// =============================================================================
// ADMIN APP ENTRY
// Shows the login screen until authenticated, then the insights dashboard.
// =============================================================================
import '../styles/admin.css';
import { isSupabaseConfigured } from '../config/supabase.js';
import { getSession } from './auth.js';
import { renderLogin } from './login.js';
import { renderDashboard } from './dashboard.js';

const root = document.getElementById('admin-root');

async function showDashboard(session) {
  await renderDashboard(root, session, showLogin);
}

function showLogin() {
  renderLogin(root, (session) => showDashboard(session));
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
  if (session) {
    showDashboard(session);
  } else {
    showLogin();
  }
}

boot();
