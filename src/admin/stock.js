// =============================================================================
// STOCK MANAGER (admin + staff)
// An internal inventory register, separate from the public shop catalogue.
// Shows the total gross weight of stock and lets admin/staff add or remove
// items. Each item captures photos/video, category + subcategory, supplier,
// collection, gross weight and size. On save the DB assigns an SKU and a design
// number; both can be printed onto a scannable tag (Code128 barcode).
// =============================================================================
import QRCode from 'qrcode';
import { openScanner } from './scanner.js';
import { openInvoiceModal } from './invoices.js';
import { openCatalogue } from './catalogue.js';
import { mountInventoryPanel } from './inventoryPanel.js';
import { comboField, wireCombos } from './combo.js';
import { fetchUserDirectory, actorLabel } from '../data/business.js';
import { fetchProducts } from '../data/products.js';
import { fetchPricingSettings, priceLabel } from '../data/pricing.js';
import {
  fetchStockItems,
  insertStockItem,
  updateStockItem,
  deleteStockItem,
  uploadStockMedia,
  fetchStockLists,
  insertStockList,
  totalGrossWeight,
  totalQuantity,
  formatGrams,
  firstImage,
  distinctValues,
  mergeSuggestions,
  STOCK_CATEGORIES,
  STOCK_SUBCATEGORIES,
} from '../data/stock.js';

// Coarse mobile / touch detection — used to surface a live-camera capture
// button alongside the gallery picker on phones and tablets.
const IS_MOBILE =
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints || 0) > 1);


function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Edit / delete tool icons (top-right of each card).
const EDIT_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
const DEL_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2zM4 6h16v1H4V6z"/></svg>';

// Small "i" help button (matches the product manager).
function ic(text) {
  return `<button type="button" class="pm-info" data-info="${esc(text)}" aria-label="What is this field?">i</button>`;
}

function wireInfo(scope) {
  const closeAll = () => scope.querySelectorAll('.pm-info-pop').forEach((p) => p.remove());
  scope.addEventListener('click', (e) => {
    const btn = e.target.closest('.pm-info');
    if (!btn) {
      closeAll();
      return;
    }
    e.preventDefault();
    const alreadyOpen = btn.nextElementSibling?.classList?.contains('pm-info-pop');
    closeAll();
    if (!alreadyOpen) {
      const pop = document.createElement('span');
      pop.className = 'pm-info-pop';
      pop.textContent = btn.dataset.info;
      btn.after(pop);
    }
  });
}

// Build dropdown suggestion sets from master lists + values already used on
// items + a static seed list (deduped, sorted).
function buildSets(items, lists = {}) {
  const names = (arr) => (arr || []).map((x) => x.name);
  return {
    categories: mergeSuggestions([...names(lists.category), ...distinctValues(items, 'category')], STOCK_CATEGORIES),
    subcategories: mergeSuggestions([...names(lists.subcategory), ...distinctValues(items, 'subcategory')], STOCK_SUBCATEGORIES),
    suppliers: mergeSuggestions([...names(lists.supplier), ...distinctValues(items, 'supplier')], []),
    collections: mergeSuggestions([...names(lists.collection), ...distinctValues(items, 'collection')], []),
  };
}

