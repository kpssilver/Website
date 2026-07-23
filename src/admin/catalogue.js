// =============================================================================
// CATALOGUE BUILDER
// Pick stock items, choose how many images per row, toggle branding + product
// details, tweak any value inline — with a LIVE preview — then print / "Save as
// PDF" to share. The image is the hero (large, on top); details sit below it.
// =============================================================================
import { site } from '../config/site.js';
import { firstImage, formatGrams } from '../data/stock.js';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Product photos are often multi-MB phone uploads, which made the catalogue slow
// to load/print. Request a resized copy from Supabase's image-transform endpoint;
// if transforms aren't enabled the <img> onerror falls back to the original.
function thumbUrl(url, width = 800) {
  if (!url || typeof url !== 'string' || !url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  return base + (base.includes('?') ? '&' : '?') + `width=${width}&quality=78`;
}

// Detail fields shown under each image. `on` = visible by default.
const FIELDS = [
  { key: 'title', label: 'Name', on: true },
  { key: 'design_no', label: 'Design no', on: true },
  { key: 'sku', label: 'SKU', on: false },
  { key: 'category', label: 'Category', on: false },
  { key: 'subcategory', label: 'Subcategory', on: false },
  { key: 'collection', label: 'Collection', on: false },
  { key: 'weight', label: 'Weight', on: true },
  { key: 'size', label: 'Size', on: true },
  { key: 'purity', label: 'Purity', on: true },
  { key: 'price', label: 'Price', on: true },
];

function fieldValue(it, key, priceFor) {
  switch (key) {
    case 'title':
      return it.title || it.sku || 'Silver piece';
    case 'design_no':
      return it.design_no ? `Design ${it.design_no}` : '';
    case 'sku':
      return it.sku || '';
    case 'category':
      return it.category || '';
    case 'subcategory':
      return it.subcategory || '';
    case 'collection':
      return it.collection || '';
    case 'weight':
      return it.gross_weight != null ? formatGrams(it.gross_weight) : '';
    case 'size':
      return it.size || '';
    case 'purity':
      return '92.5 Sterling';
    case 'price':
      return priceFor ? priceFor(it) : '';
    default:
      return '';
  }
}

// One preview card: hero image on top, details below. Every field is always in
// the DOM (wrapped with data-field) so a toggle just hides it — inline edits and
// removals are never lost.
function itemCard(it, priceFor) {
  const img = firstImage(it);
  const chips = ['design_no', 'sku', 'category', 'subcategory', 'collection', 'weight', 'size', 'purity']
    .map((key) => {
      const val = fieldValue(it, key, priceFor);
      return `<span class="cat-chip" data-field="${key}"${val ? '' : ' hidden'} contenteditable="true">${esc(val)}</span>`;
    })
    .join('');
  return `
  <figure class="cat-item" data-id="${esc(it.id)}">
    <button type="button" class="cat-item-rm" data-rm="${esc(it.id)}" aria-label="Remove from catalogue">✕</button>
    <div class="cat-item-img" data-field="image">${
      img
        ? `<img src="${esc(thumbUrl(img))}" data-full="${esc(img)}" onerror="this.onerror=null;this.src=this.dataset.full" alt="" loading="lazy" decoding="async" />`
        : '<span class="cat-noimg">No photo</span>'
    }<span class="cat-item-wm" data-wm hidden><span></span></span></div>
    <figcaption class="cat-item-body">
      <div class="cat-title" data-field="title" contenteditable="true">${esc(fieldValue(it, 'title', priceFor))}</div>
      <div class="cat-meta">${chips}</div>
      <div class="cat-price" data-field="price" contenteditable="true">${esc(fieldValue(it, 'price', priceFor))}</div>
    </figcaption>
  </figure>`;
}

const TOGGLE = (key, label, on) =>
  `<label class="cat-toggle"><input type="checkbox" data-toggle="${key}" ${on ? 'checked' : ''}/> ${esc(label)}</label>`;

// items: array of stock items. opts.priceFor(item) -> formatted price string.
export function openCatalogue(items, { priceFor } = {}) {
  if (!items || !items.length) {
    alert('Select at least one item to build a catalogue.');
    return;
  }

  // ---- State ----
  const show = {};
  FIELDS.forEach((f) => (show[f.key] = f.on));
  show.image = true;
  let cols = items.length === 1 ? 1 : 2;
  const brand = { on: true, logo: true, brand: true, tagline: true, address: true, phone: true };
  const wm = { on: false, text: site.brand };
  const vals = {
    brand: site.brand,
    tagline: site.motto,
    address: site.address.lines.join(', '),
    phone: site.contact.phoneDisplay,
    note: '',
  };

  const holder = document.createElement('div');
  holder.innerHTML = `
  <div class="pm-modal-backdrop" id="catBackdrop">
    <div class="pm-modal cat-modal">
      <div class="pm-modal-head">
        <h2>Catalogue — ${items.length} item(s)</h2>
        <button class="pm-x" id="catClose" type="button" aria-label="Close">✕</button>
      </div>
      <div class="cat-layout">
        <aside class="cat-controls">
          <section class="cat-sec">
            <h3 class="cat-sec-h">Layout</h3>
            <label class="cat-field"><span>Images per row</span>
              <select class="cat-select" id="catCols">
                ${[1, 2, 3, 4].map((n) => `<option value="${n}" ${n === cols ? 'selected' : ''}>${n} per row</option>`).join('')}
              </select>
            </label>
            <label class="cat-toggle"><input type="checkbox" data-toggle="image" checked/> Show product photos</label>
            <label class="cat-toggle"><input type="checkbox" id="catWmOn"/> Add watermark on photos</label>
            <label class="cat-field"><span>Watermark text</span><input id="catWmText" value="${esc(wm.text)}" placeholder="e.g. KPS Silver" /></label>
          </section>

          <section class="cat-sec">
            <div class="cat-row">
              <h3 class="cat-sec-h">Branding</h3>
              <label class="cat-toggle"><input type="checkbox" id="catBrandOn" checked/> Show</label>
            </div>
            <div class="cat-brand-fields" id="catBrandFields">
              <label class="cat-toggle"><input type="checkbox" data-brand="logo" checked/> Logo</label>
              <label class="cat-field"><span><label class="cat-toggle cat-toggle--inline"><input type="checkbox" data-brand="brand" checked/> Brand name</label></span><input id="catBrand" value="${esc(vals.brand)}" /></label>
              <label class="cat-field"><span><label class="cat-toggle cat-toggle--inline"><input type="checkbox" data-brand="tagline" checked/> Tagline</label></span><input id="catTagline" value="${esc(vals.tagline)}" /></label>
              <label class="cat-field"><span><label class="cat-toggle cat-toggle--inline"><input type="checkbox" data-brand="address" checked/> Address</label></span><textarea id="catAddress" rows="2">${esc(vals.address)}</textarea></label>
              <label class="cat-field"><span><label class="cat-toggle cat-toggle--inline"><input type="checkbox" data-brand="phone" checked/> Phone / WhatsApp</label></span><input id="catPhone" value="${esc(vals.phone)}" /></label>
            </div>
            <label class="cat-field"><span>Footer note (optional)</span><input id="catNote" placeholder="e.g. Prices indicative, subject to daily silver rate" /></label>
          </section>

          <section class="cat-sec">
            <h3 class="cat-sec-h">Product details</h3>
            <div class="cat-toggle-grid">
              ${FIELDS.map((f) => TOGGLE(f.key, f.label, f.on)).join('')}
            </div>
            <p class="cat-hint">Click any value in the preview to edit it · ✕ removes an item.</p>
          </section>

          <div class="cat-actions">
            <button class="dash-btn" id="catPrint" type="button">Print / Save as PDF</button>
            <p class="cat-hint">Save as PDF, then share on WhatsApp or email.</p>
          </div>
        </aside>

        <section class="cat-preview-wrap">
          <div class="cat-preview" id="catPreview">
            <header class="cat-sheet-head" id="catHead">
              <img class="cat-head-logo" data-b="logo" src="/favicon.svg" alt="" />
              <div class="cat-head-text">
                <div class="cat-head-brand" data-b="brand">${esc(vals.brand)}</div>
                <div class="cat-head-tag" data-b="tagline">${esc(vals.tagline)}</div>
                <div class="cat-head-addr" data-b="address">${esc(vals.address)}</div>
                <div class="cat-head-phone" data-b="phone">${esc(vals.phone)}</div>
              </div>
            </header>
            <div class="cat-grid" id="catGrid" style="--cols:${cols}">
              ${items.map((it) => itemCard(it, priceFor)).join('')}
            </div>
            <p class="cat-note" data-b="note" hidden></p>
          </div>
        </section>
      </div>
    </div>
  </div>`;
  document.body.appendChild(holder);

  const preview = holder.querySelector('#catPreview');
  const grid = holder.querySelector('#catGrid');
  const head = holder.querySelector('#catHead');
  const noteEl = holder.querySelector('.cat-note');
  const close = () => holder.remove();
  holder.querySelector('#catClose').addEventListener('click', close);
  holder.querySelector('#catBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'catBackdrop') close();
  });

  // ---- Live: product-detail field visibility ----
  const applyField = (key) => {
    preview.querySelectorAll(`[data-field="${key}"]`).forEach((el) => {
      const empty = el.classList.contains('cat-chip') && !el.textContent.trim();
      el.hidden = !show[key] || empty;
    });
  };
  Object.keys(show).forEach(applyField);
  holder.querySelectorAll('[data-toggle]').forEach((cb) =>
    cb.addEventListener('change', () => {
      show[cb.dataset.toggle] = cb.checked;
      applyField(cb.dataset.toggle);
    }),
  );

  // ---- Live: layout ----
  holder.querySelector('#catCols').addEventListener('change', (e) => {
    cols = Number(e.target.value) || 2;
    grid.style.setProperty('--cols', cols);
  });

  // ---- Live: watermark ----
  const applyWatermark = () => {
    preview.querySelectorAll('[data-wm]').forEach((el) => {
      el.hidden = !wm.on || !wm.text.trim();
      const span = el.querySelector('span');
      if (span) span.textContent = wm.text;
    });
  };
  holder.querySelector('#catWmOn').addEventListener('change', (e) => {
    wm.on = e.target.checked;
    applyWatermark();
  });
  holder.querySelector('#catWmText').addEventListener('input', (e) => {
    wm.text = e.target.value;
    applyWatermark();
  });
  applyWatermark();

  // ---- Live: branding ----
  const applyBranding = () => {
    head.hidden = !brand.on;
    const part = (key, hasContent) => {
      const el = head.querySelector(`[data-b="${key}"]`);
      if (el) el.hidden = !brand.on || !brand[key] || (hasContent === false);
    };
    part('logo', brand.logo);
    part('brand', !!vals.brand.trim());
    part('tagline', !!vals.tagline.trim());
    part('address', !!vals.address.trim());
    part('phone', !!vals.phone.trim());
    noteEl.hidden = !vals.note.trim();
  };
  holder.querySelector('#catBrandOn').addEventListener('change', (e) => {
    brand.on = e.target.checked;
    holder.querySelector('#catBrandFields').classList.toggle('is-off', !brand.on);
    applyBranding();
  });
  holder.querySelectorAll('[data-brand]').forEach((cb) =>
    cb.addEventListener('change', () => {
      brand[cb.dataset.brand] = cb.checked;
      applyBranding();
    }),
  );
  // Header text inputs → live preview.
  const bindText = (inputId, key, targetSel) => {
    holder.querySelector(inputId).addEventListener('input', (e) => {
      vals[key] = e.target.value;
      const el = head.querySelector(targetSel);
      if (el) el.textContent = e.target.value;
      applyBranding();
    });
  };
  bindText('#catBrand', 'brand', '[data-b="brand"]');
  bindText('#catTagline', 'tagline', '[data-b="tagline"]');
  bindText('#catAddress', 'address', '[data-b="address"]');
  bindText('#catPhone', 'phone', '[data-b="phone"]');
  holder.querySelector('#catNote').addEventListener('input', (e) => {
    vals.note = e.target.value;
    noteEl.textContent = e.target.value;
    applyBranding();
  });
  applyBranding();

  // ---- Remove an item ----
  preview.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-rm]');
    if (!btn) return;
    btn.closest('.cat-item')?.remove();
    if (!grid.querySelector('.cat-item')) close();
  });

  // ---- Print / Save as PDF ----
  holder.querySelector('#catPrint').addEventListener('click', async () => {
    const printBtn = holder.querySelector('#catPrint');
    printBtn.disabled = true;
    printBtn.textContent = 'Preparing…';
    document.querySelectorAll('.print-sheet').forEach((n) => n.remove());

    // Clone the live preview (keeps hidden fields, layout + inline edits), then
    // strip editing affordances so it prints clean.
    const sheet = document.createElement('div');
    sheet.className = 'print-sheet cat-print';
    const clone = preview.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[contenteditable]').forEach((el) => el.removeAttribute('contenteditable'));
    clone.querySelectorAll('.cat-item-rm').forEach((el) => el.remove());
    // Force every image to fetch now (preview versions may still be lazy).
    clone.querySelectorAll('img').forEach((im) => im.removeAttribute('loading'));
    sheet.appendChild(clone);
    document.body.appendChild(sheet);

    // Images are already loaded in the preview (same src → cached), so this is
    // near-instant. Cap the wait so a slow/stalled image never blocks printing.
    const imgs = [...sheet.querySelectorAll('img')];
    const ready = Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth
          ? Promise.resolve()
          : new Promise((res) => {
              img.onload = res;
              img.onerror = res;
            }),
      ),
    );
    await Promise.race([ready, new Promise((res) => setTimeout(res, 2500))]);

    const cleanup = () => {
      sheet.remove();
      window.removeEventListener('afterprint', cleanup);
      printBtn.disabled = false;
      printBtn.textContent = 'Print / Save as PDF';
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
    // Safety: restore the button even if afterprint doesn't fire.
    setTimeout(() => {
      if (printBtn.disabled) cleanup();
    }, 1500);
  });
}
