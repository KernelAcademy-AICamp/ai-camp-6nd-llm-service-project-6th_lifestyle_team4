import { getSupabase } from './supabase-client.js';

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
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

// If already authenticated, skip the login screen.
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
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in...';

  try {
    const sb = await getSupabase();
    const { error } = await sb.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });
    if (error) throw error;
    location.href = '/dashboard.html';
  } catch (err) {
    showError(err.message || 'Login failed');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In';
  }
});
