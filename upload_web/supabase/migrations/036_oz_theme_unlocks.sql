-- OZ 테마 구매/해금 영구 기록 + 실타래 차감 RPC
-- 사용자 명세(2026-06-16): 클라이언트만 purchased 기록해서 yarn_balance 차감이 안 되던 문제.
--   서버에 unique 기록 + atomic 차감 RPC 추가. 이미 보유한 테마는 잔액 그대로 반환.

CREATE TABLE IF NOT EXISTS public.oz_theme_unlocks (
  user_id      bigint      NOT NULL,
  theme_id     text        NOT NULL,
  unlocked_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, theme_id)
);

ALTER TABLE public.oz_theme_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service can read oz_theme_unlocks" ON public.oz_theme_unlocks;
DROP POLICY IF EXISTS "service can write oz_theme_unlocks" ON public.oz_theme_unlocks;
CREATE POLICY "service can read oz_theme_unlocks"  ON public.oz_theme_unlocks FOR SELECT USING ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "service can write oz_theme_unlocks" ON public.oz_theme_unlocks FOR ALL    USING ((auth.jwt() ->> 'role') = 'service_role') WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- 테마 구매 RPC
-- 반환값:
--    >=0 → 차감 후 새 yarn_balance
--     -1 → 인자 NULL
--     -2 → 잔액 부족 (차감 X)
CREATE OR REPLACE FUNCTION public.purchase_oz_theme(p_user_id bigint, p_theme_id text, p_price int)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_already int := 0;
  v_balance int;
BEGIN
  IF p_user_id IS NULL OR p_theme_id IS NULL OR p_price IS NULL THEN
    RETURN -1;
  END IF;

  -- 이미 보유한 테마 — 차감 없이 현재 잔액 반환
  SELECT COUNT(*) INTO v_already
  FROM public.oz_theme_unlocks
  WHERE user_id = p_user_id AND theme_id = p_theme_id;

  IF v_already > 0 THEN
    SELECT yarn_balance INTO v_balance FROM public.users WHERE user_id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  -- atomic 차감 — 잔액 부족이면 0 rows
  UPDATE public.users
     SET yarn_balance = yarn_balance - p_price
   WHERE user_id = p_user_id
     AND COALESCE(yarn_balance, 0) >= p_price
   RETURNING yarn_balance INTO v_balance;

  IF v_balance IS NULL THEN
    RETURN -2;  -- 잔액 부족
  END IF;

  -- 영구 unlock 등록
  INSERT INTO public.oz_theme_unlocks (user_id, theme_id)
  VALUES (p_user_id, p_theme_id)
  ON CONFLICT (user_id, theme_id) DO NOTHING;

  RETURN COALESCE(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_oz_theme(bigint, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_oz_theme(bigint, text, int) TO anon, authenticated, service_role;

COMMENT ON TABLE public.oz_theme_unlocks IS
  'OZ 테마 영구 보유 기록. (user_id, theme_id) UNIQUE.';
COMMENT ON FUNCTION public.purchase_oz_theme IS
  'OZ 테마 구매 — yarn_balance 에서 p_price 차감 + oz_theme_unlocks 등록. 이미 보유 시 잔액 그대로, 잔액 부족 시 -2.';