// Modal to add a new category / subcategory / supplier / collection with proper
// details. Persists to stock_lists and resolves with the new name (or null).
function openAddListModal(kind) {
  const titles = { category: 'category', subcategory: 'sub category', supplier: 'supplier', collection: 'collection' };
  const isSupplier = kind === 'supplier';
  return new Promise((resolve) => {
    const holder = document.createElement('div');
    holder.innerHTML = `
    <div class="pm-modal-backdrop" id="slBackdrop" style="z-index:120">
      <div class="pm-modal pm-modal--sm" role="dialog" aria-modal="true" aria-label="New ${titles[kind] || kind}">
        <div class="pm-modal-head"><h2>New ${titles[kind] || kind}</h2><button class="pm-x" id="slClose" type="button" aria-label="Close">✕</button></div>
        <form class="pm-form" id="slForm">
          <div class="pm-form-grid">
            <label class="pm-lbl pm-col-2">Name *<input name="name" type="text" required autocomplete="off" placeholder="e.g. ${isSupplier ? 'Sri Lakshmi Silvers' : kind === 'collection' ? 'Heritage' : 'Pooja Articles'}" /></label>
            ${
              isSupplier
                ? `<label class="pm-lbl">Mobile<input name="mobile" type="text" placeholder="Optional" /></label>
                   <label class="pm-lbl">GST / code<input name="notes" type="text" placeholder="Optional" /></label>
                   <label class="pm-lbl pm-col-2">Address<input name="address" type="text" placeholder="Optional" /></label>`
                : `<label class="pm-lbl pm-col-2">Description<textarea name="description" rows="2" placeholder="Optional details for this ${titles[kind] || kind}"></textarea></label>`
            }
          </div>
          <div class="pm-form-actions">
            <span class="pm-save-msg" id="slMsg"></span>
            <button type="button" class="dash-btn dash-btn--ghost" id="slCancel">Cancel</button>
            <button type="submit" class="dash-btn" id="slSubmit">Add &amp; save</button>
          </div>
        </form>
      </div>
    </div>`;
    document.body.appendChild(holder);
    const done = (v) => {
      holder.remove();
      resolve(v);
    };
    holder.querySelector('#slClose').addEventListener('click', () => done(null));
    holder.querySelector('#slCancel').addEventListener('click', () => done(null));
    holder.querySelector('#slBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'slBackdrop') done(null);
    });
    holder.querySelector('#slForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const name = (fd.get('name') || '').trim();
      const msg = holder.querySelector('#slMsg');
      if (!name) {
        msg.textContent = 'Name is required.';
        msg.className = 'pm-save-msg is-error';
        return;
      }
      const btn = holder.querySelector('#slSubmit');
      btn.disabled = true;
      msg.textContent = 'Saving…';
      msg.className = 'pm-save-msg';
      try {
        await insertStockList({
          kind,
          name,
          description: (fd.get('description') || '').trim() || null,
          mobile: (fd.get('mobile') || '').trim() || null,
          address: (fd.get('address') || '').trim() || null,
          notes: (fd.get('notes') || '').trim() || null,
        });
        done(name);
      } catch (err) {
        // Already exists → just reuse the name.
        if (/duplicate|unique/i.test(err.message || '')) {
          done(name);
          return;
        }
        msg.textContent = `Save failed: ${err.message}`;
        msg.className = 'pm-save-msg is-error';
        btn.disabled = false;
      }
    });
    holder.querySelector('input[name="name"]').focus();
  });
}

// ---- List ------------------------------------------------------------------
function listMarkup(items, dir = {}, opts = {}) {
  const { selectMode = false, selected = new Set() } = opts;
  if (!items.length) {
    return `
    <div class="pm-empty">
      <p>No stock items yet.</p>
      <p class="pm-empty-sub">Add your first item — it will be assigned an SKU and design number automatically.</p>
    </div>`;
  }
  const rows = items
    .map((it) => {
      const img = firstImage(it);
      const thumb = img
        ? `<img src="${esc(img)}" alt="" class="pm-thumb" />`
        : `<div class="pm-thumb pm-thumb--empty">No image</div>`;
      const gross = it.gross_weight != null ? `${formatGrams(it.gross_weight)}${(it.quantity || 1) > 1 ? ` × ${it.quantity}` : ''}` : '';
      const who = it.updated_by || it.created_by;
      const soldOut = (it.quantity || 0) <= 0;
      const picked = selected.has(it.id);
      return `
      <article class="pm-card ${selectMode ? `pm-card--select${picked ? ' pm-card--picked' : ''}` : 'pm-card--click'}" data-open="${it.id}" tabindex="0" role="button" aria-label="Edit ${esc(it.title || it.sku)}">
        ${
          selectMode
            ? `<span class="pm-card-check" aria-hidden="true">${picked ? '✓' : ''}</span>`
            : `<div class="pm-card-tools">
          <button class="pm-tool" data-edit="${it.id}" type="button" title="Edit" aria-label="Edit">${EDIT_ICON}</button>
          <button class="pm-tool pm-tool--danger" data-del="${it.id}" type="button" title="Remove" aria-label="Remove">${DEL_ICON}</button>
        </div>`
        }
        ${thumb}
        <div class="pm-card-body">
          <div class="pm-card-head">
            <h3>${esc(it.title || it.sku)}</h3>
            <div class="pm-badges">
              <span class="pm-badge pm-badge--sku">${esc(it.sku)}</span>
              ${it.design_no ? `<span class="pm-badge">Design ${esc(it.design_no)}</span>` : ''}
              ${soldOut ? '<span class="pm-badge pm-badge--out">Sold out</span>' : ''}
            </div>
          </div>
          <div class="pm-card-meta">
            ${it.category ? `<span>${esc(it.category)}${it.subcategory ? ` · ${esc(it.subcategory)}` : ''}</span>` : ''}
            ${gross ? `<span>${esc(gross)}</span>` : ''}
            ${it.size ? `<span>${esc(it.size)}</span>` : ''}
            ${it.supplier ? `<span>Supplier: ${esc(it.supplier)}</span>` : ''}
            ${it.collection ? `<span>Collection: ${esc(it.collection)}</span>` : ''}
            ${who ? `<span>Added by ${esc(actorLabel(dir, who))}</span>` : ''}
          </div>
          ${
            selectMode
              ? ''
              : `<div class="pm-card-actions">
            <button class="dash-btn" data-sell="${it.id}" type="button"${soldOut ? ' disabled' : ''}>Sell item</button>
            <button class="dash-btn dash-btn--ghost" data-tag="${it.id}" type="button">Print tag</button>
          </div>`
          }
        </div>
      </article>`;
    })
    .join('');
  return `<div class="pm-list">${rows}</div>`;
}

