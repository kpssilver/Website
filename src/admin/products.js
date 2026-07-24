// =============================================================================
// PRODUCT MANAGER (admin)
// Full CRUD for the storefront catalogue plus a master silver-pricing control.
// Each listing carries title, subtitle, category, description, multiple images,
// a video, weight, purity, dimensions, SKU, stock and featured flags.
//
// Pricing: a master silver rate per purity (925 / 999) + GST% is set once at the
// top. Each product either auto-calculates from that rate (weight × rate +
// weightage% + making charges and/or labour + GST), uses a fixed price, or is
// "price on request". A live breakdown preview shows the maths while editing.
// Media uploads go to the public `product-media` bucket.
// =============================================================================
import { supabase } from '../config/supabase.js';
import { fetchProducts, PRODUCT_CATEGORIES, formatWeight, firstImage } from '../data/products.js';
import { fetchUserDirectory, actorLabel } from '../data/business.js';
import { fetchStockItemByProduct } from '../data/stock.js';
import { openInvoiceModal } from './invoices.js';
import { mountInventoryPanel } from './inventoryPanel.js';
import { comboField, wireCombos } from './combo.js';
import {
  fetchPricingSettings,
  computePrice,
  priceLabel,
  formatMoney,
  PRICING_MODES,
  CHARGE_MODES,
  DEFAULT_PRICING,
} from '../data/pricing.js';

const MEDIA_BUCKET = 'product-media';
const PURITY_OPTIONS = ['Handcrafted', 'Hallmarked', 'Antique finish', 'Oxidised finish'];

// Coarse mobile / touch detection — surfaces a live-camera capture button
// beside the gallery picker on phones and tablets.
const IS_MOBILE =
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints || 0) > 1);

let pricingSettings = { ...DEFAULT_PRICING };
let userDir = {};

// Edit / delete tool icons (top-right of each card).
const EDIT_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
const DEL_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M6 7h12l-1 14H7L6 7zm3-3h6l1 2H8l1-2zM4 6h16v1H4V6z"/></svg>';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Small "i" help button. Clicking it reveals an explanation popover (wired by
// wireInfo). Placed right after a field label's text.
function ic(text) {
  return `<button type="button" class="pm-info" data-info="${esc(text)}" aria-label="What is this field?">i</button>`;
}

// Toggle info popovers within a scope. One open at a time; click elsewhere closes.
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

async function uploadMedia(file) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

// ---- Master pricing control -------------------------------------------------
// Silver rates are pulled live from metals.dev (MCX) on a schedule and are
// read-only here. Only GST is editable; a manual "Refresh from market" button
// triggers an out-of-schedule fetch (still bounded by the 3/day, 90/month cap).
function fmtWhen(iso) {
  if (!iso) return 'not yet';
  const d = new Date(iso);
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return d.toLocaleString('en-IN');
}

