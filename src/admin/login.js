// =============================================================================
// ADMIN LOGIN SCREEN
// =============================================================================
import { signIn } from './auth.js';

export function renderLogin(root, onSuccess) {
  root.innerHTML = `
<div class="login-wrap">
  <div class="login-card">
    <div class="login-brand">
      <span class="login-mark">KPS</span>
      <span class="login-brand-sub">Silver · Super Admin</span>
    </div>
    <h1>Welcome back</h1>
    <p class="login-lede">Sign in to view visitor insights for KPS Silver.</p>
    <form id="loginForm" novalidate>
      <label class="field">
        <span>Email</span>
        <input type="text" id="email" autocomplete="username" placeholder="admin@123" required />
      </label>
      <label class="field">
        <span>Password</span>
        <input type="password" id="password" autocomplete="current-password" placeholder="••••••••" required />
      </label>
      <p class="login-error" id="loginError" hidden></p>
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
      const email = form.querySelector('#email').value.trim();
      const password = form.querySelector('#password').value;
      const session = await signIn(email, password);
      onSuccess(session);
    } catch (err) {
      errEl.textContent = err?.message || 'Unable to sign in. Check your credentials.';
      errEl.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });
}
