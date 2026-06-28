-- =====================================================================
-- 공유 카드지(premium/royal) 소유권 서버화 — 036_oz_theme_unlocks 패턴 재사용.
--  ⚠️ Supabase SQL Editor 에서 1회 수동 실행 (프로젝트 컨벤션: android/supabase/*.sql).
--  upload_web/supabase/migrations/046_share_theme_unlocks.sql 과 동일 본문.
--
--   기존: 카드지 구매 시 실타래는 서버(spend_yarn)에서 진짜 차감되는데, '무엇을
--         샀는지'는 클라이언트 로컬에만(웹 ds.purchasedShareThemes / Android
--         share_themes_purchased) 기록 → 재설치/기기변경 시 실타래는 소진됐는데
--         소유권은 사라지는 갭(재결제 유발).
--   변경: share_theme_unlocks(user_id, theme_id) 테이블 + purchase_share_theme()
--         RPC 로 차감과 소유 등록을 한 트랜잭션에 묶는다. iOS 는 카드지 기능 없음.
-- =====================================================================

create table if not exists public.share_theme_unlocks (
    user_id     bigint      not null,
    theme_id    text        not null,
    unlocked_at timestamptz not null default now(),
    primary key (user_id, theme_id)
);

alter table public.share_theme_unlocks enable row level security;

drop policy if exists share_theme_unlocks_select_own on public.share_theme_unlocks;
create policy share_theme_unlocks_select_own on public.share_theme_unlocks
    for select to anon, authenticated
    using (user_id = (select user_id from public.users where anonymous_id = auth.uid()));

create or replace function public.purchase_share_theme(p_theme_id text, p_price int)
returns int
language plpgsql security definer
set search_path = public as $$
declare
    v_uid     uuid;
    v_user_id bigint;
    v_balance int;
    v_already int := 0;
begin
    v_uid := auth.uid();
    if v_uid is null then raise exception 'not authenticated'; end if;
    if p_theme_id is null or p_price is null then return -1; end if;
    if p_price < 0 then return -1; end if;

    select user_id into v_user_id from public.users where anonymous_id = v_uid
      order by user_id limit 1;   -- 방어: UNIQUE(anonymous_id) 적용 전 중복 행이 있어도 1개로 고정
    if v_user_id is null then return -3; end if;

    select count(*) into v_already
      from public.share_theme_unlocks
     where user_id = v_user_id and theme_id = p_theme_id;
    if v_already > 0 then
        select yarn_balance into v_balance from public.users where user_id = v_user_id;
        return coalesce(v_balance, 0);
    end if;

    update public.users
       set yarn_balance = yarn_balance - p_price
     where user_id = v_user_id
       and coalesce(yarn_balance, 0) >= p_price
    returning yarn_balance into v_balance;

    if v_balance is null then
        return -2;
    end if;

    insert into public.share_theme_unlocks (user_id, theme_id)
    values (v_user_id, p_theme_id)
    on conflict (user_id, theme_id) do nothing;

    return coalesce(v_balance, 0);
end;
$$;

revoke all on function public.purchase_share_theme(text, int) from public;
grant execute on function public.purchase_share_theme(text, int) to anon, authenticated;

comment on table public.share_theme_unlocks is
    '공유 카드지(premium/royal) 영구 보유 기록. (user_id, theme_id) UNIQUE.';
comment on function public.purchase_share_theme is
    '카드지 구매 — yarn_balance 에서 p_price 차감 + share_theme_unlocks 등록. 이미 보유 시 잔액 그대로, 부족 시 -2.';
