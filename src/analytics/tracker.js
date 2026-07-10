// =============================================================================
// ANALYTICS TRACKER
// Records, for every visit:
//   • a visitor_sessions row (device, context, location, total active time)
//   • section_views rows (active seconds spent looking at each page section)
//   • page_events rows (CTA / WhatsApp / call / directions / nav interactions)
//
// Time is only counted while the tab is actually visible, and data is flushed
// on a heartbeat plus on page-hide so numbers survive the visitor leaving.
// Everything degrades silently if Supabase isn't configured.
// =============================================================================
import { supabase, isSupabaseConfigured } from '../config/supabase.js';
import { collectContext } from './device.js';
import { requestLocationConsent } from './consent.js';
import { resolveLocation } from './location.js';

// The page sections we care about, mapped to their DOM selectors.
const SECTION_SELECTORS = {
  hero: '.hero',
  showcase: '#showcase',
  collections: '#collections',
  heritage: '#heritage',
  occasions: '#occasions',
  promise: '#promise',
  visit: '#visit',
};

const HEARTBEAT_MS = 10000;

const state = {
  sessionKey: null,
  started: false,
  activeSeconds: 0,
  sectionSeconds: {},
  sectionCounts: {},
  currentSection: null,
  ratios: {},
  dirtySections: new Set(),
};

function makeSessionKey() {
  try {
    const existing = sessionStorage.getItem('kps_session_key');
    if (existing) return existing;
    const key =
      crypto.randomUUID?.() ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem('kps_session_key', key);
    return key;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

// ---- Session lifecycle ------------------------------------------------------
// Both create and patch go through the same SECURITY DEFINER upsert RPC, which
// is the only visitor-facing write path (anon has no direct table access).
async function createSession() {
  const context = collectContext();
  const { error } = await supabase.rpc('track_session', {
    p: { session_key: state.sessionKey, ...context },
  });
  if (error) console.warn('[KPS] session create failed:', error.message);
}

async function patchSession(patch) {
  const { error } = await supabase.rpc('track_session', {
    p: { session_key: state.sessionKey, ...patch },
  });
  if (error) console.warn('[KPS] session patch failed:', error.message);
}

// ---- Section time tracking --------------------------------------------------
function observeSections() {
  const entries = Object.entries(SECTION_SELECTORS)
    .map(([name, sel]) => [name, document.querySelector(sel)])
    .filter(([, el]) => el);

  if (!entries.length) return;

  const elToName = new Map(entries.map(([name, el]) => [el, name]));

  const observer = new IntersectionObserver(
    (obs) => {
      obs.forEach((entry) => {
        const name = elToName.get(entry.target);
        state.ratios[name] = entry.isIntersecting ? entry.intersectionRatio : 0;
      });
      recomputeCurrentSection();
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );

  entries.forEach(([, el]) => observer.observe(el));
}

function recomputeCurrentSection() {
  let best = null;
  let bestRatio = 0;
  for (const [name, ratio] of Object.entries(state.ratios)) {
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = name;
    }
  }
  if (best && best !== state.currentSection) {
    state.currentSection = best;
    state.sectionCounts[best] = (state.sectionCounts[best] || 0) + 1;
    state.dirtySections.add(best);
  }
}

// One tick per second — accrue active time only while the tab is visible.
function tick() {
  if (document.hidden) return;
  state.activeSeconds += 1;
  const s = state.currentSection;
  if (s) {
    state.sectionSeconds[s] = (state.sectionSeconds[s] || 0) + 1;
    state.dirtySections.add(s);
  }
}

// ---- Flushing ---------------------------------------------------------------
async function flush() {
  if (!state.sessionKey) return;

  await patchSession({ total_time_seconds: state.activeSeconds });

  if (state.dirtySections.size) {
    const rows = [...state.dirtySections].map((section) => ({
      section,
      time_spent_seconds: state.sectionSeconds[section] || 0,
      view_count: state.sectionCounts[section] || 1,
    }));
    state.dirtySections.clear();
    const { error } = await supabase.rpc('track_sections', {
      p_session: state.sessionKey,
      p_sections: rows,
    });
    if (error) console.warn('[KPS] section flush failed:', error.message);
  }
}

// ---- Discrete events --------------------------------------------------------
export async function trackEvent(eventType, label = null, section = null) {
  if (!isSupabaseConfigured || !state.sessionKey) return;
  const { error } = await supabase.rpc('track_event', {
    p_session: state.sessionKey,
    p_type: eventType,
    p_label: label,
    p_section: section || state.currentSection,
  });
  if (error) console.warn('[KPS] event failed:', error.message);
}

function classifyClick(target) {
  const contactBtn = target.closest('[data-contact]');
  if (contactBtn) return { type: 'contact_open', label: contactBtn.textContent?.trim().slice(0, 60) };

  const link = target.closest('a[href]');
  if (link) {
    const href = link.getAttribute('href') || '';
    if (href.startsWith('tel:')) return { type: 'call_click', label: href.replace('tel:', '') };
    if (/wa\.me|whatsapp/i.test(href)) return { type: 'whatsapp_click', label: 'WhatsApp' };
    if (/google\.[a-z.]+\/maps/i.test(href)) return { type: 'directions_click', label: 'Google Maps' };
    if (href.startsWith('#')) return { type: 'nav_click', label: href.slice(1) };
  }
  return null;
}

function wireEventTracking() {
  document.addEventListener(
    'click',
    (e) => {
      const hit = classifyClick(e.target);
      if (hit) trackEvent(hit.type, hit.label);
    },
    { capture: true },
  );
}

// ---- Public entry -----------------------------------------------------------
export async function initAnalytics() {
  if (!isSupabaseConfigured) return;
  if (state.started) return;
  state.started = true;

  state.sessionKey = makeSessionKey();

  await createSession();

  observeSections();
  wireEventTracking();

  setInterval(tick, 1000);
  setInterval(() => {
    flush();
  }, HEARTBEAT_MS);

  // Flush promptly when the visitor backgrounds or leaves the page.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });
  window.addEventListener('pagehide', () => {
    flush();
  });

  // Resolve location in the background so it never blocks the page.
  (async () => {
    const allowPrecise = await requestLocationConsent();
    const locationPatch = await resolveLocation({ allowPrecise });
    if (locationPatch && Object.keys(locationPatch).length) {
      await patchSession(locationPatch);
    }
  })();
}
