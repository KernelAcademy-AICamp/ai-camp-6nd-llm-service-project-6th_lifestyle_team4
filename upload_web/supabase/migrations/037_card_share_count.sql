-- 카드별 공유(다운로드) 카운트
-- 사용자 명세(2026-06): TODAY 카드 우하단 공유 아이콘 아래에 횟수 표시.

ALTER TABLE public.cards
  ADD COLUMN IF NOT EXISTS share_count integer NOT NULL DEFAULT 0;

-- RPC: 카드 share_count + 1, 새 값 반환
CREATE OR REPLACE FUNCTION public.increment_share_count(p_card_id bigint)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_new integer;
BEGIN
  IF p_card_id IS NULL THEN RETURN -1; END IF;
  UPDATE public.cards
     SET share_count = COALESCE(share_count, 0) + 1
   WHERE card_id = p_card_id
   RETURNING share_count INTO v_new;
  RETURN COALESCE(v_new, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.increment_share_count(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_share_count(bigint) TO anon, authenticated, service_role;

COMMENT ON COLUMN public.cards.share_count IS '공유(다운로드 또는 SNS 공유) 누적 횟수. increment_share_count RPC 로만 증가.';
