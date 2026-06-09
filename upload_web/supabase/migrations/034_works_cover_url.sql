-- 034_works_cover_url.sql
-- works 테이블에 책 표지 이미지 URL 컬럼 추가.
--   값 예: Supabase Storage 공개 URL (https://<ref>.supabase.co/storage/v1/object/public/covers/xxx.jpg)
--          또는 사이트 상대경로 (/m/covers/xxx.jpg)
-- 피드 카드(및 추후 상세/하이라이트)에서 책 표지를 표시하는 데 사용.
-- 표지가 없는 책은 NULL → 표지 미표시(텍스트만).

ALTER TABLE public.works
  ADD COLUMN IF NOT EXISTS cover_url text;

COMMENT ON COLUMN public.works.cover_url IS
  '책 표지 이미지 URL (Supabase Storage 공개 URL 또는 사이트 상대경로). 피드/상세 표지 표시용.';
