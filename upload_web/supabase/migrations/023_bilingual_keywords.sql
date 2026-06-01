-- 023_bilingual_keywords.sql
-- 이중 언어 — 키워드도 영문 토글 대상에 포함.
-- 본 컬럼 keywords (jsonb 배열, 한국어) 와 같은 형태로 영문 원본 배열을 저장.
-- EN 토글 첫 클릭 시 lazy KO→EN 번역해 채우고 DB 캐시.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS keywords_original jsonb;
