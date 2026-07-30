// =============================================================================
// TWO-FACTOR CHALLENGE (login)
// Shown after a correct password when the account has a verified authenticator.
// The admin enters the current 6-digit code to elevate the session to AAL2.
// =============================================================================
import { signOut, getVerifiedTotpFactor, verifyTotpCode } from './auth.js';

export function renderMfaChallenge(root, onDone, onCancel) {
  root.innerHTML = `
<div class="login-wrap">
  <div class="login-card">
    <div class="login-brand">
      <img class="login-mark" src="/favicon.svg" alt="KPS Silver" width="40" height="40" />
      <span class="login-brand-sub">Silver · Admin</span>
    </div>
    <h1>Two-factor verification</h1>
    <p class="login-lede">Enter the 6-digit code from your authenticator app to continue.</p>
    <form id="mfaForm" novalidate>
      <label class="field">
        <span>Authenticator code</span>
        <input type="text" id="mfaCode" inputmode="numeric" autocomplete="one-time-code"
               maxlength="6" pattern="[0-9]*" placeholder="123456" required />
      </label>
      <p class="login-error" id="mfaError" hidden></p>
      <button type="submit" class="login-btn" id="mfaBtn">Verify</button>
      <button type="button" class="dash-btn dash-btn--ghost" id="mfaCancel" style="width:100%;margin-top:.6rem">Sign out</button>
    </form>
  </div>
</div>`;

  const form = root.querySelector('#mfaForm');
  const btn = root.querySelector('#mfaBtn');
  const errEl = root.querySelector('#mfaError');
  const input = root.querySelector('#mfaCode');
  input.focus();

  const fail = (msg) => {
    errEl.textContent = msg;
    errEl.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Verify';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const code = input.value.replace(/\D/g, '');
    if (code.length !== 6) return fail('Enter the 6-digit code from your app.');
    btn.disabled = true;
    btn.textContent = 'Verifying…';
    try {
      const factor = await getVerifiedTotpFactor();
      if (!factor) return onDone(); // factor removed elsewhere — nothing to verify
      await verifyTotpCode(factor.id, code);
      onDone();
    } catch (err) {
      fail(err?.message || 'That code was incorrect. Please try again.');
    }
  });

  root.querySelector('#mfaCancel').addEventListener('click', async () => {
    await signOut();
    if (onCancel) onCancel();
  });
}
