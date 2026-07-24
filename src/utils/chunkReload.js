// =============================================================================
// STALE-CHUNK RELOAD
// Vite code-splits heavy libraries (jsPDF, html2canvas, Tesseract, ZXing) into
// hashed chunks that are loaded on demand with import(). When the site is
// redeployed, those hashes change and the old files are removed. A tab that was
// opened before the deploy still references the OLD hashes, so the first lazy
// import 404s with "Failed to fetch dynamically imported module".
//
// The fix is to reload the page ONCE so the browser fetches the fresh index +
// current chunk graph. A session flag guards against reload loops when a chunk
// is genuinely missing (in which case callers fall back to their own handling).
// =============================================================================
const FLAG = 'kps_chunk_reloaded';

export function isChunkLoadError(err) {
  const msg = String((err && (err.message || err.toString?.())) || err || '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|dynamically imported module|Loading chunk|ChunkLoadError/i.test(
    msg,
  );
}

// Reload once to pick up freshly deployed assets. Returns true if a reload was
// triggered (caller should stop and let the page refresh), false if we already
// reloaded this session (caller should fall back to its own error handling).
export function reloadForStaleChunk() {
  try {
    if (sessionStorage.getItem(FLAG)) return false;
    sessionStorage.setItem(FLAG, '1');
  } catch {
    // Storage unavailable (private mode) — reload anyway; worst case is a loop
    // the user can break by closing the tab.
  }
  window.location.reload();
  return true;
}

// Install a global safety net so ANY failed lazy import triggers the one-time
// reload. Call preventDefault so Vite doesn't also log an unhandled error.
export function installChunkReload() {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForStaleChunk()) e.preventDefault();
  });
}
