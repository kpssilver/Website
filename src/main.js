// =============================================================================
// APP ENTRY
// 1. Load the (split) stylesheet.
// 2. Render every section into #app.
// 3. Wire up all the motion/interactions.
// Vite hot-reloads this graph on save — edit any section/style and the
// browser updates instantly.
// =============================================================================
import './styles/index.css';
import { renderPage } from './sections/index.js';
import { initInteractions } from './interactions/animations.js';
import { initContact } from './interactions/contact.js';
import { initAnalytics } from './analytics/tracker.js';
import { applyContent, applyContentMap } from './content/apply.js';

// Two special modes used by the admin Content Manager (never real visitors):
//   ?kpsedit=1     → live-edit preview inside the admin (admin drives content)
//   ?kpspreview=1  → full-tab preview of unsaved edits (read from localStorage)
const params = new URLSearchParams(window.location.search);
const editMode = params.has('kpsedit');
const previewMode = params.has('kpspreview');

const app = document.getElementById('app');
app.innerHTML = renderPage();

// Sections are in the DOM now — wire the contact chooser and the motion.
initContact();
initInteractions();

if (previewMode) {
  // Show the admin's unsaved edits, passed via localStorage.
  try {
    const raw = localStorage.getItem('kps_preview_overrides');
    if (raw) applyContentMap(JSON.parse(raw));
  } catch {
    /* ignore malformed preview payload */
  }
} else if (!editMode) {
  // Normal visit: apply saved content overrides from Supabase.
  applyContent();
}

// Analytics only for real visitors — never for the admin's own previews.
if (!editMode && !previewMode) {
  initAnalytics();
}

// In edit mode the admin injects its own overrides + edit affordances; expose
// a flag it can check.
if (editMode) window.__kpsEditMode = true;
