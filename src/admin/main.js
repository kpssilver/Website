// =============================================================================
// ADMIN APP ENTRY
// Shows the login screen until authenticated, then routes by role:
//   • admin  -> full dashboard
//   • staff  -> products-only dashboard (forced password change on first login)
//   • other  -> signed out with a message
// =============================================================================
import '../styles/admin.css';
import { isSupabaseConfigured } from '../config/supabase.js';
import { getSession, getProfile, signOut } from './auth.js';
import { renderLogin } from './login.js';
import { renderApp } from './app.js';
import { renderChangePassword } from './changePassword.js';

const root = document.getElementById('admin-root');

function showLogin(errorMsg = '') {
  renderLogin(root, (session) => route(session), errorMsg);
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

  // Staff must set their own password on first login.
  if (profile.role === 'staff' && profile.mustChange) {
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