function masterMarkup(s) {
  const sourceLabel =
    s.silver_source === 'aib'
      ? 'Live · All India Bullion (Bangalore)'
      : s.silver_source === 'api'
        ? 'Live · metals.dev (MCX, fallback)'
        : 'Awaiting first live fetch';
  const isLive = s.silver_source === 'aib' || s.silver_source === 'api';
  return `
  <div class="pm-master">
    <div class="pm-master-head">
      <div>
        <h3>Master silver pricing <span class="pm-live-tag ${isLive ? '' : 'is-off'}">${sourceLabel}</span></h3>
        <p class="pm-hint">The silver price updates automatically from the live Bangalore rate (All India Bullion, 999 with GST), every 5 minutes. Every auto-calculated product uses this × weight (100%) as its base, then GST is added on top — you only set GST.</p>
      </div>
      <span class="pm-save-msg" id="pmMasterMsg"></span>
    </div>

    <div class="pm-rate-tiles">
      <div class="pm-rate-tile">
        <span class="pm-rate-lbl">Silver price (per gram) ${ic('The live Bangalore 999-with-GST silver rate from All India Bullion, used purely as the silver price base. Every auto-calculated product uses this × weight (100%), regardless of the item’s stated purity, and GST is then added on top.')}</span>
        <span class="pm-rate-val">₹${Number(s.silver_rate_999 || 0).toLocaleString('en-IN')}<small>/g</small></span>
      </div>
      <div class="pm-rate-tile pm-rate-meta">
        <span class="pm-rate-lbl">Last updated</span>
        <span class="pm-rate-when">${fmtWhen(s.silver_rate_updated_at)}</span>
        ${s.silver_market_timestamp ? `<span class="pm-rate-note">Market time: ${new Date(s.silver_market_timestamp).toLocaleString('en-IN')}</span>` : ''}
      </div>
    </div>

    <div class="pm-master-controls">
      <form class="pm-gst-form" id="pmMasterForm">
        <label class="pm-lbl">GST (%) ${ic('Goods & Services Tax added on top of silver value + weightage + charges. Silver articles are 3% in India.')}
          <input name="gst_percent" type="number" step="0.01" min="0" value="${s.gst_percent ?? 3}" />
        </label>
        <button type="submit" class="dash-btn dash-btn--ghost" id="pmMasterSave">Save GST</button>
      </form>
      <div class="pm-refresh">
        <button type="button" class="dash-btn" id="pmRefreshRate">Refresh now</button>
        <p class="pm-hint">Auto-updates every 5 minutes from All India Bullion (Bangalore).</p>
      </div>
    </div>
  </div>`;
}

// ---- List view --------------------------------------------------------------
function listMarkup(products) {
  if (!products.length) {
    return `
    <div class="pm-empty">
      <p>No products yet.</p>
      <p class="pm-empty-sub">Create your first listing — it will appear on the Shop page instantly.</p>
    </div>`;
  }

  const rows = products
    .map((p) => {
      const img = firstImage(p);
      const thumb = img
        ? `<img src="${esc(img)}" alt="" class="pm-thumb" />`
        : `<div class="pm-thumb pm-thumb--empty">No image</div>`;
      const stock = p.in_stock ? '<span class="pm-badge pm-badge--in">In stock</span>' : '<span class="pm-badge pm-badge--out">Sold out</span>';
      const feat = p.featured ? '<span class="pm-badge pm-badge--feat">Featured</span>' : '';
      const who = p.updated_by || p.created_by;
      return `
      <article class="pm-card pm-card--click" data-open="${p.id}" tabindex="0" role="button" aria-label="Edit ${esc(p.title)}">
        <div class="pm-card-tools">
          <button class="pm-tool" data-edit="${p.id}" type="button" title="Edit" aria-label="Edit">${EDIT_ICON}</button>
          <button class="pm-tool pm-tool--danger" data-del="${p.id}" type="button" title="Delete" aria-label="Delete">${DEL_ICON}</button>
        </div>
        ${thumb}
        <div class="pm-card-body">
          <div class="pm-card-head">
            <h3>${esc(p.title)}</h3>
            <div class="pm-badges">${stock}${feat}</div>
          </div>
          ${p.subtitle ? `<p class="pm-card-sub">${esc(p.subtitle)}</p>` : ''}
          <div class="pm-card-meta">
            ${p.category ? `<span>${esc(p.category)}</span>` : ''}
            <span>${esc(priceLabel(p, pricingSettings))}</span>
            ${p.weight_grams ? `<span>${esc(formatWeight(p))}</span>` : ''}
            <span>${(p.images || []).length} image(s)</span>
            ${who ? `<span>Updated by ${esc(actorLabel(userDir, who))}</span>` : ''}
          </div>
          <div class="pm-card-actions">
            <button class="dash-btn" data-sell="${p.id}" type="button">Sell item</button>
          </div>
        </div>
      </article>`;
    })
    .join('');

  return `<div class="pm-list">${rows}</div>`;
}

// ---- Editor form ------------------------------------------------------------
function options(list, selected) {
  return list.map((o) => `<option value="${o.value}" ${selected === o.value ? 'selected' : ''}>${o.label}</option>`).join('');
}

