// =============================================================================
// ADMIN APP ENTRY
// Shows the login screen until authenticated, then routes by role:
//   • admin  -> full dashboard
//   • staff  -> products-only dashboard (forced password change on first login)
//   • other  -> signed out with a message
// =============================================================================
import '../styles/admin.css';
import { isSupabaseConfigured } from '../config/supabase.js';
import { getSession, getProfile, signOut, needsMfaChallenge } from './auth.js';
import { renderLogin } from './login.js';
import { renderApp } from './app.js';
import { renderChangePassword } from './changePassword.js';
import { renderMfaChallenge } from './mfaChallenge.js';
import { excludeThisDevice } from '../analytics/exclude.js';

// Visiting /admin marks this device immediately — even on the login screen,
// before anyone signs in — so team traffic never lands in visitor insights.
excludeThisDevice();

const root = document.getElementById('admin-root');

const LOGIN_OPTS = {
  brandSub: 'Silver · Admin',
  lede: 'Sign in to manage KPS Silver.',
  idLabel: 'Email',
  idPlaceholder: 'admin@123',
};

function showLogin(errorMsg = '') {
  renderLogin(root, (session) => route(session), errorMsg, LOGIN_OPTS);
}

async function route(session) {
  let profile;
  try {
    profile = await getProfile();
  } catch {
    await signOut();
    return showLogin('Could not verify your account. Please sign in again.');
  }

  if (profile.role === 'disabled') {
    await signOut();
    return showLogin('This staff account has been deactivated. Contact the administrator.');
  }
  if (profile.role === 'none') {
    await signOut();
    return showLogin('This account is not authorised to access the dashboard.');
  }

  // This is the admin portal — staff belong on the staff portal.
  if (profile.role === 'staff') {
    await signOut();
    return showLogin('Staff sign in at the staff portal: /staff');
  }

  // If this account has a verified authenticator, require a 2FA code before the
  // dashboard is shown (elevate the session to AAL2).
  try {
    if (await needsMfaChallenge()) {
      return renderMfaChallenge(root, () => route(session), () => showLogin());
    }
  } catch {
    /* never lock the admin out on an MFA lookup hiccup */
  }

  renderApp(root, session, profile, () => showLogin());
}

async function boot() {
  if (!isSupabaseConfigured) {
    root.innerHTML =
      '<div class="login-wrap"><div class="login-card"><h1>Setup needed</h1>' +
      '<p class="login-lede">Supabase isn\'t configured. Copy <code>.env.example</code> to ' +
      '<code>.env.local</code>, add your project URL and anon key, then restart the dev server.</p>' +
      '</div></div>';
    return;
  }

  const session = await getSession();
  if (session) route(session);
  else showLogin();
}

boot();
