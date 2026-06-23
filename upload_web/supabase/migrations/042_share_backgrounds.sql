-- ============================================================================
--  공유 카드지(Premium/Royal) 배경 이미지 — 로컬 에셋 → DB 호스팅 전환
--   - 지금까지 Android 는 APK 번들 에셋(assets/share-premium|royal/*.png)에서,
--     PWA 는 아예 이미지가 없었다(빈 '곧 만나요' 상태).
--   - 앱 재배포 없이 카드지를 추가/교체/비활성하기 위해 메타데이터 테이블 +
--     공개 Storage 버킷으로 옮긴다. (notice-images/020, works.cover_url/034 컨벤션)
--   - 무료 8종(절차적 그림)은 코드에 남는다 — 여기 테이블엔 premium/royal 만.
--   - 소비자 앱(web_pwa/안드)은 공개 URL 로 읽기만, 쓰기(업로드/수정/삭제)는 admin.
-- ============================================================================

-- ---- 메타 테이블 -----------------------------------------------------------
create table if not exists public.share_backgrounds (
  slug        text primary key,                 -- bg_id (share_links.bg_id 가 text, 클라 선택 id)
  name        text not null,                    -- 카드지 라벨(책 제목과 매칭에 쓰일 수 있음)
  tier        text not null check (tier in ('premium','royal')),
  price       int  not null default 0,
  image_url   text not null,                    -- Storage 공개 URL
  ink         text not null default '#3B2A1A',  -- 이미지 위 글자색 hex (#RRGGBB)
  work_title  text,                             -- 책 제목 우선정렬 타깃(없으면 name 폴백)
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

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

-- 읽기: 활성 행만 공개(비활성 행은 자동으로 읽기 경로에서 사라짐)
create policy share_bg_select on public.share_backgrounds
  for select to anon, authenticated
  using (is_active = true);

-- admin 은 비활성 행까지 전부 조회(관리 화면에서 숨김 카드지를 다시 표시하려면 필요).
-- permissive 정책은 OR 로 결합 → anon=활성만, admin=전체.
create policy share_bg_admin_select on public.share_backgrounds
  for select to authenticated
  using (public.is_admin());

-- 쓰기: admin (app_metadata.role = 'admin')
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

-- ---- Storage RLS (storage.objects 는 기본 RLS 활성) -------------------------
drop policy if exists share_bg_obj_read   on storage.objects;
drop policy if exists share_bg_obj_insert on storage.objects;
drop policy if exists share_bg_obj_update on storage.objects;
drop policy if exists share_bg_obj_delete on storage.objects;

-- 이미지 자체는 누구나 읽기(공개 카드지에 노출되므로)
create policy share_bg_obj_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'share-backgrounds');

-- 업로드/수정/삭제는 admin 만
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
