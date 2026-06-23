-- 카드 본문(script_excerpt) 표시 정렬 — 관리자 페이지 편집에서 좌/중앙/우 토글 → 저장 → 클라이언트 표시 반영.
-- NULL 이면 클라이언트가 format 기본값 사용 (poem=center, 그 외=left).
-- KO/EN 별도 정렬 가능 — text_align 은 script_excerpt 용, text_align_original 은 script_excerpt_original 용.

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS text_align          text,
  ADD COLUMN IF NOT EXISTS text_align_original text;

COMMENT ON COLUMN public.cards.text_align IS
  '본문 script_excerpt 표시 정렬: ''left'' | ''center'' | ''right''. NULL=format 기본(poem=center, else=left).';
COMMENT ON COLUMN public.cards.text_align_original IS
  '본문 script_excerpt_original(EN) 표시 정렬. NULL=KO 와 동일 기본 규칙.';
