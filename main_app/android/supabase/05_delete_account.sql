-- =====================================================================
-- Daily Script — 회원 탈퇴 (account deletion).
-- Run once in Supabase SQL Editor.
--
-- public.delete_account(): 로그인 사용자가 본인 계정을 삭제한다.
-- SECURITY DEFINER 라 소유자(postgres) 권한으로 실행 → anon/authenticated
-- 역할엔 없는 auth 스키마 삭제 권한을 빌린다. 대상은 오직 auth.uid() 에서
-- 도출하므로 호출자는 '현재 사용자'만 삭제할 수 있다(무인자).
-- search_path 에 auth 를 포함하고 모든 참조를 스키마 한정한다.
-- =====================================================================

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
    v_uid     uuid;
    v_user_id bigint;
begin
    v_uid := auth.uid();
    if v_uid is null then
        raise exception 'not authenticated';
    end if;

    select user_id into v_user_id
    from public.users
    where anonymous_id = v_uid;

    if v_user_id is null then        -- 앱 행이 아직 없는 엣지 케이스
        delete from auth.users where id = v_uid;
        return;
    end if;

    -- 1) 내 댓글에 달린 좋아요(누가 눌렀든) — 내 card_comments 삭제 전에 먼저.
    delete from public.comment_likes cl
    using public.card_comments c
    where cl.comment_id = c.comment_id
      and c.user_id = v_user_id;

    -- 2) 내가 누른 좋아요(FK user_id).
    delete from public.comment_likes where user_id = v_user_id;

    -- 3) 내 댓글. 행마다 sync_card_comment_count() 트리거가 cards.comment_count
    --    를 감소(greatest(...,0)). 정상 동작.
    delete from public.card_comments where user_id = v_user_id;

    -- 4) 나머지 사용자 콘텐츠 (모두 FK user_id → users).
    delete from public.feed_posts          where user_id = v_user_id;
    delete from public.card_highlights      where user_id = v_user_id;
    delete from public.user_bookmarks       where user_id = v_user_id;
    delete from public.user_daily_cards     where user_id = v_user_id;
    delete from public.user_card_selections where user_id = v_user_id;
    delete from public.user_preferences     where user_id = v_user_id;

    -- 5) 앱 사용자 행, 6) auth 사용자
    --    (auth.identities/sessions/refresh_tokens 로 cascade).
    delete from public.users where user_id = v_user_id;
    delete from auth.users  where id = v_uid;
end;
$$;

grant execute on function public.delete_account() to anon, authenticated;
