// =============================================================================
// STAFF (admin only)
// Super admin adds staff (name · mobile · password), can force a password
// change on first login, reset passwords, deactivate/remove accounts, and see
// per-staff activity: how many products each created / updated / deleted, plus
// a field-level log of exactly what changed and who did it.
//
// Account provisioning goes through the /api/staff/* serverless endpoints
// (service_role); reads (overview + audit) use RLS-guarded tables directly.
// =============================================================================
import { supabase } from '../config/supabase.js';
import { staffApi } from './staffApi.js';
import { adminApi } from './adminApi.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const nf = (n) => Number(n || 0).toLocaleString('en-IN');

function fmtWhen(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const secs = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Fields worth surfacing in the change log (label + friendly formatter).
const FIELD_LABELS = {
  title: 'Title',
  subtitle: 'Subtitle',
  category: 'Category',
  description: 'Description',
  price: 'Price',
  pricing_mode: 'Pricing mode',
  weight_grams: 'Weight (g)',
  purity: 'Purity',
  metal_purity: 'Silver purity',
  weightage_percent: 'Weightage %',
  charge_mode: 'Charges',
  making_charge_type: 'Making charge type',
  making_charge_value: 'Making charge',
  labour_type: 'Labour type',
  labour_value: 'Labour',
  dimensions: 'Dimensions',
  sku: 'Item code',
  images: 'Images',
  video_url: 'Video',
  in_stock: 'In stock',
  featured: 'Featured',
  sort_order: 'Sort order',
};

function fmtVal(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (key === 'images') return `${Array.isArray(v) ? v.length : 0} image${Array.isArray(v) && v.length === 1 ? '' : 's'}`;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

// Render an audit row's `changes` payload as readable HTML.
function renderChanges(action, changes) {
  if (!changes || typeof changes !== 'object') return '';
  if (action === 'update') {
    const keys = Object.keys(changes).filter((k) => FIELD_LABELS[k] || k in changes);
    if (!keys.length) return '<span class="staff-diff-none">No tracked fields changed.</span>';
    return `<ul class="staff-diff">${keys
      .map((k) => {
        const label = FIELD_LABELS[k] || k;
        const from = fmtVal(k, changes[k]?.from);
        const to = fmtVal(k, changes[k]?.to);
        return `<li><span class="staff-diff-field">${esc(label)}</span><span class="staff-diff-from">${esc(from)}</span><span class="staff-diff-arrow">→</span><span class="staff-diff-to">${esc(to)}</span></li>`;
      })
      .join('')}</ul>`;
  }
  // create / delete: show a compact snapshot of the key fields.
  const pick = ['category', 'price', 'weight_grams', 'metal_purity', 'in_stock'];
  const rows = pick
    .filter((k) => k in changes)
    .map((k) => `<li><span class="staff-diff-field">${esc(FIELD_LABELS[k] || k)}</span><span class="staff-diff-to">${esc(fmtVal(k, changes[k]))}</span></li>`)
    .join('');
  return rows ? `<ul class="staff-diff staff-diff--snap">${rows}</ul>` : '';
}

const ACTION_LABEL = { create: 'Created', update: 'Edited', delete: 'Deleted' };

function auditRow(a) {
  return `
  <li class="staff-log-row">
    <span class="staff-log-badge staff-log-badge--${esc(a.action)}">${ACTION_LABEL[a.action] || a.action}</span>
    <div class="staff-log-main">
      <div class="staff-log-head">
        <span class="staff-log-title">${esc(a.product_title || 'Untitled product')}</span>
        <span class="staff-log-meta">${esc(a.actor_name || 'Unknown')}${a.actor_role ? ` · ${esc(a.actor_role)}` : ''} · ${esc(fmtWhen(a.created_at))}</span>
      </div>
      ${renderChanges(a.action, a.changes)}
    </div>
  </li>`;
}

// Max rows shown per page — the user scrolls to the next page for more.
const PAGE_SIZE = 500;

async function fetchOverview() {
  const { data, error } = await supabase.rpc('admin_staff_overview');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// Paged + optionally date-ranged / staff-scoped audit query. Returns the rows
// for the page plus the total count so we can drive the pager.
async function fetchAudit({ actorId = null, from = null, to = null, page = 0 } = {}) {
  let q = supabase.from('product_audit').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (actorId) q = q.eq('actor_id', actorId);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', `${to}T23:59:59.999`);
  q = q.range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data || [], count: count ?? 0 };
}

// Pager bar (Prev / Next + "showing X–Y of N"). `ns` namespaces the buttons so
// the page-level log and the per-staff drawer log don't clash.
function pagerBar(count, page, ns) {
  const start = count ? page * PAGE_SIZE + 1 : 0;
  const end = Math.min(count, (page + 1) * PAGE_SIZE);
  const hasPrev = page > 0;
  const hasNext = end < count;
  return `
  <div class="staff-pager">
    <span class="staff-pager-info">${count ? `Showing ${nf(start)}–${nf(end)} of ${nf(count)}` : 'No entries'}</span>
    <div class="staff-pager-btns">
      <button class="dash-btn dash-btn--sm dash-btn--ghost" data-page="prev" data-ns="${ns}" ${hasPrev ? '' : 'disabled'}>← Prev</button>
      <button class="dash-btn dash-btn--sm dash-btn--ghost" data-page="next" data-ns="${ns}" ${hasNext ? '' : 'disabled'}>Next →</button>
    </div>
  </div>`;
}

function renderPagedLog(rows, count, page, ns) {
  const list = rows.length
    ? `<ul class="staff-log">${rows.map(auditRow).join('')}</ul>`
    : '<p class="empty">No product changes in this view.</p>';
  return `${pagerBar(count, page, ns)}${list}`;
}

function adminTable(list) {
  if (!list.length) return '<p class="empty">No administrators yet.</p>';
  return `
  <table class="staff-table">
    <thead>
      <tr><th>Name</th><th>Email</th><th>Added</th><th></th></tr>
    </thead>
    <tbody>
      ${list
        .map(
          (a) => `
        <tr data-uid="${esc(a.user_id)}">
          <td><span class="staff-name">${esc(a.name)}</span>${a.is_self ? ' <span class="staff-flag">you</span>' : ''}</td>
          <td>${esc(a.email)}</td>
          <td>${esc(fmtWhen(a.created_at))}</td>
          <td class="staff-actions">
            ${a.is_self ? '<span class="staff-flag">manage your password in Security</span>' : `<button class="dash-btn dash-btn--sm dash-btn--danger" data-aact="delete" data-uid="${esc(a.user_id)}" data-name="${esc(a.name)}">Remove</button>`}
          </td>
        </tr>`,
        )
        .join('')}
    </tbody>
  </table>`;
}

function staffTable(list) {
  if (!list.length) return '<p class="empty">No staff yet. Add your first team member above.</p>';
  return `
  <table class="staff-table">
    <thead>
      <tr>
        <th>Name</th><th>Mobile</th><th>Status</th>
        <th class="num">Created</th><th class="num">Edited</th><th class="num">Deleted</th>
        <th>Last activity</th><th></th>
      </tr>
    </thead>
    <tbody>
      ${list
        .map(
          (s) => `
        <tr data-uid="${esc(s.user_id)}">
          <td>
            <span class="staff-name">${esc(s.name)}</span>
            ${s.must_change_password ? '<span class="staff-flag">must change password</span>' : ''}
          </td>
          <td>${esc(s.mobile)}</td>
          <td><span class="staff-pill ${s.active ? 'is-on' : 'is-off'}">${s.active ? 'Active' : 'Inactive'}</span></td>
          <td class="num">${nf(s.created_count)}</td>
          <td class="num">${nf(s.updated_count)}</td>
          <td class="num">${nf(s.deleted_count)}</td>
          <td>${esc(fmtWhen(s.last_activity))}</td>
          <td class="staff-actions">
            <button class="dash-btn dash-btn--sm" data-act="activity" data-uid="${esc(s.user_id)}" data-name="${esc(s.name)}">Activity</button>
            <button class="dash-btn dash-btn--sm" data-act="reset" data-uid="${esc(s.user_id)}" data-name="${esc(s.name)}">Reset password</button>
            <button class="dash-btn dash-btn--sm" data-act="toggle" data-uid="${esc(s.user_id)}" data-active="${s.active ? '1' : '0'}">${s.active ? 'Deactivate' : 'Activate'}</button>
            <button class="dash-btn dash-btn--sm dash-btn--danger" data-act="delete" data-uid="${esc(s.user_id)}" data-name="${esc(s.name)}">Remove</button>
          </td>
        </tr>`,
        )
        .join('')}
    </tbody>
  </table>`;
}

export async function renderStaff(root) {
  root.innerHTML = `
  <div class="staff">
    <div class="pm-top">
      <div>
        <h2 class="pm-title">Staff</h2>
        <p class="pm-lede">Add team members who can manage products. They can only add, edit and delete listings — nothing else. Every change is logged below.</p>
      </div>
    </div>

    <div class="panel staff-admins-panel">
      <div class="panel-head"><h2>Administrators</h2></div>
      <p class="pm-lede pm-lede--tight">Admins have full access to the dashboard and can manage staff and other admins. Add another administrator with their email and a password.</p>
      <form class="staff-add" id="adminAdd">
        <div class="staff-add-grid">
          <label class="pm-lbl">Name
            <input name="name" type="text" placeholder="e.g. Priya S" required />
          </label>
          <label class="pm-lbl">Email
            <input name="email" type="email" inputmode="email" placeholder="name@example.com" required />
          </label>
          <label class="pm-lbl">Password
            <input name="password" type="text" placeholder="At least 8 characters" required />
            <span class="pm-field-note">You choose the password and share it with the new admin. They sign in at the admin portal with this email.</span>
          </label>
        </div>
        <div class="staff-add-foot">
          <button type="submit" class="dash-btn" id="adminAddBtn">+ Add admin</button>
          <span class="pm-save-msg" id="adminAddMsg"></span>
        </div>
      </form>
      <div id="adminListRegion"><div class="cm-loading">Loading administrators…</div></div>
    </div>

    <form class="staff-add" id="staffAdd">
      <div class="staff-add-grid">
        <label class="pm-lbl">Name
          <input name="name" type="text" placeholder="e.g. Ramesh K" required />
        </label>
        <label class="pm-lbl">Mobile number
          <input name="mobile" type="tel" inputmode="numeric" placeholder="9876543210" required />
        </label>
        <label class="pm-lbl">Password
          <input name="password" type="text" placeholder="At least 8 characters" required />
          <span class="pm-field-note">You choose the password and share it with the staff member. If the box below is ticked, they'll be asked to set their own on first login.</span>
        </label>
      </div>
      <label class="staff-check">
        <input type="checkbox" name="mustChange" checked />
        Require this staff member to set their own password on first login
      </label>
      <div class="staff-add-foot">
        <button type="submit" class="dash-btn" id="staffAddBtn">+ Add staff</button>
        <span class="pm-save-msg" id="staffAddMsg"></span>
      </div>
    </form>

    <div class="panel staff-list-panel">
      <div class="panel-head"><h2>Team</h2></div>
      <div id="staffListRegion"><div class="cm-loading">Loading staff…</div></div>
    </div>

    <div class="panel panel--wide">
      <div class="panel-head"><h2>Recent product changes</h2></div>
      <div id="staffLogRegion"><div class="cm-loading">Loading activity…</div></div>
    </div>
  </div>

  <div class="drawer" id="staffDrawer" hidden>
    <div class="drawer-backdrop" data-drawer-close></div>
    <aside class="drawer-panel" role="dialog" aria-modal="true" aria-labelledby="staffDrawerTitle">
      <header class="drawer-head">
        <h2 id="staffDrawerTitle">Activity</h2>
        <button class="drawer-close" data-drawer-close aria-label="Close">✕</button>
      </header>
      <div class="drawer-body" id="staffDrawerBody"></div>
    </aside>
  </div>`;

  const listRegion = root.querySelector('#staffListRegion');
  const logRegion = root.querySelector('#staffLogRegion');
  const drawer = root.querySelector('#staffDrawer');

  const setMsg = (text, cls = 'pm-save-msg') => {
    const el = root.querySelector('#staffAddMsg');
    if (el) {
      el.textContent = text;
      el.className = cls;
    }
  };

  let overview = []; // cached staff overview rows (for drawer insights)
  let logPage = 0; // page index for the site-wide activity log

  const loadList = async () => {
    try {
      overview = await fetchOverview();
      listRegion.innerHTML = staffTable(overview);
    } catch (err) {
      listRegion.innerHTML = `<p class="empty">Could not load staff: ${esc(err.message)}</p>`;
    }
  };

  const loadLog = async () => {
    logRegion.innerHTML = '<div class="cm-loading">Loading activity…</div>';
    try {
      const { rows, count } = await fetchAudit({ page: logPage });
      logRegion.innerHTML = renderPagedLog(rows, count, logPage, 'log');
    } catch (err) {
      logRegion.innerHTML = `<p class="empty">Could not load activity: ${esc(err.message)}</p>`;
    }
  };

  // Site-wide log pager.
  logRegion.addEventListener('click', (e) => {
    const b = e.target.closest('[data-page][data-ns="log"]');
    if (!b) return;
    logPage = Math.max(0, logPage + (b.dataset.page === 'next' ? 1 : -1));
    loadLog().then(() => logRegion.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  });

  // ---- Administrators -------------------------------------------------------
  const adminListRegion = root.querySelector('#adminListRegion');
  const adminForm = root.querySelector('#adminAdd');

  const setAdminMsg = (text, cls = 'pm-save-msg') => {
    const el = root.querySelector('#adminAddMsg');
    if (el) {
      el.textContent = text;
      el.className = cls;
    }
  };

  const loadAdmins = async () => {
    try {
      const { admins } = await adminApi.list();
      adminListRegion.innerHTML = adminTable(admins || []);
    } catch (err) {
      adminListRegion.innerHTML = `<p class="empty">Could not load administrators: ${esc(err.message)}</p>`;
    }
  };

  adminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(adminForm);
    const name = String(fd.get('name') || '').trim();
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const btn = root.querySelector('#adminAddBtn');

    btn.disabled = true;
    setAdminMsg('Creating…');
    try {
      await adminApi.create(name, email, password);
      setAdminMsg(`Added ✓ — ${name} can sign in at /admin with ${email} and this password.`, 'pm-save-msg is-ok');
      adminForm.reset();
      loadAdmins();
    } catch (err) {
      setAdminMsg(err.message || 'Could not add admin.', 'pm-save-msg is-error');
    } finally {
      btn.disabled = false;
    }
  });

  adminListRegion.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-aact]');
    if (!btn) return;
    const { aact, uid, name } = btn.dataset;

    if (aact === 'delete') {
      if (!confirm(`Remove admin access for ${name}? Their login is deleted permanently.`)) return;
      btn.disabled = true;
      try {
        await adminApi.remove(uid);
        loadAdmins();
      } catch (err) {
        alert(err.message || 'Could not remove the administrator.');
        btn.disabled = false;
      }
      return;
    }
  });

  // ---- Add staff ------------------------------------------------------------
  const form = root.querySelector('#staffAdd');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    const mobile = String(fd.get('mobile') || '').trim();
    const password = String(fd.get('password') || '');
    const mustChange = fd.get('mustChange') != null;
    const btn = root.querySelector('#staffAddBtn');

    btn.disabled = true;
    setMsg('Creating…');
    try {
      await staffApi.create(name, mobile, password, mustChange);
      setMsg(`Added ✓ — ${name} can sign in with mobile ${mobile.replace(/\D/g, '')} and this password.`, 'pm-save-msg is-ok');
      form.reset();
      form.querySelector('[name="mustChange"]').checked = true;
      loadList();
    } catch (err) {
      setMsg(err.message || 'Could not add staff.', 'pm-save-msg is-error');
    } finally {
      btn.disabled = false;
    }
  });

  // ---- Row actions ----------------------------------------------------------
  const drawerBody = root.querySelector('#staffDrawerBody');
  const actState = { uid: null, name: '', from: '', to: '', page: 0 };

  // Load just the (paged, date-ranged) log portion of the drawer.
  const loadActLog = async () => {
    const logEl = drawerBody.querySelector('#stActLog');
    if (!logEl) return;
    logEl.innerHTML = '<div class="cm-loading">Loading…</div>';
    try {
      const { rows, count } = await fetchAudit({
        actorId: actState.uid,
        from: actState.from || null,
        to: actState.to || null,
        page: actState.page,
      });
      const ranged = actState.from || actState.to ? ' in this range' : '';
      logEl.innerHTML = `<p class="staff-range-count">${nf(count)} change${count === 1 ? '' : 's'}${ranged}</p>${renderPagedLog(rows, count, actState.page, 'act')}`;
    } catch (err) {
      logEl.innerHTML = `<p class="empty">Could not load activity: ${esc(err.message)}</p>`;
    }
  };

  const renderDrawer = () => {
    const s = overview.find((x) => x.user_id === actState.uid) || {};
    drawerBody.innerHTML = `
      <div class="staff-insights">
        <div class="stk-stat"><span class="stk-stat-lbl">Created</span><span class="stk-stat-val">${nf(s.created_count)}</span></div>
        <div class="stk-stat"><span class="stk-stat-lbl">Edited</span><span class="stk-stat-val">${nf(s.updated_count)}</span></div>
        <div class="stk-stat"><span class="stk-stat-lbl">Deleted</span><span class="stk-stat-val">${nf(s.deleted_count)}</span></div>
        <div class="stk-stat"><span class="stk-stat-lbl">Last activity</span><span class="stk-stat-val stk-stat-val--sm">${esc(fmtWhen(s.last_activity))}</span></div>
      </div>
      <div class="staff-drawer-filters">
        <label class="biz-date"><span>From</span><input type="date" id="stActFrom" value="${esc(actState.from)}" /></label>
        <label class="biz-date"><span>To</span><input type="date" id="stActTo" value="${esc(actState.to)}" /></label>
        <button type="button" class="dash-btn dash-btn--sm dash-btn--ghost" id="stActClear">All time</button>
      </div>
      <div id="stActLog"><div class="cm-loading">Loading…</div></div>`;
    drawerBody.querySelector('#stActFrom').addEventListener('change', (e) => {
      actState.from = e.target.value;
      actState.page = 0;
      loadActLog();
    });
    drawerBody.querySelector('#stActTo').addEventListener('change', (e) => {
      actState.to = e.target.value;
      actState.page = 0;
      loadActLog();
    });
    drawerBody.querySelector('#stActClear').addEventListener('click', () => {
      actState.from = '';
      actState.to = '';
      actState.page = 0;
      renderDrawer();
    });
    loadActLog();
  };

  const openActivity = (uid, name) => {
    actState.uid = uid;
    actState.name = name;
    actState.page = 0;
    root.querySelector('#staffDrawerTitle').textContent = `Activity · ${name}`;
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    renderDrawer();
  };

  // Per-staff drawer log pager.
  drawerBody.addEventListener('click', (e) => {
    const b = e.target.closest('[data-page][data-ns="act"]');
    if (!b) return;
    actState.page = Math.max(0, actState.page + (b.dataset.page === 'next' ? 1 : -1));
    loadActLog().then(() => drawerBody.scrollTo({ top: 0, behavior: 'smooth' }));
  });

  const closeDrawer = () => {
    drawer.classList.remove('is-open');
    setTimeout(() => {
      if (!drawer.classList.contains('is-open')) drawer.hidden = true;
    }, 320);
  };

  listRegion.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) {
      // Clicking the row (anywhere but a button) opens that staff's activity.
      const row = e.target.closest('tr[data-uid]');
      if (row) {
        const s = overview.find((x) => x.user_id === row.dataset.uid);
        openActivity(row.dataset.uid, s?.name || 'Staff');
      }
      return;
    }
    const { act, uid, name } = btn.dataset;

    if (act === 'activity') return openActivity(uid, name || 'Staff');

    if (act === 'reset') {
      const pw = prompt(`Set a new password for ${name}.\nThey'll be asked to change it on next login.`);
      if (pw == null) return;
      if (pw.length < 8) return alert('Password must be at least 8 characters.');
      btn.disabled = true;
      try {
        await staffApi.resetPassword(uid, pw);
        alert(`Password reset for ${name}.`);
        loadList();
      } catch (err) {
        alert(err.message || 'Could not reset the password.');
      } finally {
        btn.disabled = false;
      }
      return;
    }

    if (act === 'toggle') {
      const makeActive = btn.dataset.active !== '1';
      btn.disabled = true;
      try {
        await staffApi.setActive(uid, makeActive);
        loadList();
      } catch (err) {
        alert(err.message || 'Could not update the account.');
        btn.disabled = false;
      }
      return;
    }

    if (act === 'delete') {
      if (!confirm(`Remove ${name}? Their login is deleted permanently. Product history stays in the log.`)) return;
      btn.disabled = true;
      try {
        await staffApi.remove(uid);
        loadList();
      } catch (err) {
        alert(err.message || 'Could not remove the staff member.');
        btn.disabled = false;
      }
      return;
    }
  });

  drawer.addEventListener('click', (e) => {
    if (e.target.closest('[data-drawer-close]')) closeDrawer();
  });

  loadAdmins();
  loadList();
  loadLog();
}
