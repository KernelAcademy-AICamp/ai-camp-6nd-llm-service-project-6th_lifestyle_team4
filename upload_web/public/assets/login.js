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

// 이미 세션이 있으면 바로 대시보드로.
(async () => {
  try {
    const sb = await getSupabase();
    const { data } = await sb.auth.getSession();
    if (data?.session) location.href = '/dashboard.html';
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
  submitBtn.textContent = 'Signing in...';

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
