-- ============================================================================
--  notice-images (공지 이미지 저장용 Storage 버킷)
--   - 어드민(upload_web)이 공지 작성 시 이미지를 업로드한다.
--   - 소비자 앱(web_pwa)은 공개 URL로 읽기만 한다 → public 버킷.
--   - 쓰기(업로드/수정/삭제)는 notices 와 동일하게 public.is_admin() 으로 제한.
--   - 공지 body 안에는 ![설명](공개URL) 마크다운으로 이미지 주소만 저장된다.
-- ============================================================================

-- ---- 버킷 생성 (public read) -----------------------------------------------
insert into storage.buckets (id, name, public)
values ('notice-images', 'notice-images', true)
on conflict (id) do nothing;

-- ---- Storage RLS (storage.objects 는 기본적으로 RLS 활성) -------------------
drop policy if exists notice_images_read         on storage.objects;
drop policy if exists notice_images_admin_insert on storage.objects;
drop policy if exists notice_images_admin_update on storage.objects;
drop policy if exists notice_images_admin_delete on storage.objects;

-- 이미지 자체는 누구나 읽기(공개 공지에 노출되므로)
create policy notice_images_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'notice-images');

-- 업로드/수정/삭제는 admin 만 (app_metadata.role = 'admin')
create policy notice_images_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'notice-images' and public.is_admin());

create policy notice_images_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'notice-images' and public.is_admin())
  with check (bucket_id = 'notice-images' and public.is_admin());

create policy notice_images_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'notice-images' and public.is_admin());
