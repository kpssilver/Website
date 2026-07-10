// =============================================================================
// SHOP — public storefront for KPS Silver.
// Lists products from Supabase with a category filter and a rich product
// detail view (image gallery, video, specifications) plus WhatsApp / call
// enquiry CTAs. No cart/checkout — silver is bought in person or on enquiry.
// =============================================================================
import '../styles/shop.css';
import { Logo, LogoDefs } from '../components/logo.js';
import { site } from '../config/site.js';
import {
  fetchProducts,
  PRODUCT_CATEGORIES,
  formatWeight,
  productWhatsAppUrl,
  categoryWhatsAppUrl,
  productLink,
  firstImage,
} from '../data/products.js';
import {
  fetchPricingSettings,
  computePrice,
  priceLabel,
  formatMoney,
  purityLabel,
  DEFAULT_PRICING,
} from '../data/pricing.js';
import { initAnalytics, trackEvent } from '../analytics/tracker.js';

const root = document.getElementById('shop-root');
let allProducts = [];
let pricing = { ...DEFAULT_PRICING };
let activeCategory = null;
let searchQuery = '';

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shell() {
  const chips = ['All', ...PRODUCT_CATEGORIES]
    .map((c) => {
      const val = c === 'All' ? '' : c;
      const active = (activeCategory || '') === val ? ' is-active' : '';
      return `<button class="shop-chip${active}" type="button" data-cat="${esc(val)}">${esc(c)}</button>`;
    })
    .join('');

  return `
  ${LogoDefs()}
  <header class="shop-header">
    <a class="shop-brand" href="/">${Logo('nav')}</a>
    <nav class="shop-nav">
      <a href="/">← Back to home</a>
      <a id="shopEnquire" class="btn btn-solid shop-cta" href="${categoryWhatsAppUrl(activeCategory)}" target="_blank" rel="noopener"><span class="fill"></span><span class="lbl">Enquire on WhatsApp</span></a>
    </nav>
  </header>

  <section class="shop-hero">
    <p class="shop-eyebrow">The Collection</p>
    <h1>Silver, ready for your home and every giving hand</h1>
    <p class="shop-lede">Every article is genuine silver — graded from 925 sterling to 999 fine, weighed and priced on the day's rate. Browse below and enquire for weight, price and availability.</p>
  </section>

  <div class="shop-search">
    <input id="shopSearch" type="search" autocomplete="off" placeholder="Search silver — name or category…" value="${esc(searchQuery)}" aria-label="Search products" />
    <span class="shop-search-icon" id="shopSearchIcon" aria-hidden="true" ${searchQuery ? 'hidden' : ''}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg></span>
    <button class="shop-search-clear" id="shopSearchClear" type="button" aria-label="Clear search" ${searchQuery ? '' : 'hidden'}>✕</button>
  </div>

  <div class="shop-filter" id="shopFilter">${chips}</div>
  <main class="shop-main" id="shopGrid"></main>

  <footer class="shop-foot">
    <div class="shop-foot-brand">${Logo('foot')}</div>
    <p>${esc(site.address.lines.join(', '))}</p>
    <p><a href="${site.contact.phoneHref}">${esc(site.contact.phoneDisplay)}</a> · <a href="${site.contact.whatsappUrl}" target="_blank" rel="noopener">WhatsApp</a> · <a href="${site.contact.mapsDirectionsUrl}" target="_blank" rel="noopener">Directions</a></p>
    <small>© 2026 ${esc(site.brand)}. All rights reserved.</small>
  </footer>

  <div id="shopModalHost"></div>`;
}

function cardMarkup(p) {
  const img = firstImage(p);
  const media = img
    ? `<div class="shop-card-img" role="img" aria-label="${esc(p.title)}" style="background-image:url('${esc(img)}')"></div>`
    : `<div class="shop-card-noimg">${Logo()}</div>`;
  const soldOut = p.in_stock ? '' : '<span class="shop-tag shop-tag--out">Sold out</span>';
  const hasVideo = p.video_url ? '<span class="shop-tag shop-tag--video">▶ Video</span>' : '';
  return `
  <article class="shop-card" data-id="${p.id}" tabindex="0" role="button" aria-label="View ${esc(p.title)}">
    <div class="shop-card-media">${media}${soldOut}${hasVideo}</div>
    <div class="shop-card-body">
      ${p.category ? `<span class="shop-card-cat">${esc(p.category)}</span>` : ''}
      <h3>${esc(p.title)}</h3>
      ${p.subtitle ? `<p class="shop-card-sub">${esc(p.subtitle)}</p>` : ''}
      <div class="shop-card-foot">
        <span class="shop-price">${esc(priceLabel(p, pricing))}</span>
        ${p.weight_grams ? `<span class="shop-weight">${esc(formatWeight(p))}</span>` : ''}
      </div>
    </div>
  </article>`;
}