// ---- Editor ----------------------------------------------------------------
function editorMarkup(it, sets = {}) {
  const isNew = !it.id;
  const cats = sets.categories || STOCK_CATEGORIES;
  const subs = sets.subcategories || STOCK_SUBCATEGORIES;
  const sups = sets.suppliers || [];
  const cols = sets.collections || [];
  const detailsForm = `
      <form class="pm-form stk-pane${isNew ? '' : ' is-hidden'}" data-pane="details" id="stkForm">
        ${
          isNew
            ? '<p class="pm-hint">An SKU and design number are assigned automatically when you save.</p>'
            : `<div class="stk-codes"><span class="pm-badge pm-badge--sku">${esc(it.sku)}</span>${it.design_no ? `<span class="pm-badge">Design ${esc(it.design_no)}</span>` : ''}</div>`
        }
        <div class="pm-form-grid">
          <label class="pm-lbl pm-col-2">Item name ${ic('An optional descriptive name for internal reference, e.g. "Peacock Deepam - large". If left blank, the SKU is used.')}
            <input name="title" type="text" value="${esc(it.title)}" placeholder="Optional — e.g. Peacock Deepam (large)" />
          </label>

          ${comboField({ name: 'category', label: 'Category *', value: it.category || '', options: cats, required: true, kind: 'category', extra: ic('Broad group for the item. Pick an existing one or choose “Add new…” to create a category (saved for reuse).') })}
          ${comboField({ name: 'subcategory', label: 'Sub category', value: it.subcategory || '', options: subs, kind: 'subcategory', extra: ic('A finer grouping within the category. Pick an existing one or add a new sub category (saved for reuse).') })}

          ${comboField({ name: 'supplier', label: 'Supplier name', value: it.supplier || '', options: sups, kind: 'supplier', extra: ic('Who supplied this piece. Pick an existing supplier or add a new one with contact details (saved for reuse).') })}
          ${comboField({ name: 'collection', label: 'Collection', value: it.collection || '', options: cols, kind: 'collection', extra: ic('The collection / range this piece belongs to. Pick an existing one or add a new collection (saved for reuse).') })}

          <label class="pm-lbl">Gross weight (grams) ${ic('The total weight of the piece in grams. Used to compute the total gross weight of stock.')}
            <input name="gross_weight" type="number" step="0.001" min="0" value="${it.gross_weight ?? ''}" />
          </label>
          <label class="pm-lbl">Size ${ic('Physical size / dimensions, e.g. "H 6in × W 3in" or "Medium".')}
            <input name="size" type="text" value="${esc(it.size)}" placeholder="e.g. H 6in × W 3in" />
          </label>

          ${
            isNew
              ? `<label class="pm-lbl">Opening quantity ${ic('How many identical pieces you are adding under this SKU. This becomes the opening stock in the inventory ledger.')}
            <input name="quantity" type="number" step="1" min="1" value="${it.quantity ?? 1}" />
          </label>`
              : `<div class="pm-lbl">On hand
            <div class="stk-onhand">${Number(it.quantity ?? 0)} pcs <span class="pm-field-note">Change via Restock / Sell / Return in the Inventory tab.</span></div>
          </div>`
          }
          <label class="pm-lbl">Design number ${ic('Auto-assigned on save. You can override it with a supplier/style design number if you have one.')}
            <input name="design_no" type="text" value="${esc(it.design_no)}" placeholder="${isNew ? 'Auto-assigned' : ''}" />
          </label>

          <label class="pm-lbl pm-col-2">Notes ${ic('Any internal notes about the piece (condition, location, remarks). Not printed on the tag.')}
            <textarea name="notes" rows="2" placeholder="Optional internal notes">${esc(it.notes)}</textarea>
          </label>
        </div>

        <div class="pm-media">
          <div class="pm-media-head">
            <h3>Photos</h3>
            <div class="pm-media-btns">
              <label class="cm-upload-btn"><input type="file" accept="image/*" multiple id="stkImgFile" hidden /> ${IS_MOBILE ? 'Gallery' : 'Add photos'}</label>
              ${IS_MOBILE ? '<label class="cm-upload-btn cm-upload-btn--cam"><input type="file" accept="image/*" capture="environment" id="stkImgCam" hidden /> 📷 Take photo</label>' : ''}
            </div>
          </div>
          <p class="pm-hint">The first photo is the main image.${IS_MOBILE ? ' “Take photo” opens your camera; “Gallery” picks existing photos.' : ''}</p>
          <div class="pm-images" id="stkImages"></div>
          <span class="pm-upload-status" id="stkImgStatus"></span>
        </div>

        <div class="pm-media">
          <div class="pm-media-head">
            <h3>Video</h3>
            <div class="pm-media-btns">
              <label class="cm-upload-btn"><input type="file" accept="video/*" id="stkVideoFile" hidden /> ${IS_MOBILE ? 'Gallery' : 'Upload video'}</label>
              ${IS_MOBILE ? '<label class="cm-upload-btn cm-upload-btn--cam"><input type="file" accept="video/*" capture="environment" id="stkVideoCam" hidden /> 🎥 Record</label>' : ''}
            </div>
          </div>
          <input name="video_url" type="text" id="stkVideoUrl" value="${esc(it.video_url)}" placeholder="Paste a video URL or upload a file" />
          <span class="pm-upload-status" id="stkVideoStatus"></span>
        </div>

        <div class="pm-form-actions">
          <span class="pm-save-msg" id="stkMsg"></span>
          <button type="button" class="dash-btn dash-btn--ghost" id="stkCancel">Cancel</button>
          <button type="submit" class="dash-btn" id="stkSubmit">${isNew ? 'Add to stock' : 'Save changes'}</button>
        </div>
      </form>`;

  return `
  <div class="pm-modal-backdrop" id="stkBackdrop">
    <div class="pm-modal" role="dialog" aria-modal="true" aria-label="${isNew ? 'New stock item' : 'Stock item'}">
      <div class="pm-modal-head">
        <h2>${isNew ? 'New stock item' : esc(it.title || it.sku)}</h2>
        <button class="pm-x" id="stkClose" type="button" aria-label="Close">✕</button>
      </div>
      ${
        isNew
          ? ''
          : `<div class="stk-tabs" role="tablist">
        <button type="button" class="stk-tab is-active" data-pane="inventory">Inventory</button>
        <button type="button" class="stk-tab" data-pane="details">Details</button>
      </div>
      <div class="stk-pane" data-pane="inventory"><div id="stkInv"></div></div>`
      }
      ${detailsForm}
    </div>
  </div>`;
}

