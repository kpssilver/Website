// =============================================================================
// CAMERA BARCODE SCANNER
// Opens a modal with the device camera and decodes barcodes (Code128 tags,
// plus QR/EAN) using ZXing. Calls onResult(text) with the first decoded value,
// then closes. Used by the stock search and the invoice item picker.
// =============================================================================
import { BrowserMultiFormatReader } from '@zxing/browser';

export function openScanner(onResult) {
  const holder = document.createElement('div');
  holder.className = 'scan-backdrop';
  holder.innerHTML = `
    <div class="scan-modal" role="dialog" aria-modal="true" aria-label="Scan a barcode">
      <div class="scan-head">
        <h3>Scan barcode</h3>
        <button type="button" class="pm-x" id="scanClose" aria-label="Close">✕</button>
      </div>
      <div class="scan-video-wrap">
        <video id="scanVideo" muted playsinline></video>
        <div class="scan-reticle"></div>
      </div>
      <p class="scan-status" id="scanStatus">Point the camera at the tag barcode…</p>
    </div>`;
  document.body.appendChild(holder);

  const video = holder.querySelector('#scanVideo');
  const status = holder.querySelector('#scanStatus');
  const reader = new BrowserMultiFormatReader();
  let controls = null;
  let done = false;

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

  reader
    .decodeFromVideoDevice(undefined, video, (result, err, ctrl) => {
      controls = ctrl;
      if (result && !done) {
        const text = result.getText();
        close();
        onResult(text);
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
