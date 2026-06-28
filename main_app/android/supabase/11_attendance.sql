-- =====================================================================
-- 출석체크 서버화 — 출석 날짜 기록 + 보상(+100)을 서버에서 원자적으로.
--  ⚠️ Supabase SQL Editor 에서 1회 수동 실행 (프로젝트 컨벤션: android/supabase/*.sql).
--  upload_web/supabase/migrations/045_attendance.sql 과 동일 본문.
--
--   기존: 출석한 날짜는 클라이언트 로컬에만(ds.attendance.history / DataStore /
--         UserDefaults) 저장되고 보상만 grant_yarn 으로 서버 반영 → 재설치/기기변경
--         시 달력이 비고, 로컬 dedup 이라 같은 날 +100 재수령이 가능한 갭이 있었다.
--   변경: attendance(user_id, attended_date) 테이블 + check_in_attendance() RPC 로
--         "오늘 첫 출석"을 서버에서 판정해 보상까지 한 트랜잭션에 처리한다.
-- =====================================================================

create table if not exists public.attendance (
    user_id       bigint      not null,
    attended_date date        not null,
    created_at    timestamptz not null default now(),
    primary key (user_id, attended_date)
);

alter table public.attendance enable row level security;

drop policy if exists attendance_select_own on public.attendance;
create policy attendance_select_own on public.attendance
    for select to authenticated
    using (user_id = (select user_id from public.users where anonymous_id = auth.uid()));

create or replace function public.check_in_attendance(p_reward int default 100)
returns json
language plpgsql security definer
set search_path = public as $$
declare
    v_uid     uuid;
    v_user_id bigint;
    v_today   date;
    v_balance int;
    v_dummy   int;
begin
    v_uid := auth.uid();
    if v_uid is null then raise exception 'not authenticated'; end if;
    if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
        raise exception 'anonymous not allowed';
    end if;
    if p_reward is null or p_reward < 0 then raise exception 'p_reward must be >= 0'; end if;

    select user_id, yarn_balance into v_user_id, v_balance
      from public.users where anonymous_id = v_uid
      order by user_id limit 1;   -- 방어: UNIQUE(anonymous_id) 적용 전 중복 행이 있어도 1개로 고정
    if v_user_id is null then raise exception 'user row not found'; end if;

    v_today := (now() at time zone 'Asia/Seoul')::date;

    insert into public.attendance (user_id, attended_date)
    values (v_user_id, v_today)
    on conflict (user_id, attended_date) do nothing
    returning 1 into v_dummy;

    if found then
        if p_reward > 0 then
            update public.users
               set yarn_balance = yarn_balance + p_reward
             where user_id = v_user_id
            returning yarn_balance into v_balance;
        end if;
        return json_build_object('rewarded', true,
                                 'balance', coalesce(v_balance, 0),
                                 'today', to_char(v_today, 'YYYY-MM-DD'));
    end if;

    return json_build_object('rewarded', false,
                             'balance', coalesce(v_balance, 0),
                             'today', to_char(v_today, 'YYYY-MM-DD'));
end;
$$;

revoke all on function public.check_in_attendance(int) from public;
grant execute on function public.check_in_attendance(int) to authenticated;

comment on table public.attendance is
    '출석 기록. (user_id, attended_date) UNIQUE — 달력/연속기록의 서버 권위 소스.';
comment on function public.check_in_attendance is
    '오늘(KST) 첫 출석이면 attendance 기록 + yarn_balance += p_reward(기본 100). 반환 {rewarded,balance,today}.';