function editorMarkup(p) {
  const isNew = !p.id;
  const purityOptions = PURITY_OPTIONS.map((c) => `<option value="${esc(c)}"></option>`).join('');

  return `
  <div class="pm-modal-backdrop" id="pmBackdrop">
    <div class="pm-modal" role="dialog" aria-modal="true" aria-label="${isNew ? 'New product' : 'Edit product'}">
      <div class="pm-modal-head">
        <h2>${isNew ? 'New product' : 'Edit product'}</h2>
        <button class="pm-x" id="pmClose" type="button" aria-label="Close">✕</button>
      </div>
      <form class="pm-form" id="pmForm">
        <div class="pm-form-grid">
          <label class="pm-lbl pm-col-2">Title * ${ic('The product name customers see on the card and detail page, e.g. "Peacock Deepam".')}
            <input name="title" type="text" required value="${esc(p.title)}" />
          </label>
          <label class="pm-lbl pm-col-2">Subtitle ${ic('A short one-line tagline shown under the title. Optional but helps sell the piece.')}
            <input name="subtitle" type="text" value="${esc(p.subtitle)}" placeholder="e.g. Handcrafted 999 fine silver kuthuvilakku" />
          </label>

          ${comboField({ name: 'category', label: 'Category', value: p.category || '', options: PRODUCT_CATEGORIES, extra: ic('Groups the product under a shop filter and links it from the matching Collections card on the home page. Pick an existing one or add a new category.') })}
          <label class="pm-lbl">Silver purity ${ic('The silver grade shown to customers — 925 sterling or 999 fine. This is descriptive only; pricing always uses the live per-gram silver price × weight (100%).')}
            <select name="metal_purity">
              <option value="925" ${p.metal_purity !== '999' ? 'selected' : ''}>925 Sterling Silver</option>
              <option value="999" ${p.metal_purity === '999' ? 'selected' : ''}>999 Fine Silver</option>
            </select>
          </label>

          <label class="pm-lbl">Material / finish (optional) ${ic('Extra descriptive note shown in specs (e.g. "Hallmarked, antique finish"). Display only — does not affect price.')}
            <input name="purity" type="text" list="pmPurity" value="${esc(p.purity)}" placeholder="e.g. Hallmarked, antique finish" />
            <datalist id="pmPurity">${purityOptions}</datalist>
          </label>

          <label class="pm-lbl">Weight (grams) ${ic('Net silver weight of the piece in grams. This is multiplied by the silver rate to calculate the price.')}
            <input name="weight_grams" type="number" step="0.01" min="0" value="${p.weight_grams ?? ''}" />
          </label>
          <label class="pm-lbl">Dimensions ${ic('Physical size shown in the specs, e.g. "H 9in × W 4in". Display only.')}
            <input name="dimensions" type="text" value="${esc(p.dimensions)}" placeholder="e.g. H 9in × W 4in" />
          </label>

          <label class="pm-lbl">SKU / code ${ic('Your internal item code for stock tracking. This is NOT shown to customers.')}
            <input name="sku" type="text" value="${esc(p.sku)}" />
          </label>
          <label class="pm-lbl">Display order ${ic('Controls sort position in the shop — lower numbers appear first. Ties fall back to newest.')}
            <input name="sort_order" type="number" step="1" value="${p.sort_order ?? 0}" />
          </label>

          <label class="pm-lbl pm-col-2">Description ${ic('Full description shown on the product detail page. Line breaks are preserved.')}
            <textarea name="description" rows="4" placeholder="Tell the story of the piece — craft, occasion, care.">${esc(p.description)}</textarea>
          </label>
        </div>

        <fieldset class="pm-pricing">
          <legend>Pricing</legend>
          <p class="pm-formula pm-when-calc">Total = (Weight × Silver price/g, at 100%) + Weightage% + Charges, then + GST%</p>
          <div class="pm-form-grid">
            <label class="pm-lbl">Pricing model ${ic('Auto-calculate = price is built from the live silver price + weightage + charges below. Fixed = you type one final price. On request = no price shown, customer must enquire.')}
              <select name="pricing_mode" id="pmMode">${options(PRICING_MODES, p.pricing_mode || 'calculated')}</select>
            </label>

            <label class="pm-lbl pm-when-fixed" id="pmFixedWrap">Fixed price (₹) ${ic('The exact final price shown to customers. Used only when Pricing model is "Fixed price".')}
              <input name="price" type="number" step="0.01" min="0" value="${p.price ?? ''}" />
            </label>

            <label class="pm-lbl pm-when-calc">Weightage / wastage (%) ${ic('Percentage added on top of the silver value to cover making/wastage during crafting. Prefilled at 12%.')}
              <input name="weightage_percent" type="number" step="0.01" min="0" value="${p.weightage_percent ?? 12}" />
              <span class="pm-field-note">Prefilled at 12% (a typical making charge). Please check and adjust if needed.</span>
            </label>
            <label class="pm-lbl pm-when-calc">Charges ${ic('Optional extra charges on top of silver + weightage: making charges, labour, both, or none. Only the selected inputs are used.')}
              <select name="charge_mode" id="pmChargeMode">${options(CHARGE_MODES, p.charge_mode || 'none')}</select>
            </label>

            <div class="pm-lbl pm-when-calc pm-charge-making">Making charge ${ic('The crafting charge. "% of silver value" = percent of (silver + weightage); "₹ per gram" = amount × weight; "Flat ₹" = fixed amount.')}
              <div class="pm-inline">
                <select name="making_charge_type">
                  <option value="percent" ${(p.making_charge_type || 'percent') === 'percent' ? 'selected' : ''}>% of silver value</option>
                  <option value="per_gram" ${p.making_charge_type === 'per_gram' ? 'selected' : ''}>₹ per gram</option>
                  <option value="flat" ${p.making_charge_type === 'flat' ? 'selected' : ''}>Flat ₹</option>
                </select>
                <input name="making_charge_value" type="number" step="0.01" min="0" value="${p.making_charge_value ?? 0}" />
              </div>
            </div>

            <div class="pm-lbl pm-when-calc pm-charge-labour">Labour ${ic('A labour cost added separately from making charges. "₹ per gram" = amount × weight; "Flat ₹" = fixed amount.')}
              <div class="pm-inline">
                <select name="labour_type">
                  <option value="per_gram" ${(p.labour_type || 'per_gram') === 'per_gram' ? 'selected' : ''}>₹ per gram</option>
                  <option value="flat" ${p.labour_type === 'flat' ? 'selected' : ''}>Flat ₹</option>
                </select>
                <input name="labour_value" type="number" step="0.01" min="0" value="${p.labour_value ?? 0}" />
              </div>
            </div>
          </div>

          <div class="pm-breakdown pm-when-calc" id="pmBreakdown"></div>
        </fieldset>

        <div class="pm-media">
          <div class="pm-media-head">
            <h3>Images</h3>
            <div class="pm-media-btns">
              <label class="cm-upload-btn"><input type="file" accept="image/*" multiple id="pmImgFile" hidden /> ${IS_MOBILE ? 'Gallery' : 'Add images'}</label>
              ${IS_MOBILE ? '<label class="cm-upload-btn cm-upload-btn--cam"><input type="file" accept="image/*" capture="environment" id="pmImgCam" hidden /> 📷 Take photo</label>' : ''}
            </div>
          </div>
          <p class="pm-hint">The first image is the main photo. Use “Make main” to promote any image.${IS_MOBILE ? ' “Take photo” opens your camera.' : ' You can also paste an image (Ctrl/⌘+V).'}</p>
          <div class="pm-images" id="pmImages"></div>
          <span class="pm-upload-status" id="pmImgStatus"></span>
        </div>

        <div class="pm-media">
          <div class="pm-media-head">
            <h3>Video</h3>
            <div class="pm-media-btns">
              <label class="cm-upload-btn"><input type="file" accept="video/*" id="pmVideoFile" hidden /> ${IS_MOBILE ? 'Gallery' : 'Upload video'}</label>
              ${IS_MOBILE ? '<label class="cm-upload-btn cm-upload-btn--cam"><input type="file" accept="video/*" capture="environment" id="pmVideoCam" hidden /> 🎥 Record</label>' : ''}
            </div>
          </div>
          <input name="video_url" type="text" id="pmVideoUrl" value="${esc(p.video_url)}" placeholder="Paste a video URL (YouTube/MP4) or upload a file" />
          <span class="pm-upload-status" id="pmVideoStatus"></span>
        </div>

        ${p.id ? '<div id="pmInv"></div>' : ''}

        <div class="pm-flags">
          <label class="pm-check"><input type="checkbox" name="in_stock" ${p.in_stock ? 'checked' : ''} /> In stock ${ic('Untick to mark the piece as sold out. It stays visible in the shop with a "Sold out" badge.')}</label>
          <label class="pm-check"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''} /> Featured ${ic('Flags the product as featured for future highlighting.')}</label>
        </div>

        <div class="pm-breakdown pm-breakdown--final" id="pmBreakdownBottom"></div>

        <div class="pm-form-actions">
          <span class="pm-save-msg" id="pmMsg"></span>
          <button type="button" class="dash-btn dash-btn--ghost" id="pmCancel">Cancel</button>
          <button type="submit" class="dash-btn" id="pmSubmit">${isNew ? 'Create product' : 'Save changes'}</button>
        </div>
      </form>
    </div>
  </div>`;
}

