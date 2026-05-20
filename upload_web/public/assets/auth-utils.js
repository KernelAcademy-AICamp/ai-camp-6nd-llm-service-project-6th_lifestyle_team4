// 관리자 계정은 "아이디"만 받지만 Supabase Auth는 이메일을 요구합니다.
// 내부적으로 이 도메인을 붙여 가짜 이메일로 변환합니다.
// `.local` 은 RFC 6762로 예약된 TLD라 실제 메일 라우팅과 충돌하지 않습니다.
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
