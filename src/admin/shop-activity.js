// =============================================================================
// SHOP ACTIVITY (admin)
// Surfaces storefront engagement captured by the shop page: product views,
// category interest, searches and WhatsApp enquiries. Everything is derived
// from page_events rows tagged section = 'shop'.
//
// KPI cards are clickable: each opens a drawer with the underlying breakdown
// (ranked list + recent feed) built from the events already in memory.
// =============================================================================
import { fetchShopEvents } from './data.js';

let refreshTimer = null;
let escHandler = null;
let latestEvents = [];
let drawerOpen = false;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const nf = (n) => Number(n || 0).toLocaleString('en-IN');

function timeAgo(iso) {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const NICE = {
  product_view: 'Viewed',
  product_enquiry: 'Enquired',
  category_enquiry: 'Category enquiry',
  product_search: 'Searched',
  category_view: 'Browsed',
  shop_open: 'Opened shop',
};

// Count events of a type by their label, returning sorted [label, count] pairs.
function tally(events, type) {
  const map = new Map();
  events
    .filter((e) => (Array.isArray(type) ? type.includes(e.event_type) : e.event_type === type) && e.event_label)
    .forEach((e) => map.set(e.event_label, (map.get(e.event_label) || 0) + 1));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function rankList(pairs, emptyMsg) {
  if (!pairs.length) return `<p class="empty">${emptyMsg}</p>`;
  const max = pairs[0][1] || 1;
  return `<div class="sa-rank">${pairs
    .slice(0, 12)
    .map(
      ([label, count]) => `
      <div class="sa-rank-row">
        <span class="sa-rank-label">${esc(label)}</span>
        <span class="sa-rank-bar"><span style="width:${Math.round((count / max) * 100)}%"></span></span>
        <span class="sa-rank-count">${nf(count)}</span>
      </div>`,
    )
    .join('')}</div>`;
}

function feedList(events, types, emptyMsg, limit = 25) {
  const rows = events.filter((e) => types.includes(e.event_type)).slice(0, limit);
  if (!rows.length) return `<p class="empty">${emptyMsg}</p>`;
  return `<ul class="sa-feed">${rows
    .map(
      (e) => `
      <li>
        <span class="sa-feed-type sa-feed-type--${esc(e.event_type)}">${esc(NICE[e.event_type] || e.event_type)}</span>
        <span class="sa-feed-label">${esc(e.event_label || '—')}</span>
        <span class="sa-feed-time">${esc(timeAgo(e.created_at))}</span>
      </li>`,
    )
    .join('')}</ul>`;
}

// --- KPI drill-downs (title + html, built from in-memory events) -------------
function drillContent(type, events) {
  const count = (t) => events.filter((e) => e.event_type === t).length;
  switch (type) {
    case 'visits': {
      const uniques = new Set(events.filter((e) => e.event_type === 'shop_open').map((e) => e.session_key)).size;
      return {
        title: `Shop visits (${nf(count('shop_open'))})`,
        html:
          `<p class="drawer-note">${nf(count('shop_open'))} shop opens from ${nf(uniques)} unique session${uniques === 1 ? '' : 's'}.</p>` +
          `<h3 class="drawer-sub">Recent visits</h3>${feedList(events, ['shop_open'], 'No shop visits yet.')}`,
      };
    }
    case 'views':
      return {
        title: `Product views (${nf(count('product_view'))})`,
        html:
          `<h3 class="drawer-sub">Most viewed products</h3>${rankList(tally(events, 'product_view'), 'No product views yet.')}` +
          `<h3 class="drawer-sub">Recent views</h3>${feedList(events, ['product_view'], 'No product views yet.')}`,
      };
    case 'enquiries':
      return {
        title: `Enquiries (${nf(count('product_enquiry') + count('category_enquiry'))})`,
        html:
          `<h3 class="drawer-sub">Products enquired</h3>${rankList(tally(events, 'product_enquiry'), 'No product enquiries yet.')}` +
          `<h3 class="drawer-sub">Category enquiries</h3>${rankList(tally(events, 'category_enquiry'), 'No category enquiries yet.')}` +
          `<h3 class="drawer-sub">Recent enquiries</h3>${feedList(events, ['product_enquiry', 'category_enquiry'], 'No enquiries yet.')}`,
      };
    case 'searches':
      return {
        title: `Searches (${nf(count('product_search'))})`,
        html:
          `<h3 class="drawer-sub">Top search terms</h3>${rankList(tally(events, 'product_search'), 'No searches yet.')}` +
          `<h3 class="drawer-sub">Recent searches</h3>${feedList(events, ['product_search'], 'No searches yet.')}`,
      };
    default:
      return { title: 'Details', html: '<p class="empty">No data.</p>' };
  }
}

function render(root, events) {
  const count = (type) => events.filter((e) => e.event_type === type).length;
  const uniqueVisitors = new Set(events.map((e) => e.session_key)).size;

  const kpis = [
    { drill: 'visits', label: 'Shop visits', value: nf(count('shop_open')), sub: `${nf(uniqueVisitors)} unique sessions` },
    { drill: 'views', label: 'Product views', value: nf(count('product_view')), sub: 'detail opens · tap' },
    { drill: 'enquiries', label: 'Enquiries', value: nf(count('product_enquiry') + count('category_enquiry')), sub: 'WhatsApp clicks · tap' },
    { drill: 'searches', label: 'Searches', value: nf(count('product_search')), sub: 'search terms · tap' },
  ];

  root.innerHTML = `
  <div class="sa">
    <div class="sa-top">
      <div>
        <h2 class="pm-title">Shop activity</h2>
        <p class="pm-lede">How customers are browsing the storefront — updates automatically. Tap any card for the breakdown.</p>
      </div>
    </div>

    <section class="kpi-row">
      ${kpis
        .map(
          (c) => `
        <button class="kpi kpi--click" data-drill="${c.drill}" type="button">
          <span class="kpi-label">${c.label}</span>
          <span class="kpi-value">${c.value}</span>
          <span class="kpi-sub">${c.sub}</span>
        </button>`,
        )
        .join('')}
    </section>

    <div class="sa-grid">
      <div class="panel">
        <div class="panel-head"><h2>Most viewed products</h2></div>
        ${rankList(tally(events, 'product_view'), 'No product views yet.')}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Category interest</h2></div>
        ${rankList(tally(events, 'category_view'), 'No category browsing yet.')}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Most enquired products</h2></div>
        ${rankList(tally(events, 'product_enquiry'), 'No enquiries yet.')}
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Top searches</h2></div>
        ${rankList(tally(events, 'product_search'), 'No searches yet.')}
      </div>
      <div class="panel panel--wide">
        <div class="panel-head"><h2>Recent activity</h2></div>
        ${feedList(
          events,
          ['product_view', 'product_enquiry', 'category_enquiry', 'product_search', 'category_view'],
          'No shop activity yet.',
        )}
      </div>
    </div>
  </div>

  <div class="drawer" id="saDrawer" hidden>
    <div class="drawer-backdrop" data-drawer-close></div>
    <aside class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="saDrawerTitle">
      <header class="drawer-head">
        <h2 id="saDrawerTitle">Details</h2>
        <button class="drawer-close" data-drawer-close aria-label="Close">✕</button>
      </header>
      <div class="drawer-body" id="saDrawerBody"></div>
    </aside>
  </div>`;
}

function openDrill(root, type) {
  const drawer = root.querySelector('#saDrawer');
  if (!drawer) return;
  const { title, html } = drillContent(type, latestEvents);
  root.querySelector('#saDrawerTitle').textContent = title;
  root.querySelector('#saDrawerBody').innerHTML = html;
  drawer.hidden = false;
  drawerOpen = true;
  requestAnimationFrame(() => drawer.classList.add('is-open'));
}

function closeDrawer(root) {
  const drawer = root.querySelector('#saDrawer');
  if (!drawer) return;
  drawer.classList.remove('is-open');
  drawerOpen = false;
  setTimeout(() => {
    if (!drawer.classList.contains('is-open')) drawer.hidden = true;
  }, 320);
}

export function disposeShopActivity() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
  if (escHandler) document.removeEventListener('keydown', escHandler);
  escHandler = null;
  drawerOpen = false;
}

export async function renderShopActivity(root) {
  disposeShopActivity();
  root.innerHTML = `<div class="cm-loading">Loading shop activity…</div>`;

  const load = async () => {
    // Don't disrupt the admin while a drill-down drawer is open (or tab hidden).
    if (drawerOpen || document.hidden) return;
    try {
      latestEvents = await fetchShopEvents();
      render(root, latestEvents);
    } catch (err) {
      root.innerHTML = `<p class="empty">Could not load shop activity: ${esc(err.message)}</p>`;
    }
  };

  // Delegated clicks: open a drill on KPI tap, close on backdrop / ✕.
  root.onclick = (e) => {
    if (e.target.closest('[data-drawer-close]')) {
      closeDrawer(root);
      return;
    }
    const kpi = e.target.closest('.kpi[data-drill]');
    if (kpi) openDrill(root, kpi.dataset.drill);
  };

  escHandler = (e) => {
    if (e.key === 'Escape' && drawerOpen) closeDrawer(root);
  };
  document.addEventListener('keydown', escHandler);

  await load();
  refreshTimer = setInterval(load, 20000);
}