const blankProduct = () => ({
  title: '',
  subtitle: '',
  category: '',
  description: '',
  pricing_mode: 'calculated',
  price: null,
  metal_purity: '925',
  weightage_percent: 12,
  charge_mode: 'none',
  making_charge_type: 'percent',
  making_charge_value: 0,
  labour_type: 'per_gram',
  labour_value: 0,
  weight_grams: null,
  purity: '',
  dimensions: '',
  sku: '',
  images: [],
  video_url: '',
  in_stock: true,
  featured: false,
  sort_order: 0,
});

export async function renderProducts(root, session, opts = {}) {
  // Staff manage the catalogue but not the master silver pricing / GST — that
  // panel is admin-only. Everything else (product CRUD) is shared.
  const isAdmin = opts.isAdmin !== false;
  root.innerHTML = `
  <div class="pm">
    <div id="pmMasterRegion"></div>
    <div class="pm-top">
      <div>
        <h2 class="pm-title">Products</h2>
        <p class="pm-lede">Add, edit and remove listings shown on the Shop page.</p>
      </div>
      <button class="dash-btn" id="pmAdd" type="button">+ New product</button>
    </div>
    <div id="pmListRegion" class="pm-region"><div class="cm-loading">Loading products…</div></div>
  </div>`;

  const region = root.querySelector('#pmListRegion');
  const masterRegion = root.querySelector('#pmMasterRegion');

  // ---- Master pricing panel -------------------------------------------------
  const setMasterMsg = (text, cls = 'pm-save-msg') => {
    const el = masterRegion.querySelector('#pmMasterMsg');
    if (el) {
      el.textContent = text;
      el.className = cls;
    }
  };

  const renderMaster = () => {
    if (!isAdmin) {
      masterRegion.innerHTML = '';
      return;
    }
    masterRegion.innerHTML = masterMarkup(pricingSettings);
    wireInfo(masterRegion);
    const form = masterRegion.querySelector('#pmMasterForm');

    // GST is the only editable master value; the silver rate comes from AIB.
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const patch = { gst_percent: Number(fd.get('gst_percent') || 0) };
      const btn = form.querySelector('#pmMasterSave');
      btn.disabled = true;
      setMasterMsg('Saving…');
      const { error } = await supabase.from('pricing_settings').update(patch).eq('id', 1);
      btn.disabled = false;
      if (error) {
        setMasterMsg(`Save failed: ${error.message}`, 'pm-save-msg is-error');
        return;
      }
      pricingSettings = { ...pricingSettings, ...patch };
      setMasterMsg('Saved ✓ — prices updated.', 'pm-save-msg is-ok');
      reload();
    });

    // Manual "Refresh now" — fetches the AIB rate immediately (in addition to
    // the automatic 60-second poll).
    masterRegion.querySelector('#pmRefreshRate').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      setMasterMsg('Fetching live rate…');
      let outcome = { text: '', cls: 'pm-save-msg' };
      try {
        const { data, error } = await supabase.rpc('admin_refresh_silver_price');
        if (error) throw error;
        if (data?.status === 'success') {
          outcome = { text: `Updated ✓ — ₹${Number(data.silver_per_gram).toLocaleString('en-IN')}/g`, cls: 'pm-save-msg is-ok' };
        } else {
          outcome = { text: `Could not refresh (${data?.reason || 'error'}). Last saved rate kept.`, cls: 'pm-save-msg is-error' };
        }
        pricingSettings = await fetchPricingSettings();
      } catch (err) {
        outcome = { text: `Refresh failed: ${err.message}`, cls: 'pm-save-msg is-error' };
      }
      renderMaster();
      setMasterMsg(outcome.text, outcome.cls);
      reload();
    });
  };

  const reload = async () => {
    try {
      const products = await fetchProducts();
      region.innerHTML = listMarkup(products);
      wireList(products);
    } catch (err) {
      region.innerHTML = `<p class="empty">Could not load products: ${esc(err.message)}</p>`;
    }
  };

  const wireList = (products) => {
    const openFor = (id) => {
      const product = products.find((x) => x.id === id);
      if (product) openEditor({ ...product, images: [...(product.images || [])] });
    };
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
    region.querySelectorAll('[data-sell]').forEach((btn) =>
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openInvoiceModal({ kind: 'sale', prefill: [{ product_id: btn.dataset.sell }] });
      }),
    );
    region.querySelectorAll('[data-del]').forEach((btn) =>
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const product = products.find((x) => x.id === btn.dataset.del);
        if (!product) return;
        if (!confirm(`Delete “${product.title}”? This cannot be undone.`)) return;
        btn.disabled = true;
        const { error } = await supabase.from('products').delete().eq('id', product.id);
        if (error) {
          alert(`Delete failed: ${error.message}`);
          btn.disabled = false;
          return;
        }
        reload();
      }),
    );
  };

  root.querySelector('#pmAdd').addEventListener('click', () => openEditor(blankProduct()));

  // ---- Editor modal ---------------------------------------------------------
  function openEditor(product) {
    const holder = document.createElement('div');
    holder.innerHTML = editorMarkup(product);
    document.body.appendChild(holder);

    const form = holder.querySelector('#pmForm');
    const images = [...(product.images || [])];
    const imagesWrap = holder.querySelector('#pmImages');
    const imgStatus = holder.querySelector('#pmImgStatus');
    const modeSel = holder.querySelector('#pmMode');
    const chargeSel = holder.querySelector('#pmChargeMode');
    const breakdown = holder.querySelector('#pmBreakdown');

    const close = () => holder.remove();
    holder.querySelector('#pmClose').addEventListener('click', close);
    holder.querySelector('#pmCancel').addEventListener('click', close);
    holder.querySelector('#pmBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'pmBackdrop') close();
    });

    const renderImages = () => {
      imagesWrap.innerHTML = images.length
        ? images
            .map(
              (url, i) => `
        <div class="pm-img" data-i="${i}">
          <img src="${esc(url)}" alt="" />
          ${i === 0 ? '<span class="pm-img-main">Main</span>' : `<button type="button" class="pm-img-promote" data-promote="${i}">Make main</button>`}
          <button type="button" class="pm-img-del" data-rm="${i}" aria-label="Remove image">✕</button>
        </div>`,
            )
            .join('')
        : '<p class="pm-hint">No images yet.</p>';
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

    const addImageFiles = async (fileList) => {
      const files = [...fileList].filter((f) => (f.type || '').startsWith('image/'));
      if (!files.length) return;
      imgStatus.textContent = `Uploading ${files.length} image(s)…`;
      try {
        for (const file of files) {
          const url = await uploadMedia(file);
          images.push(url);
          renderImages();
        }
        imgStatus.textContent = 'Uploaded ✓';
      } catch (err) {
        imgStatus.textContent = `Upload failed: ${err.message}`;
      }
    };
    const handleImagePick = (e) => {
      addImageFiles(e.target.files);
      e.target.value = '';
    };
    holder.querySelector('#pmImgFile').addEventListener('change', handleImagePick);
    holder.querySelector('#pmImgCam')?.addEventListener('change', handleImagePick);

    // Paste an image straight from the clipboard (e.g. a screenshot or a copied
    // photo) anywhere in the editor.
    holder.addEventListener('paste', (e) => {
      const imgs = [...(e.clipboardData?.items || [])]
        .filter((it) => (it.type || '').startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter(Boolean);
      if (imgs.length) {
        e.preventDefault();
        addImageFiles(imgs);
      }
    });

    const videoUrl = holder.querySelector('#pmVideoUrl');
    const videoStatus = holder.querySelector('#pmVideoStatus');
    const handleVideoPick = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      videoStatus.textContent = 'Uploading video…';
      try {
        videoUrl.value = await uploadMedia(file);
        videoStatus.textContent = 'Uploaded ✓';
      } catch (err) {
        videoStatus.textContent = `Upload failed: ${err.message}`;
      }
      e.target.value = '';
    };
    holder.querySelector('#pmVideoFile').addEventListener('change', handleVideoPick);
    holder.querySelector('#pmVideoCam')?.addEventListener('change', handleVideoPick);

    // ---- Inventory movements panel (existing products linked to stock) ----
    const invHolder = holder.querySelector('#pmInv');
    if (product.id && invHolder) {
      fetchStockItemByProduct(product.id)
        .then((stock) => {
          if (!stock) {
            invHolder.innerHTML =
              '<div class="stk-inv"><div class="pm-media-head"><h3>Inventory &amp; movements</h3></div><p class="pm-hint">This product isn’t linked to a stock item, so there’s no movement ledger. Add it from the Stock register to track opening, restock, sales and returns.</p></div>';
            return;
          }
          mountInventoryPanel(invHolder, {
            stockItemId: stock.id,
            productId: product.id,
            itemLabel: `${product.title} (${stock.sku})`,
            dir: userDir,
            onSell: () => {
              close();
              openInvoiceModal({ kind: 'sale', prefill: [{ product_id: product.id }] });
            },
            onChange: () => reload(),
          });
        })
        .catch(() => {});
    }

    // Reads current form values into a product-shaped object for live preview.
    const readForm = () => {
      const fd = new FormData(form);
      const num = (v) => (v === '' || v == null ? 0 : Number(v));
      return {
        pricing_mode: fd.get('pricing_mode'),
        price: fd.get('price') === '' ? null : Number(fd.get('price')),
        metal_purity: fd.get('metal_purity'),
        weight_grams: num(fd.get('weight_grams')),
        weightage_percent: num(fd.get('weightage_percent')),
        charge_mode: fd.get('charge_mode'),
        making_charge_type: fd.get('making_charge_type'),
        making_charge_value: num(fd.get('making_charge_value')),
        labour_type: fd.get('labour_type'),
        labour_value: num(fd.get('labour_value')),
      };
    };

    const breakdownBottom = holder.querySelector('#pmBreakdownBottom');
    const linesHtml = (r) =>
      r.lines
        .map((l) => `<div class="pm-brk-row"><span>${esc(l.label)}</span><span>${esc(formatMoney(l.amount))}</span></div>`)
        .join('');

    // The bottom cross-check summary covers every pricing model.
    const bottomHtml = (r) => {
      const title = '<div class="pm-brk-title">Cross-check — price the customer sees</div>';
      if (r.mode === 'on_request')
        return `${title}<div class="pm-brk-row pm-brk-total"><span>Shown to customer</span><span>Price on request</span></div>`;
      if (r.mode === 'unset')
        return `${title}<p class="pm-hint">Enter a weight and set the master silver rate to preview the price.</p>`;
      if (r.mode === 'fixed')
        return `${title}<div class="pm-brk-row pm-brk-total"><span>Fixed price</span><span>${esc(formatMoney(r.total))}</span></div>`;
      return `${title}${linesHtml(r)}<div class="pm-brk-row pm-brk-total"><span>Total (incl. GST)</span><span>${esc(formatMoney(r.total))}</span></div>`;
    };

    // Show/hide fields per pricing model + charge mode, and refresh both previews.
    const refresh = () => {
      const mode = modeSel.value;
      form.classList.toggle('is-calc', mode === 'calculated');
      form.classList.toggle('is-fixed', mode === 'fixed');
      form.classList.toggle('is-request', mode === 'on_request');

      const cm = chargeSel.value;
      const makingEl = form.querySelector('.pm-charge-making');
      const labourEl = form.querySelector('.pm-charge-labour');
      if (makingEl) makingEl.style.display = cm === 'making' || cm === 'both' ? '' : 'none';
      if (labourEl) labourEl.style.display = cm === 'labour' || cm === 'both' ? '' : 'none';

      const r = computePrice(readForm(), pricingSettings);

      // Live breakdown next to the price fields (calculated mode only).
      if (mode !== 'calculated') {
        breakdown.innerHTML = '';
      } else if (r.mode === 'unset') {
        breakdown.innerHTML = `<p class="pm-hint">Enter a weight and set the master silver rate to see the price.</p>`;
      } else {
        breakdown.innerHTML = `
          <div class="pm-brk-title">Live price breakdown</div>
          ${linesHtml(r)}
          <div class="pm-brk-row pm-brk-total"><span>Total (incl. GST)</span><span>${esc(formatMoney(r.total))}</span></div>`;
      }

      // Final cross-check summary at the bottom of the form (all modes).
      breakdownBottom.innerHTML = bottomHtml(r);
    };

    wireInfo(holder);
    wireCombos(form);
    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);
    refresh();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submit = holder.querySelector('#pmSubmit');
      const msg = holder.querySelector('#pmMsg');
      const fd = new FormData(e.target);

      const mode = fd.get('pricing_mode');
      const num = (v) => (v === '' || v == null ? null : Number(v));
      const payload = {
        title: (fd.get('title') || '').trim(),
        subtitle: (fd.get('subtitle') || '').trim() || null,
        category: (fd.get('category') || '').trim() || null,
        description: (fd.get('description') || '').trim() || null,
        pricing_mode: mode,
        price: mode === 'fixed' ? num(fd.get('price')) : null,
        metal_purity: fd.get('metal_purity') || '925',
        weightage_percent: num(fd.get('weightage_percent')) ?? 0,
        charge_mode: fd.get('charge_mode') || 'making',
        making_charge_type: fd.get('making_charge_type') || 'percent',
        making_charge_value: num(fd.get('making_charge_value')) ?? 0,
        labour_type: fd.get('labour_type') || 'per_gram',
        labour_value: num(fd.get('labour_value')) ?? 0,
        weight_grams: num(fd.get('weight_grams')),
        purity: (fd.get('purity') || '').trim() || null,
        dimensions: (fd.get('dimensions') || '').trim() || null,
        sku: (fd.get('sku') || '').trim() || null,
        images,
        video_url: (fd.get('video_url') || '').trim() || null,
        in_stock: fd.get('in_stock') === 'on',
        featured: fd.get('featured') === 'on',
        sort_order: num(fd.get('sort_order')) ?? 0,
      };

      if (!payload.title) {
        msg.textContent = 'Title is required.';
        msg.className = 'pm-save-msg is-error';
        return;
      }
      if (mode === 'calculated' && !(payload.weight_grams > 0)) {
        msg.textContent = 'Auto-calculated pricing needs a weight in grams.';
        msg.className = 'pm-save-msg is-error';
        return;
      }

      submit.disabled = true;
      msg.textContent = 'Saving…';
      msg.className = 'pm-save-msg';
      try {
        if (product.id) {
          const { error } = await supabase.from('products').update(payload).eq('id', product.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('products').insert(payload);
          if (error) throw error;
        }
        close();
        reload();
      } catch (err) {
        console.error('[KPS] product save failed:', err);
        msg.textContent = `Save failed: ${err.message}`;
        msg.className = 'pm-save-msg is-error';
        submit.disabled = false;
      }
    });
  }

  // Load pricing settings + fetch-budget usage first so list + editor previews
  // and the master panel are accurate.
  try {
    pricingSettings = await fetchPricingSettings();
  } catch {
    pricingSettings = { ...DEFAULT_PRICING };
  }
  userDir = await fetchUserDirectory();
  renderMaster();
  reload();
}
