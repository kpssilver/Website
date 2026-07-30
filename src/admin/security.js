// =============================================================================
// SECURITY (admin)
// Two-factor authentication (authenticator app / TOTP) setup + password change.
//   • Enrol an authenticator: scan the QR (or type the secret), confirm a code.
//   • Once enabled, the admin must enter a code at every login.
//   • Change password: if 2FA is on, a current authenticator code is required
//     first (re-authentication) before the new password is saved.
// =============================================================================
import { supabase } from '../config/supabase.js';
import {
  listMfaFactors,
  getVerifiedTotpFactor,
  startTotpEnroll,
  verifyTotpCode,
  unenrollTotp,
} from './auth.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function renderSecurity(root) {
  root.innerHTML = `
  <div class="sec">
    <div class="pm-top">
      <div>
        <h2 class="pm-title">Security</h2>
        <p class="pm-lede">Protect your account with an authenticator app and manage your password.</p>
      </div>
    </div>

    <div class="panel sec-panel">
      <div class="panel-head"><h2>Authenticator app (2FA)</h2></div>
      <div id="secMfaRegion"><div class="cm-loading">Loading…</div></div>
    </div>

    <div class="panel sec-panel">
      <div class="panel-head"><h2>Change password</h2></div>
      <form class="sec-form" id="secPwForm">
        <div class="sec-grid">
          <label class="pm-lbl">New password
            <input name="new" type="password" autocomplete="new-password" placeholder="At least 8 characters" required />
          </label>
          <label class="pm-lbl">Confirm new password
            <input name="confirm" type="password" autocomplete="new-password" placeholder="Re-enter password" required />
          </label>
          <label class="pm-lbl" id="secPwCodeWrap" hidden>Authenticator code
            <input name="code" type="text" inputmode="numeric" maxlength="6" pattern="[0-9]*" placeholder="123456" autocomplete="one-time-code" />
            <span class="pm-field-note">Enter the current 6-digit code from your authenticator app to confirm this change.</span>
          </label>
        </div>
        <div class="sec-foot">
          <button type="submit" class="dash-btn" id="secPwBtn">Update password</button>
          <span class="pm-save-msg" id="secPwMsg"></span>
        </div>
      </form>
    </div>
  </div>`;

  const mfaRegion = root.querySelector('#secMfaRegion');

  // ---- Two-factor authentication -------------------------------------------
  let enroll = null; // in-progress enrolment { id, totp }

  const renderEnabled = (factor) => {
    mfaRegion.innerHTML = `
      <div class="sec-status is-on">
        <span class="sec-dot"></span>
        <div>
          <strong>Enabled</strong>
          <p>Your account is protected. You'll be asked for a code from your authenticator app each time you sign in.</p>
        </div>
      </div>
      <div class="sec-actions">
        <button class="dash-btn dash-btn--danger" id="secDisable" type="button" data-fid="${esc(factor.id)}">Remove authenticator</button>
      </div>`;
    mfaRegion.querySelector('#secDisable').addEventListener('click', onDisable);
  };

  const renderDisabled = () => {
    mfaRegion.innerHTML = `
      <div class="sec-status is-off">
        <span class="sec-dot"></span>
        <div>
          <strong>Not enabled</strong>
          <p>Add an authenticator app (Google Authenticator, Authy, 1Password, …) for a second layer of security.</p>
        </div>
      </div>
      <div class="sec-actions">
        <button class="dash-btn" id="secEnable" type="button">Set up authenticator</button>
      </div>`;
    mfaRegion.querySelector('#secEnable').addEventListener('click', onEnable);
  };

  const renderEnroll = () => {
    mfaRegion.innerHTML = `
      <div class="sec-enroll">
        <ol class="sec-steps">
          <li>Open your authenticator app and add a new account.</li>
          <li>Scan this QR code, or enter the setup key manually.</li>
          <li>Enter the 6-digit code the app shows to finish.</li>
        </ol>
        <div class="sec-enroll-grid">
          <div class="sec-qr" id="secQr"></div>
          <div class="sec-key">
            <span class="sec-key-lbl">Setup key</span>
            <code class="sec-key-val">${esc(enroll.totp?.secret || '')}</code>
          </div>
        </div>
        <form id="secVerifyForm" class="sec-verify">
          <label class="pm-lbl">Authenticator code
            <input name="code" type="text" inputmode="numeric" maxlength="6" pattern="[0-9]*" placeholder="123456" autocomplete="one-time-code" required />
          </label>
          <div class="sec-foot">
            <button type="submit" class="dash-btn" id="secVerifyBtn">Verify &amp; enable</button>
            <button type="button" class="dash-btn dash-btn--ghost" id="secVerifyCancel">Cancel</button>
            <span class="pm-save-msg" id="secVerifyMsg"></span>
          </div>
        </form>
      </div>`;

    // Supabase returns the QR either as raw <svg> markup or as an SVG data URL.
    // Render it robustly (as an <img> for a data URL, inline for raw SVG) so the
    // code is always scannable.
    const qrBox = mfaRegion.querySelector('#secQr');
    const qr = (enroll.totp?.qr_code || '').trim();
    if (qr.startsWith('<svg')) {
      qrBox.innerHTML = qr;
    } else if (qr) {
      const img = new Image();
      img.alt = 'Authenticator QR code';
      img.src = qr;
      qrBox.appendChild(img);
    }

    const form = mfaRegion.querySelector('#secVerifyForm');
    const msg = mfaRegion.querySelector('#secVerifyMsg');
    const btn = mfaRegion.querySelector('#secVerifyBtn');
    form.querySelector('input[name="code"]').focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = form.querySelector('input[name="code"]').value.replace(/\D/g, '');
      if (code.length !== 6) {
        msg.textContent = 'Enter the 6-digit code from your app.';
        msg.className = 'pm-save-msg is-error';
        return;
      }
      btn.disabled = true;
      msg.textContent = 'Verifying…';
      msg.className = 'pm-save-msg';
      try {
        await verifyTotpCode(enroll.id, code);
        enroll = null;
        await loadMfa();
      } catch (err) {
        msg.textContent = err?.message || 'That code was incorrect. Please try again.';
        msg.className = 'pm-save-msg is-error';
        btn.disabled = false;
      }
    });
    mfaRegion.querySelector('#secVerifyCancel').addEventListener('click', async () => {
      try {
        if (enroll?.id) await unenrollTotp(enroll.id);
      } catch {
        /* ignore */
      }
      enroll = null;
      await loadMfa();
    });
  };

  async function onEnable() {
    mfaRegion.innerHTML = '<div class="cm-loading">Preparing setup…</div>';
    try {
      enroll = await startTotpEnroll();
      renderEnroll();
    } catch (err) {
      mfaRegion.innerHTML = `<p class="empty">Could not start setup: ${esc(err.message)}</p>`;
    }
  }

  async function onDisable(e) {
    const factorId = e.currentTarget.dataset.fid;
    if (!confirm('Remove the authenticator? You will no longer be asked for a 2FA code when signing in.')) return;
    e.currentTarget.disabled = true;
    try {
      await unenrollTotp(factorId);
      await loadMfa();
    } catch (err) {
      alert(err?.message || 'Could not remove the authenticator.');
      e.currentTarget.disabled = false;
    }
  }

  const loadMfa = async () => {
    try {
      await listMfaFactors();
      const factor = await getVerifiedTotpFactor();
      if (factor) renderEnabled(factor);
      else renderDisabled();
      updatePwCodeVisibility();
    } catch (err) {
      mfaRegion.innerHTML = `<p class="empty">Could not load 2FA status: ${esc(err.message)}</p>`;
    }
  };

  // ---- Change password ------------------------------------------------------
  const pwForm = root.querySelector('#secPwForm');
  const pwMsg = root.querySelector('#secPwMsg');
  const pwBtn = root.querySelector('#secPwBtn');
  const pwCodeWrap = root.querySelector('#secPwCodeWrap');

  const updatePwCodeVisibility = async () => {
    const factor = await getVerifiedTotpFactor().catch(() => null);
    pwCodeWrap.hidden = !factor;
  };

  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(pwForm);
    const pw = String(fd.get('new') || '');
    const confirmPw = String(fd.get('confirm') || '');
    const code = String(fd.get('code') || '').replace(/\D/g, '');

    const fail = (m) => {
      pwMsg.textContent = m;
      pwMsg.className = 'pm-save-msg is-error';
      pwBtn.disabled = false;
      pwBtn.textContent = 'Update password';
    };

    if (pw.length < 8) return fail('Password must be at least 8 characters.');
    if (pw !== confirmPw) return fail('Passwords do not match.');

    pwBtn.disabled = true;
    pwBtn.textContent = 'Saving…';
    pwMsg.textContent = '';
    pwMsg.className = 'pm-save-msg';

    try {
      const factor = await getVerifiedTotpFactor();
      if (factor) {
        if (code.length !== 6) return fail('Enter your current 6-digit authenticator code.');
        await verifyTotpCode(factor.id, code); // re-authenticate before the change
      }
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;
      pwForm.reset();
      pwMsg.textContent = 'Password updated ✓';
      pwMsg.className = 'pm-save-msg is-ok';
      pwBtn.disabled = false;
      pwBtn.textContent = 'Update password';
    } catch (err) {
      fail(err?.message || 'Could not update the password. Please try again.');
    }
  });

  loadMfa();
}
