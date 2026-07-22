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
  fetchPayments,
  fetchUserDirectory,
  actorLabel,
  invoiceKind,
  money,
} from '../data/business.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
          <label class="pm-lbl">Method
            <select name="method"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank transfer</option><option>Cheque</option></select>
          </label>
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

export async function renderBusiness(root, session) {
  root.innerHTML = `
  <div class="pm">
    <div class="stk-summary" id="bizSummary"></div>
    <div class="pm-top">
      <div>
        <h2 class="pm-title">Business</h2>
        <p class="pm-lede">Customers, sellers and their receivables / payables.</p>
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
  let balances = [];
  let parties = [];
  let dir = {};
  let filter = '';

  const reload = async () => {
    try {
      [balances, parties, dir] = await Promise.all([
        fetchPartyBalances(),
        fetchParties(),
        fetchUserDirectory(),
      ]);
      renderSummary();
      renderList();
    } catch (err) {
      region.innerHTML = `<p class="empty">Could not load: ${esc(err.message)}</p>`;
    }
  };

  const renderSummary = () => {
    const receivable = balances
      .filter((b) => b.kind === 'customer')
      .reduce((s, b) => s + Math.max(0, Number(b.balance)), 0);
    const payable = balances
      .filter((b) => b.kind === 'seller')
      .reduce((s, b) => s + Math.max(0, Number(b.balance)), 0);
    summary.innerHTML = `
      <button type="button" class="stk-stat stk-stat--hero stk-stat--click" data-drill="receivable"><span class="stk-stat-lbl">Total receivable ›</span><span class="stk-stat-val">${money(receivable)}</span></button>
      <button type="button" class="stk-stat stk-stat--click" data-drill="payable"><span class="stk-stat-lbl">Total payable ›</span><span class="stk-stat-val">${money(payable)}</span></button>
      <div class="stk-stat"><span class="stk-stat-lbl">Parties</span><span class="stk-stat-val">${parties.length}</span></div>`;
    summary.querySelectorAll('[data-drill]').forEach((b) =>
      b.addEventListener('click', () => openDrill(b.dataset.drill)),
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

  // KPI drill-down: who owes us (receivable) / who we owe (payable).
  function openDrill(kind) {
    const isRec = kind === 'receivable';
    const rows = balances
      .filter((b) => b.kind === (isRec ? 'customer' : 'seller') && Number(b.balance) > 0.005)
      .sort((a, b) => Number(b.balance) - Number(a.balance));
    const total = rows.reduce((s, b) => s + Number(b.balance), 0);
    const { holder, body, close } = openModalShell(isRec ? 'Receivables — who owes us' : 'Payables — who we owe');
    body.innerHTML = `
      <p class="biz-drill-total">${rows.length} ${isRec ? 'customer(s)' : 'seller(s)'} · ${money(total)} outstanding</p>
      ${
        rows.length
          ? `<div class="biz-drill-list">${rows
              .map(
                (b) => `<button type="button" class="biz-drill-row" data-open="${b.id}">
                  <span class="biz-drill-name">${esc(b.name)}${b.mobile ? ` · ${esc(b.mobile)}` : ''}</span>
                  <span class="biz-drill-amt">${money(b.balance)}</span></button>`,
              )
              .join('')}</div>`
          : `<p class="pm-hint">Nothing outstanding — all ${isRec ? 'customers are settled' : 'sellers are paid'}.</p>`
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
