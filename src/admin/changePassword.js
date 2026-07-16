// =============================================================================
// FORCE PASSWORD CHANGE
// Shown to a staff member on first login (must_change_password = true). They
// must set a new password before reaching the dashboard. On success we clear
// the flag via the staff_complete_password_change RPC.
// =============================================================================
import { supabase } from '../config/supabase.js';
import { signOut } from './auth.js';

export function renderChangePassword(root, name, onDone, onCancel) {
  root.innerHTML = `
<div class="login-wrap">
  <div class="login-card">
    <div class="login-brand">
      <span class="login-mark">KPS</span>
      <span class="login-brand-sub">Silver · Staff</span>
    </div>
    <h1>Set a new password</h1>
    <p class="login-lede">Welcome${name ? `, ${name}` : ''}. For security, please choose your own password before you continue.</p>
    <form id="cpForm" novalidate>
      <label class="field">
        <span>New password</span>
        <input type="password" id="cpNew" autocomplete="new-password" placeholder="At least 8 characters" required />
      </label>
      <label class="field">
        <span>Confirm new password</span>
        <input type="password" id="cpConfirm" autocomplete="new-password" placeholder="Re-enter password" required />
      </label>
      <p class="login-error" id="cpError" hidden></p>
      <button type="submit" class="login-btn" id="cpBtn">Save &amp; continue</button>
      <button type="button" class="dash-btn dash-btn--ghost" id="cpCancel" style="width:100%;margin-top:.6rem">Sign out</button>
    </form>
  </div>
</div>`;

  const form = root.querySelector('#cpForm');
  const btn = root.querySelector('#cpBtn');
  const errEl = root.querySelector('#cpError');
  const fail = (msg) => {
    errEl.textContent = msg;
    errEl.hidden = false;
    btn.disabled = false;
    btn.textContent = 'Save & continue';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const pw = form.querySelector('#cpNew').value;
    const confirm = form.querySelector('#cpConfirm').value;
    if (pw.length < 8) return fail('Password must be at least 8 characters.');
    if (pw !== confirm) return fail('Passwords do not match.');

    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const { error: pwErr } = await supabase.auth.updateUser({ password: pw });
      if (pwErr) throw pwErr;
      const { error: rpcErr } = await supabase.rpc('staff_complete_password_change');
      if (rpcErr) throw rpcErr;
      onDone();
    } catch (err) {
      fail(err?.message || 'Could not update the password. Please try again.');
    }
  });

  root.querySelector('#cpCancel').addEventListener('click', async () => {
    await signOut();
    if (onCancel) onCancel();
  });
}
