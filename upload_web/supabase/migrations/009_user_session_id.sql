-- ============================================================================
--  users.session_id — 같은 ID로 중복 로그인 방지용
--  최근 로그인 시 sessionId 생성 → users.session_id에 저장 + 클라이언트
--  localStorage에 저장. 클라이언트는 bootstrap에서 둘이 일치하는지 확인.
--  불일치 = 다른 기기에서 새 로그인이 발생 → 이전 세션은 강제 로그아웃.
-- ============================================================================

alter table public.users
  add column if not exists session_id text;

-- 기존 행은 NULL (다음 로그인 때 채워짐)
