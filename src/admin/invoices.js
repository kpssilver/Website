// =============================================================================
// INVOICES (Billing) — sale / sale-return / purchase / purchase-return.
// Create an invoice by searching (or scanning) products, pick/create the party
// inline, apply discount + tax, record amount paid; any balance flows into the
// party's receivable/payable. Invoices can be printed.
// =============================================================================
import { openScanner } from './scanner.js';
import { comboField, wireCombos } from './combo.js';
import { fetchProducts } from '../data/products.js';
import { fetchPricingSettings, computePrice } from '../data/pricing.js';
import { site } from '../config/site.js';
import {
  INVOICE_KINDS,
  invoiceKind,
  fetchParties,
  insertParty,
  fetchInvoices,
  fetchInvoice,
  createInvoice,
  createPayment,
  deleteInvoice,
  fetchUserDirectory,
  actorLabel,
  money,
} from '../data/business.js';

// Settlement methods offered on invoices + payments. "Silver" lets a customer
// settle with silver metal; "Add new…" allows any custom method.
const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque', 'Silver'];

// Payment direction implied by an invoice kind (money in vs out).
function paymentDirection(kind) {
  return kind === 'sale' || kind === 'purchase_return' ? 'in' : 'out';
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ---- Print -----------------------------------------------------------------
function printInvoice(inv, party, items) {
  document.querySelectorAll('.print-sheet').forEach((n) => n.remove());
  const k = invoiceKind(inv.kind);
  const rows = items
    .map(
      (it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(it.description)}${it.sku ? `<br><small>${esc(it.sku)}</small>` : ''}</td>
        <td class="r">${Number(it.quantity)}</td>
        <td class="r">${it.weight ? `${Number(it.weight)} g` : '—'}</td>
        <td class="r">${money(it.rate)}</td>
        <td class="r">${money(it.amount)}</td>
      </tr>`,
    )
    .join('');
  const wrap = document.createElement('div');
  wrap.className = 'print-sheet';
  wrap.innerHTML = `
    <div class="inv-sheet">
      <div class="inv-sheet-head">
        <div><div class="inv-sheet-brand">KPS SILVER</div><div class="inv-sheet-sub">${esc(site.address?.lines?.join(', ') || 'Nagarthpet, Bengaluru')}</div></div>
        <div class="inv-sheet-meta">
          <div class="inv-sheet-title">${esc(k.label)}</div>
          <div>${esc(inv.invoice_no)}</div>
          <div>${esc(inv.invoice_date)}</div>
        </div>
      </div>
      <div class="inv-sheet-party">
        <strong>${k.party === 'seller' ? 'Seller' : 'Customer'}:</strong> ${esc(party?.name || '—')}${party?.mobile ? ` · ${esc(party.mobile)}` : ''}${party?.gstin ? `<br>GSTIN: ${esc(party.gstin)}` : ''}
      </div>
      <table class="inv-sheet-table">
        <thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Wt</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="inv-sheet-totals">
        <div><span>Subtotal</span><span>${money(inv.subtotal)}</span></div>
        ${Number(inv.discount) ? `<div><span>Discount</span><span>- ${money(inv.discount)}</span></div>` : ''}
        ${Number(inv.tax_amount) ? `<div><span>Tax (${Number(inv.tax_percent)}%)</span><span>${money(inv.tax_amount)}</span></div>` : ''}
        <div class="inv-sheet-grand"><span>Total</span><span>${money(inv.total)}</span></div>
        <div><span>Paid</span><span>${money(inv.amount_paid)}</span></div>
        <div class="inv-sheet-due"><span>Balance due</span><span>${money(inv.total - inv.amount_paid)}</span></div>
      </div>
      <p class="inv-sheet-foot">Thank you · KPS Silver — Where trust is tradition</p>
    </div>`;
  document.body.appendChild(wrap);
  const cleanup = () => {
    wrap.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

// ---- Invoice editor modal --------------------------------------------------
export function openInvoiceModal({ kind = 'sale', prefill = [], onSaved } = {}) {
  const holder = document.createElement('div');
  holder.innerHTML = `
  <div class="pm-modal-backdrop" id="invBackdrop">
    <div class="pm-modal inv-modal" role="dialog" aria-modal="true" aria-label="New invoice">
      <div class="pm-modal-head">
        <h2 id="invTitle">New invoice</h2>
        <button class="pm-x" id="invClose" type="button" aria-label="Close">✕</button>
      </div>
      <div class="pm-form">
        <div class="pm-form-grid">
          <label class="pm-lbl">Type
            <select id="invKind">${INVOICE_KINDS.map((k) => `<option value="${k.value}" ${k.value === kind ? 'selected' : ''}>${k.label}</option>`).join('')}</select>
          </label>
          <label class="pm-lbl">Date
            <input id="invDate" type="date" value="${new Date().toISOString().slice(0, 10)}" />
          </label>
          <label class="pm-lbl" id="invPartyWrap"><span id="invPartyLabel">Customer</span>
            <select id="invParty"><option value="">Loading…</option></select>
          </label>
          <div class="pm-lbl inv-newparty" id="invNewParty" hidden>
            <div class="pm-inline">
              <input id="invNewName" type="text" placeholder="New name" />
              <input id="invNewMobile" type="text" placeholder="Mobile (optional)" />
            </div>
          </div>
        </div>

        <div class="inv-add">
          <div class="stk-search">
            <svg class="stk-search-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 104.47 10.03l4.75 4.75 1.41-1.41-4.75-4.75A6 6 0 0010 4zm0 2a4 4 0 110 8 4 4 0 010-8z"/></svg>
            <input id="invItemSearch" type="search" autocomplete="off" placeholder="Search product by name / SKU — or scan" />
          </div>
          <button type="button" class="dash-btn dash-btn--ghost stk-scan-btn" id="invScan">Scan</button>
        </div>
        <div class="inv-results" id="invResults" hidden></div>

        <table class="inv-items">
          <thead><tr><th>Item</th><th>Qty</th><th>Wt (g)</th><th>Rate/g ex-GST</th><th>Amount</th><th></th></tr></thead>
          <tbody id="invItemsBody"></tbody>
        </table>

        <div class="inv-foot">
          <div class="inv-foot-fields">
            <label class="pm-lbl">Discount (₹)<input id="invDiscount" type="number" step="0.01" min="0" value="0" /></label>
            <label class="pm-lbl">GST / Tax (%)<input id="invTax" type="number" step="0.001" min="0" value="3" /></label>
            <label class="pm-lbl">Amount paid (₹)<input id="invPaid" type="number" step="0.01" min="0" value="0" /></label>
            <div id="invMethodWrap" class="inv-method-wrap">${comboField({ name: 'payment_method', label: 'Payment method', value: 'Cash', options: PAYMENT_METHODS })}</div>
          </div>
          <div class="inv-totals" id="invTotals"></div>
        </div>

        <label class="pm-lbl pm-col-2">Notes<textarea id="invNotes" rows="2" placeholder="Optional"></textarea></label>

        <div class="pm-form-actions">
          <span class="pm-save-msg" id="invMsg"></span>
          <button type="button" class="dash-btn dash-btn--ghost" id="invCancel">Cancel</button>
          <button type="button" class="dash-btn" id="invSave">Save invoice</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.appendChild(holder);

  const $ = (sel) => holder.querySelector(sel);
  const close = () => holder.remove();
  $('#invClose').addEventListener('click', close);
  $('#invCancel').addEventListener('click', close);
  $('#invBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'invBackdrop') close();
  });
  wireCombos(holder);

  let products = [];
  let settings = {};
  let parties = [];
  let items = [];
  const kindSel = $('#invKind');
  const partySel = $('#invParty');

  const lineFromProduct = (p) => {
    const r = computePrice(p, settings);
    // `rate` is the per-PIECE price BEFORE GST (GST is applied once via the Tax
    // field). We also derive a per-GRAM figure for display/editing beside the
    // weight; editing per-gram recomputes rate = per_gram × weight.
    let rate;
    if (r.mode === 'calculated') rate = round2(r.subtotal);
    else if (r.mode === 'fixed') rate = round2(r.total);
    else rate = round2(Number(p.price || 0));
    const weight = p.weight_grams || null;
    const perGram = weight > 0 ? round2(rate / weight) : round2(rate);
    return {
      product_id: p.id,
      stock_item_id: null,
      description: p.title,
      sku: p.sku || null,
      design_no: null,
      hsn: null,
      quantity: 1,
      weight,
      per_gram: perGram,
      rate,
      amount: rate,
    };
  };

  // Recompute a line's rate + amount from its per-gram price and weight.
  const recalcLine = (it) => {
    const w = Number(it.weight || 0);
    it.rate = w > 0 ? round2(Number(it.per_gram || 0) * w) : round2(Number(it.per_gram || 0));
    it.amount = round2(Number(it.quantity || 0) * it.rate);
  };

  const renderTotals = () => {
    const subtotal = round2(items.reduce((s, it) => s + Number(it.amount || 0), 0));
    const discount = Number($('#invDiscount').value || 0);
    const taxPct = Number($('#invTax').value || 0);
    const taxable = Math.max(0, subtotal - discount);
    const taxAmt = round2((taxable * taxPct) / 100);
    const total = round2(taxable + taxAmt);
    const paid = Number($('#invPaid').value || 0);
    const due = round2(total - paid);
    $('#invTotals').innerHTML = `
      <div><span>Subtotal (ex-GST)</span><span>${money(subtotal)}</span></div>
      ${discount ? `<div><span>Discount</span><span>- ${money(discount)}</span></div>` : ''}
      <div><span>GST / Tax${taxPct ? ` (${taxPct}%)` : ''}</span><span>${money(taxAmt)}</span></div>
      <div class="inv-total-grand"><span>Total</span><span>${money(total)}</span></div>
      <div class="inv-total-due"><span>Balance due</span><span>${money(due)}</span></div>`;
    return { subtotal, discount, taxPct, taxAmt, total, paid, due };
  };

  const renderItems = () => {
    $('#invItemsBody').innerHTML = items.length
      ? items
          .map(
            (it, i) => `
        <tr data-i="${i}">
          <td>${esc(it.description)}${it.sku ? `<br><small>${esc(it.sku)}</small>` : ''}</td>
          <td><input class="inv-cell" data-f="quantity" type="number" step="0.001" min="0" value="${it.quantity}" /></td>
          <td><input class="inv-cell" data-f="weight" type="number" step="0.001" min="0" value="${it.weight ?? ''}" /></td>
          <td><input class="inv-cell" data-f="per_gram" type="number" step="0.01" min="0" value="${it.per_gram ?? it.rate}" /></td>
          <td class="r">${money(it.amount)}</td>
          <td><button type="button" class="inv-rm" data-rm="${i}" aria-label="Remove">✕</button></td>
        </tr>`,
          )
          .join('')
      : '<tr><td colspan="6" class="inv-empty">No items yet — search or scan to add.</td></tr>';

    $('#invItemsBody')
      .querySelectorAll('.inv-cell')
      .forEach((inp) =>
        inp.addEventListener('input', () => {
          const tr = inp.closest('tr');
          const i = Number(tr.dataset.i);
          const f = inp.dataset.f;
          items[i][f] = Number(inp.value || 0);
          recalcLine(items[i]);
          tr.querySelector('td.r').textContent = money(items[i].amount);
          renderTotals();
        }),
      );
    $('#invItemsBody')
      .querySelectorAll('[data-rm]')
      .forEach((b) =>
        b.addEventListener('click', () => {
          items.splice(Number(b.dataset.rm), 1);
          renderItems();
          renderTotals();
        }),
      );
    renderTotals();
  };

  const addProduct = (p) => {
    if (!p) return;
    items.push(lineFromProduct(p));
    renderItems();
  };

  // Item search dropdown.
  const searchInput = $('#invItemSearch');
  const results = $('#invResults');
  const renderResults = () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      results.hidden = true;
      return;
    }
    const matches = products
      .filter((p) =>
        [p.title, p.sku, p.category].some((v) => (v || '').toString().toLowerCase().includes(q)),
      )
      .slice(0, 8);
    results.hidden = false;
    results.innerHTML = matches.length
      ? matches
          .map(
            (p) =>
              `<button type="button" class="inv-result" data-id="${p.id}">${esc(p.title)}${p.sku ? ` · ${esc(p.sku)}` : ''}</button>`,
          )
          .join('')
      : '<div class="inv-result inv-result--empty">No match</div>';
    results.querySelectorAll('[data-id]').forEach((b) =>
      b.addEventListener('click', () => {
        addProduct(products.find((p) => p.id === b.dataset.id));
        searchInput.value = '';
        results.hidden = true;
      }),
    );
  };
  searchInput.addEventListener('input', renderResults);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const q = searchInput.value.trim().toLowerCase();
    const exact = products.find((p) => (p.sku || '').toLowerCase() === q);
    const first = products.filter((p) => [p.title, p.sku].some((v) => (v || '').toLowerCase().includes(q)))[0];
    addProduct(exact || first);
    searchInput.value = '';
    results.hidden = true;
  });
  $('#invScan').addEventListener('click', () =>
    openScanner((code) => {
      const p = products.find((x) => (x.sku || '').toLowerCase() === code.toLowerCase());
      if (p) addProduct(p);
      else {
        searchInput.value = code;
        renderResults();
      }
    }),
  );

  ['#invDiscount', '#invTax', '#invPaid'].forEach((s) => $(s).addEventListener('input', renderTotals));

  // Party options + inline new.
  const renderPartyOptions = () => {
    const label = invoiceKind(kindSel.value).party === 'seller' ? 'Seller' : 'Customer';
    $('#invPartyLabel').textContent = label;
    partySel.innerHTML =
      `<option value="">— Select ${label.toLowerCase()} —</option>` +
      parties.map((p) => `<option value="${p.id}">${esc(p.name)}${p.mobile ? ` (${esc(p.mobile)})` : ''}</option>`).join('') +
      `<option value="__new__">➕ Add new ${label.toLowerCase()}…</option>`;
  };
  partySel.addEventListener('change', () => {
    $('#invNewParty').hidden = partySel.value !== '__new__';
  });

  const loadParties = async () => {
    parties = await fetchParties(invoiceKind(kindSel.value).party);
    renderPartyOptions();
  };
  kindSel.addEventListener('change', () => {
    $('#invNewParty').hidden = true;
    loadParties();
  });

  // Save.
  $('#invSave').addEventListener('click', async () => {
    const msg = $('#invMsg');
    if (!items.length) {
      msg.textContent = 'Add at least one item.';
      msg.className = 'pm-save-msg is-error';
      return;
    }
    const t = renderTotals();
    const btn = $('#invSave');
    btn.disabled = true;
    msg.textContent = 'Saving…';
    msg.className = 'pm-save-msg';
    try {
      let partyId = partySel.value && partySel.value !== '__new__' ? partySel.value : null;
      if (partySel.value === '__new__') {
        const name = $('#invNewName').value.trim();
        if (!name) throw new Error('Enter a name for the new party.');
        const created = await insertParty({
          kind: invoiceKind(kindSel.value).party,
          name,
          mobile: $('#invNewMobile').value.trim() || null,
        });
        partyId = created.id;
      }
      const invoice = {
        kind: kindSel.value,
        party_id: partyId,
        invoice_date: $('#invDate').value || new Date().toISOString().slice(0, 10),
        subtotal: t.subtotal,
        discount: t.discount,
        tax_percent: t.taxPct,
        tax_amount: t.taxAmt,
        total: t.total,
        amount_paid: t.paid,
        notes: $('#invNotes').value.trim() || null,
      };
      const lineItems = items.map((it) => ({
        stock_item_id: it.stock_item_id,
        product_id: it.product_id,
        description: it.description,
        sku: it.sku,
        design_no: it.design_no,
        hsn: it.hsn,
        quantity: it.quantity,
        weight: it.weight,
        rate: it.rate,
        amount: it.amount,
      }));
      const saved = await createInvoice(invoice, lineItems);
      // If money changed hands, record it as a payment (with method) so it
      // actually settles the party balance and carries the payment method.
      if (t.paid > 0 && partyId) {
        const method = holder.querySelector('#invMethodWrap .kps-combo-val')?.value || null;
        try {
          await createPayment({
            party_id: partyId,
            direction: paymentDirection(kindSel.value),
            amount: t.paid,
            method: method || null,
            paid_on: invoice.invoice_date,
            notes: `Paid against ${saved.invoice_no}`,
          });
        } catch (payErr) {
          console.error('[KPS] payment record failed:', payErr);
        }
      }
      close();
      if (onSaved) onSaved(saved);
      const party = parties.find((p) => p.id === partyId) || { name: $('#invNewName').value.trim() };
      if (confirm(`Saved ${saved.invoice_no}. Print it now?`)) printInvoice(saved, party, lineItems);
    } catch (err) {
      msg.textContent = `Save failed: ${err.message}`;
      msg.className = 'pm-save-msg is-error';
      btn.disabled = false;
    }
  });

  // Initial load.
  (async () => {
    try {
      [products, settings] = await Promise.all([fetchProducts(), fetchPricingSettings()]);
      // Apply the master GST rate so tax is added + shown as its own line.
      $('#invTax').value = Number(settings?.gst_percent ?? 3);
      await loadParties();
      // Prefill items (e.g. from the stock "Sell" button).
      for (const pre of prefill) {
        const p = pre.product_id ? products.find((x) => x.id === pre.product_id) : null;
        if (p) addProduct(p);
      }
      renderItems();
    } catch (err) {
      $('#invMsg').textContent = `Could not load: ${err.message}`;
      $('#invMsg').className = 'pm-save-msg is-error';
    }
  })();
}