const blankItem = () => ({
  title: '',
  category: '',
  subcategory: '',
  supplier: '',
  collection: '',
  gross_weight: null,
  size: '',
  quantity: 1,
  design_no: '',
  notes: '',
  images: [],
  video_url: '',
});

// ---- Tag printing ----------------------------------------------------------
// Recreates the shop's jewellery butterfly tag: a 100mm × 15mm thermal label
// whose printable "head" (right ~56mm) carries the KPS logo, weight, purity,
// design number, sub-category and a QR code of the SKU. The left ~44mm "tail"
// stays blank so it can wrap around the piece (matching the old TSPL layout).
// Sterling silver purity shown on the tag (matches the old label's fixed 92.5).
const TAG_PURITY = '92.5';

async function printTags(items) {
  document.querySelectorAll('.print-sheet').forEach((n) => n.remove());

  // QR generation is async — build every SKU code first, then lay out the tags.
  const qrs = await Promise.all(
    items.map((it) =>
      QRCode.toDataURL(String(it.sku || ''), { margin: 0, width: 240, errorCorrectionLevel: 'M' }).catch(() => ''),
    ),
  );

  const wrap = document.createElement('div');
  wrap.className = 'print-sheet print-sheet--tags';
  wrap.innerHTML = items
    .map((it, i) => {
      const wt = it.gross_weight != null ? Number(it.gross_weight).toFixed(3) : '';
      const sub = it.subcategory || it.category || '';
      return `
      <div class="tag">
        <div class="tag-tail"></div>
        <div class="tag-head">
          <img src="/favicon.svg" alt="" class="tag-logo" />
          <div class="tag-info">
            <span class="tag-brand">KPS SILVER</span>
            ${wt ? `<span class="tag-wt">Wt: ${esc(wt)} g</span>` : ''}
            <span class="tag-line">Purity: ${TAG_PURITY}</span>
            ${it.design_no ? `<span class="tag-line">D.No: ${esc(it.design_no)}</span>` : ''}
            ${sub ? `<span class="tag-line tag-sub">${esc(sub)}</span>` : ''}
          </div>
          <div class="tag-code">
            ${qrs[i] ? `<img src="${qrs[i]}" alt="" class="tag-qr" />` : ''}
            <span class="tag-sku">${esc(it.sku)}</span>
          </div>
        </div>
      </div>`;
    })
    .join('');
  document.body.appendChild(wrap);

  // Wait for the QR + logo images to finish decoding before opening the print
  // dialog — otherwise they render blank on the label.
  const imgs = [...wrap.querySelectorAll('img')];
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth
        ? Promise.resolve()
        : new Promise((res) => {
            img.onload = res;
            img.onerror = res;
          }),
    ),
  );

  const cleanup = () => {
    wrap.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

// ---- Entry -----------------------------------------------------------------
export async function renderStock(root, session, opts = {}) {
  root.innerHTML = `
  <div class="pm">
    <div class="stk-summary" id="stkSummary"></div>
    <div class="pm-top">
      <div>
        <h2 class="pm-title">Stock register</h2>
        <p class="pm-lede">Add or remove inventory. Every item gets an SKU + design number, a printable tag, and appears in Products automatically.</p>
      </div>
      <div class="stk-top-btns">
        <button class="dash-btn dash-btn--ghost" id="stkCatalogue" type="button">Create catalogue</button>
        <button class="dash-btn" id="stkAdd" type="button">+ New stock item</button>
      </div>
    </div>
    <div class="stk-search-row">
      <div class="stk-search">
        <svg class="stk-search-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a6 6 0 104.47 10.03l4.75 4.75 1.41-1.41-4.75-4.75A6 6 0 0010 4zm0 2a4 4 0 110 8 4 4 0 010-8z"/></svg>
        <input id="stkSearch" type="search" autocomplete="off" placeholder="Search by design number, SKU or name — or type / scan a barcode" />
        <button id="stkSearchClear" type="button" hidden aria-label="Clear search">✕</button>
      </div>
      <button id="stkScan" type="button" class="dash-btn dash-btn--ghost stk-scan-btn">
        <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path fill="currentColor" d="M2 4h4v2H4v2H2V4zm16 0h4v4h-2V6h-2V4zM2 16h2v2h2v2H2v-4zm18 0h2v4h-4v-2h2v-2zM6 7h1.5v10H6V7zm3 0h1v10H9V7zm2.5 0h2v10h-2V7zm3.5 0h1v10h-1V7zm2.5 0H18v10h-.5V7z"/></svg>
        Scan
      </button>
    </div>
    <div class="stk-filters" id="stkFilters"></div>
    <div class="stk-catbar" id="stkCatBar" hidden>
      <span class="stk-catbar-count" id="stkCatCount">0 selected</span>
      <div class="stk-catbar-btns">
        <button class="dash-btn dash-btn--ghost" id="stkCatAll" type="button">Select all shown</button>
        <button class="dash-btn dash-btn--ghost" id="stkCatNone" type="button">Clear</button>
        <button class="dash-btn" id="stkCatBuild" type="button">Build catalogue</button>
        <button class="dash-btn dash-btn--ghost" id="stkCatCancel" type="button">Cancel</button>
      </div>
    </div>
    <div id="stkListRegion" class="pm-region"><div class="cm-loading">Loading stock…</div></div>
  </div>`;

  const region = root.querySelector('#stkListRegion');
  const summary = root.querySelector('#stkSummary');
  const searchInput = root.querySelector('#stkSearch');
  const searchClear = root.querySelector('#stkSearchClear');
  const scanBtn = root.querySelector('#stkScan');
  const filterBar = root.querySelector('#stkFilters');
  const catBar = root.querySelector('#stkCatBar');

  let items = [];
  let sets = {};
  let query = '';
  let dir = {};
  const filters = { category: '', subcategory: '', supplier: '', collection: '', size: '', wmin: '', wmax: '' };
  // Catalogue selection state.
  let selectMode = false;
  const selected = new Set();
  let priceMap = {}; // stock item id -> formatted price (via linked product)

  const renderSummary = () => {
    summary.innerHTML = `
    <div class="stk-stat stk-stat--hero">
      <span class="stk-stat-lbl">Total gross weight</span>
      <span class="stk-stat-val">${esc(formatGrams(totalGrossWeight(items)))}</span>
    </div>
    <div class="stk-stat">
      <span class="stk-stat-lbl">Items</span>
      <span class="stk-stat-val">${items.length.toLocaleString('en-IN')}</span>
    </div>
    <div class="stk-stat">
      <span class="stk-stat-lbl">Pieces</span>
      <span class="stk-stat-val">${totalQuantity(items).toLocaleString('en-IN')}</span>
    </div>`;
  };

  const applyFilter = () => {
    const q = query.trim().toLowerCase();
    return items.filter((it) => {
      if (q && ![it.sku, it.design_no, it.title, it.category, it.subcategory, it.supplier, it.collection].some((v) => (v || '').toString().toLowerCase().includes(q))) return false;
      if (filters.category && it.category !== filters.category) return false;
      if (filters.subcategory && it.subcategory !== filters.subcategory) return false;
      if (filters.supplier && it.supplier !== filters.supplier) return false;
      if (filters.collection && it.collection !== filters.collection) return false;
      if (filters.size && !(it.size || '').toLowerCase().includes(filters.size.toLowerCase())) return false;
      const w = Number(it.gross_weight || 0);
      if (filters.wmin !== '' && w < Number(filters.wmin)) return false;
      if (filters.wmax !== '' && w > Number(filters.wmax)) return false;
      return true;
    });
  };

  const renderList = () => {
    region.innerHTML = listMarkup(applyFilter(), dir, { selectMode, selected });
    wireList();
  };

  const renderFilters = () => {
    const sel = (name, label, opts) =>
      `<label class="stk-filter"><span>${label}</span><select data-filter="${name}"><option value="">All</option>${(opts || [])
        .map((o) => `<option value="${esc(o)}" ${filters[name] === o ? 'selected' : ''}>${esc(o)}</option>`)
        .join('')}</select></label>`;
    filterBar.innerHTML = `
      ${sel('category', 'Category', sets.categories)}
      ${sel('subcategory', 'Subcategory', sets.subcategories)}
      ${sel('supplier', 'Supplier', sets.suppliers)}
      ${sel('collection', 'Collection', sets.collections)}
      <label class="stk-filter"><span>Size</span><input data-filter="size" value="${esc(filters.size)}" placeholder="Any" /></label>
      <label class="stk-filter"><span>Weight (g)</span><span class="stk-wrange"><input data-filter="wmin" type="number" step="0.001" placeholder="min" value="${esc(filters.wmin)}" /><input data-filter="wmax" type="number" step="0.001" placeholder="max" value="${esc(filters.wmax)}" /></span></label>
      <button type="button" class="dash-btn dash-btn--ghost stk-filter-clear" id="stkFilterClear">Clear filters</button>`;
    filterBar.querySelectorAll('[data-filter]').forEach((el) => {
      const evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        filters[el.dataset.filter] = el.value.trim();
        renderList();
      });
    });
    filterBar.querySelector('#stkFilterClear').addEventListener('click', () => {
      Object.keys(filters).forEach((k) => (filters[k] = ''));
      renderFilters();
      renderList();
    });
  };

  const reload = async () => {
    try {
      let products;
      let settings;
      let lists;
      [items, dir, products, settings, lists] = await Promise.all([
        fetchStockItems(),
        fetchUserDirectory(),
        fetchProducts().catch(() => []),
        fetchPricingSettings().catch(() => null),
        fetchStockLists().catch(() => ({})),
      ]);
      // Map each stock item to a display price via its linked product.
      const byId = {};
      (products || []).forEach((p) => {
        byId[p.id] = p;
      });
      priceMap = {};
      items.forEach((it) => {
        const p = it.product_id ? byId[it.product_id] : null;
        priceMap[it.id] = p ? priceLabel(p, settings) : '';
      });
      sets = buildSets(items, lists);
      renderSummary();
      renderFilters();
      renderList();
    } catch (err) {
      region.innerHTML = `<p class="empty">Could not load stock: ${esc(err.message)}</p>`;
    }
  };

  // Search + barcode scanning. A hardware scanner types the SKU and presses
  // Enter; on Enter we open the single/exact match directly.
  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    searchClear.hidden = !query;
    renderList();
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    query = '';
    searchClear.hidden = true;
    renderList();
    searchInput.focus();
  });
  const runSearchEnter = () => {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const exact = items.find((it) => [it.sku, it.design_no].some((v) => (v || '').toString().toLowerCase() === q));
    const filtered = applyFilter();
    const target = exact || (filtered.length === 1 ? filtered[0] : null);
    if (target) openEditor({ ...target, images: [...(target.images || [])] });
  };

  searchInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    runSearchEnter();
  });

  scanBtn.addEventListener('click', () => {
    openScanner((code) => {
      query = code;
      searchInput.value = code;
      searchClear.hidden = !code;
      renderList();
      runSearchEnter();
    });
  });

  const wireList = () => {
    const openFor = (id) => {
      const it = items.find((x) => x.id === id);
      if (it) openEditor({ ...it, images: [...(it.images || [])] });
    };
    // Catalogue selection mode — cards toggle selection instead of opening.
    if (selectMode) {
      region.querySelectorAll('.pm-card--select').forEach((card) => {
        const toggle = () => {
          const id = card.dataset.open;
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          card.classList.toggle('pm-card--picked', selected.has(id));
          card.querySelector('.pm-card-check').textContent = selected.has(id) ? '✓' : '';
          updateCatBar();
        };
        card.addEventListener('click', toggle);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        });
      });
      return; // no edit/sell/tag/delete wiring while selecting
    }
    region.querySelectorAll('.pm-card--click').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        openFor(card.dataset.open);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openFor(card.dataset.open);
        }
      });
    });
    region.querySelectorAll('[data-edit]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openFor(btn.dataset.edit);
      }),
    );
    region.querySelectorAll('[data-tag]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const it = items.find((x) => x.id === btn.dataset.tag);
        if (it) printTags([it]);
      }),
    );
    region.querySelectorAll('[data-sell]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const it = items.find((x) => x.id === btn.dataset.sell);
        if (!it) return;
        if (!it.product_id) {
          alert('This item has no linked product yet. Re-save it, then try again.');
          return;
        }
        openInvoiceModal({ kind: 'sale', prefill: [{ product_id: it.product_id }] });
      }),
    );
    region.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const it = items.find((x) => x.id === btn.dataset.del);
        if (!it) return;
        if (!confirm(`Remove “${it.title || it.sku}” from stock? This cannot be undone.`)) return;
        btn.disabled = true;
        try {
          await deleteStockItem(it.id);
          reload();
        } catch (err) {
          alert(`Remove failed: ${err.message}`);
          btn.disabled = false;
        }
      }),
    );
  };

  root.querySelector('#stkAdd').addEventListener('click', () => openEditor(blankItem()));

  // ---- Catalogue selection ----
  const updateCatBar = () => {
    root.querySelector('#stkCatCount').textContent = `${selected.size} selected`;
    root.querySelector('#stkCatBuild').disabled = selected.size === 0;
  };
  const setSelectMode = (on) => {
    selectMode = on;
    catBar.hidden = !on;
    const btn = root.querySelector('#stkCatalogue');
    btn.textContent = on ? 'Exit catalogue mode' : 'Create catalogue';
    btn.classList.toggle('is-active', on);
    if (!on) selected.clear();
    renderList();
    updateCatBar();
  };
  root.querySelector('#stkCatalogue').addEventListener('click', () => setSelectMode(!selectMode));
  root.querySelector('#stkCatCancel').addEventListener('click', () => setSelectMode(false));
  root.querySelector('#stkCatNone').addEventListener('click', () => {
    selected.clear();
    renderList();
    updateCatBar();
  });
  root.querySelector('#stkCatAll').addEventListener('click', () => {
    applyFilter().forEach((it) => selected.add(it.id));
    renderList();
    updateCatBar();
  });
  root.querySelector('#stkCatBuild').addEventListener('click', () => {
    const chosen = items.filter((it) => selected.has(it.id));
    if (!chosen.length) return;
    openCatalogue(chosen, { priceFor: (it) => priceMap[it.id] || '' });
  });

  const openEditor = (item) => openStockItemEditor(item, { sets, dir, onSaved: reload });

  reload();
}

