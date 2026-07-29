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
  ensureShareToken,
} from '../data/quotations.js';
import {
  ADDRESS_HTML,
  CONTACT_BAR_HTML,
  DEFAULT_NOTES,
  PRESET_COLUMNS,
  OPTIONAL_COLUMNS,
  esc,
  titleCase,
  formatDate,
  defaultWidth,
  touchStr,
  buildPrintModel,
  generateQuotationPdf,
  quotationFilename,
} from '../data/quotationPdf.js';

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
            <button class="qt-mini" data-link="${q.id}" type="button"${items.length ? '' : ' disabled'}>Copy link</button>
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
    const link = e.target.closest('[data-link]');
    if (link) {
      const q = saved.find((x) => x.id === link.dataset.link);
      if (!q) return;
      const orig = link.textContent;
      link.disabled = true;
      link.textContent = 'Copying…';
      try {
        const token = await ensureShareToken(q.id, q.share_token);
        q.share_token = token;
        const url = `${location.origin}/quote?t=${token}`;
        try {
          await navigator.clipboard.writeText(url);
          link.textContent = 'Link copied ✓';
        } catch {
          window.prompt('Copy this shareable quotation link:', url);
          link.textContent = orig;
        }
      } catch (err) {
        alert(`Could not create a share link: ${err.message}`);
        link.textContent = orig;
      } finally {
        link.disabled = false;
        setTimeout(() => {
          link.textContent = orig;
        }, 1600);
      }
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

  // ---- Vector PDF (jsPDF + autoTable, shared with the public viewer) --------
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
    const pdf = await generateQuotationPdf(source);
    if (!pdf) {
      alert('This quotation has no line-items to export yet. Add at least one row with a name/details, then try again.');
      return null;
    }
    return pdf;
  };

  const filenameFor = quotationFilename;

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
