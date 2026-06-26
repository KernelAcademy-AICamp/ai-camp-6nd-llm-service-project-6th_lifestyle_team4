-- =====================================================================
-- 출석체크 서버화 — 출석 날짜 기록 + 보상(+100)을 서버에서 원자적으로.
--   기존: 출석한 날짜는 클라이언트 로컬에만(ds.attendance.history / DataStore /
--         UserDefaults) 저장되고 보상만 grant_yarn 으로 서버 반영 → 재설치/기기변경
--         시 달력이 비고, 로컬 dedup 이라 같은 날 +100 재수령이 가능한 갭이 있었다.
--   변경: attendance(user_id, attended_date) 테이블 + check_in_attendance() RPC 로
--         "오늘 첫 출석"을 서버에서 판정해 보상까지 한 트랜잭션에 처리한다.
-- ⚠️ Supabase SQL Editor 에서 1회 수동 실행. (멱등 — 재실행 안전)
-- 컨벤션: 06_yarn.sql 처럼 SECURITY DEFINER + 대상은 auth.uid() 에서 도출.
-- =====================================================================

create table if not exists public.attendance (
    user_id       bigint      not null,
    attended_date date        not null,
    created_at    timestamptz not null default now(),
    primary key (user_id, attended_date)
);

alter table public.attendance enable row level security;

-- 소유자만 자기 출석 기록을 읽는다(달력용). user_id ↔ auth.uid() 는 users.anonymous_id 로 매핑.
drop policy if exists attendance_select_own on public.attendance;
create policy attendance_select_own on public.attendance
    for select to authenticated
    using (user_id = (select user_id from public.users where anonymous_id = auth.uid()));

-- 쓰기는 아래 SECURITY DEFINER RPC 로만(직접 insert/update/delete 정책 없음 → 차단).

-- 출석 체크 — 오늘(KST) 첫 출석이면 기록 + 보상(+p_reward) 을 원자적으로 지급한다.
-- 반환 json: { "rewarded": bool, "balance": int, "today": "YYYY-MM-DD" }
--   rewarded=false → 이미 오늘 출석함(보상 없음), balance=현재 잔액.
-- 서버가 (user_id, attended_date) UNIQUE 로 dedup 하므로 로컬 데이터 삭제/재설치로도
-- 같은 날 보상을 중복 수령할 수 없다.
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
    -- 익명 사용자는 출석 보상 대상이 아니다(클라이언트도 게이트하지만 서버에서도 방어).
    if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
        raise exception 'anonymous not allowed';
    end if;
    if p_reward is null or p_reward < 0 then raise exception 'p_reward must be >= 0'; end if;

    select user_id, yarn_balance into v_user_id, v_balance
      from public.users where anonymous_id = v_uid;
    if v_user_id is null then raise exception 'user row not found'; end if;

    v_today := (now() at time zone 'Asia/Seoul')::date;

    insert into public.attendance (user_id, attended_date)
    values (v_user_id, v_today)
    on conflict (user_id, attended_date) do nothing
    returning 1 into v_dummy;

    if found then
        -- 오늘 첫 출석 → 보상 지급
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

    -- 이미 오늘 출석함 — 보상 없이 현재 잔액 반환
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
