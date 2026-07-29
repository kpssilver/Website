// =============================================================================
// QUOTATIONS
// Build a silver-rate quotation as an editable table, then download or share it
// as a PDF. Preset columns: Name, Purity, Plus, Touch (= Purity + Plus, auto),
// Making charges. New rows default Purity to 92.5. The admin can add more
// columns (Gross weight, Price, GST, or any custom field).
//
// The document header shows the KPS Silver logo centred with the store address
// beneath it. PDF export reuses the same html2canvas + jsPDF approach as the
// catalogue (dynamic-imported so it never weighs down the main bundle).
// =============================================================================
import { isChunkLoadError, reloadForStaleChunk } from '../utils/chunkReload.js';

const ADDRESS_HTML =
  'No.905, Nagarathpet Main Road, (Near Mahaveer Medical)<br>Bengaluru - 560002<br>Ph: 8660784494 / 9945971150 &nbsp;·&nbsp; email: kpssilver@gmail.com';

// Columns that always exist and can't be removed.
const PRESET_COLUMNS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'purity', label: 'Purity', type: 'number' },
  { key: 'plus', label: 'Plus', type: 'number' },
  { key: 'touch', label: 'Touch', type: 'computed' },
  { key: 'making', label: 'Making charges', type: 'number' },
];

// One-click optional columns the admin can add.
const OPTIONAL_COLUMNS = [
  { key: 'gross_weight', label: 'Gross weight', type: 'number' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'gst', label: 'GST', type: 'number' },
];

// Standing terms shown at the foot of every quotation (no pricing claims — we
// don't print prices here).
const FOOTER_POINTS = [
  'This quotation is valid for 7 days from the date mentioned above.',
  'Final weight and purity are confirmed at the time of billing.',
  'For any clarification, please reach us on the phone number or email above.',
];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Trim float noise (92.5 + 5 → 97.5, not 97.50000001) and drop trailing zeros.
const fmtNum = (n) => String(Number(Number(n).toFixed(3)));

function formatDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// -----------------------------------------------------------------------------
export function renderQuotations(root) {
  let colSeq = 0;
  let rowSeq = 0;
  let columns = PRESET_COLUMNS.map((c) => ({ ...c, removable: false }));
  const makeRow = () => ({ id: `r${++rowSeq}`, values: { purity: 92.5, plus: '' } });
  let rows = [makeRow(), makeRow()];

  const touchStr = (row) => fmtNum(toNum(row.values.purity) + toNum(row.values.plus));
  const cellText = (col, row) => {
    if (col.type === 'computed') return touchStr(row);
    return row.values[col.key] ?? '';
  };

  // A row is "blank" (and dropped from the PDF) when it carries no meaningful
  // data — the auto-preset Purity (92.5) and the computed Touch don't count.
  const isRowBlank = (row) =>
    columns.every((c) => {
      if (c.type === 'computed') return true;
      const v = String(row.values[c.key] ?? '').trim();
      if (v === '') return true;
      if (c.key === 'purity' && Number(v) === 92.5) return true;
      return false;
    });
  // A column is "blank" when none of the given rows fill it (Touch survives as
  // long as any row has a Purity or Plus).
  const isColBlank = (col, used) => {
    if (col.type === 'computed') {
      return used.every(
        (r) => String(r.values.purity ?? '').trim() === '' && String(r.values.plus ?? '').trim() === '',
      );
    }
    return used.every((r) => String(r.values[col.key] ?? '').trim() === '');
  };

  const today = new Date().toISOString().slice(0, 10);

  root.innerHTML = `
  <div class="pm">
    <div class="pm-top">
      <div>
        <h2 class="pm-title">Quotations</h2>
        <p class="pm-lede">Build a silver quotation, then download it as a PDF or share it on WhatsApp / email.</p>
      </div>
      <div class="qt-top-btns">
        <button class="dash-btn dash-btn--ghost" id="qtShare" type="button">Share</button>
        <button class="dash-btn" id="qtDownload" type="button">Download PDF</button>
      </div>
    </div>

    <div class="qt-toolbar">
      <button class="dash-btn dash-btn--ghost" id="qtAddRow" type="button">+ Add row</button>
      <span class="qt-toolbar-sep"></span>
      <span class="qt-addcol-lbl">Add column:</span>
      ${OPTIONAL_COLUMNS.map(
        (c) => `<button class="dash-btn dash-btn--ghost qt-addcol" data-addcol="${c.key}" type="button">${esc(c.label)}</button>`,
      ).join('')}
      <button class="dash-btn dash-btn--ghost" id="qtAddCustom" type="button">Custom field…</button>
    </div>

    <div class="qt-sheet" id="qtSheet">
      <header class="qt-head">
        <img class="qt-logo" src="/logo.svg" alt="KPS Silver" />
        <div class="qt-addr">${ADDRESS_HTML}</div>
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
      <label class="qt-note-field">Note (optional)
        <textarea id="qtNote" rows="2" placeholder="Any note to the customer (optional)."></textarea>
      </label>
      <ul class="qt-foot">${FOOTER_POINTS.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    </div>
  </div>`;

  const tableWrap = root.querySelector('#qtTableWrap');
  const customerInput = root.querySelector('#qtCustomer');
  const dateInput = root.querySelector('#qtDate');
  const noteInput = root.querySelector('#qtNote');

  // ---- Editable table -------------------------------------------------------
  const cellInput = (col, row) => {
    if (col.type === 'computed') {
      return `<span class="qt-touch" data-row="${row.id}">${esc(touchStr(row))}</span>`;
    }
    const val = row.values[col.key] ?? '';
    const type = col.type === 'number' ? 'number' : 'text';
    const step = col.type === 'number' ? ' step="0.001"' : '';
    return `<input class="qt-in" data-row="${row.id}" data-col="${col.key}" type="${type}"${step} value="${esc(val)}" />`;
  };

  const renderTable = () => {
    const head = columns
      .map(
        (c) =>
          `<th>${esc(c.label)}${c.removable ? `<button class="qt-col-rm" data-col="${c.key}" type="button" title="Remove column" aria-label="Remove ${esc(c.label)}">✕</button>` : ''}</th>`,
      )
      .join('');
    const body = rows
      .map(
        (r) =>
          `<tr>${columns.map((c) => `<td>${cellInput(c, r)}</td>`).join('')}<td class="qt-rowact"><button class="qt-row-rm" data-row="${r.id}" type="button" title="Remove row" aria-label="Remove row">✕</button></td></tr>`,
      )
      .join('');
    tableWrap.innerHTML = `
      <table class="qt-table">
        <thead><tr>${head}<th class="qt-rowact"></th></tr></thead>
        <tbody>${body}</tbody>
      </table>`;
  };
  renderTable();

  tableWrap.addEventListener('input', (e) => {
    const inp = e.target.closest('.qt-in');
    if (!inp) return;
    const row = rows.find((r) => r.id === inp.dataset.row);
    if (!row) return;
    // Auto-capitalise the first letter of product names as they're typed.
    if (inp.dataset.col === 'name' && inp.value) {
      const capped = inp.value.charAt(0).toUpperCase() + inp.value.slice(1);
      if (capped !== inp.value) {
        const pos = inp.selectionStart;
        inp.value = capped;
        try {
          inp.setSelectionRange(pos, pos);
        } catch {
          /* number/other inputs don't support selection */
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

  root.querySelector('#qtAddRow').addEventListener('click', () => {
    rows.push(makeRow());
    renderTable();
  });

  root.querySelectorAll('.qt-addcol').forEach((btn) =>
    btn.addEventListener('click', () => {
      const key = btn.dataset.addcol;
      if (columns.some((c) => c.key === key)) return; // already added
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

  // ---- PDF build ------------------------------------------------------------
  const PX_W = 794; // ≈ A4 width at 96dpi

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

  // Rows/columns that will actually appear in the PDF (blank ones removed so the
  // quotation stays tidy). Returns null when there's nothing meaningful to show.
  const printModel = () => {
    const usedRows = rows.filter((r) => !isRowBlank(r));
    if (!usedRows.length) return null;
    const usedCols = columns.filter((c) => !isColBlank(c, usedRows));
    if (!usedCols.length) return null;
    return { usedRows, usedCols };
  };

  // A clean, print-styled document built from current state (no inputs, no
  // blank rows/columns).
  const buildPrintSheet = (model) => {
    const customer = customerInput.value.trim();
    const date = formatDate(dateInput.value || today);
    const note = noteInput.value.trim();
    const sheet = document.createElement('div');
    sheet.className = 'qt-print';
    const headRow = model.usedCols.map((c) => `<th>${esc(c.label)}</th>`).join('');
    const bodyRows = model.usedRows
      .map((r) => `<tr>${model.usedCols.map((c) => `<td>${esc(cellText(c, r))}</td>`).join('')}</tr>`)
      .join('');
    sheet.innerHTML = `
      <div class="qt-print-head">
        <img class="qt-print-logo" src="/logo.svg" alt="KPS Silver" />
        <div class="qt-print-addr">${ADDRESS_HTML}</div>
      </div>
      <h2 class="qt-print-title">Quotation</h2>
      <div class="qt-print-meta">
        <span>${customer ? `To: ${esc(customer)}` : ''}</span>
        <span>Date: ${esc(date)}</span>
      </div>
      <table class="qt-print-table">
        <thead><tr>${headRow}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      ${note ? `<p class="qt-print-note">${esc(note)}</p>` : ''}
      <ul class="qt-print-foot">${FOOTER_POINTS.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>`;
    return sheet;
  };

  const nodeToCanvas = async (html2canvas, node) => {
    const stage = document.createElement('div');
    stage.style.cssText = `position:fixed;left:-10000px;top:0;width:${PX_W}px;background:#fff;z-index:-1;`;
    node.style.width = `${PX_W}px`;
    stage.appendChild(node);
    document.body.appendChild(stage);
    try {
      // Inline the logo so html2canvas never trips over the SVG.
      const logo = node.querySelector('.qt-print-logo');
      if (logo) {
        try {
          logo.src = await fetchAsDataUrl('/logo.svg');
        } catch {
          /* leave as-is; useCORS may still capture it */
        }
      }
      return await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    } finally {
      stage.remove();
    }
  };

  const filename = () => `KPS-Quotation-${dateInput.value || today}.pdf`;

  // Returns a jsPDF instance sized to exactly fit the quotation content (a
  // single auto-sized page — no forced A4 whitespace), or null if empty.
  const buildPdf = async () => {
    const model = printModel();
    if (!model) {
      alert('Add at least one row with details before creating the PDF.');
      return null;
    }
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
    const canvas = await nodeToCanvas(html2canvas, buildPrintSheet(model));
    const pageW = 595.28; // A4 width in pt — keeps a familiar document width
    const pageH = (canvas.height * pageW) / canvas.width;
    const pdf = new jsPDF({ unit: 'pt', format: [pageW, pageH], orientation: pageH >= pageW ? 'portrait' : 'landscape' });
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageW, pageH);
    return pdf;
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

  root.querySelector('#qtDownload').addEventListener('click', (e) => {
    withButton(e.currentTarget, 'Preparing…', async () => {
      const pdf = await buildPdf();
      if (!pdf) return;
      pdf.save(filename());
    });
  });

  root.querySelector('#qtShare').addEventListener('click', (e) => {
    withButton(e.currentTarget, 'Preparing…', async () => {
      const pdf = await buildPdf();
      if (!pdf) return;
      const name = filename();
      const blob = pdf.output('blob');
      const file = new File([blob], name, { type: 'application/pdf' });
      const customer = customerInput.value.trim();
      const shareData = {
        title: 'KPS Silver — Quotation',
        text: customer ? `Quotation for ${customer} — KPS Silver` : 'Quotation — KPS Silver',
      };
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ ...shareData, files: [file] });
          return;
        } catch (err) {
          if (err?.name === 'AbortError') return; // user cancelled
        }
      }
      // No file-sharing support (most desktops) — download so it can be attached.
      pdf.save(name);
      alert('Sharing files isn’t supported on this device, so the PDF has been downloaded. Attach it in WhatsApp or email to share.');
    });
  });
}
