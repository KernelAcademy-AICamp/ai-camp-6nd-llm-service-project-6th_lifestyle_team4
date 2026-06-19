-- 카드 첫 열람 보상량 변경 (1 → 300)
-- 사용자 명세(2026-06): 카드 첫 열람 시 실타래 300개 지급.
--   기존 yarn_card_rewards 테이블 / dedup 로직 그대로 두고, 적립량만 +1 → +300.

CREATE OR REPLACE FUNCTION public.reward_yarn_first_view(p_user_id bigint, p_card_id bigint)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inserted_count integer := 0;
  v_balance        integer;
BEGIN
  IF p_user_id IS NULL OR p_card_id IS NULL THEN
    RETURN -1;
  END IF;

  -- 이미 받은 카드면 충돌 → 0 rows. 새 카드면 1 row 삽입.
  INSERT INTO public.yarn_card_rewards (user_id, card_id)
  VALUES (p_user_id, p_card_id)
  ON CONFLICT (user_id, card_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  IF v_inserted_count = 0 THEN
    -- 이미 보상 받은 카드 — 잔액 그대로 반환
    SELECT yarn_balance INTO v_balance FROM public.users WHERE user_id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- 새 카드 — +300 적립
  UPDATE public.users
     SET yarn_balance = COALESCE(yarn_balance, 0) + 300
   WHERE user_id = p_user_id
   RETURNING yarn_balance INTO v_balance;

  RETURN COALESCE(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.reward_yarn_first_view(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reward_yarn_first_view(bigint, bigint) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.reward_yarn_first_view IS
  '카드당 1회 +300 실타래 보상 (구: +1). 이미 받았으면 잔액 그대로 반환, 새 카드면 +300 적립 후 새 잔액 반환.';
