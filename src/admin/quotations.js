// =============================================================================
// QUOTATIONS
// A two-pane workspace: on the LEFT an editable, spreadsheet-like quotation
// builder (resizable rows & columns); on the RIGHT a library of saved
// quotations and drafts. Preset columns: Name, Purity, Plus, Touch (= Purity +
// Plus, auto), Making charges. New rows default Purity to 92.5. The admin can
// add more columns (Gross weight, Price, GST, or any custom field), save drafts,
// reopen them, and lift line-items from an existing quotation into the current
// one (no re-typing).
//
// PDF export is fully VECTOR (jsPDF + autoTable) — crisp, selectable text with
// no rasterisation/pixelation, whatever the zoom level.
// =============================================================================
import { isChunkLoadError, reloadForStaleChunk } from '../utils/chunkReload.js';
import {
  fetchQuotations,
  insertQuotation,
  updateQuotation,
  deleteQuotation,
} from '../data/quotations.js';

const ADDRESS_TOP = [
  'No.905, Nagarathpet Main Road, (Near Mahaveer Medical)',
  'Bengaluru - 560002',
];
const CONTACT = {
  phones: [
    { display: '8660784494', tel: '+918660784494' },
    { display: '9945971150', tel: '+919945971150' },
  ],
  email: 'kpssilver@gmail.com',
};
const ADDRESS_HTML = ADDRESS_TOP[0];
const PHONE_SVG =
  '<svg class="qt-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/></svg>';
const MAIL_SVG =
  '<svg class="qt-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>';
// Contact row shares the last address line: phones on the left corner, the city
// centred, and the email on the right corner.
const CONTACT_BAR_HTML =
  `<span class="qt-contact-l">${PHONE_SVG}<span>${CONTACT.phones
    .map((p) => `<a href="tel:${p.tel}">${p.display}</a>`)
    .join(' / ')}</span></span>` +
  `<span class="qt-contact-c">${esc(ADDRESS_TOP[1])}</span>` +
  `<span class="qt-contact-r">${MAIL_SVG}<a href="mailto:${CONTACT.email}">${CONTACT.email}</a></span>`;
const PDF_LINK = [40, 82, 160]; // link colour for tappable contacts in the PDF

const DEFAULT_NOTES = [
  'This quotation is valid for 7 days from the date mentioned above.',
  'Final weight and purity are confirmed at the time of billing.',
  'For any clarification, please reach us on the phone number or email above.',
].join('\n');

const PRESET_COLUMNS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'purity', label: 'Purity', type: 'number' },
  { key: 'plus', label: 'Plus', type: 'number' },
  { key: 'touch', label: 'Touch', type: 'computed' },
  { key: 'making', label: 'MAKING CHARGES/Kg', type: 'number' },
];
const OPTIONAL_COLUMNS = [
  { key: 'gross_weight', label: 'Gross weight', type: 'number' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'gst', label: 'GST', type: 'number' },
];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const fmtNum = (n) => String(Number(Number(n).toFixed(3)));
const titleCase = (s) => String(s).replace(/(^|\s)(\p{L})/gu, (_, sp, ch) => sp + ch.toUpperCase());
function formatDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
const defaultWidth = (col) => (col.key === 'name' ? 200 : col.type === 'number' ? 110 : 140);

// Draws a link segment at (x, y) — coloured + underlined so it reads as tappable
// — and returns the x position just past it.
function drawLink(pdf, text, x, y, url) {
  const w = pdf.getTextWidth(text);
  pdf.setTextColor(PDF_LINK[0], PDF_LINK[1], PDF_LINK[2]);
  pdf.textWithLink(text, x, y, { url });
  pdf.setDrawColor(PDF_LINK[0], PDF_LINK[1], PDF_LINK[2]);
  pdf.setLineWidth(0.4);
  pdf.line(x, y + 1.4, x + w, y + 1.4);
  pdf.setTextColor(90);
  return x + w;
}

