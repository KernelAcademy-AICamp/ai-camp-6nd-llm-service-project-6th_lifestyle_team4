-- 친구 초대 referral — 공유한 사람 + 공유 받아 가입한 사람 양쪽에 실타래 +600
-- 사용자 명세(2026-06):
--   · 공유 받은 사람이 회원가입 완료한 시점에 양쪽 +600 지급
--   · 같은 사용자(referee)가 두 번 가입해도 재지급 X (영구 dedup)

CREATE TABLE IF NOT EXISTS public.referrals (
  referee_id   bigint      NOT NULL PRIMARY KEY,            -- 가입자(피초대자). 한 명은 한 번만 referral 받음
  referrer_id  bigint      NOT NULL,                        -- 초대자
  redeemed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_id);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service can read referrals"  ON public.referrals;
DROP POLICY IF EXISTS "service can write referrals" ON public.referrals;
CREATE POLICY "service can read referrals"  ON public.referrals FOR SELECT USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service can write referrals" ON public.referrals FOR ALL    USING ((auth.jwt() ->> 'role') = 'service_role') WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- Referral 보상 지급 RPC
-- 인자: 초대자 user_id, 피초대자 user_id
-- 반환:
--    >=0 : 피초대자(가입자) 의 새 yarn_balance
--    -1  : 인자 NULL / 자기 자신 referral
--    -2  : 이미 referral 받은 referee (dedup)
--    -3  : referrer 또는 referee 가 users 에 없음
CREATE OR REPLACE FUNCTION public.redeem_referral(p_referrer_id bigint, p_referee_id bigint)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inserted_count integer := 0;
  v_referee_balance integer;
  v_referrer_exists integer;
  v_referee_exists integer;
BEGIN
  IF p_referrer_id IS NULL OR p_referee_id IS NULL OR p_referrer_id = p_referee_id THEN
    RETURN -1;
  END IF;

  SELECT 1 INTO v_referrer_exists FROM public.users WHERE user_id = p_referrer_id;
  SELECT 1 INTO v_referee_exists  FROM public.users WHERE user_id = p_referee_id;
  IF v_referrer_exists IS NULL OR v_referee_exists IS NULL THEN
    RETURN -3;
  END IF;

  INSERT INTO public.referrals (referrer_id, referee_id)
  VALUES (p_referrer_id, p_referee_id)
  ON CONFLICT (referee_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  IF v_inserted_count = 0 THEN
    RETURN -2;   -- 이미 referral 받은 referee — 재지급 X
  END IF;

  -- 양쪽 +600
  UPDATE public.users SET yarn_balance = COALESCE(yarn_balance, 0) + 600 WHERE user_id = p_referrer_id;
  UPDATE public.users SET yarn_balance = COALESCE(yarn_balance, 0) + 600
   WHERE user_id = p_referee_id
   RETURNING yarn_balance INTO v_referee_balance;

  RETURN COALESCE(v_referee_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_referral(bigint, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_referral(bigint, bigint) TO anon, authenticated, service_role;

COMMENT ON TABLE public.referrals IS '친구 초대 기록 — referee 한 명당 1회만 redeem.';
COMMENT ON FUNCTION public.redeem_referral IS '양쪽 +600 실타래 지급. (referee_id) UNIQUE 로 영구 dedup.';
