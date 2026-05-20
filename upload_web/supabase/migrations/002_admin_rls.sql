-- ============================================================================
--  관리자 전용 쓰기 권한 (RLS)
--  - works / cards / genres / work_genres 는 누구나 SELECT 가능 (Flutter 앱이 anon으로 읽음)
--  - INSERT / UPDATE / DELETE 는 JWT의 app_metadata.role = 'admin' 인 계정만 허용
--
--  관리자 계정 생성/마킹 방법은 파일 하단의 가이드를 참조하세요.
-- ============================================================================

-- ---- is_admin() 헬퍼 함수 ----------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  )
$$;

-- ---- works ------------------------------------------------------------------
alter table public.works enable row level security;

drop policy if exists works_select_all   on public.works;
drop policy if exists works_admin_insert on public.works;
drop policy if exists works_admin_update on public.works;
drop policy if exists works_admin_delete on public.works;

create policy works_select_all on public.works
  for select to anon, authenticated
  using (true);

create policy works_admin_insert on public.works
  for insert to authenticated
  with check (public.is_admin());

create policy works_admin_update on public.works
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy works_admin_delete on public.works
  for delete to authenticated
  using (public.is_admin());

-- ---- cards ------------------------------------------------------------------
alter table public.cards enable row level security;

drop policy if exists cards_select_all   on public.cards;
drop policy if exists cards_admin_insert on public.cards;
drop policy if exists cards_admin_update on public.cards;
drop policy if exists cards_admin_delete on public.cards;

create policy cards_select_all on public.cards
  for select to anon, authenticated
  using (true);

create policy cards_admin_insert on public.cards
  for insert to authenticated
  with check (public.is_admin());

create policy cards_admin_update on public.cards
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy cards_admin_delete on public.cards
  for delete to authenticated
  using (public.is_admin());

-- ---- genres -----------------------------------------------------------------
alter table public.genres enable row level security;

drop policy if exists genres_select_all   on public.genres;
drop policy if exists genres_admin_insert on public.genres;
drop policy if exists genres_admin_update on public.genres;
drop policy if exists genres_admin_delete on public.genres;

create policy genres_select_all on public.genres
  for select to anon, authenticated
  using (true);

create policy genres_admin_insert on public.genres
  for insert to authenticated
  with check (public.is_admin());

create policy genres_admin_update on public.genres
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy genres_admin_delete on public.genres
  for delete to authenticated
  using (public.is_admin());

-- ---- work_genres ------------------------------------------------------------
alter table public.work_genres enable row level security;

drop policy if exists work_genres_select_all   on public.work_genres;
drop policy if exists work_genres_admin_insert on public.work_genres;
drop policy if exists work_genres_admin_update on public.work_genres;
drop policy if exists work_genres_admin_delete on public.work_genres;

create policy work_genres_select_all on public.work_genres
  for select to anon, authenticated
  using (true);

create policy work_genres_admin_insert on public.work_genres
  for insert to authenticated
  with check (public.is_admin());

create policy work_genres_admin_update on public.work_genres
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy work_genres_admin_delete on public.work_genres
  for delete to authenticated
  using (public.is_admin());


-- ============================================================================
--  관리자 계정 생성 가이드 (아이디 로그인 방식)
-- ============================================================================
--  이 프로젝트는 사용자에게 "아이디"만 입력받습니다. Supabase Auth는 이메일을
--  요구하므로, 프론트엔드가 자동으로 `<아이디>@admin.local` 형태로 변환해 보냅니다.
--  따라서 계정 생성 시에도 같은 규칙으로 이메일을 작성해야 합니다.
--
-- [1단계] 계정 만들기 — Supabase Dashboard 사용 (권장)
--   Authentication → Users → "Add user" 버튼
--     Email:    admin@admin.local           ← 아이디가 "admin" 이면 이렇게
--     Password: (16자 이상 강력한 비밀번호)
--     "Auto Confirm User"   ← 반드시 체크 (실제 메일이 가지 않으므로)
--   클릭으로 생성.
--
--   아이디를 "hwanuk"로 하고 싶다면 Email 칸에 `hwanuk@admin.local` 입력.
--
-- [2단계] 해당 계정에 admin 역할 부여 — 아래 SQL을 SQL Editor에서 실행:
--
--   UPDATE auth.users
--   SET raw_app_meta_data =
--     coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
--   WHERE email = 'admin@admin.local';
--
-- [3단계] 확인
--
--   SELECT email, raw_app_meta_data
--   FROM auth.users
--   WHERE email = 'admin@admin.local';
--
--   결과의 raw_app_meta_data 안에 "role": "admin" 이 들어 있어야 합니다.
--
-- [4단계] 로그인 — 웹의 로그인 화면에서 "admin" (도메인 빼고) + 비밀번호 입력.
--
-- [5단계] (선택) 관리자 추가 — Dashboard에서 다른 `<아이디>@admin.local` 만들고
--         위 UPDATE를 그 이메일로 한 번 더.
--
-- [6단계] (선택) 관리자 권한 회수 —
--
--   UPDATE auth.users
--   SET raw_app_meta_data = raw_app_meta_data - 'role'
--   WHERE email = 'admin@admin.local';
--
-- 주의:
--   - app_metadata 는 service_role 키로만 쓸 수 있어 일반 사용자가 자기 권한을
--     스스로 admin 으로 올릴 수 없습니다 (user_metadata 와의 차이).
--   - JWT 캐시 때문에 변경 직후에는 한 번 로그아웃했다가 다시 로그인해야 반영됩니다.
--   - `@admin.local` 도메인은 코드에서 상수로 관리됩니다:
--     public/assets/auth-utils.js → ADMIN_EMAIL_DOMAIN
--     바꾸려면 이 상수와 위 SQL의 이메일 두 곳을 같이 바꾸세요.
-- ============================================================================
