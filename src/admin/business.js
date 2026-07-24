// =============================================================================
// BUSINESS — customers & sellers with opening balances, plus derived
// receivables / payables. Record settlements (money received from a customer
// or paid to a seller). Parties can also be created inline during invoicing.
// =============================================================================
import {
  fetchParties,
  fetchPartyBalances,
  insertParty,
  updateParty,
  deleteParty,
  createPayment,
  fetchInvoicesByParty,
  fetchInvoicesRange,
  fetchPayments,
  fetchUserDirectory,
  actorLabel,
  invoiceKind,
  money,
} from '../data/business.js';
import { openInvoiceModal } from './invoices.js';
import { openStockItemEditor, openManageLists } from './stock.js';
import { comboField, wireCombos } from './combo.js';

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque', 'Silver'];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// First day of the current month → today (yyyy-mm-dd), the default range.
function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(now) };
}

function partyEditor(party) {
  const isNew = !party.id;
  const kind = party.kind || 'customer';
  const openLabel = kind === 'seller' ? 'Opening payable (₹)' : 'Opening receivable (₹)';
  return `
  <div class="pm-modal-backdrop" id="bpBackdrop">
    <div class="pm-modal" role="dialog" aria-modal="true">
      <div class="pm-modal-head">
        <h2>${isNew ? `New ${kind}` : `Edit ${esc(party.name)}`}</h2>
        <button class="pm-x" id="bpClose" type="button" aria-label="Close">✕</button>
      </div>
      <form class="pm-form" id="bpForm">
        <div class="pm-form-grid">
          <label class="pm-lbl">Type
            <select name="kind" ${isNew ? '' : 'disabled'}>
              <option value="customer" ${kind === 'customer' ? 'selected' : ''}>Customer</option>
              <option value="seller" ${kind === 'seller' ? 'selected' : ''}>Seller</option>
            </select>
          </label>
          <label class="pm-lbl">Name *<input name="name" type="text" required value="${esc(party.name)}" /></label>
          <label class="pm-lbl">Mobile<input name="mobile" type="text" value="${esc(party.mobile)}" /></label>
          <label class="pm-lbl">Email<input name="email" type="email" value="${esc(party.email)}" /></label>
          <label class="pm-lbl pm-col-2">Address<input name="address" type="text" value="${esc(party.address)}" /></label>
          <label class="pm-lbl">GSTIN<input name="gstin" type="text" value="${esc(party.gstin)}" /></label>
          <label class="pm-lbl">${openLabel}
            <input name="opening_balance" type="number" step="0.01" value="${party.opening_balance ?? 0}" ${isNew ? '' : 'disabled'} />
            ${isNew ? '' : '<span class="pm-field-note">Opening balance is fixed after creation; use payments to settle.</span>'}
          </label>
          <label class="pm-lbl pm-col-2">Notes<textarea name="notes" rows="2">${esc(party.notes)}</textarea></label>
          <label class="pm-check"><input type="checkbox" name="active" ${party.active !== false ? 'checked' : ''} /> Active</label>
        </div>
        <div class="pm-form-actions">
          <span class="pm-save-msg" id="bpMsg"></span>
          <button type="button" class="dash-btn dash-btn--ghost" id="bpCancel">Cancel</button>
          <button type="submit" class="dash-btn" id="bpSubmit">${isNew ? 'Create' : 'Save'}</button>
        </div>
      </form>
    </div>
  </div>`;
}

function paymentEditor(party) {
  const inbound = party.kind === 'customer';
  return `
  <div class="pm-modal-backdrop" id="payBackdrop">
    <div class="pm-modal" role="dialog" aria-modal="true">
      <div class="pm-modal-head">
        <h2>${inbound ? 'Receive payment' : 'Pay seller'} — ${esc(party.name)}</h2>
        <button class="pm-x" id="payClose" type="button" aria-label="Close">✕</button>
      </div>
      <form class="pm-form" id="payForm">
        <div class="pm-form-grid">
          <label class="pm-lbl">Amount (₹) *<input name="amount" type="number" step="0.01" min="0.01" required /></label>
          <label class="pm-lbl">Date<input name="paid_on" type="date" value="${new Date().toISOString().slice(0, 10)}" /></label>
          ${comboField({ name: 'method', label: 'Method', value: 'Cash', options: PAYMENT_METHODS })}
          <label class="pm-lbl pm-col-2">Notes<input name="notes" type="text" /></label>
        </div>
        <div class="pm-form-actions">
          <span class="pm-save-msg" id="payMsg"></span>
          <button type="button" class="dash-btn dash-btn--ghost" id="payCancel">Cancel</button>
          <button type="submit" class="dash-btn" id="paySubmit">${inbound ? 'Record receipt' : 'Record payment'}</button>
        </div>
      </form>
    </div>
  </div>`;
}

