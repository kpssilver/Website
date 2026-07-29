// =============================================================================
// QUOTATION PDF + SHARED MODEL
// The constants, helpers and the vector (jsPDF + autoTable) PDF generator used
// by BOTH the admin builder (src/admin/quotations.js) and the public share-link
// viewer (src/quote/main.js). Keeping this in one place guarantees the exported
// PDF and the on-screen sheet look identical everywhere.
// =============================================================================

export const ADDRESS_TOP = [
  'No.905, Nagarathpet Main Road, (Near Mahaveer Medical)',
  'Bengaluru - 560002',
];
export const CONTACT = {
  phones: [
    { display: '8660784494', tel: '+918660784494' },
    { display: '9945971150', tel: '+919945971150' },
  ],
  email: 'kpssilver@gmail.com',
};
export const ADDRESS_HTML = ADDRESS_TOP[0];
export const PHONE_SVG =
  '<svg class="qt-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="10.5" y1="18.5" x2="13.5" y2="18.5"/></svg>';
export const MAIL_SVG =
  '<svg class="qt-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/></svg>';
// Contact row shares the last address line: phones on the left corner, the city
// centred, and the email on the right corner.
export const CONTACT_BAR_HTML =
  `<span class="qt-contact-l">${PHONE_SVG}<span>${CONTACT.phones
    .map((p) => `<a href="tel:${p.tel}">${p.display}</a>`)
    .join(' / ')}</span></span>` +
  `<span class="qt-contact-c">${esc(ADDRESS_TOP[1])}</span>` +
  `<span class="qt-contact-r">${MAIL_SVG}<a href="mailto:${CONTACT.email}">${CONTACT.email}</a></span>`;
const PDF_LINK = [40, 82, 160]; // link colour for tappable contacts in the PDF

export const DEFAULT_NOTES = [
  'This quotation is valid for 7 days from the date mentioned above.',
  'Final weight and purity are confirmed at the time of billing.',
  'For any clarification, please reach us on the phone number or email above.',
].join('\n');

export const PRESET_COLUMNS = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'purity', label: 'Purity', type: 'number' },
  { key: 'plus', label: 'Plus', type: 'number' },
  { key: 'touch', label: 'Touch', type: 'computed' },
  { key: 'making', label: 'MAKING CHARGES/Kg', type: 'number' },
];
export const OPTIONAL_COLUMNS = [
  { key: 'gross_weight', label: 'Gross weight', type: 'number' },
  { key: 'price', label: 'Price', type: 'number' },
  { key: 'gst', label: 'GST', type: 'number' },
];

export function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export const toNum = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
export const fmtNum = (n) => String(Number(Number(n).toFixed(3)));
export const titleCase = (s) => String(s).replace(/(^|\s)(\p{L})/gu, (_, sp, ch) => sp + ch.toUpperCase());
export function formatDate(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
export const defaultWidth = (col) => (col.key === 'name' ? 200 : col.type === 'number' ? 110 : 140);

export const touchStr = (row) => fmtNum(toNum(row.values.purity) + toNum(row.values.plus));
export const cellText = (col, row) => (col.type === 'computed' ? touchStr(row) : row.values[col.key] ?? '');

// Pure helpers (take explicit columns/rows) so the same logic drives the live
// builder AND any saved quotation we export straight from the library.
export const isRowBlank = (row, cols) =>
  cols.every((c) => {
    if (c.type === 'computed') return true;
    const v = String(row.values?.[c.key] ?? '').trim();
    if (v === '') return true;
    if (c.key === 'purity' && Number(v) === 92.5) return true;
    return false;
  });
export const isColBlank = (col, used) => {
  if (col.type === 'computed') {
    return used.every((r) => String(r.values?.purity ?? '').trim() === '' && String(r.values?.plus ?? '').trim() === '');
  }
  return used.every((r) => String(r.values?.[col.key] ?? '').trim() === '');
};
export const buildPrintModel = (cols, rws) => {
  const usedRows = rws.filter((r) => !isRowBlank(r, cols));
  if (!usedRows.length) return null;
  const usedCols = cols.filter((c) => !isColBlank(c, usedRows));
  if (!usedCols.length) return null;
  return { usedRows, usedCols };
};

// --- PDF drawing helpers -----------------------------------------------------
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
function drawContactRow(pdf, margin, pageW, y, city) {
  const gap = 4;
  let x = drawPhoneIcon(pdf, margin, y) + gap;
  CONTACT.phones.forEach((p, i) => {
    x = drawLink(pdf, p.display, x, y, `tel:${p.tel}`);
    if (i < CONTACT.phones.length - 1) {
      pdf.setTextColor(90);
      pdf.text(' / ', x, y);
      x += pdf.getTextWidth(' / ');
    }
  });
  pdf.setTextColor(90);
  pdf.text(city, pageW / 2, y, { align: 'center' });
  const mailIconW = 11;
  const ew = pdf.getTextWidth(CONTACT.email);
  const startX = pageW - margin - (mailIconW + gap + ew);
  const afterIcon = drawMailIcon(pdf, startX, y) + gap;
  drawLink(pdf, CONTACT.email, afterIcon, y, `mailto:${CONTACT.email}`);
}

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

// A "source" is everything needed to render a PDF: { columns, rows, customer,
// quoteDate, notes }. Returns a jsPDF instance, or null if the quotation has no
// non-blank line-items to export.
export async function generateQuotationPdf(source) {
  const model = buildPrintModel(source.columns, source.rows);
  if (!model) return null;

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
}

export function quotationFilename(source) {
  const who = (source.customer || '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
  return `KPS-Quotation${who ? '-' + who : ''}-${source.quoteDate}.pdf`;
}
