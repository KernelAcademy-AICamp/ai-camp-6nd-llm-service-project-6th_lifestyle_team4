-- =====================================================================
-- Daily Script — 실타래(yarn) 충전 잔액 + 원자적 차감.
-- Run once in Supabase SQL Editor. (멱등 — 재실행 안전)
--
-- 무료 5개/일은 클라이언트 로컬(DataStore)에서 관리한다. 여기선 '충전 잔액'
-- (구매분)만 서버에 둔다. 05_delete_account.sql 컨벤션을 따른다:
-- SECURITY DEFINER 로 소유자 권한 실행, 대상은 오직 auth.uid() 에서 도출.
-- =====================================================================

alter table public.users
    add column if not exists yarn_balance int not null default 0;

-- 실타래 1개 차감. 잔액>0 일 때만 원자적으로 감소 → 동시 더블탭에도 음수 불가.
-- 반환: 차감 후 잔액. 잔액 부족(또는 행 없음)이면 -1 (미차감).
create or replace function public.consume_yarn()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid     uuid;
    v_balance int;
begin
    v_uid := auth.uid();
    if v_uid is null then
        raise exception 'not authenticated';
    end if;

    update public.users
       set yarn_balance = yarn_balance - 1
     where anonymous_id = v_uid
       and yarn_balance > 0
    returning yarn_balance into v_balance;

    if v_balance is null then
        return -1;            -- 잔액 부족(또는 행 없음): 미차감
    end if;
    return v_balance;
end;
$$;

-- QA/시드 전용 — 실타래 충전(구매 UI 가 '준비 중'인 동안 수동 지급용).
-- 반환: 충전 후 잔액.
create or replace function public.grant_yarn(p_n int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid     uuid;
    v_balance int;
begin
    v_uid := auth.uid();
    if v_uid is null then raise exception 'not authenticated'; end if;
    if p_n is null or p_n <= 0 then raise exception 'p_n must be positive'; end if;

    update public.users
       set yarn_balance = yarn_balance + p_n
     where anonymous_id = v_uid
    returning yarn_balance into v_balance;
    return coalesce(v_balance, 0);
end;
$$;

grant execute on function public.consume_yarn()  to anon, authenticated;
grant execute on function public.grant_yarn(int) to anon, authenticated;

-- 구매(예: OZ's house 테마) — 충전 잔액에서 p_amount 만큼 원자적 차감.
-- 잔액 >= p_amount 일 때만 감소 → 동시 더블탭에도 음수/초과차감 불가.
-- 반환: 차감 후 잔액. 잔액 부족(또는 행 없음)이면 -1 (미차감).
create or replace function public.spend_yarn(p_amount int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid     uuid;
    v_balance int;
begin
    v_uid := auth.uid();
    if v_uid is null then raise exception 'not authenticated'; end if;
    if p_amount is null or p_amount <= 0 then raise exception 'p_amount must be positive'; end if;

    update public.users
       set yarn_balance = yarn_balance - p_amount
     where anonymous_id = v_uid
       and yarn_balance >= p_amount
    returning yarn_balance into v_balance;

    if v_balance is null then
        return -1;            -- 잔액 부족(또는 행 없음): 미차감
    end if;
    return v_balance;
end;
$$;

grant execute on function public.spend_yarn(int) to anon, authenticated;
