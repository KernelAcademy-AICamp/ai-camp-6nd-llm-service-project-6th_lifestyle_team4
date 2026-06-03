// 관리자 계정은 "아이디"만 받지만 Supabase Auth는 이메일을 요구합니다.
// 내부적으로 이 도메인을 붙여 가짜 이메일로 변환합니다.
// `.local` 은 RFC 6762로 예약된 TLD라 실제 메일 라우팅과 충돌하지 않습니다.
//
// ⚠️ 사용자 앱(web_pwa / Android / iOS)의 인증과는 "의도적으로" 분리된 네임스페이스다.
//    - 사용자 앱: `<id>@user.local` (한글·특수문자는 FNV-1a 해시 → `u_<hash>@user.local`)
//    - 관리자(여기): `<id>@admin.local` (해시 없음, ASCII 아이디 전제)
//    도메인을 분리해 관리자와 일반 사용자가 같은 auth 계정으로 절대 섞이지 않도록 한다.
export const ADMIN_EMAIL_DOMAIN = 'admin.local';

export function idToEmail(id) {
  const v = String(id || '').trim();
  if (!v) return '';
  return v.includes('@') ? v : `${v}@${ADMIN_EMAIL_DOMAIN}`;
}

export function emailToDisplayId(email) {
  if (!email) return '';
  const suffix = `@${ADMIN_EMAIL_DOMAIN}`;
  return email.endsWith(suffix) ? email.slice(0, -suffix.length) : email;
}
