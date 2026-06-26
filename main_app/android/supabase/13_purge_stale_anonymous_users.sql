-- =====================================================================
-- Daily Script — 유령 익명 유저 정리 (stale anonymous-user purge).
-- Run once in Supabase SQL Editor, then schedule with pg_cron (아래 참고).
--
-- 배경: 3개 클라이언트(web/iOS/Android)가 로드 시 signInAnonymously() 로
--   익명 JWT 를 받는다. 공개 웹 특성상 일회성 방문자·JS 크롤러가 매일 새
--   익명 auth.users + public.users 행을 만들고, 그 대부분은 아무 행동도 하지
--   않는 "유령"이라 Amplitude/Clarity 지표와 users 수를 오염시킨다.
--
-- 이 함수는 그런 유령만 안전하게 지운다:
--   - is_anonymous = true (실제 회원/소셜 가입자는 절대 건드리지 않음)
--   - created_at 이 p_days 일보다 오래됨 (방금 들어온 활성 익명 보호)
--   - 활동이 전혀 없음: 북마크·하이라이트·댓글·좋아요·출석·카드선택·선호도·
--     충전 실타래(yarn_balance)·login_id 가 모두 비어 있음
-- → 활동이 있는 익명 유저(피드/하이라이트 등 남이 보는 콘텐츠 포함)는 보존된다.
--
-- 무활동만 지우므로 자식 행이 없어 FK 위반이 발생하지 않는다. 그래도
-- delete_account() 와 동일하게 public.users → auth.users 순으로 지운다
-- (auth.identities/sessions/refresh_tokens 는 auth 내부 cascade 로 정리).
--
-- ⚠️ 클라이언트에서 호출 불가하도록 EXECUTE 권한을 회수한다(대량 삭제 함수).
--    pg_cron / SQL Editor(=postgres) 에서만 실행된다.
-- =====================================================================

create or replace function public.purge_stale_anonymous_users(
    p_days    int     default 30,
    p_dry_run boolean default true   -- 기본 dry-run: 삭제하지 않고 대상 수만 반환
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    -- user_id 로 묶인 모든 활동 테이블. 아직 적용 안 된 마이그레이션(예: 11/12)
    -- 대비로, 실제 존재하는 테이블만 NOT EXISTS 조건에 추가한다.
    v_candidate_tables text[] := array[
        'user_bookmarks', 'user_daily_cards', 'user_card_selections', 'user_preferences',
        'feed_posts', 'card_highlights', 'card_comments', 'comment_likes',
        'feed_post_comments', 'card_highlight_comments',
        'feed_post_comment_likes', 'card_highlight_comment_likes',
        'attendance', 'share_theme_unlocks'
    ];
    v_tbl   text;
    v_conds text := '';
    v_uids  uuid[];
begin
    foreach v_tbl in array v_candidate_tables loop
        if to_regclass('public.' || v_tbl) is not null then
            v_conds := v_conds || format(
                ' and not exists (select 1 from public.%I t where t.user_id = u.user_id)',
                v_tbl);
        end if;
    end loop;

    execute format($q$
        select coalesce(array_agg(a.id), '{}'::uuid[])
        from auth.users a
        join public.users u on u.anonymous_id = a.id
        where a.is_anonymous
          and a.created_at < now() - make_interval(days => %s)
          and coalesce(u.yarn_balance, 0) = 0
          and u.login_id is null
          and u.pref_genres is null and u.pref_themes is null and u.pref_any is null
          %s
    $q$, p_days, v_conds)
    into v_uids;

    if p_dry_run then
        return coalesce(array_length(v_uids, 1), 0);
    end if;

    delete from public.users where anonymous_id = any(v_uids);
    delete from auth.users  where id = any(v_uids);

    return coalesce(array_length(v_uids, 1), 0);
end;
$$;

-- 클라이언트(anon/authenticated)는 절대 호출 못 하게 회수. (함수 생성 시 PUBLIC 에
-- 기본 부여되는 EXECUTE 를 제거 — 안 하면 누구나 대량 삭제를 호출할 수 있다.)
revoke all on function public.purge_stale_anonymous_users(int, boolean) from public;
revoke all on function public.purge_stale_anonymous_users(int, boolean) from anon, authenticated;

-- ---------------------------------------------------------------------
-- 사용법
-- ---------------------------------------------------------------------
-- 1) 먼저 dry-run 으로 몇 개가 지워질지 확인 (삭제 안 함):
--      select public.purge_stale_anonymous_users(30, true);
--
-- 2) 숫자가 합당하면 실제 삭제:
--      select public.purge_stale_anonymous_users(30, false);
--
-- 3) 매일 자동 정리 — pg_cron (Dashboard → Database → Extensions 에서 pg_cron ON):
--      select cron.schedule(
--        'purge-stale-anon-users',
--        '0 18 * * *',                                   -- 매일 UTC 18:00 = KST 03:00
--        $$select public.purge_stale_anonymous_users(30, false)$$
--      );
--    (해제: select cron.unschedule('purge-stale-anon-users');)
