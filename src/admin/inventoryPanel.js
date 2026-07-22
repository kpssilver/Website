// =============================================================================
// INVENTORY PANEL — a reusable movements ledger + Restock / Sell / Return
// controls, shown inside the Stock editor and the Products editor.
//
// Movements (opening, restock, sale, return) are recorded server-side; returns
// are validated against the original sale invoice by the process_return RPC.
// =============================================================================
import { fetchStockMovements, restockItem, processReturn } from '../data/stock.js';
import { actorLabel } from '../data/business.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MOVEMENT_KINDS = {
  opening: { label: 'Opening stock', cls: 'stk-mv--in' },
  restock: { label: 'Restock', cls: 'stk-mv--in' },
  sale: { label: 'Sale', cls: 'stk-mv--out' },
  sale_return: { label: 'Return', cls: 'stk-mv--in' },
  adjust: { label: 'Adjustment', cls: '' },
};

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return (
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) +
    ' · ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );
}

// Renders the ledger + action buttons into `container`. Returns { refresh }.
export function mountInventoryPanel(container, opts = {}) {
  const { stockItemId, productId, itemLabel = 'this item', dir = {}, onSell, onChange } = opts;
  container.classList.add('stk-inv');
  container.innerHTML = `
    <div class="pm-media-head">
      <h3>Inventory &amp; movements</h3>
      <span class="stk-inv-qty"></span>
    </div>
    <div class="stk-inv-btns">
      <button type="button" class="dash-btn dash-btn--ghost" data-act="restock">Restock</button>
      <button type="button" class="dash-btn dash-btn--ghost" data-act="sell">Sell</button>
      <button type="button" class="dash-btn dash-btn--ghost" data-act="return">Return</button>
    </div>
    <div class="stk-inv-log"><p class="pm-hint">Loading movements…</p></div>`;

  const qtyEl = container.querySelector('.stk-inv-qty');
  const logEl = container.querySelector('.stk-inv-log');

  const renderLog = async () => {
    try {
      const moves = await fetchStockMovements(stockItemId);
      let run = 0;
      const rows = moves
        .map((m) => {
          run += Number(m.quantity_delta || 0);
          const meta = MOVEMENT_KINDS[m.kind] || { label: m.kind, cls: '' };
          const delta = Number(m.quantity_delta || 0);
          const ref = m.invoice_no ? `Invoice ${esc(m.invoice_no)}` : m.note ? esc(m.note) : '';
          const who = m.actor_id ? ` · ${esc(actorLabel(dir, m.actor_id))}` : '';
          return `
          <div class="stk-mv ${meta.cls}">
            <div class="stk-mv-main">
              <span class="stk-mv-kind">${esc(meta.label)}</span>
              <span class="stk-mv-ref">${ref}${who}</span>
            </div>
            <div class="stk-mv-nums">
              <span class="stk-mv-delta">${delta > 0 ? '+' : ''}${delta}</span>
              <span class="stk-mv-run">bal ${run}</span>
            </div>
            <span class="stk-mv-date">${fmtDate(m.created_at)}</span>
          </div>`;
        })
        .reverse()
        .join('');
      qtyEl.textContent = `On hand: ${run}`;
      logEl.innerHTML = moves.length ? rows : '<p class="pm-hint">No movements recorded yet.</p>';
    } catch (err) {
      logEl.innerHTML = `<p class="pm-hint">Could not load movements: ${esc(err.message)}</p>`;
    }
  };

  container.querySelector('[data-act="restock"]').addEventListener('click', async () => {
    const raw = prompt('How many pieces are you adding to stock?', '1');
    if (raw == null) return;
    const qty = Math.round(Number(raw));
    if (!qty || qty <= 0) {
      alert('Enter a positive whole number.');
      return;
    }
    const note = prompt('Note (optional) — e.g. supplier / reason:', '') || null;
    try {
      await restockItem(stockItemId, qty, note);
      await renderLog();
      if (onChange) onChange();
    } catch (err) {
      alert(`Restock failed: ${err.message}`);
    }
  });

  container.querySelector('[data-act="sell"]').addEventListener('click', () => {
    if (!productId) {
      alert('This item has no linked product yet. Save it, then try again.');
      return;
    }
    if (onSell) onSell();
  });

  container.querySelector('[data-act="return"]').addEventListener('click', () =>
    openReturnDialog({
      stockItemId,
      productId,
      itemLabel,
      onDone: async () => {
        await renderLog();
        if (onChange) onChange();
      },
    }),
  );

  renderLog();
  return { refresh: renderLog };
}

// Return-against-invoice dialog. The backend verifies the item was actually
// sold on the quoted invoice before restocking it.
export function openReturnDialog({ stockItemId, productId, itemLabel = 'this item', onDone }) {
  const holder = document.createElement('div');
  holder.innerHTML = `
  <div class="pm-modal-backdrop" id="retBackdrop">
    <div class="pm-modal pm-modal--sm" role="dialog" aria-modal="true" aria-label="Process a return">
      <div class="pm-modal-head">
        <h2>Return item</h2>
        <button class="pm-x" id="retClose" type="button" aria-label="Close">✕</button>
      </div>
      <form class="pm-form" id="retForm">
        <p class="pm-hint">Returning <strong>${esc(itemLabel)}</strong>. We’ll verify it against the original sale invoice before it’s added back to stock.</p>
        <div class="pm-form-grid">
          <label class="pm-lbl">Original invoice number *
            <input name="invoice_no" type="text" required placeholder="e.g. INV-000123" autocomplete="off" />
          </label>
          <label class="pm-lbl">Quantity to return *
            <input name="qty" type="number" min="1" step="1" value="1" required />
          </label>
        </div>
        <div class="pm-form-actions">
          <span class="pm-save-msg" id="retMsg"></span>
          <button type="button" class="dash-btn dash-btn--ghost" id="retCancel">Cancel</button>
          <button type="submit" class="dash-btn" id="retSubmit">Process return</button>
        </div>
      </form>
    </div>
  </div>`;
  document.body.appendChild(holder);
  const close = () => holder.remove();
  holder.querySelector('#retClose').addEventListener('click', close);
  holder.querySelector('#retCancel').addEventListener('click', close);
  holder.querySelector('#retBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'retBackdrop') close();
  });

  holder.querySelector('#retForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = holder.querySelector('#retMsg');
    const submit = holder.querySelector('#retSubmit');
    const invoiceNo = (fd.get('invoice_no') || '').trim();
    const qty = Number(fd.get('qty'));
    if (!invoiceNo || !qty) {
      msg.textContent = 'Invoice number and quantity are required.';
      msg.className = 'pm-save-msg is-error';
      return;
    }
    submit.disabled = true;
    msg.textContent = 'Verifying invoice…';
    msg.className = 'pm-save-msg';
    try {
      const ret = await processReturn({ stockItemId, productId, invoiceNo, qty });
      close();
      if (onDone) await onDone();
      alert(`Return processed. Credit note ${ret?.invoice_no || ''} created and stock restored.`);
    } catch (err) {
      msg.textContent = err.message || 'Return failed.';
      msg.className = 'pm-save-msg is-error';
      submit.disabled = false;
    }
  });
}
