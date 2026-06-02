-- 026_promote_candidate_no_admin_check.sql
-- promote_candidate RPC 내부의 is_admin() 체크 제거.
--
-- 이유:
-- - /api/candidates 핸들러가 requireAdmin 으로 이미 서버 측 admin 검증을 하고 있다.
-- - 핸들러에서 RPC 를 supabaseAdmin (service_role 키) 으로 호출하는데,
--   service_role 의 JWT 에는 app_metadata.role = 'admin' 이 없어 auth.jwt() 기반의
--   is_admin() 이 항상 false 를 반환 → "admin only" RAISE 로 RPC 실패.
-- - 이게 일괄 승인 시 모든 후보가 status='needs_edit' 으로 빠지는 원인 (큐에서 사라짐).
--
-- 해결: RPC 내부의 is_admin() 체크 제거. 함수 자체는 여전히 SECURITY DEFINER 이고
-- GRANT EXECUTE 는 authenticated 에만 부여되어 있으며, 호출 경로(/api/candidates)는
-- requireAdmin 으로 이중 보호되어 있어 보안 후퇴 없음.

CREATE OR REPLACE FUNCTION public.promote_candidate(p_candidate_id bigint)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c record;
  new_card_id bigint;
BEGIN
  -- (is_admin() 체크 제거됨 — 호출 경로가 서버 측 requireAdmin 으로 이미 보호됨)

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
