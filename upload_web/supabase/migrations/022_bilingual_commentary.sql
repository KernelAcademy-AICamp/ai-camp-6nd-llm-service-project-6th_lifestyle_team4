-- 022_bilingual_commentary.sql
-- 이중 언어 해설 — excerpt_description, significance 도 영문 토글 대상에 포함.
-- 두 필드는 LLM이 항상 한국어로 생성하는 해설이라 추출 시 영문 원본이 없다.
-- 관리자가 "영문 보기" 토글을 처음 클릭할 때 KO→EN 즉시 번역 후 *_original 에 저장(캐시).
-- 다음 클릭부터는 DB에서 바로 읽어 즉시 토글.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS excerpt_description_original text,
  ADD COLUMN IF NOT EXISTS significance_original        text;
