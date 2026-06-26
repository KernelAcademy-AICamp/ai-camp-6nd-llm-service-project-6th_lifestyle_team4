-- 계정 영구 삭제 RPC — public.users + auth.users 둘 다 삭제 (같은 email 재가입 가능하게)
-- 사용자 명세 (2026-06): "영구삭제한 아이디가 이미 사용 중이라고 나옴" → auth.users 남아있어서.
-- SECURITY DEFINER 로 함수 정의자(보통 postgres) 권한 사용해 auth.users 직접 삭제.

CREATE OR REPLACE FUNCTION public.delete_my_account(p_user_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_auth_uid uuid;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'no user'; END IF;

  -- 1) public.users 의 anonymous_id (= Supabase auth.users.id 와 동일 UUID) 조회
  SELECT anonymous_id INTO v_auth_uid
  FROM public.users WHERE user_id = p_user_id;

  -- 2) public.users row 삭제 — FK CASCADE 로 북마크/하이라이트/감상평/실타래 등 자동 정리
  DELETE FROM public.users WHERE user_id = p_user_id;

  -- 3) auth.users row 삭제 — identities/sessions/refresh_tokens 까지 CASCADE 자동 정리.
  --    이 단계가 빠지면 같은 email 재가입 시 'already registered' 에러 발생.
  IF v_auth_uid IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_auth_uid;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account(bigint) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.delete_my_account IS
  '본인 계정 영구 삭제 — public.users + auth.users 모두 삭제. 같은 email 재가입 가능. (GDPR/앱스토어 1.1.x 요건)';
