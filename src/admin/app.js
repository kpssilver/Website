// =============================================================================
// ADMIN APP SHELL
// Persistent top bar with role-based tabs and a swappable view area.
//   • admin: Insights · Shop activity · Products · Content · Staff
//   • staff: Products only
// =============================================================================
import { signOut } from './auth.js';
import { renderInsights, disposeInsights } from './dashboard.js';
import { renderContent } from './content.js';
import { renderProducts } from './products.js';
import { renderShopActivity, disposeShopActivity } from './shop-activity.js';
import { renderStaff } from './staff.js';
import { renderStock } from './stock.js';
import { renderInvoices } from './invoices.js';
import { renderBusiness } from './business.js';
import { renderQuotations } from './quotations.js';
import { renderSecurity } from './security.js';

const ADMIN_TABS = [
  { id: 'insights', label: 'Insights' },
  { id: 'shop', label: 'Shop activity' },
  { id: 'products', label: 'Products' },
  { id: 'stock', label: 'Stock' },
  { id: 'billing', label: 'Billing' },
  { id: 'business', label: 'Business' },
  { id: 'quotations', label: 'Quotations' },
  { id: 'content', label: 'Content' },
  { id: 'staff', label: 'Staff' },
  { id: 'security', label: 'Security' },
];
const STAFF_TABS = [
  { id: 'products', label: 'Products' },
  { id: 'stock', label: 'Stock' },
  { id: 'billing', label: 'Billing' },
  { id: 'business', label: 'Business' },
];

const THEME_KEY = 'kps-admin-theme';
const SUN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}
function wireThemeToggle(btn) {
  if (!btn) return;
  const render = () => {
    const light = currentTheme() !== 'dark';
    btn.innerHTML = light ? MOON_SVG : SUN_SVG;
    btn.title = light ? 'Switch to dark mode' : 'Switch to light mode';
    btn.setAttribute('aria-label', btn.title);
  };
  render();
  btn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage unavailable */
    }
    render();
  });
}

function shell(name, role, tabs) {
  const roleLabel = role === 'admin' ? 'Super Admin' : 'Staff';
  return `
<div class="dash">
  <header class="dash-top">
    <div class="dash-title">
      <img class="dash-mark" src="/favicon.svg" alt="KPS Silver" width="38" height="38" />
      <div>
        <h1>${roleLabel}</h1>
        <p>KPS Silver</p>
      </div>
    </div>
    <nav class="tabs" id="tabs">
      ${tabs.map((t, i) => `<button class="tab${i === 0 ? ' is-active' : ''}" data-tab="${t.id}">${t.label}</button>`).join('')}
    </nav>
    <div class="dash-top-right">
      <span class="dash-user">${name}</span>
      <button class="dash-btn dash-btn--ghost theme-toggle" id="themeToggle" type="button" title="Switch theme" aria-label="Switch theme"></button>
      <button class="dash-btn dash-btn--ghost" id="signOutBtn">Sign out</button>
    </div>
  </header>
  <main class="dash-main"><div id="viewRoot"></div></main>
</div>`;
}

export function renderApp(root, session, profile, onSignOut) {
  const role = profile?.role === 'staff' ? 'staff' : 'admin';
  const isAdmin = role === 'admin';
  const tabs = isAdmin ? ADMIN_TABS : STAFF_TABS;
  const name = profile?.name || session?.user?.email || (isAdmin ? 'Admin' : 'Staff');

  root.innerHTML = shell(name, role, tabs);

  wireThemeToggle(root.querySelector('#themeToggle'));

  const view = root.querySelector('#viewRoot');
  const tabEls = [...root.querySelectorAll('.tab')];
  let current = null;

  const show = (nm) => {
    if (nm === current) return;
    current = nm;
    tabEls.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === nm));
    // Stop any auto-refresh timers before leaving a view.
    disposeInsights();
    disposeShopActivity();
    view.innerHTML = '';
    if (nm === 'content') renderContent(view, session);
    else if (nm === 'products') renderProducts(view, session, { isAdmin });
    else if (nm === 'stock') renderStock(view, session, { isAdmin });
    else if (nm === 'billing') renderInvoices(view, session);
    else if (nm === 'business') renderBusiness(view, session, { isAdmin });
    else if (nm === 'quotations') renderQuotations(view, session);
    else if (nm === 'shop') renderShopActivity(view, session);
    else if (nm === 'staff') renderStaff(view, session);
    else if (nm === 'security') renderSecurity(view, session);
    else renderInsights(view, session);
  };

  tabEls.forEach((t) => t.addEventListener('click', () => show(t.dataset.tab)));

  root.querySelector('#signOutBtn').addEventListener('click', async () => {
    disposeInsights();
    disposeShopActivity();
    await signOut();
    onSignOut();
  });

  show(tabs[0].id);
}