export async function renderBusiness(root, session, opts = {}) {
  // The sales / returns / receivable / payable KPIs (and their date filter) are
  // admin-only. Staff still manage parties and can create sales / returns.
  const isAdmin = opts.isAdmin !== false;
  const range = defaultRange();
  root.innerHTML = `
  <div class="pm">
    <div class="pm-top">
      <div>
        <h2 class="pm-title">Business${isAdmin ? ' dashboard' : ''}</h2>
        <p class="pm-lede">${isAdmin ? 'Sales, returns, receivables &amp; payables — with customers and sellers.' : 'Customers, sellers, sales &amp; returns.'}</p>
      </div>
      <div class="biz-actions">
        <button class="dash-btn" id="bizNewSale" type="button">+ New sale</button>
        <button class="dash-btn dash-btn--ghost" id="bizNewReturn" type="button">+ Return</button>
        <button class="dash-btn dash-btn--ghost" id="bizStockIn" type="button">+ Stock in</button>
        <button class="dash-btn dash-btn--ghost" id="bizManageCats" type="button">Manage categories</button>
      </div>
    </div>

    ${
      isAdmin
        ? `<div class="biz-daterow">
      <div class="biz-date-fields">
        <label class="biz-date"><span>From</span><input type="date" id="bizFrom" value="${range.from}" /></label>
        <label class="biz-date"><span>To</span><input type="date" id="bizTo" value="${range.to}" /></label>
      </div>
      <div class="biz-date-presets" role="group" aria-label="Quick ranges">
        <button type="button" class="biz-preset" data-preset="month">This month</button>
        <button type="button" class="biz-preset" data-preset="30">Last 30 days</button>
        <button type="button" class="biz-preset" data-preset="year">This year</button>
      </div>
    </div>

    <div class="stk-summary biz-kpis" id="bizSummary"></div>`
        : ''
    }

    <div class="pm-top biz-parties-top">
      <div>
        <h3 class="pm-title pm-title--sm">Customers &amp; sellers</h3>
      </div>
      <div class="biz-add-btns">
        <button class="dash-btn dash-btn--ghost" id="bizAddCustomer" type="button">+ Customer</button>
        <button class="dash-btn dash-btn--ghost" id="bizAddSeller" type="button">+ Seller</button>
      </div>
    </div>
    <div class="biz-filter" id="bizFilter">
      <button class="shop-chip is-active" data-kind="">All</button>
      <button class="shop-chip" data-kind="customer">Customers</button>
      <button class="shop-chip" data-kind="seller">Sellers</button>
    </div>
    <div id="bizListRegion" class="pm-region"><div class="cm-loading">Loading…</div></div>
  </div>`;

  const region = root.querySelector('#bizListRegion');
  const summary = root.querySelector('#bizSummary');
  const fromInput = root.querySelector('#bizFrom');
  const toInput = root.querySelector('#bizTo');
  let balances = [];
  let parties = [];
  let invoices = [];
  let dir = {};
  let filter = '';

  const reload = async () => {
    try {
      const from = fromInput?.value || null;
      const to = toInput?.value || null;
      [balances, parties, invoices, dir] = await Promise.all([
        fetchPartyBalances(),
        fetchParties(),
        isAdmin ? fetchInvoicesRange({ from, to }) : Promise.resolve([]),
        fetchUserDirectory(),
      ]);
      renderSummary();
      renderList();
    } catch (err) {
      region.innerHTML = `<p class="empty">Could not load: ${esc(err.message)}</p>`;
    }
  };

  const sumTotals = (kinds) =>
    invoices.filter((i) => kinds.includes(i.kind)).reduce((s, i) => s + Number(i.total || 0), 0);

  const renderSummary = () => {
    if (!summary) return; // KPIs are admin-only
    const sales = sumTotals(['sale']);
    const returns = sumTotals(['sale_return', 'purchase_return']);
    // A customer normally owes us (receivable); if their balance is negative we
    // hold their money (a payable). Sellers are the mirror image. So negatives
    // flip sides rather than being ignored.
    let receivable = 0;
    let payable = 0;
    balances.forEach((b) => {
      const bal = Number(b.balance);
      if (b.kind === 'customer') {
        if (bal > 0) receivable += bal;
        else payable += -bal;
      } else {
        if (bal > 0) payable += bal;
        else receivable += -bal;
      }
    });
    const saleCount = invoices.filter((i) => i.kind === 'sale').length;
    const retCount = invoices.filter((i) => /return/.test(i.kind)).length;
    summary.innerHTML = `
      <button type="button" class="stk-stat stk-stat--hero stk-stat--click" data-drill="sales"><span class="stk-stat-lbl">Total sales ›</span><span class="stk-stat-val">${money(sales)}</span><span class="stk-stat-sub">${saleCount} invoice(s)</span></button>
      <button type="button" class="stk-stat stk-stat--click" data-drill="returns"><span class="stk-stat-lbl">Returns ›</span><span class="stk-stat-val">${money(returns)}</span><span class="stk-stat-sub">${retCount} note(s)</span></button>
      <button type="button" class="stk-stat stk-stat--click" data-drill="receivable"><span class="stk-stat-lbl">Receivable ›</span><span class="stk-stat-val">${money(receivable)}</span><span class="stk-stat-sub">all-time</span></button>
      <button type="button" class="stk-stat stk-stat--click" data-drill="payable"><span class="stk-stat-lbl">Payable ›</span><span class="stk-stat-val">${money(payable)}</span><span class="stk-stat-sub">all-time</span></button>`;
    summary.querySelectorAll('[data-drill]').forEach((b) =>
      b.addEventListener('click', () => {
        const d = b.dataset.drill;
        if (d === 'sales' || d === 'returns') openInvoiceDrill(d);
        else openDrill(d);
      }),
    );
  };

  const renderList = () => {
    const rows = balances.filter((b) => !filter || b.kind === filter);
    region.innerHTML = rows.length
      ? `<div class="pm-list">${rows
          .map((b) => {
            const bal = Number(b.balance);
            const label = b.kind === 'customer' ? 'Receivable' : 'Payable';
            const state = Math.abs(bal) < 0.005 ? 'settled' : bal > 0 ? 'due' : 'advance';
            const balAmt = state === 'settled' ? money(0) : state === 'due' ? money(bal) : money(-bal);
            const balLbl = state === 'settled' ? 'Settled' : state === 'due' ? label : 'Advance';
            const full = parties.find((p) => p.id === b.id) || {};
            const initials =
              (b.name || '?')
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((s) => s[0] || '')
                .join('')
                .toUpperCase() || '·';
            return `
            <article class="biz-card biz-card--${b.kind}${b.active ? '' : ' biz-card--off'}" data-open="${b.id}" tabindex="0" role="button" aria-label="View ${esc(b.name)} ledger">
              <div class="biz-card-tools">
                <button class="pm-tool" data-edit="${b.id}" type="button" title="Edit" aria-label="Edit">
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                </button>
                <button class="pm-tool pm-tool--danger" data-del="${b.id}" type="button" title="Delete" aria-label="Delete">
                  <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2zM4 6h16v1H4V6z"/></svg>
                </button>
              </div>
              <div class="biz-card-top">
                <span class="biz-avatar" aria-hidden="true">${esc(initials)}</span>
                <div class="biz-card-id">
                  <h3 class="biz-card-name">${esc(b.name)} <span class="biz-kind-tag">${b.kind === 'seller' ? 'Seller' : 'Customer'}</span>${b.active ? '' : '<span class="biz-kind-tag biz-kind-tag--off">Inactive</span>'}</h3>
                  <div class="biz-card-contact">${b.mobile ? esc(b.mobile) : 'No mobile'}${full.created_by ? ` · Added by ${esc(actorLabel(dir, full.created_by))}` : ''}</div>
                </div>
              </div>
              <div class="biz-bal-strip biz-bal-strip--${state}">
                <span class="biz-bal-lbl">${balLbl}</span>
                <span class="biz-bal-amt">${balAmt}</span>
              </div>
              ${
                state === 'advance'
                  ? `<div class="biz-bal-note">${
                      b.kind === 'customer'
                        ? 'Credit balance — we owe this customer. Counted under Payables.'
                        : 'Overpaid — this seller owes us. Counted under Receivables.'
                    }</div>`
                  : ''
              }
              <div class="biz-card-stats">
                <span><em>Opening</em> ${money(b.opening_balance)}</span>
                <span><em>Invoiced</em> ${money(b.invoiced)}</span>
                <span><em>Settled</em> ${money(b.settled)}</span>
              </div>
              <div class="biz-card-foot">
                <button class="dash-btn biz-pay-btn" data-pay="${b.id}" type="button">${b.kind === 'customer' ? 'Receive payment' : 'Pay seller'}</button>
                <span class="biz-card-ledger">Tap for ledger →</span>
              </div>
            </article>`;
          })
          .join('')}</div>`
      : '<div class="pm-empty"><p>No parties yet.</p><p class="pm-empty-sub">Add a customer or seller to get started.</p></div>';
    wire();
  };

  const wire = () => {
    // Card click / keyboard → open the party's transaction log.
    region.querySelectorAll('.biz-card').forEach((card) => {
      const open = () => openTransactions(parties.find((p) => p.id === card.dataset.open) || balances.find((x) => x.id === card.dataset.open));
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // let action buttons handle themselves
        open();
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
    region.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openParty(parties.find((p) => p.id === btn.dataset.edit));
      }),
    );
    region.querySelectorAll('[data-pay]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openPayment(parties.find((p) => p.id === btn.dataset.pay));
      }),
    );
    region.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const p = parties.find((x) => x.id === btn.dataset.del);
        if (!confirm(`Delete “${p?.name}”? Their invoices/payments will also be removed. This cannot be undone.`)) return;
        btn.disabled = true;
        try {
          await deleteParty(btn.dataset.del);
          reload();
        } catch (err) {
          alert(`Delete failed: ${err.message}`);
          btn.disabled = false;
        }
      }),
    );
  };

  root.querySelector('#bizFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('.shop-chip');
    if (!btn) return;
    filter = btn.dataset.kind || '';
    root.querySelectorAll('#bizFilter .shop-chip').forEach((c) => c.classList.toggle('is-active', c === btn));
    renderList();
  });

  // Date range + presets (admin-only controls).
  if (isAdmin && fromInput && toInput) {
    fromInput.addEventListener('change', reload);
    toInput.addEventListener('change', reload);
    root.querySelector('.biz-date-presets').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-preset]');
      if (!btn) return;
      const now = new Date();
      const iso = (d) => d.toISOString().slice(0, 10);
      if (btn.dataset.preset === 'month') {
        fromInput.value = iso(new Date(now.getFullYear(), now.getMonth(), 1));
      } else if (btn.dataset.preset === '30') {
        fromInput.value = iso(new Date(now.getTime() - 29 * 86400000));
      } else if (btn.dataset.preset === 'year') {
        fromInput.value = iso(new Date(now.getFullYear(), 0, 1));
      }
      toInput.value = iso(now);
      reload();
    });
  }

  // Quick actions.
  root.querySelector('#bizNewSale').addEventListener('click', () => openInvoiceModal({ kind: 'sale', onSaved: reload }));
  root.querySelector('#bizNewReturn').addEventListener('click', () => openInvoiceModal({ kind: 'sale_return', onSaved: reload }));
  root.querySelector('#bizStockIn').addEventListener('click', () => openStockItemEditor({ images: [] }, { onSaved: reload }));
  root.querySelector('#bizManageCats').addEventListener('click', () => openManageLists({ onChange: reload }));

  root.querySelector('#bizAddCustomer').addEventListener('click', () => openParty({ kind: 'customer', active: true }));
  root.querySelector('#bizAddSeller').addEventListener('click', () => openParty({ kind: 'seller', active: true }));

  function openParty(party) {
    if (!party) return;
    const holder = document.createElement('div');
    holder.innerHTML = partyEditor(party);
    document.body.appendChild(holder);
    const form = holder.querySelector('#bpForm');
    const close = () => holder.remove();
    holder.querySelector('#bpClose').addEventListener('click', close);
    holder.querySelector('#bpCancel').addEventListener('click', close);
    holder.querySelector('#bpBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'bpBackdrop') close();
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const msg = holder.querySelector('#bpMsg');
      const payload = {
        name: (fd.get('name') || '').trim(),
        mobile: (fd.get('mobile') || '').trim() || null,
        email: (fd.get('email') || '').trim() || null,
        address: (fd.get('address') || '').trim() || null,
        gstin: (fd.get('gstin') || '').trim() || null,
        notes: (fd.get('notes') || '').trim() || null,
        active: fd.get('active') === 'on',
      };
      if (!party.id) {
        payload.kind = fd.get('kind');
        payload.opening_balance = Number(fd.get('opening_balance') || 0);
      }
      if (!payload.name) {
        msg.textContent = 'Name is required.';
        msg.className = 'pm-save-msg is-error';
        return;
      }
      holder.querySelector('#bpSubmit').disabled = true;
      msg.textContent = 'Saving…';
      try {
        if (party.id) await updateParty(party.id, payload);
        else await insertParty(payload);
        close();
        reload();
      } catch (err) {
        msg.textContent = `Save failed: ${err.message}`;
        msg.className = 'pm-save-msg is-error';
        holder.querySelector('#bpSubmit').disabled = false;
      }
    });
  }

  function openPayment(party) {
    if (!party) return;
    const holder = document.createElement('div');
    holder.innerHTML = paymentEditor(party);
    document.body.appendChild(holder);
    const form = holder.querySelector('#payForm');
    const close = () => holder.remove();
    holder.querySelector('#payClose').addEventListener('click', close);
    holder.querySelector('#payCancel').addEventListener('click', close);
    holder.querySelector('#payBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'payBackdrop') close();
    });
    wireCombos(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const msg = holder.querySelector('#payMsg');
      const amount = Number(fd.get('amount') || 0);
      if (!(amount > 0)) {
        msg.textContent = 'Enter an amount.';
        msg.className = 'pm-save-msg is-error';
        return;
      }
      holder.querySelector('#paySubmit').disabled = true;
      msg.textContent = 'Saving…';
      try {
        await createPayment({
          party_id: party.id,
          direction: party.kind === 'customer' ? 'in' : 'out',
          amount,
          method: fd.get('method') || null,
          paid_on: fd.get('paid_on') || new Date().toISOString().slice(0, 10),
          notes: (fd.get('notes') || '').trim() || null,
        });
        close();
        reload();
      } catch (err) {
        msg.textContent = `Save failed: ${err.message}`;
        msg.className = 'pm-save-msg is-error';
        holder.querySelector('#paySubmit').disabled = false;
      }
    });
  }

  // Generic read-only modal shell (used by the drill-downs + transaction log).
  function openModalShell(title) {
    const holder = document.createElement('div');
    holder.innerHTML = `
      <div class="pm-modal-backdrop" data-modal>
        <div class="pm-modal">
          <div class="pm-modal-head"><h2>${esc(title)}</h2><button class="pm-x" data-close type="button" aria-label="Close">✕</button></div>
          <div class="pm-modal-body" data-body><div class="cm-loading">Loading…</div></div>
        </div>
      </div>`;
    document.body.appendChild(holder);
    const close = () => {
      holder.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    holder.querySelector('[data-close]').addEventListener('click', close);
    holder.querySelector('[data-modal]').addEventListener('click', (e) => {
      if (e.target.matches('[data-modal]')) close();
    });
    return { holder, body: holder.querySelector('[data-body]'), close };
  }

  // KPI drill-down: the sale / return invoices behind the totals for the range.
  function openInvoiceDrill(which) {
    const isSales = which === 'sales';
    const rows = invoices
      .filter((i) => (isSales ? i.kind === 'sale' : /return/.test(i.kind)))
      .sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date));
    const total = rows.reduce((s, i) => s + Number(i.total || 0), 0);
    const { body } = openModalShell(
      `${isSales ? 'Sales' : 'Returns'} · ${fromInput.value} → ${toInput.value}`,
    );
    body.innerHTML = `
      <p class="biz-drill-total">${rows.length} invoice(s) · ${money(total)}</p>
      ${
        rows.length
          ? `<ul class="biz-tx-list">${rows
              .map((i) => {
                const k = invoiceKind(i.kind);
                const due = Number(i.total) - Number(i.amount_paid);
                return `<li class="biz-tx" data-party="${i.party_id || ''}">
                  <div class="biz-tx-main">
                    <span class="pm-badge pm-badge--sku">${esc(i.invoice_no)}</span>
                    <span class="biz-tx-t">${esc(k.short)}</span>
                    <span class="biz-tx-sub">${esc(i.party?.name || '—')} · ${esc(i.invoice_date)} · by ${esc(actorLabel(dir, i.created_by))}${due > 0.005 ? ` · Due ${money(due)}` : ''}</span>
                  </div>
                  <div class="biz-tx-amt"><span class="biz-tx-delta is-pos">${money(i.total)}</span></div>
                </li>`;
              })
              .join('')}</ul>`
          : `<p class="pm-hint">No ${isSales ? 'sales' : 'returns'} in this date range.</p>`
      }`;
    body.querySelectorAll('[data-party]').forEach((li) =>
      li.addEventListener('click', () => {
        const pid = li.dataset.party;
        const party = parties.find((p) => p.id === pid);
        if (party) openTransactions(party);
      }),
    );
  }

  // KPI drill-down: who owes us (receivable) / who we owe (payable). A customer
  // with a negative balance (credit held) surfaces under Payables, and a seller
  // with a negative balance under Receivables — each flagged with a narration.
  function openDrill(kind) {
    const isRec = kind === 'receivable';
    const rows = balances
      .map((b) => {
        const bal = Number(b.balance);
        let amount = 0;
        let note = '';
        if (isRec) {
          if (b.kind === 'customer' && bal > 0) amount = bal;
          else if (b.kind === 'seller' && bal < 0) {
            amount = -bal;
            note = 'Seller overpaid — they owe us';
          }
        } else if (b.kind === 'seller' && bal > 0) amount = bal;
        else if (b.kind === 'customer' && bal < 0) {
          amount = -bal;
          note = 'Customer credit — we hold their money';
        }
        return { b, amount, note };
      })
      .filter((r) => r.amount > 0.005)
      .sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    const { holder, body, close } = openModalShell(isRec ? 'Receivables — who owes us' : 'Payables — who we owe');
    body.innerHTML = `
      <p class="biz-drill-total">${rows.length} ${rows.length === 1 ? 'party' : 'parties'} · ${money(total)} outstanding</p>
      ${
        rows.length
          ? `<div class="biz-drill-list">${rows
              .map(
                (r) => `<button type="button" class="biz-drill-row" data-open="${r.b.id}">
                  <span class="biz-drill-name">${esc(r.b.name)}${r.b.mobile ? ` · ${esc(r.b.mobile)}` : ''}${r.note ? `<span class="biz-drill-note">${esc(r.note)}</span>` : ''}</span>
                  <span class="biz-drill-amt">${money(r.amount)}</span></button>`,
              )
              .join('')}</div>`
          : `<p class="pm-hint">Nothing outstanding here.</p>`
      }`;
    body.querySelectorAll('[data-open]').forEach((btn) =>
      btn.addEventListener('click', () => {
        close();
        openTransactions(parties.find((p) => p.id === btn.dataset.open) || balances.find((x) => x.id === btn.dataset.open));
      }),
    );
  }

  // Full transaction log (invoices + payments) for one party, with a running
  // balance from the opening balance down to the current (closing) balance.
  async function openTransactions(party) {
    if (!party) return;
    const bal = balances.find((x) => x.id === party.id);
    const kind = party.kind || bal?.kind;
    const label = kind === 'seller' ? 'payable' : 'receivable';
    const { body } = openModalShell(`${party.name} — transactions`);

    // How each entry moves the balance: an invoice adds (a return subtracts);
    // a payment always reduces what's outstanding.
    const deltaOf = (e) => {
      if (e.kind === 'invoice') {
        const isReturn = /return/.test(e.data.kind || '');
        return (isReturn ? -1 : 1) * Number(e.data.total || 0);
      }
      return -Number(e.data.amount || 0);
    };

    const renderTxRow = (e) => {
      const delta = deltaOf(e);
      const deltaHtml = `<span class="biz-tx-delta ${delta < 0 ? 'is-neg' : 'is-pos'}">${delta < 0 ? '−' : '+'}${money(Math.abs(delta))}</span>`;
      const runHtml = `<span class="biz-tx-run">Bal ${money(e._run)}</span>`;
      if (e.kind === 'invoice') {
        const i = e.data;
        const k = invoiceKind(i.kind);
        const due = Number(i.total) - Number(i.amount_paid);
        return `<li class="biz-tx">
          <div class="biz-tx-main">
            <span class="pm-badge pm-badge--sku">${esc(i.invoice_no)}</span>
            <span class="biz-tx-t">${esc(k.short)}</span>
            <span class="biz-tx-sub">${esc(i.invoice_date)} · by ${esc(actorLabel(dir, i.created_by))}${due > 0.005 ? ` · Due ${money(due)}` : ''}</span>
          </div>
          <div class="biz-tx-amt">${deltaHtml}${runHtml}</div>
        </li>`;
      }
      const p = e.data;
      return `<li class="biz-tx">
        <div class="biz-tx-main">
          <span class="pm-badge pm-badge--in">${p.direction === 'in' ? 'Received' : 'Paid'}</span>
          <span class="biz-tx-t">${esc(p.receipt_no)}</span>
          <span class="biz-tx-sub">${esc(p.paid_on)}${p.method ? ` · ${esc(p.method)}` : ''} · by ${esc(actorLabel(dir, p.created_by))}</span>
        </div>
        <div class="biz-tx-amt">${deltaHtml}${runHtml}</div>
      </li>`;
    };

    try {
      const [invoices, pays] = await Promise.all([fetchInvoicesByParty(party.id), fetchPayments(party.id)]);
      const opening = Number(bal?.opening_balance || 0);
      // Oldest → newest to accumulate the running balance from the opening.
      const asc = [
        ...invoices.map((i) => ({ t: i.created_at, kind: 'invoice', data: i })),
        ...pays.map((p) => ({ t: p.created_at, kind: 'payment', data: p })),
      ].sort((a, b) => new Date(a.t) - new Date(b.t));
      let run = opening;
      asc.forEach((e) => {
        run += deltaOf(e);
        e._run = run;
      });
      const closing = run;
      const display = asc.reverse(); // newest first for the list
      body.innerHTML = `
        <div class="biz-tx-summary">
          <div class="biz-tx-obc">
            <div><span class="stk-stat-lbl">Opening balance</span><div class="biz-tx-oval">${money(opening)}</div></div>
            <div class="biz-tx-arrow">→</div>
            <div><span class="stk-stat-lbl">Closing balance</span><div class="biz-tx-bal">${money(closing)} <span class="biz-tx-kind">${label}</span></div></div>
          </div>
          <div class="pm-card-meta">
            <span>Invoiced ${money(bal?.invoiced || 0)}</span>
            <span>Returned ${money(bal?.returned || 0)}</span>
            <span>Settled ${money(bal?.settled || 0)}</span>
          </div>
        </div>
        ${
          display.length
            ? `<ul class="biz-tx-list">${display.map(renderTxRow).join('')}</ul>`
            : '<p class="pm-hint">No transactions yet — closing balance equals the opening balance.</p>'
        }`;
    } catch (err) {
      body.innerHTML = `<p class="empty">Could not load: ${esc(err.message)}</p>`;
    }
  }

  reload();
}
