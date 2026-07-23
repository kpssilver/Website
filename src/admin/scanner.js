// =============================================================================
// CAMERA BARCODE SCANNER (+ optional tag OCR)
// Opens a modal with the device camera and decodes barcodes (Code128 tags,
// plus QR/EAN) using ZXing. Calls onResult(text, details) with the first
// decoded value, then closes.
//
// When opened with { ocr: true } it ALSO reads the printed text on the tag
// (weight + design number) from a captured frame using Tesseract.js, and
// returns them in `details` so the caller can auto-fill a new product.
// Used by the stock search, the invoice item picker, and Scan & register.
// =============================================================================
import { BrowserMultiFormatReader } from '@zxing/browser';

// Pull the readable fields off a tag's OCR text. Tolerant of common OCR slips
// (Wt/W1/Wl, missing colons, comma decimals, "D No" vs "D.No").
export function parseTagText(text) {
  const out = {};
  const t = String(text || '').replace(/[\r\n]+/g, ' ');
  // Weight: "Wt: 12.345 g" or a decimal number immediately followed by g.
  const wm =
    t.match(/w\s*[t1l|][\s:.=]*([0-9]{1,4}[.,][0-9]{1,3})/i) ||
    t.match(/([0-9]{1,4}[.,][0-9]{1,3})\s*g\b/i);
  if (wm) {
    const w = parseFloat(wm[1].replace(',', '.'));
    if (Number.isFinite(w) && w > 0 && w < 100000) out.weight = w;
  }
  // Design number: "D.No: ABC-123".
  const dm = t.match(/d[.\s]*no[.:\s=]*([a-z0-9][a-z0-9\-/]{0,24})/i);
  if (dm) out.design_no = dm[1].toUpperCase();
  return out;
}

// Grab the current video frame into a canvas for still-image decoding / OCR.
function grabFrame(video) {
  const c = document.createElement('canvas');
  c.width = video.videoWidth || 720;
  c.height = video.videoHeight || 540;
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c;
}

// Run OCR over a canvas and return the parsed tag fields. Tesseract.js is
// lazy-loaded so it never weighs down the main bundle.
async function ocrTag(canvas) {
  const Tesseract = (await import('tesseract.js')).default;
  const { data } = await Tesseract.recognize(canvas, 'eng');
  return parseTagText(data?.text || '');
}

export function openScanner(onResult, opts = {}) {
  const { ocr = false } = opts;

  const holder = document.createElement('div');
  holder.className = 'scan-backdrop';
  holder.innerHTML = `
    <div class="scan-modal" role="dialog" aria-modal="true" aria-label="Scan a barcode">
      <div class="scan-head">
        <h3>${ocr ? 'Scan tag' : 'Scan barcode'}</h3>
        <button type="button" class="pm-x" id="scanClose" aria-label="Close">✕</button>
      </div>
      <div class="scan-video-wrap">
        <video id="scanVideo" muted playsinline></video>
        <div class="scan-reticle"></div>
      </div>
      <p class="scan-status" id="scanStatus">${
        ocr
          ? 'Fill the frame with the tag. It reads the QR code and the printed weight &amp; design number.'
          : 'Point the camera at the tag barcode…'
      }</p>
      ${ocr ? '<button type="button" class="dash-btn" id="scanCapture">Read tag now</button>' : ''}
    </div>`;
  document.body.appendChild(holder);

  const video = holder.querySelector('#scanVideo');
  const status = holder.querySelector('#scanStatus');
  const captureBtn = holder.querySelector('#scanCapture');
  const reader = new BrowserMultiFormatReader();
  let controls = null;
  let done = false;
  let working = false;
  let lastCode = '';

  const close = () => {
    if (done) return;
    done = true;
    try {
      controls?.stop();
    } catch {
      /* already stopped */
    }
    document.removeEventListener('keydown', onKey);
    holder.remove();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);
  holder.querySelector('#scanClose').addEventListener('click', close);
  holder.addEventListener('click', (e) => {
    if (e.target === holder) close();
  });

  // Finish: capture the frame, OCR it (in ocr mode), then hand back the result.
  const finish = async (code) => {
    if (done || working) return;
    if (!ocr) {
      close();
      onResult(code, {});
      return;
    }
    working = true;
    if (captureBtn) captureBtn.disabled = true;
    let details = {};
    try {
      const frame = grabFrame(video);
      status.textContent = 'Reading the tag text…';
      details = await ocrTag(frame);
    } catch {
      /* OCR unavailable/failed — still return whatever code we have */
    }
    close();
    onResult(code || '', details);
  };

  if (captureBtn) captureBtn.addEventListener('click', () => finish(lastCode));

  reader
    .decodeFromVideoDevice(undefined, video, (result, err, ctrl) => {
      controls = ctrl;
      if (result && !done && !working) {
        const text = result.getText();
        if (ocr) {
          // Remember the code and read the text off the same tag automatically.
          lastCode = text;
          status.textContent = 'Barcode read ✓ — reading text…';
          finish(text);
        } else {
          close();
          onResult(text, {});
        }
      }
    })
    .then((ctrl) => {
      controls = ctrl;
    })
    .catch((err) => {
      status.textContent =
        err?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access and try again.'
          : `Could not start the camera: ${err?.message || err}. You can still type the code.`;
      status.classList.add('is-error');
    });
}
