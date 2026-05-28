-- ============================================================================
--  users 프로필 필드 + 아이디 중복확인 함수
--  - login_id  : 로그인용 아이디(표시·관리용). 대소문자 무시 유니크.
--  - gender    : 성별 (선택). male/female/other
--  - age_group : 나이대 (선택). 10s ~ 90s
--  - email_available(text) : 회원가입 전 아이디(이메일) 중복확인.
--      RLS가 타인 users 행 조회를 막으므로 SECURITY DEFINER 로 auth.users 조회.
--  기존 RLS 정책(users self read/insert/update)은 건드리지 않는다.
-- ============================================================================

-- 1) 컬럼 추가
alter table public.users
  add column if not exists login_id  text,
  add column if not exists gender    text,
  add column if not exists age_group text;

-- 2) 값 검증 (NULL 허용 = 선택 입력)
alter table public.users drop constraint if exists users_gender_check;
alter table public.users
  add constraint users_gender_check
  check (gender is null or gender in ('male','female','other'));

alter table public.users drop constraint if exists users_age_group_check;
alter table public.users
  add constraint users_age_group_check
  check (age_group is null or age_group in
    ('10s','20s','30s','40s','50s','60s','70s','80s','90s'));

-- 3) 로그인 아이디 중복 방지 (대소문자 무시, NULL 다중 허용)
create unique index if not exists users_login_id_unique
  on public.users (lower(login_id))
  where login_id is not null;

-- 4) 아이디(이메일) 사용 가능 여부 — true = 사용 가능(미가입)
--    클라이언트는 idToEmail(id) 로 만든 합성 이메일을 그대로 넘긴다.
create or replace function public.email_available(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select not exists (
    select 1 from auth.users
    where lower(email) = lower(trim(p_email))
  );
$$;

grant execute on function public.email_available(text) to anon, authenticated;
