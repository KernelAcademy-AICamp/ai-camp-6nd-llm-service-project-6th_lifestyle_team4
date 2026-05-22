-- ============================================================================
--  명대사 맞추기 랭킹 테이블
--  - 모든 사용자가 SELECT 가능 (랭킹은 전원 공유)
--  - 인증된 사용자가 본인 결과만 INSERT
--  - 본인 결과만 UPDATE/DELETE (또는 관리자)
-- ============================================================================

create table if not exists public.quiz_rankings (
  id            bigserial primary key,
  name          text        not null,
  score         integer     not null,
  correct       integer     not null default 0,
  played        integer     not null default 0,
  user_id       uuid        references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_quiz_rankings_score_desc
  on public.quiz_rankings (score desc, created_at desc);

alter table public.quiz_rankings enable row level security;

drop policy if exists quiz_rankings_select_all     on public.quiz_rankings;
drop policy if exists quiz_rankings_insert_own     on public.quiz_rankings;
drop policy if exists quiz_rankings_update_own     on public.quiz_rankings;
drop policy if exists quiz_rankings_delete_own     on public.quiz_rankings;

-- 누구나 읽기 가능 (anon + authenticated)
create policy quiz_rankings_select_all on public.quiz_rankings
  for select to anon, authenticated
  using (true);

-- 인증된 사용자가 본인 결과만 등록 가능
create policy quiz_rankings_insert_own on public.quiz_rankings
  for insert to authenticated
  with check (auth.uid() = user_id);

-- 본인 결과 또는 관리자만 수정/삭제
create policy quiz_rankings_update_own on public.quiz_rankings
  for update to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create policy quiz_rankings_delete_own on public.quiz_rankings
  for delete to authenticated
  using (auth.uid() = user_id or public.is_admin());