function matchesSearch(p) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return [p.title, p.subtitle, p.category, p.description, purityLabel(p.metal_purity)].some((v) =>
    String(v || '').toLowerCase().includes(q),
  );
}

function renderGrid() {
  const grid = root.querySelector('#shopGrid');
  const list = allProducts.filter((p) => (!activeCategory || p.category === activeCategory) && matchesSearch(p));

  if (!list.length) {
    const catNote = activeCategory ? ` in <strong>${esc(activeCategory)}</strong>` : '';
    const searchNote = searchQuery ? ` matching “<strong>${esc(searchQuery)}</strong>”` : '';
    grid.innerHTML = `
    <div class="shop-empty">
      <p>No pieces to show here yet${catNote}${searchNote}.</p>
      <p class="shop-empty-sub">New silver is added regularly — <a class="shop-empty-wa" href="${categoryWhatsAppUrl(activeCategory)}" target="_blank" rel="noopener">message us on WhatsApp</a> and tell us what you're looking for.</p>
    </div>`;
    const wa = grid.querySelector('.shop-empty-wa');
    if (wa) wa.addEventListener('click', () => trackEvent('category_enquiry', activeCategory || 'All', 'shop'));
    return;
  }
  grid.innerHTML = list.map(cardMarkup).join('');
  grid.querySelectorAll('.shop-card').forEach((card) => {
    const open = () => openDetail(card.dataset.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}

function videoEmbed(url) {
  if (!url) return '';
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) {
    return `<div class="shop-video"><iframe src="https://www.youtube.com/embed/${yt[1]}" title="Product video" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  return `<div class="shop-video"><video src="${esc(url)}" controls playsinline preload="metadata"></video></div>`;
}

function specRow(label, value) {
  return value ? `<div class="shop-spec"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : '';
}

// Transparent price breakdown for the detail view.
function priceBlock(p) {
  const r = computePrice(p, pricing);
  if (r.mode === 'on_request' || r.mode === 'unset') {
    return `<div class="shop-detail-price"><span class="shop-price">Price on request</span>${
      p.in_stock ? '' : '<span class="shop-tag shop-tag--out">Sold out</span>'
    }</div>`;
  }
  if (r.mode === 'fixed') {
    return `<div class="shop-detail-price"><span class="shop-price">${esc(formatMoney(r.total))}</span>${
      p.in_stock ? '' : '<span class="shop-tag shop-tag--out">Sold out</span>'
    }</div>`;
  }
  const rows = r.lines
    .map((l) => `<div class="shop-brk-row"><span>${esc(l.label)}</span><span>${esc(formatMoney(l.amount))}</span></div>`)
    .join('');
  return `
  <div class="shop-detail-price">
    <span class="shop-price">${esc(formatMoney(r.total))}</span>
    ${p.in_stock ? '' : '<span class="shop-tag shop-tag--out">Sold out</span>'}
  </div>
  <div class="shop-breakdown">
    <div class="shop-brk-title">Price breakdown</div>
    ${rows}
    <div class="shop-brk-row shop-brk-total"><span>Total (incl. GST)</span><span>${esc(formatMoney(r.total))}</span></div>
  </div>`;
}

function openDetail(id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;
  trackEvent('product_view', p.title, 'shop');
  const host = root.querySelector('#shopModalHost');
  const images = Array.isArray(p.images) ? p.images : [];
  const mainImg = images[0] || '';

  const thumbs = images
    .map((u, i) => `<button class="shop-thumb${i === 0 ? ' is-active' : ''}" type="button" data-src="${esc(u)}"><img src="${esc(u)}" alt="" /></button>`)
    .join('');

  host.innerHTML = `
  <div class="shop-modal-backdrop" id="shopBackdrop">
    <div class="shop-modal" role="dialog" aria-modal="true" aria-label="${esc(p.title)}">
      <button class="shop-modal-x" id="shopClose" aria-label="Close">✕</button>
      <div class="shop-modal-grid">
        <div class="shop-gallery">
          <div class="shop-gallery-main">
            ${mainImg ? `<div id="shopMainImg" class="shop-gallery-img" role="img" aria-label="${esc(p.title)}" data-full="${esc(mainImg)}" style="background-image:url('${esc(mainImg)}')" title="Hover to zoom · click to enlarge"></div>` : `<div class="shop-card-noimg">${Logo()}</div>`}
          </div>
          ${mainImg ? '<span class="shop-zoom-hint">Hover to zoom · click to enlarge</span>' : ''}
          ${images.length > 1 ? `<div class="shop-thumbs">${thumbs}</div>` : ''}
          ${videoEmbed(p.video_url)}
        </div>
        <div class="shop-detail">
          <div class="shop-detail-scroll">
            ${p.category ? `<span class="shop-card-cat">${esc(p.category)}</span>` : ''}
            <h2>${esc(p.title)}</h2>
            ${p.subtitle ? `<p class="shop-detail-sub">${esc(p.subtitle)}</p>` : ''}
            ${priceBlock(p)}
            ${p.description ? `<p class="shop-detail-desc">${esc(p.description).replace(/\n/g, '<br>')}</p>` : ''}
            <dl class="shop-specs">
              ${specRow('Weight', formatWeight(p))}
              ${specRow('Purity', purityLabel(p.metal_purity))}
              ${specRow('Material / notes', p.purity)}
              ${specRow('Dimensions', p.dimensions)}
            </dl>
            <p class="shop-detail-note">Silver is priced on the day's rate and weighed in store. Message us for the current price and to reserve this piece.</p>
          </div>
          <div class="shop-detail-foot">
            <div class="shop-detail-cta">
              <a id="shopDetailWa" class="btn btn-solid" href="${productWhatsAppUrl(p, productLink(p))}" target="_blank" rel="noopener"><span class="fill"></span><span class="lbl">Enquire on WhatsApp</span></a>
              <a class="btn btn-ghost" href="${site.contact.phoneHref}"><span class="fill"></span><span class="lbl">Call the store</span></a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;

  document.body.classList.add('shop-modal-open');
  const close = () => {
    host.innerHTML = '';
    document.body.classList.remove('shop-modal-open');
  };
  host.querySelector('#shopClose').addEventListener('click', close);
  host.querySelector('#shopBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'shopBackdrop') close();
  });
  host.querySelector('#shopDetailWa')?.addEventListener('click', () => trackEvent('product_enquiry', p.title, 'shop'));
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onEsc);
    }
  });

  const mainImgEl = host.querySelector('#shopMainImg');
  host.querySelectorAll('.shop-thumb').forEach((t) =>
    t.addEventListener('click', () => {
      if (mainImgEl) {
        mainImgEl.style.backgroundImage = `url('${t.dataset.src}')`;
        mainImgEl.dataset.full = t.dataset.src;
      }
      host.querySelectorAll('.shop-thumb').forEach((x) => x.classList.remove('is-active'));
      t.classList.add('is-active');
    }),
  );

  // Hover-to-zoom: magnify the image toward the cursor so customers can inspect
  // the fine silver detailing. Click opens the fullscreen lightbox.
  if (mainImgEl) {
    mainImgEl.addEventListener('mouseenter', () => mainImgEl.classList.add('is-zoom'));
    mainImgEl.addEventListener('mouseleave', () => {
      mainImgEl.classList.remove('is-zoom');
      mainImgEl.style.backgroundPosition = 'center';
    });
    mainImgEl.addEventListener('mousemove', (e) => {
      const r = mainImgEl.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * 100;
      const y = ((e.clientY - r.top) / r.height) * 100;
      mainImgEl.style.backgroundPosition = `${x}% ${y}%`;
    });
    mainImgEl.addEventListener('click', () => openLightbox(mainImgEl.dataset.full, p.title));
  }
}

// Fullscreen image viewer, layered above the product modal.
function openLightbox(src, alt) {
  const lb = document.createElement('div');
  lb.className = 'shop-lightbox';
  lb.innerHTML = `
    <button class="shop-lightbox-x" aria-label="Close">✕</button>
    <img src="${esc(src)}" alt="${esc(alt || '')}" />`;
  document.body.appendChild(lb);
  const close = () => {
    lb.remove();
    document.removeEventListener('keydown', onEsc);
  };
  function onEsc(e) {
    if (e.key === 'Escape') close();
  }
  lb.addEventListener('click', (e) => {
    if (e.target === lb || e.target.classList.contains('shop-lightbox-x')) close();
  });
  document.addEventListener('keydown', onEsc);
}

// Keep the header "Enquire on WhatsApp" message tied to the active category.
function updateEnquireCta() {
  const cta = root.querySelector('#shopEnquire');
  if (cta) cta.href = categoryWhatsAppUrl(activeCategory);
}

function wireFilter() {
  root.querySelector('#shopFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('.shop-chip');
    if (!btn) return;
    activeCategory = btn.dataset.cat || null;
    root.querySelectorAll('.shop-chip').forEach((c) => c.classList.toggle('is-active', c === btn));
    const url = new URL(window.location);
    if (activeCategory) url.searchParams.set('category', activeCategory);
    else url.searchParams.delete('category');
    window.history.replaceState({}, '', url);
    updateEnquireCta();
    trackEvent('category_view', activeCategory || 'All', 'shop');
    renderGrid();
  });
}

// Animated placeholder that "types" example searches while the box is empty.
function startTypewriter(input) {
  const phrases = ['Deepam', 'Pooja articles', 'Silver gift trays', '999 fine silver', 'Kuthuvilakku', 'Home décor'];
  const base = 'Search silver — ';
  let pi = 0;
  let ci = 0;
  let deleting = false;

  const tick = () => {
    // Pause the animation whenever the customer is typing or has focused it.
    if (input.value || document.activeElement === input) {
      input.placeholder = 'Search silver — name or category…';
      input._twTimer = setTimeout(tick, 700);
      return;
    }
    const word = phrases[pi];
    ci += deleting ? -1 : 1;
    input.placeholder = `${base}${word.slice(0, ci)}`;
    let delay = deleting ? 45 : 95;
    if (!deleting && ci === word.length) {
      deleting = true;
      delay = 1300;
    } else if (deleting && ci === 0) {
      deleting = false;
      pi = (pi + 1) % phrases.length;
      delay = 350;
    }
    input._twTimer = setTimeout(tick, delay);
  };
  input._twTimer = setTimeout(tick, 500);
}

function wireSearch() {
  const input = root.querySelector('#shopSearch');
  const clear = root.querySelector('#shopSearchClear');
  const icon = root.querySelector('#shopSearchIcon');
  if (!input) return;
  let searchTimer = null;

  const apply = () => {
    searchQuery = input.value.trim();
    if (clear) clear.hidden = !searchQuery;
    if (icon) icon.hidden = !!searchQuery;
    renderGrid();
    // Log the finished search term (debounced) for the admin panel.
    clearTimeout(searchTimer);
    if (searchQuery) searchTimer = setTimeout(() => trackEvent('product_search', searchQuery, 'shop'), 900);
  };

  input.addEventListener('input', apply);
  clear?.addEventListener('click', () => {
    input.value = '';
    input.focus();
    apply();
  });

  startTypewriter(input);
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('category');
  if (requested && PRODUCT_CATEGORIES.includes(requested)) activeCategory = requested;

  root.innerHTML = shell();
  wireFilter();
  wireSearch();

  // Start analytics so shop engagement shows up in the super admin panel.
  initAnalytics().then(() => trackEvent('shop_open', activeCategory || 'All', 'shop'));

  const grid = root.querySelector('#shopGrid');
  grid.innerHTML = '<div class="shop-loading">Loading the collection…</div>';
  try {
    const [products, settings] = await Promise.all([fetchProducts(), fetchPricingSettings()]);
    allProducts = products;
    pricing = settings;
    renderGrid();

    // Deep link: open a product directly when linked from WhatsApp/share.
    const wanted = params.get('product');
    if (wanted && allProducts.some((p) => p.id === wanted)) openDetail(wanted);
  } catch (err) {
    grid.innerHTML = `<div class="shop-empty"><p>Couldn't load the collection.</p><p class="shop-empty-sub">${esc(err.message)}</p></div>`;
  }
}

boot();
