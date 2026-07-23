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

// Crop the current frame to the central band (the tag is wide + short), scale
// it down, and boost contrast — smaller + cleaner input makes OCR much faster
// and more accurate than a full-resolution colour frame.
function prepForOcr(video) {
  const vw = video.videoWidth || 720;
  const vh = video.videoHeight || 540;
  const cropW = Math.round(vw * 0.94);
  const cropH = Math.round(vh * 0.6);
  const sx = Math.round((vw - cropW) / 2);
  const sy = Math.round((vh - cropH) / 2);
  const scale = Math.min(1, 1000 / cropW);
  const c = document.createElement('canvas');
  c.width = Math.round(cropW * scale);
  c.height = Math.round(cropH * scale);
  const cx = c.getContext('2d');
  cx.drawImage(video, sx, sy, cropW, cropH, 0, 0, c.width, c.height);
  const im = cx.getImageData(0, 0, c.width, c.height);
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    g = g < 128 ? Math.max(0, g - 45) : Math.min(255, g + 45); // contrast
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  cx.putImageData(im, 0, 0);
  return c;
}

// A single Tesseract worker is created once and reused across scans (creating a
// worker is the slow part). Restricting the page-segmentation mode + charset
// keeps recognition fast. Lazy-loaded so it never weighs down the main bundle.
let ocrWorkerPromise = null;
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng');
      await worker.setParameters({
        tessedit_pageseg_mode: '6', // a single uniform block of text
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.:/- ',
      });
      return worker;
    })().catch((e) => {
      ocrWorkerPromise = null;
      throw e;
    });
  }
  return ocrWorkerPromise;
}

async function ocrTag(video) {
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(prepForOcr(video));
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
      status.textContent = 'Reading the tag text…';
      details = await ocrTag(video);
    } catch {
      /* OCR unavailable/failed — still return whatever code we have */
    }
    close();
    onResult(code || '', details);
  };

  if (captureBtn) captureBtn.addEventListener('click', () => finish(lastCode));
  // Warm up the OCR worker while the user is still aiming, so capture is fast.
  if (ocr) getOcrWorker().catch(() => {});

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