// Small vector mobile-phone glyph; baseline sits on `y`. Returns its right edge.
function drawPhoneIcon(pdf, x, y) {
  const w = 7;
  const h = 10;
  const top = y - 8.5;
  pdf.setDrawColor(90);
  pdf.setFillColor(90);
  pdf.setLineWidth(0.7);
  pdf.roundedRect(x, top, w, h, 1.2, 1.2, 'S');
  pdf.line(x + w * 0.3, top + 1.6, x + w * 0.7, top + 1.6);
  pdf.circle(x + w / 2, top + h - 1.5, 0.5, 'F');
  return x + w;
}
// Small vector envelope glyph; baseline sits on `y`. Returns its right edge.
function drawMailIcon(pdf, x, y) {
  const w = 11;
  const h = 8;
  const top = y - 7.5;
  pdf.setDrawColor(90);
  pdf.setLineWidth(0.7);
  pdf.rect(x, top, w, h, 'S');
  pdf.line(x, top, x + w / 2, top + h * 0.55);
  pdf.line(x + w, top, x + w / 2, top + h * 0.55);
  return x + w;
}

// Contact row shared with the last address line: phone icon + numbers on the
// left corner, the city centred, and an envelope icon + email on the right
// corner. Phones are tel: links, the email is a mailto: link.
function drawContactRow(pdf, margin, pageW, y, city) {
  const gap = 4;
  // Left: phone icon + "<num> / <num>"
  let x = drawPhoneIcon(pdf, margin, y) + gap;
  CONTACT.phones.forEach((p, i) => {
    x = drawLink(pdf, p.display, x, y, `tel:${p.tel}`);
    if (i < CONTACT.phones.length - 1) {
      pdf.setTextColor(90);
      pdf.text(' / ', x, y);
      x += pdf.getTextWidth(' / ');
    }
  });
  // Centre: city.
  pdf.setTextColor(90);
  pdf.text(city, pageW / 2, y, { align: 'center' });
  // Right: envelope icon + email, right-aligned to the margin.
  const mailIconW = 11;
  const ew = pdf.getTextWidth(CONTACT.email);
  const startX = pageW - margin - (mailIconW + gap + ew);
  const afterIcon = drawMailIcon(pdf, startX, y) + gap;
  drawLink(pdf, CONTACT.email, afterIcon, y, `mailto:${CONTACT.email}`);
}

