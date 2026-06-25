-- 콘텐츠 좋아요 — 피드 글(feed_posts) / 하이라이트(card_highlights) 공통 좋아요 테이블.
-- target_type 으로 분기 (feed_post | highlight) — 두 종류 콘텐츠를 하나의 테이블에 묶어 UI/카운트 통일.

CREATE TABLE IF NOT EXISTS public.content_likes (
  user_id     bigint      NOT NULL,
  target_type text        NOT NULL CHECK (target_type IN ('feed_post', 'highlight')),
  target_id   bigint      NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS content_likes_target_idx
  ON public.content_likes (target_type, target_id);

ALTER TABLE public.content_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "content_likes read all" ON public.content_likes;
DROP POLICY IF EXISTS "content_likes write via rpc" ON public.content_likes;

CREATE POLICY "content_likes read all"
  ON public.content_likes FOR SELECT USING (true);

CREATE POLICY "content_likes write via rpc"
  ON public.content_likes FOR ALL USING (true) WITH CHECK (true);

-- 토글 RPC — 누르면 좋아요/취소 + 새 카운트 반환. 로그인 user 만(p_user_id null 면 에러).
CREATE OR REPLACE FUNCTION public.toggle_content_like(
  p_user_id     bigint,
  p_target_type text,
  p_target_id   bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_liked boolean;
  v_count int;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'signin required'; END IF;
  IF p_target_type NOT IN ('feed_post', 'highlight') THEN
    RAISE EXCEPTION 'invalid target_type: %', p_target_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.content_likes
    WHERE user_id = p_user_id AND target_type = p_target_type AND target_id = p_target_id
  ) THEN
    DELETE FROM public.content_likes
    WHERE user_id = p_user_id AND target_type = p_target_type AND target_id = p_target_id;
    v_liked := false;
  ELSE
    INSERT INTO public.content_likes (user_id, target_type, target_id)
    VALUES (p_user_id, p_target_type, p_target_id);
    v_liked := true;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.content_likes
  WHERE target_type = p_target_type AND target_id = p_target_id;

  RETURN jsonb_build_object('liked', v_liked, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_content_like(bigint, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_content_like(bigint, text, bigint)
  TO anon, authenticated, service_role;

-- 카운트 집계 뷰 — feed/highlight 목록 1회 fetch 로 좋아요 수 표시.
CREATE OR REPLACE VIEW public.content_like_counts AS
SELECT target_type, target_id, COUNT(*) AS like_count
FROM public.content_likes
GROUP BY target_type, target_id;

GRANT SELECT ON public.content_like_counts TO anon, authenticated, service_role;

COMMENT ON TABLE public.content_likes IS
  '피드 글 / 하이라이트 좋아요 (target_type 으로 분기). PK=(user_id,target_type,target_id) UNIQUE.';
COMMENT ON FUNCTION public.toggle_content_like IS
  '좋아요 토글 — 있으면 DELETE, 없으면 INSERT. 반환: {liked, count}.';
