-- =====================================================================
-- 중복 users 행 정리 + 재발 방지 — "같은 계정인데 폰마다 user_id 가 갈라져
-- 출석 +100 을 두 번 받는" 버그 수정.
--  ⚠️ Supabase SQL Editor 에서 1회 수동 실행 (프로젝트 컨벤션: android/supabase/*.sql).
--
--   원인: users 행은 bootstrap() 의 "조회→없으면 insert"(AuthRepository.kt) 로만
--         만들어지는데 anonymous_id(=auth.uid()) 에 UNIQUE 가 없어, 같은 계정으로
--         두 기기가 거의 동시에 첫 로그인하면 둘 다 "행 없음"을 보고 각자 insert →
--         같은 anonymous_id 에 user_id 가 2개 생긴다. 출석 dedup 은 user_id 단위라
--         (11_attendance.sql) 각 행이 따로 +100 을 받는다.
--   수정: (1) 기존 중복 행을 자식 데이터까지 보존해 병합   (2) anonymous_id UNIQUE
--         (3) 원자적 get-or-create RPC(ensure_user_row) 로 레이스 자체를 제거.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 병합 헬퍼 — loser 의 모든 자식 행(user_id FK)을 keeper 로 재지정한 뒤 loser 삭제.
--     users(user_id) 를 참조하는 FK 를 pg_catalog 에서 동적으로 전부 찾으므로
--     테이블을 빠뜨려 ON DELETE CASCADE 로 데이터가 유실되는 일이 없다.
--     (user_id, X) 형태의 PK/UNIQUE 충돌은 keeper 에 이미 같은 키가 있으면 loser 행을
--     먼저 지우고 나머지만 옮겨 해결한다 (예: attendance 의 같은 날짜 두 행).
-- ---------------------------------------------------------------------
create or replace function public._merge_dup_user(p_keep bigint, p_loser bigint)
returns void
language plpgsql
as $$
declare
    fk       record;
    uq       record;
    v_attnum smallint;
    v_other  text;
begin
    if p_keep is null or p_loser is null or p_keep = p_loser then
        return;
    end if;

    -- users(user_id) 를 단일 컬럼으로 참조하는 모든 FK 컬럼
    for fk in
        select c.conrelid::regclass::text as tbl,
               (select attname from pg_attribute
                 where attrelid = c.conrelid and attnum = c.conkey[1]) as col,
               c.conrelid as relid
        from pg_constraint c
        where c.contype = 'f'
          and c.confrelid = 'public.users'::regclass
          and (select attname from pg_attribute
                where attrelid = c.confrelid and attnum = c.confkey[1]) = 'user_id'
    loop
        select attnum into v_attnum
          from pg_attribute where attrelid = fk.relid and attname = fk.col;

        -- 해당 FK 컬럼을 포함하는 PK/UNIQUE 마다, keeper 와 충돌하는 loser 행을 제거
        for uq in
            select u.conkey
            from pg_constraint u
            where u.conrelid = fk.relid
              and u.contype in ('p', 'u')
              and v_attnum = any(u.conkey)
        loop
            select string_agg(
                       format('k.%I is not distinct from d.%I', att.attname, att.attname),
                       ' and ')
              into v_other
              from unnest(uq.conkey) as ck(attnum)
              join pg_attribute att
                on att.attrelid = fk.relid and att.attnum = ck.attnum
             where att.attname <> fk.col;

            execute format(
                'delete from %s d where d.%I = $2 and exists '
                || '(select 1 from %s k where k.%I = $1%s)',
                fk.tbl, fk.col, fk.tbl, fk.col,
                case when v_other is null then '' else ' and ' || v_other end)
            using p_keep, p_loser;
        end loop;

        -- 남은 loser 행을 keeper 로 이동
        execute format('update %s set %I = $1 where %I = $2', fk.tbl, fk.col, fk.col)
        using p_keep, p_loser;
    end loop;

    -- 잔액/로그인아이디 보존 — 이중 보상이 누적되지 않게 잔액은 greatest 로(합산 아님).
    update public.users k
       set yarn_balance = greatest(coalesce(k.yarn_balance, 0), coalesce(l.yarn_balance, 0)),
           login_id     = coalesce(k.login_id, l.login_id)
      from public.users l
     where k.user_id = p_keep and l.user_id = p_loser;

    delete from public.users where user_id = p_loser;
end;
$$;

-- ---------------------------------------------------------------------
-- (2) 현재 중복(anonymous_id 당 user_id 2개 이상)을 모두 병합. keeper = 가장 작은 user_id.
-- ---------------------------------------------------------------------
do $$
declare
    g       record;
    v_loser bigint;
begin
    for g in
        select anonymous_id,
               min(user_id)        as keep_id,
               array_agg(user_id)  as ids
        from public.users
        where anonymous_id is not null
        group by anonymous_id
        having count(*) > 1
    loop
        foreach v_loser in array g.ids loop
            if v_loser <> g.keep_id then
                perform public._merge_dup_user(g.keep_id, v_loser);
            end if;
        end loop;
    end loop;
end;
$$;

-- 병합 후 중복이 남아있으면 UNIQUE 생성이 실패하므로 미리 단언한다.
do $$
begin
    if exists (
        select 1 from public.users
        where anonymous_id is not null
        group by anonymous_id having count(*) > 1
    ) then
        raise exception '중복 users 행이 남아있습니다 — 병합 실패. UNIQUE 생성 중단.';
    end if;
end;
$$;

-- ---------------------------------------------------------------------
-- (3) 재발 방지 — anonymous_id 당 단 한 행. (anon 행은 NULL 다중 허용이라 무해)
-- ---------------------------------------------------------------------
create unique index if not exists users_anonymous_id_unique
    on public.users (anonymous_id);

-- ---------------------------------------------------------------------
-- (4) 원자적 get-or-create — 클라이언트의 "조회→insert" 레이스를 서버에서 제거.
--     UNIQUE(anonymous_id) 에 의존(on conflict). 반환: 그 계정의 user_id.
-- ---------------------------------------------------------------------
create or replace function public.ensure_user_row(p_nickname text default '')
returns bigint
language plpgsql security definer
set search_path = public as $$
declare
    v_uid uuid;
    v_id  bigint;
begin
    v_uid := auth.uid();
    if v_uid is null then raise exception 'not authenticated'; end if;

    insert into public.users (anonymous_id, nickname)
    values (v_uid, coalesce(p_nickname, ''))
    on conflict (anonymous_id) do update set anonymous_id = excluded.anonymous_id
    returning user_id into v_id;

    return v_id;
end;
$$;

revoke all on function public.ensure_user_row(text) from public;
grant execute on function public.ensure_user_row(text) to anon, authenticated;

-- 병합 헬퍼는 1회용 — 정리.
drop function if exists public._merge_dup_user(bigint, bigint);

comment on index public.users_anonymous_id_unique is
    'auth.uid() 당 users 행 1개 보장 — bootstrap 동시 insert 레이스로 인한 중복(=출석 이중보상) 방지.';
comment on function public.ensure_user_row is
    'auth.uid() 의 users.user_id 를 원자적으로 보장(get-or-create). bootstrap 의 조회→insert 대체.';