// -----------------------------------------------------------------------------
export function renderQuotations(root) {
  let colSeq = 0;
  let rowSeq = 0;
  let currentId = null; // id of the saved quotation being edited (null = new)
  let currentStatus = 'draft'; // status to keep when auto-saving on download
  let saved = []; // library of saved quotations
  let sideFilter = 'all'; // all | draft | final
  const openCards = new Set(); // saved-card ids whose item list is expanded
  let columns;
  let rows;

  const makeRow = (values = { purity: 92.5, plus: '' }, h = null) => ({ id: `r${++rowSeq}`, values: { ...values }, h });

  const resetBuilder = () => {
    currentId = null;
    currentStatus = 'draft';
    columns = PRESET_COLUMNS.map((c) => ({ ...c, removable: false }));
    rows = [makeRow(), makeRow()];
  };
  resetBuilder();

  const touchStr = (row) => fmtNum(toNum(row.values.purity) + toNum(row.values.plus));
  const cellText = (col, row) => (col.type === 'computed' ? touchStr(row) : row.values[col.key] ?? '');

  // Pure helpers (take explicit columns/rows) so the same logic drives the live
  // builder AND any saved quotation we export straight from the library.
  const isRowBlank = (row, cols) =>
    cols.every((c) => {
      if (c.type === 'computed') return true;
      const v = String(row.values?.[c.key] ?? '').trim();
      if (v === '') return true;
      if (c.key === 'purity' && Number(v) === 92.5) return true;
      return false;
    });
  const isColBlank = (col, used) => {
    if (col.type === 'computed') {
      return used.every((r) => String(r.values?.purity ?? '').trim() === '' && String(r.values?.plus ?? '').trim() === '');
    }
    return used.every((r) => String(r.values?.[col.key] ?? '').trim() === '');
  };
  const buildPrintModel = (cols, rws) => {
    const usedRows = rws.filter((r) => !isRowBlank(r, cols));
    if (!usedRows.length) return null;
    const usedCols = cols.filter((c) => !isColBlank(c, usedRows));
    if (!usedCols.length) return null;
    return { usedRows, usedCols };
  };

  const today = new Date().toISOString().slice(0, 10);

  root.innerHTML = `
  <div class="qt-view">
    <div class="pm-top">
      <div>
        <h2 class="pm-title">Quotations</h2>
        <p class="pm-lede">Build a silver quotation, save drafts, and export a crisp PDF to share.</p>
      </div>
    </div>
    <div class="qt-grid">
      <section class="qt-builder">
        <div class="qt-actions">
          <button class="dash-btn dash-btn--ghost" id="qtNew" type="button">New</button>
          <button class="dash-btn dash-btn--ghost" id="qtSaveDraft" type="button">Save draft</button>
          <button class="dash-btn" id="qtSave" type="button">Save</button>
          <span class="qt-actions-sep"></span>
          <button class="dash-btn dash-btn--ghost" id="qtShare" type="button">Share</button>
          <button class="dash-btn" id="qtDownload" type="button">Download PDF</button>
          <span class="qt-status-tag" id="qtStatusTag" hidden></span>
        </div>

        <div class="qt-toolbar">
          <button class="dash-btn dash-btn--ghost" id="qtAddRow" type="button">+ Add row</button>
          <span class="qt-toolbar-sep"></span>
          <span class="qt-addcol-lbl">Add column:</span>
          ${OPTIONAL_COLUMNS.map(
            (c) => `<button class="dash-btn dash-btn--ghost qt-addcol" data-addcol="${c.key}" type="button">${esc(c.label)}</button>`,
          ).join('')}
          <button class="dash-btn dash-btn--ghost" id="qtAddCustom" type="button">Custom field…</button>
          <span class="qt-resize-hint">Drag column &amp; row edges to resize</span>
        </div>

        <div class="qt-sheet" id="qtSheet">
          <header class="qt-head">
            <img class="qt-logo" src="/logo.svg" alt="KPS Silver" />
            <div class="qt-addr">${ADDRESS_HTML}</div>
            <div class="qt-contact-bar">${CONTACT_BAR_HTML}</div>
          </header>
          <h3 class="qt-doc-title">Quotation</h3>
          <div class="qt-meta">
            <label class="qt-meta-field">To
              <input type="text" id="qtCustomer" placeholder="Customer name (optional)" />
            </label>
            <label class="qt-meta-field">Date
              <input type="date" id="qtDate" value="${today}" />
            </label>
          </div>
          <div class="qt-table-wrap" id="qtTableWrap"></div>
          <label class="qt-note-field">Notes
            <textarea id="qtNotes" rows="4" placeholder="One note per line — shown under a “Notes” heading in the PDF.">${esc(DEFAULT_NOTES)}</textarea>
          </label>
        </div>
      </section>

      <aside class="qt-side">
        <div class="qt-side-head">
          <h3>Saved quotations</h3>
          <div class="qt-side-filter" id="qtFilter">
            <button class="qt-fbtn is-active" data-filter="all" type="button">All</button>
            <button class="qt-fbtn" data-filter="draft" type="button">Drafts</button>
            <button class="qt-fbtn" data-filter="final" type="button">Final</button>
          </div>
        </div>
        <div class="qt-side-list" id="qtSideList"><p class="qt-side-empty">Loading…</p></div>
      </aside>
    </div>
  </div>`;

  const tableWrap = root.querySelector('#qtTableWrap');
  const customerInput = root.querySelector('#qtCustomer');
  const dateInput = root.querySelector('#qtDate');
  const notesInput = root.querySelector('#qtNotes');
  const statusTag = root.querySelector('#qtStatusTag');
  const sideList = root.querySelector('#qtSideList');

  // ---- Editable, resizable table -------------------------------------------
  const cellInput = (col, row) => {
    if (col.type === 'computed') return `<span class="qt-touch" data-row="${row.id}">${esc(touchStr(row))}</span>`;
    const val = row.values[col.key] ?? '';
    const type = col.type === 'number' ? 'number' : 'text';
    const step = col.type === 'number' ? ' step="0.001"' : '';
    return `<input class="qt-in" data-row="${row.id}" data-col="${col.key}" type="${type}"${step} value="${esc(val)}" />`;
  };

  const renderTable = () => {
    const colgroup = `<colgroup>${columns
      .map((c) => `<col data-col="${c.key}" style="width:${c.width || defaultWidth(c)}px" />`)
      .join('')}<col style="width:34px" /></colgroup>`;
    const head = columns
      .map(
        (c) =>
          `<th><span class="qt-h"><input class="qt-h-in" data-col="${c.key}" value="${esc(c.label)}" title="Click to rename this column" aria-label="Column name" />${c.removable ? `<button class="qt-col-rm" data-col="${c.key}" type="button" title="Remove column" aria-label="Remove ${esc(c.label)}">✕</button>` : ''}</span><span class="qt-col-grip" data-col="${c.key}"></span></th>`,
      )
      .join('');
    const body = rows
      .map(
        (r) =>
          `<tr data-row="${r.id}"${r.h ? ` style="height:${r.h}px"` : ''}>${columns
            .map(
              (c, i) =>
                `<td class="qt-cell">${cellInput(c, r)}${i === 0 ? `<span class="qt-row-grip" data-row="${r.id}"></span>` : ''}</td>`,
            )
            .join('')}<td class="qt-rowact"><button class="qt-row-rm" data-row="${r.id}" type="button" title="Remove row" aria-label="Remove row">✕</button></td></tr>`,
      )
      .join('');
    tableWrap.innerHTML = `
      <table class="qt-table">
        ${colgroup}
        <thead><tr>${head}<th class="qt-rowact"></th></tr></thead>
        <tbody>${body}</tbody>
      </table>`;
  };
  renderTable();

  tableWrap.addEventListener('input', (e) => {
    const hin = e.target.closest('.qt-h-in');
    if (hin) {
      const col = columns.find((c) => c.key === hin.dataset.col);
      if (col) col.label = hin.value;
      return;
    }
    const inp = e.target.closest('.qt-in');
    if (!inp) return;
    const row = rows.find((r) => r.id === inp.dataset.row);
    if (!row) return;
    if (inp.dataset.col === 'name' && inp.value) {
      const capped = titleCase(inp.value);
      if (capped !== inp.value) {
        const pos = inp.selectionStart;
        inp.value = capped;
        try {
          inp.setSelectionRange(pos, pos);
        } catch {
          /* non-text input */
        }
      }
    }
    row.values[inp.dataset.col] = inp.value;
    if (inp.dataset.col === 'purity' || inp.dataset.col === 'plus') {
      const span = tableWrap.querySelector(`.qt-touch[data-row="${row.id}"]`);
      if (span) span.textContent = touchStr(row);
    }
  });

  tableWrap.addEventListener('click', (e) => {
    const colRm = e.target.closest('.qt-col-rm');
    if (colRm) {
      columns = columns.filter((c) => c.key !== colRm.dataset.col);
      renderTable();
      return;
    }
    const rowRm = e.target.closest('.qt-row-rm');
    if (rowRm) {
      rows = rows.filter((r) => r.id !== rowRm.dataset.row);
      if (!rows.length) rows.push(makeRow());
      renderTable();
    }
  });

  // Column-width + row-height drag resizing (spreadsheet style).
  let drag = null;
  const onDrag = (e) => {
    if (!drag) return;
    if (drag.type === 'col') {
      const w = Math.max(60, drag.startW + (e.clientX - drag.startX));
      drag.col.width = w;
      drag.el.style.width = `${w}px`;
    } else {
      const h = Math.max(30, drag.startH + (e.clientY - drag.startY));
      drag.row.h = h;
      drag.el.style.height = `${h}px`;
    }
  };
  const endDrag = () => {
    drag = null;
    document.body.classList.remove('qt-resizing');
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', endDrag);
  };
  tableWrap.addEventListener('mousedown', (e) => {
    const cg = e.target.closest('.qt-col-grip');
    const rg = e.target.closest('.qt-row-grip');
    if (cg) {
      const col = columns.find((c) => c.key === cg.dataset.col);
      const colEl = tableWrap.querySelector(`col[data-col="${cg.dataset.col}"]`);
      if (!col || !colEl) return;
      drag = { type: 'col', col, el: colEl, startX: e.clientX, startW: colEl.getBoundingClientRect().width };
    } else if (rg) {
      const row = rows.find((r) => r.id === rg.dataset.row);
      const trEl = tableWrap.querySelector(`tr[data-row="${rg.dataset.row}"]`);
      if (!row || !trEl) return;
      drag = { type: 'row', row, el: trEl, startY: e.clientY, startH: trEl.getBoundingClientRect().height };
    }
    if (drag) {
      e.preventDefault();
      document.body.classList.add('qt-resizing');
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', endDrag);
    }
  });

  root.querySelector('#qtAddRow').addEventListener('click', () => {
    rows.push(makeRow());
    renderTable();
  });
  root.querySelectorAll('.qt-addcol').forEach((btn) =>
    btn.addEventListener('click', () => {
      const key = btn.dataset.addcol;
      if (columns.some((c) => c.key === key)) return;
      const def = OPTIONAL_COLUMNS.find((c) => c.key === key);
      if (def) columns.push({ ...def, removable: true });
      renderTable();
    }),
  );
  root.querySelector('#qtAddCustom').addEventListener('click', () => {
    const label = (prompt('Column name (e.g. Remarks, HUID, Rate)') || '').trim();
    if (!label) return;
    columns.push({ key: `c${++colSeq}`, label, type: 'text', removable: true });
    renderTable();
  });

  // ---- Load / new / status --------------------------------------------------
  const setStatusTag = (status) => {
    if (!status) {
      statusTag.hidden = true;
      return;
    }
    statusTag.hidden = false;
    statusTag.textContent = status === 'final' ? 'Saved' : 'Draft';
    statusTag.className = `qt-status-tag ${status === 'final' ? 'is-final' : 'is-draft'}`;
  };

  const loadInto = (q) => {
    currentId = q.id;
    currentStatus = q.status || 'draft';
    columns = (Array.isArray(q.columns) && q.columns.length ? q.columns : PRESET_COLUMNS).map((c) => ({
      ...c,
      removable: !PRESET_COLUMNS.some((p) => p.key === c.key),
    }));
    rows = (Array.isArray(q.rows) && q.rows.length ? q.rows : [{}]).map((r) => makeRow(r.values || {}, r.h || null));
    customerInput.value = q.customer || '';
    dateInput.value = q.quote_date || today;
    notesInput.value = q.notes ?? DEFAULT_NOTES;
    setStatusTag(q.status);
    renderTable();
  };

  root.querySelector('#qtNew').addEventListener('click', () => {
    resetBuilder();
    customerInput.value = '';
    dateInput.value = today;
    notesInput.value = DEFAULT_NOTES;
    setStatusTag(null);
    renderTable();
  });

  // Serialise the builder to a persistable payload.
  const payloadFor = (status) => ({
    customer: customerInput.value.trim() || null,
    quote_date: dateInput.value || today,
    status,
    notes: notesInput.value,
    columns: columns.map(({ key, label, type, width }) => ({ key, label, type, ...(width ? { width } : {}) })),
    rows: rows.map((r) => ({ values: r.values, ...(r.h ? { h: r.h } : {}) })),
  });

  const save = async (status, btn) => {
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const payload = payloadFor(status);
      const rec = currentId ? await updateQuotation(currentId, payload) : await insertQuotation(payload);
      currentId = rec.id;
      currentStatus = rec.status;
      setStatusTag(rec.status);
      await refreshSaved();
    } catch (err) {
      alert(`Could not save the quotation: ${err.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  };
  root.querySelector('#qtSaveDraft').addEventListener('click', (e) => save('draft', e.currentTarget));
  root.querySelector('#qtSave').addEventListener('click', (e) => save('final', e.currentTarget));

  // ---- Right pane: saved library -------------------------------------------
  const filtered = () => (sideFilter === 'all' ? saved : saved.filter((q) => q.status === sideFilter));

  const rowsSummary = (q) => (Array.isArray(q.rows) ? q.rows : []).filter((r) => String(r.values?.name || '').trim());

  const itemsPanelHtml = (q) => {
    const items = rowsSummary(q);
    if (!items.length) return `<p class="qt-items-empty">No named items in this quotation.</p>`;
    return `
      <label class="qt-pick-all"><input type="checkbox" class="qt-pick-master" checked /> Select all (${items.length})</label>
      <div class="qt-pick-list">
        ${items
          .map(
            (r, i) => `
          <label class="qt-pick">
            <input type="checkbox" class="qt-pick-item" data-i="${i}" checked />
            <span class="qt-pick-name">${esc(r.values.name)}</span>
            <span class="qt-pick-meta">T ${esc(touchStr(r))}${r.values.making ? ` · MC ${esc(r.values.making)}` : ''}</span>
          </label>`,
          )
          .join('')}
      </div>
      <button class="dash-btn qt-pick-add" data-move="${q.id}" type="button">Move selected to current</button>`;
  };

  const renderSide = () => {
    const list = filtered();
    if (!list.length) {
      sideList.innerHTML = `<p class="qt-side-empty">No ${sideFilter === 'all' ? '' : sideFilter + ' '}quotations yet.</p>`;
      return;
    }
    sideList.innerHTML = list
      .map((q) => {
        const items = rowsSummary(q);
        const open = openCards.has(q.id);
        return `
        <div class="qt-card${q.id === currentId ? ' is-current' : ''}" data-id="${q.id}">
          <div class="qt-card-top">
            <span class="qt-card-for">${q.customer ? esc(q.customer) : 'Untitled quotation'}</span>
            <span class="qt-badge ${q.status === 'final' ? 'is-final' : 'is-draft'}">${q.status === 'final' ? 'Final' : 'Draft'}</span>
          </div>
          <div class="qt-card-sub">${esc(formatDate(q.quote_date))} · ${items.length} item${items.length === 1 ? '' : 's'}</div>
          <button class="qt-items-toggle" data-toggle="${q.id}" type="button" aria-expanded="${open}">
            <span class="qt-caret">${open ? '▾' : '▸'}</span> Items (${items.length})
          </button>
          <div class="qt-picker"${open ? '' : ' hidden'}>${open ? itemsPanelHtml(q) : ''}</div>
          <div class="qt-card-btns">
            <button class="qt-mini" data-open="${q.id}" type="button">Open</button>
            <button class="qt-mini" data-dl="${q.id}" type="button"${items.length ? '' : ' disabled'}>Download</button>
            <button class="qt-mini qt-mini--danger" data-del="${q.id}" type="button">Delete</button>
          </div>
        </div>`;
      })
      .join('');
  };

  const refreshSaved = async () => {
    try {
      saved = await fetchQuotations();
    } catch (err) {
      sideList.innerHTML = `<p class="qt-side-empty">Could not load: ${esc(err.message)}</p>`;
      return;
    }
    renderSide();
  };

  root.querySelector('#qtFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('.qt-fbtn');
    if (!btn) return;
    sideFilter = btn.dataset.filter;
    root.querySelectorAll('.qt-fbtn').forEach((b) => b.classList.toggle('is-active', b === btn));
    renderSide();
  });

  sideList.addEventListener('click', async (e) => {
    const toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      const id = toggle.dataset.toggle;
      if (openCards.has(id)) openCards.delete(id);
      else openCards.add(id);
      renderSide();
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) {
      const q = saved.find((x) => x.id === open.dataset.open);
      if (q) {
        loadInto(q);
        renderSide();
      }
      return;
    }
    const move = e.target.closest('[data-move]');
    if (move) {
      const q = saved.find((x) => x.id === move.dataset.move);
      if (!q) return;
      const card = move.closest('.qt-card');
      const items = rowsSummary(q);
      const chosen = [...card.querySelectorAll('.qt-pick-item')].filter((cb) => cb.checked).map((cb) => Number(cb.dataset.i));
      if (!chosen.length) {
        alert('Select at least one item to move.');
        return;
      }
      chosen.forEach((i) => rows.push(makeRow(items[i].values, items[i].h || null)));
      renderTable();
      root.querySelector('#qtSheet')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const orig = move.textContent;
      move.textContent = `Added ${chosen.length} item${chosen.length === 1 ? '' : 's'} ✓`;
      setTimeout(() => {
        move.textContent = orig;
      }, 1400);
      return;
    }
    const dl = e.target.closest('[data-dl]');
    if (dl) {
      const q = saved.find((x) => x.id === dl.dataset.dl);
      if (q) withButton(dl, '…', async () => downloadPdf(savedSource(q)));
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const q = saved.find((x) => x.id === del.dataset.del);
      if (!q) return;
      if (!confirm(`Delete this ${q.status === 'final' ? '' : 'draft '}quotation${q.customer ? ` for ${q.customer}` : ''}? This cannot be undone.`)) return;
      try {
        await deleteQuotation(q.id);
        openCards.delete(q.id);
        if (currentId === q.id) {
          currentId = null;
          setStatusTag(null);
        }
        await refreshSaved();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    }
  });

  // "Select all" master checkbox inside an expanded card.
  sideList.addEventListener('change', (e) => {
    const master = e.target.closest('.qt-pick-master');
    if (!master) return;
    master.closest('.qt-picker').querySelectorAll('.qt-pick-item').forEach((cb) => {
      cb.checked = master.checked;
    });
  });

  refreshSaved();

  // ---- Vector PDF (jsPDF + autoTable) --------------------------------------
  async function fetchAsDataUrl(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }
  // Rasterise the SVG logo at high resolution (only the logo is an image — all
  // text/lines stay vector, so the document is crisp at any zoom).
  async function loadLogo(displayW) {
    const svgUrl = await fetchAsDataUrl('/logo.svg');
    const img = new Image();
    img.src = svgUrl;
    await img.decode();
    const ratio = img.naturalHeight && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1115 / 1713;
    const scale = 5;
    const w = Math.round(displayW * scale);
    const h = Math.round(w * ratio);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return { dataUrl: c.toDataURL('image/png'), w: displayW, h: displayW * ratio };
  }

  // A "source" is everything needed to render a PDF, decoupled from the live DOM
  // so we can export the builder OR any saved quotation from the library.
  const builderSource = () => ({
    columns,
    rows,
    customer: customerInput.value.trim(),
    quoteDate: dateInput.value || today,
    notes: notesInput.value,
  });
  const savedSource = (q) => ({
    columns: Array.isArray(q.columns) && q.columns.length ? q.columns : PRESET_COLUMNS,
    rows: Array.isArray(q.rows) ? q.rows : [],
    customer: q.customer || '',
    quoteDate: q.quote_date || today,
    notes: q.notes ?? '',
  });

  const generatePdf = async (source) => {
    const model = buildPrintModel(source.columns, source.rows);
    if (!model) {
      alert('This quotation has no line-items to export yet. Add at least one row with a name/details, then try again.');
      return null;
    }
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const margin = 42;
    let y = 40;

    try {
      const logo = await loadLogo(140);
      pdf.addImage(logo.dataUrl, 'PNG', (pageW - logo.w) / 2, y, logo.w, logo.h);
      y += logo.h + 10;
    } catch {
      /* logo optional */
    }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(90);
    pdf.text(ADDRESS_TOP[0], pageW / 2, y, { align: 'center' });
    y += 12;
    // Last address line: phones left corner, city centred, email right corner.
    drawContactRow(pdf, margin, pageW, y, ADDRESS_TOP[1]);
    y += 12;
    y += 6;
    pdf.setDrawColor(214);
    pdf.line(margin, y, pageW - margin, y);
    y += 17;
    pdf.setFontSize(15);
    pdf.setTextColor(26);
    pdf.text('QUOTATION', pageW / 2, y, { align: 'center' });
    y += 7;
    pdf.setDrawColor(214);
    pdf.line(margin, y, pageW - margin, y);
    y += 18;

    pdf.setFontSize(10);
    pdf.setTextColor(45);
    if (source.customer) pdf.text(`To: ${source.customer}`, margin, y);
    pdf.text(`Date: ${formatDate(source.quoteDate)}`, pageW - margin, y, { align: 'right' });
    y += 8;

    autoTable(pdf, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [model.usedCols.map((c) => String(c.label).toUpperCase())],
      body: model.usedRows.map((r) => model.usedCols.map((c) => cellText(c, r))),
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 6, lineColor: [201, 188, 193], lineWidth: 0.6, textColor: [26, 26, 26] },
      headStyles: { fillColor: [240, 232, 234], textColor: [74, 59, 66], fontStyle: 'bold', halign: 'center', lineColor: [201, 188, 193], lineWidth: 0.6 },
      alternateRowStyles: { fillColor: [250, 247, 248] },
    });

    let afterY = (pdf.lastAutoTable?.finalY || y) + 22;
    const notes = (source.notes || '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (notes.length) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(74, 59, 66);
      pdf.text('Notes', margin, afterY);
      afterY += 6;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(90);
      notes.forEach((n) => {
        const wrapped = pdf.splitTextToSize(`•  ${n}`, pageW - 2 * margin);
        afterY += 13;
        pdf.text(wrapped, margin, afterY);
        afterY += (wrapped.length - 1) * 11;
      });
    }
    return pdf;
  };

  const filenameFor = (source) => {
    const who = (source.customer || '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
    return `KPS-Quotation${who ? '-' + who : ''}-${source.quoteDate}.pdf`;
  };

  const withButton = async (btn, label, fn) => {
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try {
      await fn();
    } catch (err) {
      if (isChunkLoadError(err) && reloadForStaleChunk()) return;
      alert(`Could not build the PDF (${err?.message || err}). Please try again.`);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  };

  const downloadPdf = async (source) => {
    const pdf = await generatePdf(source);
    if (!pdf) return;
    pdf.save(filenameFor(source));
  };

  const sharePdf = async (source) => {
    const pdf = await generatePdf(source);
    if (!pdf) return;
    const name = filenameFor(source);
    const blob = pdf.output('blob');
    const file = new File([blob], name, { type: 'application/pdf' });
    const shareData = {
      title: 'KPS Silver — Quotation',
      text: source.customer ? `Quotation for ${source.customer} — KPS Silver` : 'Quotation — KPS Silver',
    };
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ ...shareData, files: [file] });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    pdf.save(name);
    alert('Sharing files isn’t supported on this device, so the PDF has been downloaded. Attach it in WhatsApp or email to share.');
  };

  // Downloading/sharing always persists the current quotation first, even if the
  // admin never pressed Save/Save draft — so nothing that goes out is ever lost.
  const autosaveBuilder = async () => {
    if (!buildPrintModel(columns, rows)) return; // nothing worth saving yet
    try {
      const payload = payloadFor(currentStatus || 'draft');
      const rec = currentId ? await updateQuotation(currentId, payload) : await insertQuotation(payload);
      currentId = rec.id;
      currentStatus = rec.status;
      setStatusTag(rec.status);
      await refreshSaved();
    } catch (err) {
      console.warn('[KPS] quotation autosave failed:', err.message);
    }
  };

  root.querySelector('#qtDownload').addEventListener('click', (e) =>
    withButton(e.currentTarget, 'Preparing…', async () => {
      await autosaveBuilder();
      await downloadPdf(builderSource());
    }),
  );
  root.querySelector('#qtShare').addEventListener('click', (e) =>
    withButton(e.currentTarget, 'Preparing…', async () => {
      await autosaveBuilder();
      await sharePdf(builderSource());
    }),
  );
}
