-- 025_card_candidates_bilingual.sql
-- card_candidates 에 *_original 컬럼 추가 + promote_candidate RPC 가 cards 로 함께 복사하도록 갱신.
--
-- 흐름 변경:
-- 1. 추출 직후 '번역' 버튼 한 번 클릭 = quote/script EN→KO 번역 + description/significance/keywords KO→EN 배치 번역.
-- 2. 저장 시 dashboard.js 가 *_original 까지 모두 보내고, save.js 가 candidates 에 함께 INSERT.
-- 3. 승인 시 promote_candidate 가 cards 로 *_original 까지 복사 — autoFill 추가 호출 거의 불필요.

ALTER TABLE public.card_candidates
  ADD COLUMN IF NOT EXISTS quote_original                text,
  ADD COLUMN IF NOT EXISTS script_excerpt_original       text,
  ADD COLUMN IF NOT EXISTS excerpt_description_original  text,
  ADD COLUMN IF NOT EXISTS significance_original         text,
  ADD COLUMN IF NOT EXISTS keywords_original             jsonb;

-- promote_candidate 갱신 — cards INSERT 시 *_original 포함.
-- cards 테이블에 이미 quote_original/script_excerpt_original 등이 있음(021/022/023 마이그레이션).
CREATE OR REPLACE FUNCTION public.promote_candidate(p_candidate_id bigint)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c record;
  new_card_id bigint;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO c
  FROM public.card_candidates
  WHERE candidate_id = p_candidate_id
    AND status = 'approved'
    AND promoted_card_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'candidate not promotable (must be approved and not yet promoted)';
  END IF;

  IF c.work_id IS NULL THEN
    RAISE EXCEPTION 'candidate has no work_id — cannot promote';
  END IF;

  INSERT INTO public.cards (
    work_id, quote, script_excerpt, excerpt_description,
    keywords, temperature, intensity, significance,
    quote_original, script_excerpt_original,
    excerpt_description_original, significance_original, keywords_original
  ) VALUES (
    c.work_id, c.quote, c.script_excerpt, c.excerpt_description,
    c.keywords, c.temperature, c.intensity, c.significance,
    c.quote_original, c.script_excerpt_original,
    c.excerpt_description_original, c.significance_original, c.keywords_original
  )
  RETURNING card_id INTO new_card_id;

  UPDATE public.card_candidates
  SET promoted_card_id = new_card_id
  WHERE candidate_id = p_candidate_id;

  RETURN new_card_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_candidate(bigint) TO authenticated;
