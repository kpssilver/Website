// =============================================================================
// SHOP ACTIVITY (admin)
// Surfaces storefront engagement captured by the shop page: product views,
// category interest, searches and WhatsApp enquiries. Everything is derived
// from page_events rows tagged section = 'shop'.
// =============================================================================
import { fetchShopEvents } from './data.js';

let refreshTimer = null;

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

// Count events of a type by their label, returning sorted [label, count] pairs.
function tally(events, type) {
  const map = new Map();
  events
    .filter((e) => e.event_type === type && e.event_label)
    .forEach((e) => map.set(e.event_label, (map.get(e.event_label) || 0) + 1));
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function rankList(pairs, emptyMsg) {
  if (!pairs.length) return `<p class="empty">${emptyMsg}</p>`;
  const max = pairs[0][1] || 1;
  return `<div class="sa-rank">${pairs
    .slice(0, 10)
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

function feedList(events, types, emptyMsg) {
  const rows = events.filter((e) => types.includes(e.event_type)).slice(0, 25);
  if (!rows.length) return `<p class="empty">${emptyMsg}</p>`;
  const nice = {
    product_view: 'Viewed',
    product_enquiry: 'Enquired',
    category_enquiry: 'Category enquiry',
    product_search: 'Searched',
    category_view: 'Browsed',
    shop_open: 'Opened shop',
  };
  return `<ul class="sa-feed">${rows
    .map(
      (e) => `
      <li>
        <span class="sa-feed-type sa-feed-type--${esc(e.event_type)}">${esc(nice[e.event_type] || e.event_type)}</span>
        <span class="sa-feed-label">${esc(e.event_label || '—')}</span>
        <span class="sa-feed-time">${esc(timeAgo(e.created_at))}</span>
      </li>`,
    )
    .join('')}</ul>`;
}

function render(root, events) {
  const count = (type) => events.filter((e) => e.event_type === type).length;
  const uniqueVisitors = new Set(events.map((e) => e.session_key)).size;

  const kpis = [
    { label: 'Shop visits', value: nf(count('shop_open')), sub: `${nf(uniqueVisitors)} unique sessions` },
    { label: 'Product views', value: nf(count('product_view')), sub: 'detail opens' },
    { label: 'Enquiries', value: nf(count('product_enquiry') + count('category_enquiry')), sub: 'WhatsApp clicks' },
    { label: 'Searches', value: nf(count('product_search')), sub: 'search terms entered' },
  ];

  root.innerHTML = `
  <div class="sa">
    <div class="sa-top">
      <div>
        <h2 class="pm-title">Shop activity</h2>
        <p class="pm-lede">How customers are browsing the storefront — updates automatically.</p>
      </div>
    </div>

    <section class="kpi-row">
      ${kpis
        .map(
          (c) => `
        <div class="kpi">
          <span class="kpi-label">${c.label}</span>
          <span class="kpi-value">${c.value}</span>
          <span class="kpi-sub">${c.sub}</span>
        </div>`,
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
  </div>`;
}

export function disposeShopActivity() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

export async function renderShopActivity(root) {
  root.innerHTML = `<div class="cm-loading">Loading shop activity…</div>`;

  const load = async () => {
    try {
      const events = await fetchShopEvents();
      render(root, events);
    } catch (err) {
      root.innerHTML = `<p class="empty">Could not load shop activity: ${esc(err.message)}</p>`;
    }
  };

  await load();
  disposeShopActivity();
  refreshTimer = setInterval(load, 20000);
}
