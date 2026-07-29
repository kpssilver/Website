// =============================================================================
// PUBLIC QUOTATION VIEWER  (/quote?t=<share_token>)
// A read-only, mobile-friendly view of a quotation shared by an admin. Reads the
// record through the anon-safe SECURITY DEFINER RPC (get_shared_quotation) and
// renders it with the SAME model + PDF generator as the admin builder, so what a
// customer sees and downloads matches the admin's copy exactly.
// =============================================================================
import '../styles/quote.css';
import { fetchSharedQuotation } from '../data/quotations.js';
import {
  ADDRESS_HTML,
  CONTACT_BAR_HTML,
  PRESET_COLUMNS,
  esc,
  formatDate,
  cellText,
  buildPrintModel,
  generateQuotationPdf,
  quotationFilename,
} from '../data/quotationPdf.js';

const root = document.getElementById('quote-root');

function shell(inner) {
  root.innerHTML = `<div class="qv-wrap">${inner}</div>`;
}

function messageView(title, body) {
  shell(`
    <div class="qv-msg">
      <img class="qv-msg-logo" src="/logo.svg" alt="KPS Silver" />
      <h1>${esc(title)}</h1>
      <p>${esc(body)}</p>
    </div>`);
}

function sourceFrom(q) {
  return {
    columns: Array.isArray(q.columns) && q.columns.length ? q.columns : PRESET_COLUMNS,
    rows: Array.isArray(q.rows) ? q.rows : [],
    customer: q.customer || '',
    quoteDate: q.quote_date || new Date().toISOString().slice(0, 10),
    notes: q.notes ?? '',
  };
}

function tableHtml(model) {
  const head = model.usedCols.map((c) => `<th>${esc(String(c.label).toUpperCase())}</th>`).join('');
  const body = model.usedRows
    .map(
      (r) => `<tr>${model.usedCols.map((c) => `<td>${esc(cellText(c, r))}</td>`).join('')}</tr>`,
    )
    .join('');
  return `<table class="qv-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function notesHtml(notes) {
  const list = (notes || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (!list.length) return '';
  return `
    <div class="qv-notes">
      <h3>Notes</h3>
      <ul>${list.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    </div>`;
}

function renderQuotation(q) {
  const source = sourceFrom(q);
  const model = buildPrintModel(source.columns, source.rows);

  shell(`
    <div class="qv-actionbar">
      <button class="qv-btn" id="qvDownload" type="button"${model ? '' : ' disabled'}>Download PDF</button>
    </div>
    <article class="qv-sheet">
      <header class="qv-head">
        <img class="qv-logo" src="/logo.svg" alt="KPS Silver" />
        <div class="qv-addr">${ADDRESS_HTML}</div>
        <div class="qt-contact-bar">${CONTACT_BAR_HTML}</div>
      </header>
      <h2 class="qv-title">Quotation</h2>
      <div class="qv-meta">
        ${source.customer ? `<span><span class="qv-meta-lbl">To</span> ${esc(source.customer)}</span>` : '<span></span>'}
        <span><span class="qv-meta-lbl">Date</span> ${esc(formatDate(source.quoteDate))}</span>
      </div>
      ${model ? tableHtml(model) : '<p class="qv-empty">This quotation has no line-items yet.</p>'}
      ${notesHtml(source.notes)}
    </article>`);

  const dl = document.getElementById('qvDownload');
  if (dl && model) {
    dl.addEventListener('click', async () => {
      const orig = dl.textContent;
      dl.disabled = true;
      dl.textContent = 'Preparing…';
      try {
        const pdf = await generateQuotationPdf(source);
        if (pdf) pdf.save(quotationFilename(source));
      } catch (err) {
        alert(`Could not build the PDF (${err?.message || err}). Please try again.`);
      } finally {
        dl.disabled = false;
        dl.textContent = orig;
      }
    });
  }
}

async function boot() {
  const token = new URLSearchParams(location.search).get('t');
  if (!token) {
    messageView('Quotation not found', 'This link is missing its quotation reference. Please ask KPS Silver to share the link again.');
    return;
  }
  shell('<div class="qv-loading">Loading quotation…</div>');
  try {
    const q = await fetchSharedQuotation(token);
    if (!q) {
      messageView('Quotation unavailable', 'This quotation link is invalid or has been withdrawn. Please contact KPS Silver for an updated link.');
      return;
    }
    document.title = `Quotation${q.customer ? ` · ${q.customer}` : ''} · KPS Silver`;
    renderQuotation(q);
  } catch (err) {
    messageView('Could not load quotation', err?.message || 'Something went wrong. Please try again later.');
  }
}

boot();
