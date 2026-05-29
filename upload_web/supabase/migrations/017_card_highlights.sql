-- ============================================================================
--  card_highlights — 사용자가 카드의 script_excerpt 일부를 드래그 선택해 저장한
--  '하이라이트' 게시물. 피드 > 하이라이트 카테고리에 노출.
--
--  - selected_text: 카드 본문에서 사용자가 선택해 가져온 텍스트 원문
--  - card_id: 어느 카드에서 가져왔는지 (제목·부제·작가·연도·시간 등을 JOIN 으로 표시)
--  - created_at: 작성 시각 (피드 정렬·시간 표기에 사용)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.card_highlights (
  highlight_id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  card_id        bigint NOT NULL REFERENCES public.cards(card_id)  ON DELETE CASCADE,
  user_id        bigint NOT NULL REFERENCES public.users(user_id)  ON DELETE CASCADE,
  selected_text  text   NOT NULL CHECK (char_length(trim(selected_text)) BETWEEN 1 AND 2000),
  user_note      text   CHECK (user_note IS NULL OR char_length(user_note) <= 500),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_highlights_created_idx
  ON public.card_highlights (created_at DESC);
CREATE INDEX IF NOT EXISTS card_highlights_user_idx
  ON public.card_highlights (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS card_highlights_card_idx
  ON public.card_highlights (card_id);

ALTER TABLE public.card_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_highlights_select_all      ON public.card_highlights;
DROP POLICY IF EXISTS card_highlights_insert_self     ON public.card_highlights;
DROP POLICY IF EXISTS card_highlights_update_self     ON public.card_highlights;
DROP POLICY IF EXISTS card_highlights_delete_self     ON public.card_highlights;

-- 누구나 읽기
CREATE POLICY card_highlights_select_all ON public.card_highlights
  FOR SELECT TO anon, authenticated
  USING (true);

-- 본인 행만 INSERT (익명 JWT 차단)
CREATE POLICY card_highlights_insert_self ON public.card_highlights
  FOR INSERT TO authenticated
  WITH CHECK (
    coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    AND EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.user_id = card_highlights.user_id
         AND u.anonymous_id = auth.uid()
    )
  );

-- 본인만 수정
CREATE POLICY card_highlights_update_self ON public.card_highlights
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u
                  WHERE u.user_id = card_highlights.user_id
                    AND u.anonymous_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u
                       WHERE u.user_id = card_highlights.user_id
                         AND u.anonymous_id = auth.uid()));

-- 본인만 삭제
CREATE POLICY card_highlights_delete_self ON public.card_highlights
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u
                  WHERE u.user_id = card_highlights.user_id
                    AND u.anonymous_id = auth.uid()));

-- Realtime publication (다른 사용자에게도 실시간 노출)
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.card_highlights';
  exception when duplicate_object then null;
           when others then null;
  end;
end$$;
