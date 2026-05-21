-- ============================================================================
--  cards 테이블에 'significance' 컬럼 추가
--  - 명대사의 의의(80~200자, NULL 허용 — 기존 카드는 NULL)
--
--  적용 방법 (Supabase Dashboard → SQL Editor → New query → Run):
-- ============================================================================

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS significance text;

-- 확인:
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'cards';
