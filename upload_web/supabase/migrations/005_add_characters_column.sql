-- ============================================================================
--  works 테이블에 'characters' 컬럼 추가
--  - 작품의 등장인물 이름 목록 (jsonb 배열, NULL 허용 — 기존 작품은 NULL)
--  - 발췌문에서 화자 이름만 정확히 볼드 처리하는 데 사용.
--  - 추출 시 LLM이 채우거나, /api/backfill-characters 로 기존 작품을 일괄 채움.
--
--  적용 방법 (Supabase Dashboard → SQL Editor → New query → Run):
-- ============================================================================

ALTER TABLE public.works
  ADD COLUMN IF NOT EXISTS characters jsonb;

-- 확인:
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'works' AND column_name = 'characters';
