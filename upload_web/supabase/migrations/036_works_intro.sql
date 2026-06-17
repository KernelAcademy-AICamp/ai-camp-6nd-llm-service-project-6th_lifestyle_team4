-- 036_works_intro.sql
-- works 테이블에 책 소개(영업 문구) 컬럼 추가.
--   "이 고전을 왜 읽어야 하는가"를 1~2문장으로 소개하는 LLM 생성 텍스트.
--   NEW(새로 들어온 고전) 카드 등에서 명대사 대신 표시한다.
--   값이 없으면(NULL) 프론트가 명대사로 폴백한다.

ALTER TABLE public.works
  ADD COLUMN IF NOT EXISTS intro text;

COMMENT ON COLUMN public.works.intro IS
  '책 소개(영업 문구) — 읽고 싶게 만드는 1~2문장. LLM 생성. NEW 카드 등 표시용. NULL이면 명대사로 폴백.';
