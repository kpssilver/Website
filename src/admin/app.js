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
];
const STAFF_TABS = [
  { id: 'products', label: 'Products' },
  { id: 'stock', label: 'Stock' },
  { id: 'billing', label: 'Billing' },
  { id: 'business', label: 'Business' },
];

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
