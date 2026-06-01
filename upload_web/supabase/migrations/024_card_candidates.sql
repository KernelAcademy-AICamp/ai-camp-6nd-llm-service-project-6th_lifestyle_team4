-- ============================================================================
--  card_candidates (사람-검토 게이트)
--   - 모든 신규 카드는 cards 에 바로 들어가지 않고 card_candidates 로 들어간다.
--   - 어드민이 review 페이지에서 승인(approve) 해야 promote_candidate RPC가
--     해당 행을 cards 로 복사한다. 거절(reject) / 수정필요(needs_edit) 도 기록.
--   - cards 와 달리 anon 은 select 할 수 없다 — PWA / iOS 는 이 테이블을 보지 못한다.
--   - works/cards 와 동일한 admin RLS 패턴 (public.is_admin()).
-- ============================================================================

create table if not exists public.card_candidates (
  candidate_id  bigint generated always as identity primary key,

  -- ---- cards 필드 미러 (LLM 추출 결과 그대로 보관) ----
  work_id              bigint references public.works(work_id),
  quote                text not null,
  script_excerpt       text not null,
  excerpt_description  text,
  keywords             jsonb not null default '[]'::jsonb,
  temperature          smallint check (temperature between 1 and 5),
  intensity            smallint check (intensity between 1 and 5),
  significance         text,

  -- ---- 검토 상태 ----
  status text not null default 'pending'
         check (status in ('pending', 'approved', 'rejected', 'needs_edit')),

  -- ---- 출처 / 검증 ----
  -- uploaded_doc: 업로드된 원문에서 추출 (verbatim 자동 검증 가능)
  -- web_seed:     웹 시드(검색결과 등) — 원문 통제 불가, verbatim 미검증
  -- manual:       어드민이 직접 입력
  source_kind  text check (source_kind in ('uploaded_doc', 'web_seed', 'manual')),
  source_url   text,
  source_text  text,                     -- verbatim 재검증을 위해 원문(또는 일부) 보관
  quote_verbatim_verified boolean not null default false,

  -- ---- 동시 검토 락 (claim TTL = 10분, API 레이어에서 강제) ----
  claimed_by  uuid references auth.users(id),
  claimed_at  timestamptz,

  -- ---- 결정 기록 ----
  reviewer_id  uuid references auth.users(id),
  reviewed_at  timestamptz,
  notes        text,

  -- ---- 인라인 편집 흔적 (감사 로그용 — 원본 vs 편집본 비교) ----
  original_payload  jsonb,                -- LLM 원본 (편집되더라도 보존)

  -- ---- 출처 메타 ----
  extracted_by  uuid references auth.users(id),
  extracted_at  timestamptz not null default now(),

  -- ---- 승인 후 promote 흔적 ----
  promoted_card_id  bigint references public.cards(card_id),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 검토 큐 정렬용 — pending 을 오래된 순으로 빠르게
create index if not exists card_candidates_queue_idx
  on public.card_candidates (status, extracted_at);

-- claim 만료 체크용
create index if not exists card_candidates_claim_idx
  on public.card_candidates (claimed_at);

-- ---- updated_at 자동 갱신 (019_notices 의 set_updated_at 재사용) ----
drop trigger if exists card_candidates_set_updated_at on public.card_candidates;
create trigger card_candidates_set_updated_at
  before update on public.card_candidates
  for each row execute function public.set_updated_at();

-- ---- RLS — 어드민만. anon/authenticated(비관리자) 는 select 불가 ----
alter table public.card_candidates enable row level security;

drop policy if exists card_candidates_admin_select on public.card_candidates;
drop policy if exists card_candidates_admin_insert on public.card_candidates;
drop policy if exists card_candidates_admin_update on public.card_candidates;
drop policy if exists card_candidates_admin_delete on public.card_candidates;

create policy card_candidates_admin_select on public.card_candidates
  for select to authenticated
  using (public.is_admin());

create policy card_candidates_admin_insert on public.card_candidates
  for insert to authenticated
  with check (public.is_admin());

create policy card_candidates_admin_update on public.card_candidates
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy card_candidates_admin_delete on public.card_candidates
  for delete to authenticated
  using (public.is_admin());

-- ============================================================================
--  promote_candidate(p_candidate_id) — 승인된 후보를 cards 로 복사
--   - status = 'approved' AND promoted_card_id IS NULL 인 행만 promote.
--   - cards 에 insert 후 card_candidates.promoted_card_id 에 새 card_id 기록.
--   - SECURITY DEFINER + is_admin() 가드 — 비관리자가 호출하면 raise.
-- ============================================================================

create or replace function public.promote_candidate(p_candidate_id bigint)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  c record;
  new_card_id bigint;
begin
  if not public.is_admin() then
    raise exception 'admin only';
  end if;

  select * into c
  from public.card_candidates
  where candidate_id = p_candidate_id
    and status = 'approved'
    and promoted_card_id is null
  for update;

  if not found then
    raise exception 'candidate not promotable (must be approved and not yet promoted)';
  end if;

  if c.work_id is null then
    raise exception 'candidate has no work_id — cannot promote';
  end if;

  insert into public.cards (
    work_id, quote, script_excerpt, excerpt_description,
    keywords, temperature, intensity, significance
  ) values (
    c.work_id, c.quote, c.script_excerpt, c.excerpt_description,
    c.keywords, c.temperature, c.intensity, c.significance
  )
  returning card_id into new_card_id;

  update public.card_candidates
  set promoted_card_id = new_card_id
  where candidate_id = p_candidate_id;

  return new_card_id;
end;
$$;

grant execute on function public.promote_candidate(bigint) to authenticated;
