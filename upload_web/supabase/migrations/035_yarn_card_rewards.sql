-- 카드 첫 열람 시 실타래 +1 보상 — 카드당 1회 영구 dedup
-- 사용자 명세(2026-06-15): 이전엔 클라이언트 localStorage(ds.yarnRewarded) 로만 추적이라
--   기기 변경/스토리지 초기화 시 같은 카드를 다시 보면 또 보상이 지급되던 문제.
--   서버에 unique 기록을 두고 RPC 안에서 INSERT … ON CONFLICT DO NOTHING 으로 영구 차단.

CREATE TABLE IF NOT EXISTS public.yarn_card_rewards (
  user_id      bigint    NOT NULL,
  card_id      bigint    NOT NULL,
  rewarded_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_id)
);

ALTER TABLE public.yarn_card_rewards ENABLE ROW LEVEL SECURITY;

-- RLS — RPC 안에서만 쓰임. 클라이언트 직접 select/write 차단.
DROP POLICY IF EXISTS "service can read yarn_card_rewards" ON public.yarn_card_rewards;
DROP POLICY IF EXISTS "service can write yarn_card_rewards" ON public.yarn_card_rewards;
CREATE POLICY "service can read yarn_card_rewards" ON public.yarn_card_rewards FOR SELECT USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service can write yarn_card_rewards" ON public.yarn_card_rewards FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role') WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- 카드 첫 열람 보상 RPC
-- 인자: p_user_id (state.userId 직접 전달), p_card_id
-- 반환: 사용자의 새 yarn_balance (이미 보상 받았으면 잔액 그대로 반환)
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

  -- 새 카드 — +1 적립
  UPDATE public.users
     SET yarn_balance = COALESCE(yarn_balance, 0) + 1
   WHERE user_id = p_user_id
   RETURNING yarn_balance INTO v_balance;

  RETURN COALESCE(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.reward_yarn_first_view(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reward_yarn_first_view(bigint, bigint) TO anon, authenticated, service_role;

COMMENT ON TABLE public.yarn_card_rewards IS
  '카드 첫 열람 +1 실타래 보상 추적. (user_id, card_id) UNIQUE — 영구 dedup.';
COMMENT ON FUNCTION public.reward_yarn_first_view IS
  '카드당 1회 +1 실타래 보상. 이미 받았으면 잔액 그대로 반환, 새 카드면 +1 적립 후 새 잔액 반환.';
