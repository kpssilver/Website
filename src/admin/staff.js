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

async function fetchOverview() {
  const { data, error } = await supabase.rpc('admin_staff_overview');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function fetchAudit({ actorId = null, limit = 60 } = {}) {
  let q = supabase.from('product_audit').select('*').order('created_at', { ascending: false }).limit(limit);
  if (actorId) q = q.eq('actor_id', actorId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
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

  const loadList = async () => {
    try {
      const list = await fetchOverview();
      listRegion.innerHTML = staffTable(list);
    } catch (err) {
      listRegion.innerHTML = `<p class="empty">Could not load staff: ${esc(err.message)}</p>`;
    }
  };

  const loadLog = async () => {
    try {
      const rows = await fetchAudit({ limit: 60 });
      logRegion.innerHTML = rows.length
        ? `<ul class="staff-log">${rows.map(auditRow).join('')}</ul>`
        : '<p class="empty">No product changes recorded yet.</p>';
    } catch (err) {
      logRegion.innerHTML = `<p class="empty">Could not load activity: ${esc(err.message)}</p>`;
    }
  };

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
  const openActivity = async (uid, name) => {
    root.querySelector('#staffDrawerTitle').textContent = `Activity · ${name}`;
    const body = root.querySelector('#staffDrawerBody');
    body.innerHTML = '<div class="cm-loading">Loading…</div>';
    drawer.hidden = false;
    requestAnimationFrame(() => drawer.classList.add('is-open'));
    try {
      const rows = await fetchAudit({ actorId: uid, limit: 100 });
      body.innerHTML = rows.length
        ? `<ul class="staff-log">${rows.map(auditRow).join('')}</ul>`
        : '<p class="empty">No product changes by this staff member yet.</p>';
    } catch (err) {
      body.innerHTML = `<p class="empty">Could not load activity: ${esc(err.message)}</p>`;
    }
  };

  const closeDrawer = () => {
    drawer.classList.remove('is-open');
    setTimeout(() => {
      if (!drawer.classList.contains('is-open')) drawer.hidden = true;
    }, 320);
  };

  listRegion.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
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

  loadList();
  loadLog();
}
