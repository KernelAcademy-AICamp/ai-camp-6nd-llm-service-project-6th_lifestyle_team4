-- ============================================================================
--  공유 카드지(Premium/Royal) 배경 이미지 — 로컬 에셋 → DB 호스팅 전환
--  ⚠️ Supabase SQL Editor 에서 1회 수동 실행 (프로젝트 컨벤션: android/supabase/*.sql).
--  upload_web/supabase/migrations/042_share_backgrounds.sql 과 동일 본문.
--
--  - Android 는 지금까지 APK 번들 에셋(assets/share-premium|royal/*.png)에서 카드지를
--    읽었다. 앱 재배포 없이 카드지를 관리하려고 메타 테이블 + 공개 Storage 버킷으로 옮긴다.
--  - 무료 8종(절차적 그림)은 코드에 남는다 — 여기 테이블엔 premium/royal 만.
--  - is_admin()/storage.objects 는 같은 프로젝트(002·020)에 이미 존재.
-- ============================================================================

-- ---- 메타 테이블 -----------------------------------------------------------
create table if not exists public.share_backgrounds (
  slug        text primary key,                 -- bg_id (share_links.bg_id 가 text, 클라 선택 id)
  name        text not null,                    -- 카드지 라벨(책 제목과 매칭에 쓰일 수 있음)
  tier        text not null check (tier in ('premium','royal')),
  price       int  not null default 0,
  image_url   text not null,                    -- Storage 공개 URL
  ink         text not null default '#3B2A1A',  -- 이미지 위 글자색 hex (#RRGGBB)
  work_id     bigint references public.works(work_id) on delete set null,  -- 연결된 책(앱에서 우선 매칭)
  work_title  text,                             -- 책 제목 스냅샷(표시·매칭 폴백). 선택 책에서 자동 채움.
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 기존 설치(work_id 없이 만든 테이블) 호환 — 재실행 시 컬럼 보강.
alter table public.share_backgrounds
  add column if not exists work_id bigint references public.works(work_id) on delete set null;

create index if not exists share_backgrounds_active_idx
  on public.share_backgrounds (is_active, tier, sort_order);

comment on table public.share_backgrounds is
  '공유 카드지(premium/royal) 메타 — 이미지는 share-backgrounds 버킷, 무료 8종은 앱 코드.';

-- ---- 테이블 RLS -------------------------------------------------------------
alter table public.share_backgrounds enable row level security;

drop policy if exists share_bg_select        on public.share_backgrounds;
drop policy if exists share_bg_admin_select  on public.share_backgrounds;
drop policy if exists share_bg_admin_insert  on public.share_backgrounds;
drop policy if exists share_bg_admin_update  on public.share_backgrounds;
drop policy if exists share_bg_admin_delete  on public.share_backgrounds;

create policy share_bg_select on public.share_backgrounds
  for select to anon, authenticated
  using (is_active = true);

-- admin 은 비활성 행까지 전부 조회(관리 화면에서 숨김 카드지를 다시 표시하려면 필요).
create policy share_bg_admin_select on public.share_backgrounds
  for select to authenticated
  using (public.is_admin());

create policy share_bg_admin_insert on public.share_backgrounds
  for insert to authenticated
  with check (public.is_admin());

create policy share_bg_admin_update on public.share_backgrounds
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy share_bg_admin_delete on public.share_backgrounds
  for delete to authenticated
  using (public.is_admin());

-- ---- Storage 버킷 (public read) --------------------------------------------
insert into storage.buckets (id, name, public)
values ('share-backgrounds', 'share-backgrounds', true)
on conflict (id) do nothing;

-- ---- Storage RLS ------------------------------------------------------------
drop policy if exists share_bg_obj_read   on storage.objects;
drop policy if exists share_bg_obj_insert on storage.objects;
drop policy if exists share_bg_obj_update on storage.objects;
drop policy if exists share_bg_obj_delete on storage.objects;

create policy share_bg_obj_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'share-backgrounds');

create policy share_bg_obj_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'share-backgrounds' and public.is_admin());

create policy share_bg_obj_update on storage.objects
  for update to authenticated
  using (bucket_id = 'share-backgrounds' and public.is_admin())
  with check (bucket_id = 'share-backgrounds' and public.is_admin());

create policy share_bg_obj_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'share-backgrounds' and public.is_admin());
