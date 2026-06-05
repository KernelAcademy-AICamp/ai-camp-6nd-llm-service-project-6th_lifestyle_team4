-- 027_promoted_card_fk_set_null.sql
-- card_candidates.promoted_card_id FK 를 ON DELETE SET NULL 로 변경.
--
-- 증상: 관리자 라이브러리에서 카드 삭제 시
--   "삭제 실패: update or delete on table "cards" violates foreign key constraint
--    "card_candidates_promoted_card_id_fkey" on table "card_candidates""
--
-- 원인: 024 migration 에서 promoted_card_id 가 REFERENCES public.cards(card_id) 만
--      지정되어 ON DELETE NO ACTION (기본값). 승격된 카드를 삭제하려고 하면 그 카드를
--      참조하는 candidate(promoted_card_id) 가 있어 차단됨.
--
-- 해결: ON DELETE SET NULL — 카드가 삭제되면 candidate.promoted_card_id 는 NULL 로.
--   · candidate row 자체는 보존 (감사 기록)
--   · 다시 promote 가능 (status='approved' AND promoted_card_id IS NULL)

ALTER TABLE public.card_candidates
  DROP CONSTRAINT IF EXISTS card_candidates_promoted_card_id_fkey;

ALTER TABLE public.card_candidates
  ADD CONSTRAINT card_candidates_promoted_card_id_fkey
  FOREIGN KEY (promoted_card_id)
  REFERENCES public.cards(card_id)
  ON DELETE SET NULL;
