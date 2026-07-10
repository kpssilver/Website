// =============================================================================
// CONTENT APPLY
// On the public site, fetch any admin-saved content overrides and apply them
// to elements tagged with [data-ck] (text/html) or [data-ck-img] (image src).
// Elements without a saved override simply keep their built-in default, so the
// page renders correctly even before this async fetch resolves.
// =============================================================================
import { supabase, isSupabaseConfigured } from '../config/supabase.js';
import { isHtmlField } from './schema.js';

export async function applyContent() {
  if (!isSupabaseConfigured) return;

  const { data, error } = await supabase.from('site_content').select('key, value');
  if (error || !data) return;

  const map = new Map(data.map((r) => [r.key, r.value]));

  document.querySelectorAll('[data-ck]').forEach((el) => {
    const key = el.dataset.ck;
    const val = map.get(key);
    if (val == null || val === '') return;
    if (isHtmlField(key)) el.innerHTML = val;
    else el.textContent = val;
  });

  document.querySelectorAll('[data-ck-img]').forEach((el) => {
    const val = map.get(el.dataset.ckImg);
    if (val) {
      el.src = val;
      el.srcset = '';
    }
  });
}
