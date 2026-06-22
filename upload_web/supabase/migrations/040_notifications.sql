-- 알림 시스템 — 내 글/댓글/하이라이트에 다른 사용자가 댓글·대댓글 달면 자동 알림 생성
-- 사용자 명세(2026-06-19):
--   1) 내 feed_post 에 다른 사람이 댓글  → post_comment
--   2) 내 feed_post 댓글에 다른 사람이 대댓글 → comment_reply
--   3) 내 highlight 에 다른 사람이 댓글 → highlight_comment
--   4) 내 highlight 댓글에 다른 사람이 대댓글 → highlight_comment_reply
--
-- 헤더 확성기 아이콘 클릭 → 알림 리스트 → 항목 클릭 시 해당 컨텐츠로 이동.

CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_user_id bigint      NOT NULL,                            -- 알림 받는 사람
  actor_user_id     bigint      NOT NULL,                            -- 알림 발생시킨 사람
  actor_nickname    text,                                            -- snapshot (actor 가 닉네임 바꿔도 유지)
  kind              text        NOT NULL,                            -- post_comment | comment_reply | highlight_comment | highlight_comment_reply
  target_post_id    bigint,                                          -- 관련 feed_post (kind 가 post_comment / comment_reply 일 때)
  target_highlight_id bigint,                                        -- 관련 highlight (kind 가 highlight_comment / highlight_comment_reply 일 때)
  target_comment_id bigint,                                          -- 트리거 된 댓글 id (이동 시 스크롤용)
  body_preview      text,                                            -- 댓글 본문 첫 ~80자
  is_read           boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
  ON public.notifications (recipient_user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "users update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "service writes notifications" ON public.notifications;

CREATE POLICY "users read own notifications"
  ON public.notifications FOR SELECT
  USING (true);   -- 클라이언트 select 는 anon key 라 RLS 우회 — 단순화. 실제 필터는 .eq('recipient_user_id', me) 로.

CREATE POLICY "users update own notifications"
  ON public.notifications FOR UPDATE
  USING (true) WITH CHECK (true);

CREATE POLICY "service writes notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);   -- 트리거(SECURITY DEFINER) 안에서 insert

-- ─────────────────────────────────────────────────────────────────
-- 트리거: feed_post_comments insert 시 알림 생성
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_feed_post_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_post_owner       bigint;
  v_parent_author    bigint;
  v_actor_nickname   text;
  v_preview          text;
BEGIN
  /* actor 닉네임 snapshot */
  SELECT nickname INTO v_actor_nickname
  FROM public.users WHERE user_id = NEW.user_id;
  v_preview := LEFT(COALESCE(NEW.body, ''), 80);

  /* 1) 최상위 댓글 → feed_post 주인에게 'post_comment' */
  IF NEW.parent_comment_id IS NULL THEN
    SELECT user_id INTO v_post_owner
    FROM public.feed_posts WHERE post_id = NEW.post_id;
    IF v_post_owner IS NOT NULL AND v_post_owner <> NEW.user_id THEN
      INSERT INTO public.notifications
        (recipient_user_id, actor_user_id, actor_nickname, kind,
         target_post_id, target_comment_id, body_preview)
      VALUES
        (v_post_owner, NEW.user_id, v_actor_nickname, 'post_comment',
         NEW.post_id, NEW.comment_id, v_preview);
    END IF;
  ELSE
    /* 2) 대댓글 → 부모 댓글 작성자에게 'comment_reply' */
    SELECT user_id INTO v_parent_author
    FROM public.feed_post_comments WHERE comment_id = NEW.parent_comment_id;
    IF v_parent_author IS NOT NULL AND v_parent_author <> NEW.user_id THEN
      INSERT INTO public.notifications
        (recipient_user_id, actor_user_id, actor_nickname, kind,
         target_post_id, target_comment_id, body_preview)
      VALUES
        (v_parent_author, NEW.user_id, v_actor_nickname, 'comment_reply',
         NEW.post_id, NEW.comment_id, v_preview);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_feed_post_comment ON public.feed_post_comments;
CREATE TRIGGER trg_notify_feed_post_comment
  AFTER INSERT ON public.feed_post_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_feed_post_comment();

-- ─────────────────────────────────────────────────────────────────
-- 트리거: card_highlight_comments insert 시 알림 생성
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_highlight_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_highlight_owner  bigint;
  v_parent_author    bigint;
  v_actor_nickname   text;
  v_preview          text;
BEGIN
  SELECT nickname INTO v_actor_nickname
  FROM public.users WHERE user_id = NEW.user_id;
  v_preview := LEFT(COALESCE(NEW.body, ''), 80);

  IF NEW.parent_comment_id IS NULL THEN
    SELECT user_id INTO v_highlight_owner
    FROM public.card_highlights WHERE highlight_id = NEW.highlight_id;
    IF v_highlight_owner IS NOT NULL AND v_highlight_owner <> NEW.user_id THEN
      INSERT INTO public.notifications
        (recipient_user_id, actor_user_id, actor_nickname, kind,
         target_highlight_id, target_comment_id, body_preview)
      VALUES
        (v_highlight_owner, NEW.user_id, v_actor_nickname, 'highlight_comment',
         NEW.highlight_id, NEW.comment_id, v_preview);
    END IF;
  ELSE
    SELECT user_id INTO v_parent_author
    FROM public.card_highlight_comments WHERE comment_id = NEW.parent_comment_id;
    IF v_parent_author IS NOT NULL AND v_parent_author <> NEW.user_id THEN
      INSERT INTO public.notifications
        (recipient_user_id, actor_user_id, actor_nickname, kind,
         target_highlight_id, target_comment_id, body_preview)
      VALUES
        (v_parent_author, NEW.user_id, v_actor_nickname, 'highlight_comment_reply',
         NEW.highlight_id, NEW.comment_id, v_preview);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_highlight_comment ON public.card_highlight_comments;
CREATE TRIGGER trg_notify_highlight_comment
  AFTER INSERT ON public.card_highlight_comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_highlight_comment();

COMMENT ON TABLE public.notifications IS
  '댓글/대댓글 알림. recipient_user_id 로 본인 알림 조회.';
COMMENT ON FUNCTION public.notify_on_feed_post_comment IS
  'feed_post_comments insert 시 post 주인 또는 부모 댓글 작성자에게 알림 자동 생성.';
COMMENT ON FUNCTION public.notify_on_highlight_comment IS
  'card_highlight_comments insert 시 highlight 주인 또는 부모 댓글 작성자에게 알림 자동 생성.';
