// =============================================================================
// ADMIN / STAFF LOGIN SCREEN
// Accepts the admin's email OR a staff member's mobile number.
// =============================================================================
import { signIn } from './auth.js';

export function renderLogin(root, onSuccess, initialError = '', opts = {}) {
  const {
    brandSub = 'Silver · Admin',
    lede = 'Sign in to manage KPS Silver.',
    idLabel = 'Email or mobile',
    idPlaceholder = 'admin@123 or 9876543210',
  } = opts;
  root.innerHTML = `
<div class="login-wrap">
  <div class="login-card">
    <div class="login-brand">
      <img class="login-mark" src="/favicon.svg" alt="KPS Silver" width="40" height="40" />
      <span class="login-brand-sub">${brandSub}</span>
    </div>
    <h1>Welcome back</h1>
    <p class="login-lede">${lede}</p>
    <form id="loginForm" novalidate>
      <label class="field">
        <span>${idLabel}</span>
        <input type="text" id="email" autocomplete="username" placeholder="${idPlaceholder}" required />
      </label>
      <label class="field">
        <span>Password</span>
        <input type="password" id="password" autocomplete="current-password" placeholder="••••••••" required />
      </label>
      <p class="login-error" id="loginError" ${initialError ? '' : 'hidden'}>${initialError}</p>
      <button type="submit" class="login-btn" id="loginBtn">Sign in</button>
    </form>
  </div>
</div>`;

  const form = root.querySelector('#loginForm');
  const btn = root.querySelector('#loginBtn');
  const errEl = root.querySelector('#loginError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const identifier = form.querySelector('#email').value.trim();
      const password = form.querySelector('#password').value;
      const session = await signIn(identifier, password);
      onSuccess(session);
    } catch (err) {
      errEl.textContent = err?.message || 'Unable to sign in. Check your credentials.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
}
