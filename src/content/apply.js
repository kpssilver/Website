// =============================================================================
// CONTENT APPLY
// Applies admin-saved content overrides to the page. Elements are tagged with:
//   • data-ck       → text / HTML / multiline copy
//   • data-ck-img   → image src
//   • data-ck-href  → link URL (href)
// Elements without a saved override keep their built-in default, so the page
// renders correctly even before the async fetch resolves.
// =============================================================================
import { supabase, isSupabaseConfigured } from '../config/supabase.js';
import { isHtmlField, isMultilineField, nl2br } from './schema.js';
import { showcaseSlidesHtml, parseShowcaseItems } from '../data/showcase.js';
import { initShowcase } from '../interactions/animations.js';

// Rebuild the showcase carousel from a saved gallery and re-init its behaviour.
function applyShowcaseGallery(raw) {
  const items = parseShowcaseItems(raw);
  if (!items) return;
  const track = document.querySelector('.showcase-track');
  if (!track) return;
  track.innerHTML = showcaseSlidesHtml(items);
  initShowcase();
}

// Apply a key→value map of overrides to the current document.
export function applyContentMap(map) {
  const get = (k) => (map instanceof Map ? map.get(k) : map[k]);

  document.querySelectorAll('[data-ck]').forEach((el) => {
    const key = el.dataset.ck;
    const val = get(key);
    if (val == null || val === '') return;
    if (isMultilineField(key)) el.innerHTML = nl2br(val);
    else if (isHtmlField(key)) el.innerHTML = val;
    else el.textContent = val;
  });

  document.querySelectorAll('[data-ck-img]').forEach((el) => {
    const val = get(el.dataset.ckImg);
    if (val) {
      el.src = val;
      el.removeAttribute('srcset');
    }
  });

  document.querySelectorAll('[data-ck-href]').forEach((el) => {
    const val = get(el.dataset.ckHref);
    if (val) el.setAttribute('href', val);
  });

  applyShowcaseGallery(get('showcase.items'));
}

// Fetch saved overrides from Supabase and apply them (public landing page).
export async function applyContent() {
  if (!isSupabaseConfigured) return;
  const { data, error } = await supabase.from('site_content').select('key, value');
  if (error || !data) return;
  applyContentMap(new Map(data.map((r) => [r.key, r.value])));
}
