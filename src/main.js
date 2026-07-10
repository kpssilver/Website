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
import { applyContent } from './content/apply.js';

const app = document.getElementById('app');
app.innerHTML = renderPage();

// Sections are in the DOM now — wire the contact chooser and the motion.
initContact();
initInteractions();

// Apply any admin-edited content (titles, body text, images) over the
// built-in defaults. Runs async; the page shows defaults until it resolves.
applyContent();

// Visitor analytics: location (with consent), time-on-section and interactions.
// Degrades silently if Supabase env vars aren't set.
initAnalytics();