// ---- Invoices list view ----------------------------------------------------
export async function renderInvoices(root, session) {
  root.innerHTML = `
  <div class="pm">
    <div class="pm-top">
      <div>
        <h2 class="pm-title">Billing</h2>
        <p class="pm-lede">Create sale &amp; return invoices. Unpaid balances flow into receivables / payables.</p>
      </div>
      <button class="dash-btn" id="invNew" type="button">+ New invoice</button>
    </div>
    <div id="invListRegion" class="pm-region"><div class="cm-loading">Loading invoices…</div></div>
  </div>`;

  const region = root.querySelector('#invListRegion');

  const reload = async () => {
    try {
      const [rows, dir] = await Promise.all([fetchInvoices(), fetchUserDirectory()]);
      region.innerHTML = rows.length
        ? `<div class="inv-list">${rows
            .map((r) => {
              const k = invoiceKind(r.kind);
              const due = Number(r.total) - Number(r.amount_paid);
              const dueBadge =
                due > 0.005
                  ? `<span class="pm-badge pm-badge--out">Due ${money(due)}</span>`
                  : '<span class="pm-badge pm-badge--in">Settled</span>';
              return `
              <article class="inv-row" data-id="${r.id}">
                <div class="inv-row-main">
                  <div class="inv-row-head"><span class="pm-badge pm-badge--sku">${esc(r.invoice_no)}</span><span class="inv-kind">${esc(k.short)}</span>${dueBadge}</div>
                  <div class="pm-card-meta">
                    <span>${esc(r.party?.name || '—')}</span>
                    <span>${esc(r.invoice_date)}</span>
                    <span>Total ${money(r.total)}</span>
                    ${r.created_by ? `<span>By ${esc(actorLabel(dir, r.created_by))}</span>` : ''}
                  </div>
                </div>
                <div class="pm-card-actions">
                  <button class="dash-btn dash-btn--ghost" data-print="${r.id}" type="button">Print</button>
                  <button class="dash-btn dash-btn--danger" data-del="${r.id}" type="button">Delete</button>
                </div>
              </article>`;
            })
            .join('')}</div>`
        : '<div class="pm-empty"><p>No invoices yet.</p><p class="pm-empty-sub">Create your first sale invoice.</p></div>';
      wire(rows);
    } catch (err) {
      region.innerHTML = `<p class="empty">Could not load invoices: ${esc(err.message)}</p>`;
    }
  };

  const wire = (rows) => {
    region.querySelectorAll('[data-print]').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          const full = await fetchInvoice(b.dataset.print);
          printInvoice(full, full.party, full.items || []);
        } catch (err) {
          alert(`Could not open invoice: ${err.message}`);
        }
      }),
    );
    region.querySelectorAll('[data-del]').forEach((b) =>
      b.addEventListener('click', async () => {
        const r = rows.find((x) => x.id === b.dataset.del);
        if (!confirm(`Delete invoice ${r?.invoice_no}? This cannot be undone.`)) return;
        b.disabled = true;
        try {
          await deleteInvoice(b.dataset.del);
          reload();
        } catch (err) {
          alert(`Delete failed: ${err.message}`);
          b.disabled = false;
        }
      }),
    );
  };

  root.querySelector('#invNew').addEventListener('click', () => openInvoiceModal({ onSaved: reload }));
  reload();
}
