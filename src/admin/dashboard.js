// =============================================================================
// INSIGHTS VIEW
// KPI cards (clickable → drill-down drawer), a live "viewing now" count that
// auto-refreshes, a sitewide breakdown, a visitor map, charts, and a
// clickable recent-sessions table that opens a per-visitor activity drawer.
// =============================================================================
import Chart from 'chart.js/auto';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  fetchSummary,
  fetchDailyTraffic,
  fetchSectionEngagement,
  fetchDeviceBreakdown,
  fetchCountryBreakdown,
  fetchCityBreakdown,
  fetchEventCounts,
  fetchRecentSessions,
  fetchLocatedSessions,
  fetchLiveSessions,
  fetchAllSessions,
  fetchRecentEvents,
  fetchSessionDetail,
} from './data.js';

// --- Brand palette -----------------------------------------------------------
const C = {
  rose: '#C98B7B',
  roseHi: '#E9BCA9',
  glow: '#8C1E2C',
  wine: '#5E1220',
  silver: '#CBD1DA',
  silverHi: '#F5F7FA',
  gold: '#D9B382',
};
const SERIES = [C.roseHi, C.rose, C.gold, C.glow, C.silver, '#9C6B5E', '#7A2531'];

Chart.defaults.color = 'rgba(245,247,250,0.72)';
Chart.defaults.font.family = 'Mulish, sans-serif';
Chart.defaults.borderColor = 'rgba(233,188,169,0.12)';

const KPI_TICK_MS = 15000; // light refresh: KPIs + live drawer
const FULL_REFRESH_MS = 60000; // heavy refresh: charts / map / tables

const registry = { charts: [], map: null, timers: [], escHandler: null, root: null };

// --- Formatting helpers ------------------------------------------------------
const nf = (n) => Number(n || 0).toLocaleString();

