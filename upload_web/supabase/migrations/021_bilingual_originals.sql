-- 021_bilingual_originals.sql
-- 이중 언어 카드: 영문 PDF에서 추출된 원본을 같은 행에 함께 보존.
-- 기본 컬럼은 그대로 "보여줄 한국어"(번역본), *_original 컬럼은 "영문 원본".
--
-- 토글 표시 규칙: 프런트는 works.title_original IS NOT NULL 또는
-- cards.quote_original IS NOT NULL 일 때만 "영문으로 보기" 버튼을 노출한다.
-- 기존에 저장된 카드는 *_original = NULL → 토글 버튼 자동 숨김 (영향 없음).

-- 1) works 메타데이터 원본 보존
ALTER TABLE works
  ADD COLUMN IF NOT EXISTS title_original    text,
  ADD COLUMN IF NOT EXISTS subtitle_original text,
  ADD COLUMN IF NOT EXISTS author_original   text;

-- 2) cards 본문 원본 보존 (실제 토글 대상은 quote / script_excerpt 두 개)
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS quote_original          text,
  ADD COLUMN IF NOT EXISTS script_excerpt_original text;

-- 3) "원본 있음" 빠른 필터/조회용 부분 인덱스
CREATE INDEX IF NOT EXISTS works_has_original_idx
  ON works (work_id) WHERE title_original IS NOT NULL;

CREATE INDEX IF NOT EXISTS cards_has_original_idx
  ON cards (card_id) WHERE quote_original IS NOT NULL;
