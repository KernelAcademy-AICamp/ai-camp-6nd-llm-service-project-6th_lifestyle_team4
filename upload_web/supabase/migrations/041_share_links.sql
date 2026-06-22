-- 공유 short URL — /m/?s=<6자> 로 referrer + card + bg + quote 묶음
-- 사용자 명세(2026-06): 한글 quote 가 들어간 URL 이 카카오톡에서 길게 보이는 문제
--   → 서버에 share_links 행 1개 만들고 6자 base62 short_id 발급. URL 은 ?s=xxxxxx 한 토큰.

CREATE TABLE IF NOT EXISTS public.share_links (
  short_id      text        PRIMARY KEY,
  referrer_id   bigint,
  card_id       bigint,
  bg_id         text,
  quote_b64     text,             -- 클라이언트가 URL-safe base64 로 보낸 그대로 (디코딩은 클라이언트)
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS share_links_created_idx ON public.share_links (created_at DESC);
CREATE INDEX IF NOT EXISTS share_links_referrer_idx ON public.share_links (referrer_id) WHERE referrer_id IS NOT NULL;

ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "share_links read public" ON public.share_links;
DROP POLICY IF EXISTS "share_links write via rpc" ON public.share_links;
CREATE POLICY "share_links read public" ON public.share_links FOR SELECT USING (true);
CREATE POLICY "share_links write via rpc" ON public.share_links FOR INSERT WITH CHECK (true);

-- short_id 생성: 6자 base62 (a-z A-Z 0-9). 62^6 = 56.8 billion → 충돌 거의 0.
CREATE OR REPLACE FUNCTION public._gen_short_id(p_len int DEFAULT 6)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  chars  text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i      int;
BEGIN
  FOR i IN 1..p_len LOOP
    result := result || substr(chars, (floor(random() * 62) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Share link 생성 RPC
-- 충돌 시 자동 재시도 (max 5회), 그래도 충돌이면 7자로 확장.
CREATE OR REPLACE FUNCTION public.create_share_link(
  p_referrer_id bigint,
  p_card_id     bigint,
  p_bg_id       text,
  p_quote_b64   text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id     text;
  v_tries  int := 0;
BEGIN
  LOOP
    v_tries := v_tries + 1;
    v_id := public._gen_short_id(CASE WHEN v_tries < 5 THEN 6 ELSE 7 END);
    BEGIN
      INSERT INTO public.share_links (short_id, referrer_id, card_id, bg_id, quote_b64)
      VALUES (v_id, p_referrer_id, p_card_id, p_bg_id, p_quote_b64);
      RETURN v_id;
    EXCEPTION WHEN unique_violation THEN
      IF v_tries >= 10 THEN
        RAISE;
      END IF;
      CONTINUE;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_share_link(bigint, bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_share_link(bigint, bigint, text, text) TO anon, authenticated, service_role;

COMMENT ON TABLE public.share_links IS '카드 공유 short URL — /m/?s=<short_id> 한 토큰으로 ref+card+bg+quote 묶기.';
COMMENT ON FUNCTION public.create_share_link IS 'short_id 6자 base62 발급 + share_links insert. 충돌 시 자동 재시도.';
