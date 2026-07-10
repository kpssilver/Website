// =============================================================================
// SUPER ADMIN DASHBOARD
// Pulls every analytics slice in parallel and renders KPI cards, a visitor
// map, engagement/traffic/device/event charts and a recent-sessions table.
// =============================================================================
import Chart from 'chart.js/auto';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { signOut } from './auth.js';
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

const registry = { charts: [], map: null };

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
  const then = new Date(iso).getTime();
  const diff = Math.round((Date.now() - then) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function flag(cc) {
  if (!cc || cc.length !== 2) return '🌐';
  return cc
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// --- Shell -------------------------------------------------------------------
function shell(email) {
  return `
<div class="dash">
  <header class="dash-top">
    <div class="dash-title">
      <span class="dash-mark">KPS</span>
      <div>
        <h1>Visitor Insights</h1>
        <p>KPS Silver · Super Admin</p>
      </div>
    </div>
    <div class="dash-top-right">
      <span class="dash-updated" id="dashUpdated"></span>
      <span class="dash-user">${email || 'admin'}</span>
      <button class="dash-btn" id="refreshBtn" title="Refresh">↻ Refresh</button>
      <button class="dash-btn dash-btn--ghost" id="signOutBtn">Sign out</button>
    </div>
  </header>

  <main class="dash-main">
    <section class="kpi-row" id="kpiRow"></section>

    <section class="dash-grid">
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
        <div class="panel-head"><h2>Recent sessions</h2></div>
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
  </main>
</div>`;
}

// --- KPI cards ----------------------------------------------------------------
function renderKpis(root, s) {
  const cards = [
    { label: 'Total visitors', value: nf(s.total_sessions), sub: `${nf(s.sessions_today)} today` },
    { label: 'Avg. time on site', value: fmtDuration(s.avg_time_seconds), sub: 'per session' },
    { label: 'Shared location', value: nf(s.sessions_with_location), sub: `${nf(s.located_sessions)} placed on map` },
    { label: 'Interactions', value: nf(s.total_events), sub: 'clicks & CTAs' },
    { label: 'Countries', value: nf(s.unique_countries), sub: `${nf(s.unique_cities)} cities` },
  ];
  root.querySelector('#kpiRow').innerHTML = cards
    .map(
      (c) => `
    <div class="kpi">
      <span class="kpi-label">${c.label}</span>
      <span class="kpi-value">${c.value}</span>
      <span class="kpi-sub">${c.sub}</span>
    </div>`,
    )
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
  const label = (t) => titleCase(String(t).replace(/_/g, ' '));
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: rows.map((r) => label(r.event_type)),
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

// --- Sessions table ----------------------------------------------------------
function renderSessions(el, rows) {
  const body = el.querySelector('tbody');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">No sessions recorded yet.</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((r) => {
      const place = [r.city, r.country].filter(Boolean).join(', ') || 'Unknown';
      const src = r.location_source
        ? `<span class="tag tag--${r.location_source}">${r.location_source.toUpperCase()}</span>`
        : '<span class="tag">—</span>';
      return `
      <tr>
        <td>${relTime(r.started_at)}</td>
        <td>${flag(r.country_code)} ${place}</td>
        <td>${titleCase(r.device_type) || '—'}</td>
        <td>${[r.browser, r.os].filter(Boolean).join(' · ') || '—'}</td>
        <td>${fmtDuration(r.total_time_seconds)}</td>
        <td>${src}</td>
      </tr>`;
    })
    .join('');
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
      .bindPopup(`<strong>${place}</strong><br>Time on site: ${fmtDuration(r.total_time_seconds)}<br>Source: ${(r.location_source || 'n/a').toUpperCase()}`);
  });

  if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 8 });
  // Leaflet needs a nudge when the container is sized after creation.
  setTimeout(() => map.invalidateSize(), 100);
  return pts.length;
}

// --- Orchestration -----------------------------------------------------------
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

  renderKpis(root, summary);
  registry.charts.push(makeTrafficChart(root.querySelector('#trafficChart'), daily));
  registry.charts.push(makeSectionChart(root.querySelector('#sectionChart'), sections));
  registry.charts.push(makeDeviceChart(root.querySelector('#deviceChart'), devices));
  registry.charts.push(makeEventChart(root.querySelector('#eventChart'), events));

  renderRankList(root.querySelector('#countryList'), countries, {
    name: (r) => `${flag(r.country_code)} ${r.country}`,
  });
  renderRankList(root.querySelector('#cityList'), cities, {
    name: (r) => `${r.city}${r.country ? `, ${r.country}` : ''}`,
  });

  renderSessions(root.querySelector('#sessionsTable'), recent);

  const plotted = renderMap(located);
  root.querySelector('#mapNote').textContent = plotted
    ? `${nf(plotted)} located session${plotted === 1 ? '' : 's'} plotted. GPS points in rose, approximate IP points in gold.`
    : 'No location data yet — points appear here as visitors share their location.';

  root.querySelector('#dashUpdated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

export async function renderDashboard(root, session, onSignOut) {
  const email = session?.user?.email || 'admin';
  root.innerHTML = shell(email);

  let mapDays = null;

  const runLoad = async () => {
    const refreshBtn = root.querySelector('#refreshBtn');
    refreshBtn.disabled = true;
    try {
      await load(root, mapDays);
    } catch (err) {
      console.error('[KPS] dashboard load failed:', err);
      root.querySelector('#kpiRow').innerHTML = `<p class="empty">Could not load analytics: ${err.message}</p>`;
    } finally {
      refreshBtn.disabled = false;
    }
  };

  root.querySelector('#signOutBtn').addEventListener('click', async () => {
    await signOut();
    onSignOut();
  });
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
}
