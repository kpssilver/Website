// =============================================================================
// ADMIN APP SHELL
// Persistent top bar (brand, tabs, user, sign out) with a swappable view area
// for the two sections: Insights (analytics) and Content (the CMS editor).
// =============================================================================
import { signOut } from './auth.js';
import { renderInsights, disposeInsights } from './dashboard.js';
import { renderContent } from './content.js';

function shell(email) {
  return `
<div class="dash">
  <header class="dash-top">
    <div class="dash-title">
      <span class="dash-mark">KPS</span>
      <div>
        <h1>Super Admin</h1>
        <p>KPS Silver</p>
      </div>
    </div>
    <nav class="tabs" id="tabs">
      <button class="tab is-active" data-tab="insights">Insights</button>
      <button class="tab" data-tab="content">Content</button>
    </nav>
    <div class="dash-top-right">
      <span class="dash-user">${email}</span>
      <button class="dash-btn dash-btn--ghost" id="signOutBtn">Sign out</button>
    </div>
  </header>
  <main class="dash-main"><div id="viewRoot"></div></main>
</div>`;
}

export function renderApp(root, session, onSignOut) {
  const email = session?.user?.email || 'admin';
  root.innerHTML = shell(email);

  const view = root.querySelector('#viewRoot');
  const tabs = [...root.querySelectorAll('.tab')];
  let current = null;

  const show = (name) => {
    if (name === current) return;
    current = name;
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === name));
    // Stop the insights auto-refresh timers before leaving that view.
    disposeInsights();
    view.innerHTML = '';
    if (name === 'content') renderContent(view, session);
    else renderInsights(view, session);
  };

  tabs.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));

  root.querySelector('#signOutBtn').addEventListener('click', async () => {
    disposeInsights();
    await signOut();
    onSignOut();
  });

  show('insights');
}