// Standalone stock-item editor — usable from the Stock register and from the
// Business dashboard ("Stock in"). Shows the inventory ledger by default (for
// existing items) with a Details tab to edit the piece. `onSaved` is called
// after a successful insert/update.
export async function openStockItemEditor(item, { sets = null, dir = null, onSaved } = {}) {
  // When invoked standalone (no sets/dir passed), load suggestions + directory.
  if (!sets) {
    try {
      const [all, lists] = await Promise.all([fetchStockItems(), fetchStockLists()]);
      sets = buildSets(all, lists);
    } catch {
      sets = {};
    }
  }
  if (!dir) {
    dir = await fetchUserDirectory().catch(() => ({}));
  }

  const holder = document.createElement('div');
  holder.innerHTML = editorMarkup(item, sets);
  document.body.appendChild(holder);

  const form = holder.querySelector('#stkForm');
  const images = [...(item.images || [])];
  const imagesWrap = holder.querySelector('#stkImages');
  const imgStatus = holder.querySelector('#stkImgStatus');

  const close = () => holder.remove();
  holder.querySelector('#stkClose').addEventListener('click', close);
  holder.querySelector('#stkCancel').addEventListener('click', close);
  holder.querySelector('#stkBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'stkBackdrop') close();
  });

  // Inventory / Details tab switching (existing items only).
  const panes = [...holder.querySelectorAll('.stk-pane')];
  holder.querySelectorAll('.stk-tab').forEach((tab) =>
    tab.addEventListener('click', () => {
      holder.querySelectorAll('.stk-tab').forEach((t) => t.classList.toggle('is-active', t === tab));
      panes.forEach((p) => p.classList.toggle('is-hidden', p.dataset.pane !== tab.dataset.pane));
    }),
  );

  wireCombos(form, { onAddNew: openAddListModal });

  const renderImages = () => {
    imagesWrap.innerHTML = images.length
      ? images
          .map(
            (url, i) => `
      <div class="pm-img" data-i="${i}">
        <img src="${esc(url)}" alt="" />
        ${i === 0 ? '<span class="pm-img-main">Main</span>' : `<button type="button" class="pm-img-promote" data-promote="${i}">Make main</button>`}
        <button type="button" class="pm-img-del" data-rm="${i}" aria-label="Remove photo">✕</button>
      </div>`,
          )
          .join('')
      : '<p class="pm-hint">No photos yet.</p>';
    imagesWrap.querySelectorAll('[data-rm]').forEach((b) =>
      b.addEventListener('click', () => {
        images.splice(Number(b.dataset.rm), 1);
        renderImages();
      }),
    );
    imagesWrap.querySelectorAll('[data-promote]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.dataset.promote);
        const [moved] = images.splice(i, 1);
        images.unshift(moved);
        renderImages();
      }),
    );
  };
  renderImages();

  const handleImagePick = async (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    imgStatus.textContent = `Uploading ${files.length} photo(s)…`;
    try {
      for (const file of files) {
        const url = await uploadStockMedia(file);
        images.push(url);
        renderImages();
      }
      imgStatus.textContent = 'Uploaded ✓';
    } catch (err) {
      imgStatus.textContent = `Upload failed: ${err.message}`;
    }
    e.target.value = '';
  };
  holder.querySelector('#stkImgFile').addEventListener('change', handleImagePick);
  holder.querySelector('#stkImgCam')?.addEventListener('change', handleImagePick);

  const videoUrl = holder.querySelector('#stkVideoUrl');
  const videoStatus = holder.querySelector('#stkVideoStatus');
  const handleVideoPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    videoStatus.textContent = 'Uploading video…';
    try {
      videoUrl.value = await uploadStockMedia(file);
      videoStatus.textContent = 'Uploaded ✓';
    } catch (err) {
      videoStatus.textContent = `Upload failed: ${err.message}`;
    }
    e.target.value = '';
  };
  holder.querySelector('#stkVideoFile').addEventListener('change', handleVideoPick);
  holder.querySelector('#stkVideoCam')?.addEventListener('change', handleVideoPick);

  // ---- Inventory movements panel (existing items only) ----
  const invHolder = holder.querySelector('#stkInv');
  if (item.id && invHolder) {
    mountInventoryPanel(invHolder, {
      stockItemId: item.id,
      productId: item.product_id,
      itemLabel: `${item.title || item.sku} (${item.sku})`,
      dir,
      onSell: () => {
        close();
        openInvoiceModal({ kind: 'sale', prefill: [{ product_id: item.product_id }], onSaved });
      },
      onChange: () => onSaved && onSaved(),
    });
  }

  wireInfo(holder);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submit = holder.querySelector('#stkSubmit');
    const msg = holder.querySelector('#stkMsg');
    const fd = new FormData(e.target);
    const num = (v) => (v === '' || v == null ? null : Number(v));

    const payload = {
      title: (fd.get('title') || '').trim() || null,
      category: (fd.get('category') || '').trim(),
      subcategory: (fd.get('subcategory') || '').trim() || null,
      supplier: (fd.get('supplier') || '').trim() || null,
      collection: (fd.get('collection') || '').trim() || null,
      gross_weight: num(fd.get('gross_weight')),
      size: (fd.get('size') || '').trim() || null,
      design_no: (fd.get('design_no') || '').trim() || null,
      notes: (fd.get('notes') || '').trim() || null,
      images,
      video_url: (fd.get('video_url') || '').trim() || null,
    };
    // Quantity is only set on creation (the opening balance). For existing items
    // it is managed exclusively through movements (restock / sale / return) so
    // the ledger and on-hand stay in sync.
    if (!item.id) payload.quantity = Math.max(1, Math.round(num(fd.get('quantity')) ?? 1));

    if (!payload.category) {
      msg.textContent = 'Category is required.';
      msg.className = 'pm-save-msg is-error';
      return;
    }

    submit.disabled = true;
    msg.textContent = 'Saving…';
    msg.className = 'pm-save-msg';
    try {
      let saved;
      if (item.id) {
        await updateStockItem(item.id, payload);
      } else {
        saved = await insertStockItem(payload);
      }
      close();
      if (onSaved) await onSaved();
      // Offer to print the tag right after adding a new item.
      if (saved && confirm(`Added ${saved.sku} — it's now live in Products too. Print its tag now?`)) printTags([saved]);
    } catch (err) {
      console.error('[KPS] stock save failed:', err);
      msg.textContent = `Save failed: ${err.message}`;
      msg.className = 'pm-save-msg is-error';
      submit.disabled = false;
    }
  });
}