function fmtDuration(sec) {
  sec = Math.round(Number(sec) || 0);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function relTime(iso) {
  if (!iso) return '—';
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function flag(cc) {
  if (!cc || cc.length !== 2) return '🌐';
  return cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function placeOf(r) {
  return [r.city, r.country].filter(Boolean).join(', ') || 'Unknown';
}
function deviceLabel(r) {
  return [titleCase(r.device_type), r.os, r.browser].filter(Boolean).join(' · ') || '—';
}
const eventLabel = (t) => titleCase(String(t).replace(/_/g, ' '));

// --- View markup -------------------------------------------------------------
function viewMarkup() {
  return `
  <div class="view-toolbar">
    <span class="live-pill" id="livePill"><span class="live-dot"></span> Live · auto-updating</span>
    <span class="dash-updated" id="dashUpdated"></span>
    <button class="dash-btn" id="refreshBtn" title="Refresh now">↻ Refresh</button>
  </div>

  <section class="kpi-row" id="kpiRow"></section>

  <section class="dash-grid">
    <div class="panel panel--wide">
      <div class="panel-head"><h2>Sitewide breakdown</h2></div>
      <div class="table-scroll">
        <table class="sessions-table" id="breakdownTable">
          <thead>
            <tr><th>Section</th><th>Reach</th><th>Unique viewers</th><th>Total time</th><th>Avg time / viewer</th><th>Share of time</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <div class="panel panel--wide">
      <div class="panel-head">
        <h2>Where visitors are viewing from</h2>
        <div class="map-filter" id="mapFilter">
          <button class="chip is-active" data-days="">All</button>
          <button class="chip" data-days="30">30d</button>
          <button class="chip" data-days="7">7d</button>
        </div>
      </div>
      <div id="map" class="map"></div>
      <p class="panel-note" id="mapNote"></p>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Daily traffic</h2></div>
      <div class="chart-box"><canvas id="trafficChart"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Time spent per section</h2></div>
      <div class="chart-box"><canvas id="sectionChart"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Devices</h2></div>
      <div class="chart-box chart-box--sm"><canvas id="deviceChart"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Interactions</h2></div>
      <div class="chart-box"><canvas id="eventChart"></canvas></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Top countries</h2></div>
      <div class="rank-list" id="countryList"></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Top cities</h2></div>
      <div class="rank-list" id="cityList"></div>
    </div>

    <div class="panel panel--wide">
      <div class="panel-head">
        <h2>Recent sessions</h2>
        <span class="panel-hint">Tap a row for full visitor detail</span>
      </div>
      <div class="table-scroll">
        <table class="sessions-table" id="sessionsTable">
          <thead>
            <tr><th>When</th><th>Location</th><th>Device</th><th>Browser / OS</th><th>Time on site</th><th>Source</th></tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </section>

  <div class="drawer" id="drawer" hidden>
    <div class="drawer-backdrop" data-drawer-close></div>
    <aside class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
      <header class="drawer-head">
        <button class="drawer-back" id="drawerBack" hidden>‹ Back</button>
        <h2 id="drawerTitle">Details</h2>
        <button class="drawer-close" data-drawer-close aria-label="Close">✕</button>
      </header>
      <div class="drawer-body" id="drawerBody"></div>
    </aside>
  </div>`;
}

// --- KPI cards ----------------------------------------------------------------
function renderKpis(root, s, devices) {
  const topDevice = (devices || []).slice().sort((a, b) => b.sessions - a.sessions)[0];
  const totalDev = (devices || []).reduce((acc, d) => acc + Number(d.sessions || 0), 0) || 1;
  const devPct = topDevice ? Math.round((topDevice.sessions / totalDev) * 100) : 0;

  const cards = [
    { drill: 'live', label: 'Viewing now', value: nf(s.live_now), sub: 'active right now', live: true },
    { drill: 'visitors', label: 'Total visitors', value: nf(s.total_sessions), sub: `${nf(s.sessions_today)} today` },
    { drill: 'avgtime', label: 'Avg. time on site', value: fmtDuration(s.avg_time_seconds), sub: 'tap for sessions' },
    { drill: 'location', label: 'Shared location', value: nf(s.sessions_with_location), sub: `${nf(s.located_sessions)} on map` },
    { drill: 'events', label: 'Interactions', value: nf(s.total_events), sub: 'clicks & CTAs' },
    {
      drill: 'devices',
      label: 'Devices',
      value: topDevice ? titleCase(topDevice.device_type) : '—',
      sub: topDevice ? `${devPct}% of visits · tap` : 'no data',
    },
  ];
  root.querySelector('#kpiRow').innerHTML = cards
    .map(
      (c) => `
    <button class="kpi kpi--click" data-drill="${c.drill}" type="button">
      <span class="kpi-label">${c.live ? '<span class="live-dot"></span> ' : ''}${c.label}</span>
      <span class="kpi-value">${c.value}</span>
      <span class="kpi-sub">${c.sub}</span>
    </button>`,
    )
    .join('');
}

// --- Sitewide breakdown ------------------------------------------------------
function renderBreakdown(root, sections, totalSessions) {
  const body = root.querySelector('#breakdownTable tbody');
  if (!sections.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No section data yet.</td></tr>`;
    return;
  }
  const sorted = [...sections].sort((a, b) => b.total_time_seconds - a.total_time_seconds);
  const totalTime = sorted.reduce((acc, r) => acc + Number(r.total_time_seconds || 0), 0) || 1;

  body.innerHTML = sorted
    .map((r) => {
      const reach = totalSessions ? Math.round((r.unique_viewers / totalSessions) * 100) : 0;
      const share = Math.round((r.total_time_seconds / totalTime) * 100);
      return `
      <tr>
        <td>${titleCase(r.section)}</td>
        <td><span class="reach"><span class="reach-bar"><span style="width:${Math.min(reach, 100)}%"></span></span><span class="reach-pct">${reach}%</span></span></td>
        <td>${nf(r.unique_viewers)}</td>
        <td>${fmtDuration(r.total_time_seconds)}</td>
        <td>${fmtDuration(r.avg_time_seconds)}</td>
        <td>${share}%</td>
      </tr>`;
    })
    .join('');
}

// --- Charts ------------------------------------------------------------------
function makeTrafficChart(canvas, rows) {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: rows.map((r) => new Date(r.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
      datasets: [
        {
          label: 'Sessions',
          data: rows.map((r) => r.sessions),
          borderColor: C.roseHi,
          backgroundColor: 'rgba(233,188,169,0.15)',
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: C.roseHi,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function makeSectionChart(canvas, rows) {
  const sorted = [...rows].sort((a, b) => b.total_time_seconds - a.total_time_seconds);
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map((r) => titleCase(r.section)),
      datasets: [
        {
          label: 'Total minutes',
          data: sorted.map((r) => Math.round((r.total_time_seconds / 60) * 10) / 10),
          backgroundColor: C.rose,
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            afterLabel: (ctx) => {
              const r = sorted[ctx.dataIndex];
              return `${nf(r.unique_viewers)} viewers · avg ${fmtDuration(r.avg_time_seconds)}`;
            },
          },
        },
      },
      scales: { x: { beginAtZero: true, title: { display: true, text: 'minutes' } } },
    },
  });
}

function makeDeviceChart(canvas, rows) {
  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: rows.map((r) => titleCase(r.device_type)),
      datasets: [{ data: rows.map((r) => r.sessions), backgroundColor: SERIES, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 14 } } },
    },
  });
}

function makeEventChart(canvas, rows) {
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map((r) => eventLabel(r.event_type)),
      datasets: [{ label: 'Count', data: rows.map((r) => r.total), backgroundColor: C.gold, borderRadius: 6 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

// --- Rank lists --------------------------------------------------------------
function renderRankList(el, rows, opts) {
  if (!rows.length) {
    el.innerHTML = `<p class="empty">No data yet.</p>`;
    return;
  }
  const max = Math.max(...rows.map((r) => r.sessions), 1);
  el.innerHTML = rows
    .map((r) => {
      const pct = Math.round((r.sessions / max) * 100);
      return `
      <div class="rank-row">
        <span class="rank-name">${opts.name(r)}</span>
        <span class="rank-bar"><span style="width:${pct}%"></span></span>
        <span class="rank-val">${nf(r.sessions)}</span>
      </div>`;
    })
    .join('');
}

// Small reusable bar list from arbitrary {name,count} pairs.
function barListHtml(pairs) {
  if (!pairs.length) return `<p class="empty">No data.</p>`;
  const max = Math.max(...pairs.map((p) => p.count), 1);
  return `<div class="rank-list">${pairs
    .map(
      (p) => `<div class="rank-row"><span class="rank-name">${esc(p.name)}</span><span class="rank-bar"><span style="width:${Math.round(
        (p.count / max) * 100,
      )}%"></span></span><span class="rank-val">${nf(p.count)}</span></div>`,
    )
    .join('')}</div>`;
}

function groupCount(rows, key) {
  const m = new Map();
  rows.forEach((r) => {
    const k = titleCase(r[key]) || 'Unknown';
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

// --- Sessions table (reusable) -----------------------------------------------
function sessionRowsHtml(rows) {
  return rows
    .map((r) => {
      const src = r.location_source
        ? `<span class="tag tag--${r.location_source}">${r.location_source.toUpperCase()}</span>`
        : '<span class="tag">—</span>';
      return `
      <tr class="row-click" data-session="${esc(r.session_key)}">
        <td>${relTime(r.started_at)}</td>
        <td>${flag(r.country_code)} ${esc(placeOf(r))}</td>
        <td>${esc(titleCase(r.device_type) || '—')}</td>
        <td>${esc([r.browser, r.os].filter(Boolean).join(' · ') || '—')}</td>
        <td>${fmtDuration(r.total_time_seconds)}</td>
        <td>${src}</td>
      </tr>`;
    })
    .join('');
}

function renderSessions(el, rows) {
  const body = el.querySelector('tbody');
  body.innerHTML = rows.length
    ? sessionRowsHtml(rows)
    : `<tr><td colspan="6" class="empty">No sessions recorded yet.</td></tr>`;
}

function sessionsTableHtml(rows) {
  if (!rows.length) return `<p class="empty">No sessions.</p>`;
  return `<div class="table-scroll"><table class="sessions-table">
    <thead><tr><th>When</th><th>Location</th><th>Device</th><th>Browser / OS</th><th>Time</th><th>Source</th></tr></thead>
    <tbody>${sessionRowsHtml(rows)}</tbody></table></div>`;
}

// --- Map ---------------------------------------------------------------------
function renderMap(rows) {
  if (registry.map) {
    registry.map.remove();
    registry.map = null;
  }
  const map = L.map('map', { scrollWheelZoom: false, attributionControl: true }).setView([22.5, 79], 4);
  registry.map = map;

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    maxZoom: 19,
  }).addTo(map);

  const pts = [];
  rows.forEach((r) => {
    if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return;
    pts.push([r.latitude, r.longitude]);
    const place = [r.city, r.region, r.country].filter(Boolean).join(', ') || 'Unknown';
    L.circleMarker([r.latitude, r.longitude], {
      radius: 6,
      color: r.location_source === 'gps' ? C.roseHi : C.gold,
      weight: 1.5,
      fillColor: r.location_source === 'gps' ? C.rose : C.gold,
      fillOpacity: 0.55,
    })
      .addTo(map)
      .bindPopup(`<strong>${esc(place)}</strong><br>Time on site: ${fmtDuration(r.total_time_seconds)}<br>Source: ${(r.location_source || 'n/a').toUpperCase()}`);
  });

  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 8 });
  setTimeout(() => map.invalidateSize(), 100);
  return pts.length;
}

// =============================================================================
// DRAWER (drill-downs + per-visitor detail)
// =============================================================================
const drawerStack = [];

function drawerEls() {
  const root = registry.root;
  return {
    drawer: root.querySelector('#drawer'),
    title: root.querySelector('#drawerTitle'),
    body: root.querySelector('#drawerBody'),
    back: root.querySelector('#drawerBack'),
  };
}

function isDrawerOpen() {
  const { drawer } = drawerEls();
  return drawer && !drawer.hidden;
}

function openDrawer() {
  const { drawer } = drawerEls();
  drawer.hidden = false;
  requestAnimationFrame(() => drawer.classList.add('is-open'));
}

function closeDrawer() {
  const { drawer } = drawerEls();
  drawer.classList.remove('is-open');
  drawerStack.length = 0;
  setTimeout(() => {
    if (!drawer.classList.contains('is-open')) drawer.hidden = true;
  }, 320);
}

async function showTop() {
  const { title, body, back } = drawerEls();
  const entry = drawerStack[drawerStack.length - 1];
  if (!entry) return;
  back.hidden = drawerStack.length <= 1;
  body.innerHTML = `<div class="drawer-loading">Loading…</div>`;
  try {
    const res = await entry.render();
    if (drawerStack[drawerStack.length - 1] !== entry) return; // navigated away
    title.textContent = res.title || entry.title || 'Details';
    body.innerHTML = res.html;
  } catch (err) {
    title.textContent = 'Error';
    body.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
  }
}

function pushDrawer(entry) {
  drawerStack.push(entry);
  if (!isDrawerOpen()) openDrawer();
  showTop();
}

function openDrill(type) {
  const entry = DRILLS[type];
  if (!entry) return;
  drawerStack.length = 0;
  pushDrawer({ ...entry });
}

function openVisitorDetail(sessionKey) {
  pushDrawer({ title: 'Visitor detail', render: () => renderVisitorDetail(sessionKey) });
}

// --- Drill renderers (return { title, html }) --------------------------------
async function renderLiveDrill() {
  const rows = await fetchLiveSessions();
  const html =
    `<p class="drawer-note">${rows.length} visitor${rows.length === 1 ? '' : 's'} active in the last 45 seconds. Refreshes automatically.</p>` +
    sessionsTableHtml(rows);
  return { title: `Viewing now (${rows.length})`, html };
}

async function renderVisitorsDrill() {
  const rows = await fetchAllSessions();
  return { title: `All visitors (${rows.length})`, html: sessionsTableHtml(rows) };
}

async function renderTimeDrill() {
  const rows = await fetchAllSessions();
  rows.sort((a, b) => (b.total_time_seconds || 0) - (a.total_time_seconds || 0));
  return { title: 'Time on site — longest first', html: sessionsTableHtml(rows) };
}

async function renderLocationDrill() {
  const rows = (await fetchAllSessions()).filter((r) => r.location_source);
  return { title: `Shared location (${rows.length})`, html: sessionsTableHtml(rows) };
}

async function renderEventsDrill() {
  const [counts, recent] = await Promise.all([fetchEventCounts(), fetchRecentEvents(60)]);
  const countsHtml = barListHtml(counts.map((c) => ({ name: eventLabel(c.event_type), count: c.total })));
  const recentHtml = recent.length
    ? `<ul class="timeline">${recent
        .map(
          (e) => `<li><span class="tl-time">${relTime(e.created_at)}</span><span class="tl-body"><strong>${esc(
            eventLabel(e.event_type),
          )}</strong>${e.event_label ? ` — ${esc(e.event_label)}` : ''}${
            e.section ? ` <span class="tl-sec">${esc(titleCase(e.section))}</span>` : ''
          }</span></li>`,
        )
        .join('')}</ul>`
    : `<p class="empty">No interactions yet.</p>`;
  return {
    title: 'Interactions',
    html: `<h3 class="drawer-sub">By type</h3>${countsHtml}<h3 class="drawer-sub">Recent activity</h3>${recentHtml}`,
  };
}

async function renderDevicesDrill() {
  const rows = await fetchAllSessions();
  const html =
    `<h3 class="drawer-sub">Device type</h3>${barListHtml(groupCount(rows, 'device_type'))}` +
    `<h3 class="drawer-sub">Operating system</h3>${barListHtml(groupCount(rows, 'os'))}` +
    `<h3 class="drawer-sub">Browser</h3>${barListHtml(groupCount(rows, 'browser'))}`;
  return { title: 'Device details', html };
}

async function renderVisitorDetail(sessionKey) {
  const { session: sx, sections, events } = await fetchSessionDetail(sessionKey);
  if (!sx) return { title: 'Visitor detail', html: `<p class="empty">Session not found.</p>` };

  const facts = [
    ['Location', `${flag(sx.country_code)} ${esc([sx.city, sx.region, sx.country].filter(Boolean).join(', ') || 'Unknown')}`],
    ['Device', esc(titleCase(sx.device_type) || '—')],
    ['Operating system', esc(sx.os || '—')],
    ['Browser', esc(sx.browser || '—')],
    ['Location source', sx.location_source ? sx.location_source.toUpperCase() : '—'],
    ['Screen', sx.screen_width ? `${sx.screen_width} × ${sx.screen_height}` : '—'],
    ['Language', esc(sx.language || '—')],
    ['Referrer', esc(sx.referrer || 'Direct')],
    ['Entry page', esc(sx.entry_page || '—')],
    ['First seen', new Date(sx.started_at).toLocaleString()],
    ['Last seen', `${new Date(sx.last_seen_at).toLocaleString()} (${relTime(sx.last_seen_at)})`],
    ['Total time', fmtDuration(sx.total_time_seconds)],
  ];

  const factsHtml = `<div class="facts">${facts
    .map(([k, v]) => `<div class="fact"><span class="fact-k">${k}</span><span class="fact-v">${v}</span></div>`)
    .join('')}</div>`;

  const uaHtml = sx.user_agent
    ? `<h3 class="drawer-sub">Device string</h3><code class="ua">${esc(sx.user_agent)}</code>`
    : '';

  const sectionsHtml = sections.length
    ? barListHtml(sections.map((s) => ({ name: `${titleCase(s.section)} · ${fmtDuration(s.time_spent_seconds)}`, count: s.time_spent_seconds })))
    : `<p class="empty">No section time recorded.</p>`;

  const eventsHtml = events.length
    ? `<ul class="timeline">${events
        .map(
          (e) => `<li><span class="tl-time">${new Date(e.created_at).toLocaleTimeString()}</span><span class="tl-body"><strong>${esc(
            eventLabel(e.event_type),
          )}</strong>${e.event_label ? ` — ${esc(e.event_label)}` : ''}${
            e.section ? ` <span class="tl-sec">${esc(titleCase(e.section))}</span>` : ''
          }</span></li>`,
        )
        .join('')}</ul>`
    : `<p class="empty">No interactions recorded.</p>`;

  return {
    title: `${flag(sx.country_code)} ${esc(placeOf(sx))}`,
    html: `${factsHtml}${uaHtml}<h3 class="drawer-sub">Sections viewed</h3>${sectionsHtml}<h3 class="drawer-sub">Activity trail</h3>${eventsHtml}`,
  };
}

const DRILLS = {
  live: { title: 'Viewing now', render: renderLiveDrill, refreshable: true },
  visitors: { title: 'All visitors', render: renderVisitorsDrill },
  avgtime: { title: 'Time on site', render: renderTimeDrill },
  location: { title: 'Shared location', render: renderLocationDrill },
  events: { title: 'Interactions', render: renderEventsDrill },
  devices: { title: 'Device details', render: renderDevicesDrill },
};

// =============================================================================
// LOAD + AUTO-REFRESH
// =============================================================================
let cachedDevices = [];

async function refreshKpis(root) {
  if (!root.isConnected || !root.querySelector('#kpiRow')) return;
  try {
    const summary = await fetchSummary();
    renderKpis(root, summary, cachedDevices);
    root.querySelector('#dashUpdated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    // Keep the live drawer fresh while it's open.
    const top = drawerStack[drawerStack.length - 1];
    if (isDrawerOpen() && top && top.refreshable) showTop();
  } catch (err) {
    console.warn('[KPS] kpi refresh failed:', err.message);
  }
}

async function load(root, mapDays) {
  registry.charts.forEach((c) => c.destroy());
  registry.charts = [];

  const [summary, daily, sections, devices, countries, cities, events, recent, located] =
    await Promise.all([
      fetchSummary(),
      fetchDailyTraffic(),
      fetchSectionEngagement(),
      fetchDeviceBreakdown(),
      fetchCountryBreakdown(),
      fetchCityBreakdown(),
      fetchEventCounts(),
      fetchRecentSessions(40),
      fetchLocatedSessions(mapDays),
    ]);

  cachedDevices = devices;
  renderKpis(root, summary, devices);
  renderBreakdown(root, sections, summary.total_sessions);
  registry.charts.push(makeTrafficChart(root.querySelector('#trafficChart'), daily));
  registry.charts.push(makeSectionChart(root.querySelector('#sectionChart'), sections));
  registry.charts.push(makeDeviceChart(root.querySelector('#deviceChart'), devices));
  registry.charts.push(makeEventChart(root.querySelector('#eventChart'), events));

  renderRankList(root.querySelector('#countryList'), countries, { name: (r) => `${flag(r.country_code)} ${r.country}` });
  renderRankList(root.querySelector('#cityList'), cities, { name: (r) => `${r.city}${r.country ? `, ${r.country}` : ''}` });

  renderSessions(root.querySelector('#sessionsTable'), recent);

  const plotted = renderMap(located);
  root.querySelector('#mapNote').textContent = plotted
    ? `${nf(plotted)} located session${plotted === 1 ? '' : 's'} plotted. GPS points in rose, approximate IP points in gold.`
    : 'No location data yet — points appear here as visitors share their location.';

  root.querySelector('#dashUpdated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

export function disposeInsights() {
  registry.timers.forEach((t) => clearInterval(t));
  registry.timers = [];
  if (registry.escHandler) {
    document.removeEventListener('keydown', registry.escHandler);
    registry.escHandler = null;
  }
  if (registry.map) {
    registry.map.remove();
    registry.map = null;
  }
  registry.charts.forEach((c) => c.destroy());
  registry.charts = [];
  drawerStack.length = 0;
}

export async function renderInsights(root) {
  disposeInsights();
  registry.root = root;
  root.innerHTML = viewMarkup();

  let mapDays = null;

  const runLoad = async () => {
    const refreshBtn = root.querySelector('#refreshBtn');
    if (refreshBtn) refreshBtn.disabled = true;
    try {
      await load(root, mapDays);
    } catch (err) {
      console.error('[KPS] dashboard load failed:', err);
      root.querySelector('#kpiRow').innerHTML = `<p class="empty">Could not load analytics: ${esc(err.message)}</p>`;
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  };

  // Delegated clicks: KPI drill-downs + clickable session rows + drawer nav.
  root.onclick = (e) => {
    if (e.target.closest('[data-drawer-close]')) {
      closeDrawer();
      return;
    }
    if (e.target.closest('#drawerBack')) {
      drawerStack.pop();
      showTop();
      return;
    }
    const kpi = e.target.closest('.kpi[data-drill]');
    if (kpi) {
      openDrill(kpi.dataset.drill);
      return;
    }
    const row = e.target.closest('[data-session]');
    if (row) {
      openVisitorDetail(row.dataset.session);
    }
  };

  registry.escHandler = (e) => {
    if (e.key === 'Escape' && isDrawerOpen()) closeDrawer();
  };
  document.addEventListener('keydown', registry.escHandler);

  root.querySelector('#refreshBtn').addEventListener('click', runLoad);
  root.querySelectorAll('#mapFilter .chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      root.querySelectorAll('#mapFilter .chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      mapDays = chip.dataset.days ? Number(chip.dataset.days) : null;
      runLoad();
    }),
  );

  await runLoad();

  // Auto-refresh: light KPI tick + periodic full refresh (paused when a drawer
  // is open or the tab is hidden, to avoid disrupting the admin).
  registry.timers.push(setInterval(() => refreshKpis(root), KPI_TICK_MS));
  registry.timers.push(
    setInterval(() => {
      if (!root.isConnected) return;
      if (isDrawerOpen() || document.hidden) return;
      runLoad();
    }, FULL_REFRESH_MS),
  );
}
