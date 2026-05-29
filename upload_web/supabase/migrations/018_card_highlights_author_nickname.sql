-- ============================================================================
--  card_highlights.author_nickname — 카드 댓글(card_comments.author_nickname)과
--  동일한 패턴. 작성 당시 닉네임을 스냅샷으로 저장해 피드 카드 상단에 표시.
--  이후 작성자 닉네임이 바뀌어도 게시된 하이라이트는 그대로 유지.
-- ============================================================================

ALTER TABLE public.card_highlights
  ADD COLUMN IF NOT EXISTS author_nickname text;
