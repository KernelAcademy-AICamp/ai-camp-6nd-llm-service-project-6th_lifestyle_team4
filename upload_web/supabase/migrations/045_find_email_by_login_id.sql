-- 비밀번호 찾기 — ID 로 그 사용자의 auth.users.email 조회 RPC.
-- 클라이언트는 sb.auth.resetPasswordForEmail(email) 호출 전에 이걸로 email 받는다.
-- SECURITY DEFINER 로 auth.users 직접 조회 (RLS 우회).

CREATE OR REPLACE FUNCTION public.find_email_by_login_id(p_login_id text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_email text;
BEGIN
  IF p_login_id IS NULL OR p_login_id = '' THEN RETURN NULL; END IF;
  SELECT au.email INTO v_email
  FROM public.users u
  JOIN auth.users au ON au.id = u.anonymous_id
  WHERE u.login_id = p_login_id
  LIMIT 1;
  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.find_email_by_login_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_email_by_login_id(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.find_email_by_login_id IS
  'ID → 해당 사용자의 auth.users.email 반환. 비번 찾기에서 resetPasswordForEmail 호출용. 합성 이메일(<id>@user.local)도 그대로 반환 → 클라이언트가 분기.';
