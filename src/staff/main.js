// =============================================================================
// STAFF APP ENTRY
// The staff portal is separate from the admin dashboard. It only admits staff
// accounts (products-only workspace) and forces a password change on first
// login. Admins are redirected to the admin portal.
// =============================================================================
import '../styles/admin.css';
import { isSupabaseConfigured } from '../config/supabase.js';
import { getSession, getProfile, signOut } from '../admin/auth.js';
import { renderLogin } from '../admin/login.js';
import { renderApp } from '../admin/app.js';
import { renderChangePassword } from '../admin/changePassword.js';
import { excludeThisDevice } from '../analytics/exclude.js';

// Visiting /staff marks this device immediately — even on the login screen —
// so staff browsing never lands in visitor insights.
excludeThisDevice();

const root = document.getElementById('staff-root');

const LOGIN_OPTS = {
  brandSub: 'Silver · Staff',
  lede: 'Sign in with your mobile number.',
  idLabel: 'Mobile number',
  idPlaceholder: '9876543210',
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
    return showLogin('This account is not authorised to access the staff portal.');
  }

  // This is the staff portal — admins belong on the admin portal.
  if (profile.role === 'admin') {
    await signOut();
    return showLogin('Administrators sign in at the admin portal: /admin');
  }

  // Staff must set their own password on first login.
  if (profile.mustChange) {
    renderChangePassword(root, profile.name, () => route(session), () => showLogin());
    return;
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
