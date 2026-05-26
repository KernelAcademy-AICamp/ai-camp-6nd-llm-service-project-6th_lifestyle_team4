import { getSupabase } from './supabase-client.js';
import { idToEmail } from './auth-utils.js';

const form = document.getElementById('login-form');
const idInput = document.getElementById('userid');
const passwordInput = document.getElementById('password');
const errorBox = document.getElementById('login-error');
const submitBtn = document.getElementById('login-submit');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
}
function clearError() {
  errorBox.textContent = '';
  errorBox.classList.add('hidden');
}

// 이미 세션이 있을 때:
//  - 관리자(app_metadata.role === 'admin') → 대시보드로 직행
//  - 익명 사용자(/m/ 에서 만들어진 anon 세션) → 로그인 폼은 유지하되 사용자 앱으로 갈 수 있게 함
(async () => {
  try {
    const sb = await getSupabase();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;
    const role = session.user?.app_metadata?.role;
    if (role === 'admin') {
      location.href = '/dashboard.html';
    }
    // 익명 세션이면 그냥 로그인 화면을 유지 (앱으로 가기 링크는 HTML에 별도로 있음)
  } catch (err) {
    showError(err.message);
  }
})();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const userid = idInput.value.trim();
  if (!userid) {
    showError('아이디를 입력하세요.');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in⋯';

  try {
    const sb = await getSupabase();
    const { error } = await sb.auth.signInWithPassword({
      email: idToEmail(userid),
      password: passwordInput.value,
    });
    if (error) throw error;
    location.href = '/dashboard.html';
  } catch (err) {
    showError(err.message || '로그인 실패');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
});
