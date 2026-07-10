// =============================================================================
// CONTENT MANAGER (WYSIWYG)
// Shows the real landing page in a live preview iframe with click-to-edit:
//   • Every editable heading, sub-heading, body copy, button label, link/URL
//     and image is exposed in the side editor AND clickable in the preview.
//   • Edits preview live (in the iframe) before saving.
//   • Images show the current photo with replace / add.
//   • "Preview ↗" opens a full-tab preview of the unsaved edits.
// Saved values persist to public.site_content; images to the site-images
// bucket. Values reset to default are removed so the code default takes over.
// =============================================================================
import { supabase } from '../config/supabase.js';
import {
  contentGroups,
  contentFields,
  fieldByKey,
  cd,
  nl2br,
  isHtmlField,
  isMultilineField,
} from '../content/schema.js';

const IMAGE_BUCKET = 'site-images';
const PREVIEW_KEY = 'kps_preview_overrides';

const EDIT_CSS = `
[data-intro], .rv, [data-split] { opacity: 1 !important; transform: none !important; filter: none !important; }
.kps-editable { cursor: pointer !important; }
.kps-editable:hover { outline: 2px solid #E9BCA9 !important; outline-offset: 2px; background: rgba(233,188,169,0.10) !important; }
#kps-badge { position: absolute; z-index: 99999; background: #E9BCA9; color: #2E060B; font: 600 11px/1 Mulish, sans-serif; padding: 5px 8px; border-radius: 6px; cursor: pointer; box-shadow: 0 6px 16px rgba(0,0,0,.45); display: inline-flex; gap: 4px; align-items: center; }
#kps-badge[hidden] { display: none; }
`;

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function defaultForSave(field) {
  return field.type === 'image' ? '' : field.default ?? '';
}

async function fetchOverrides() {
  const { data, error } = await supabase.from('site_content').select('key, value');
  if (error) throw error;
  return new Map((data || []).map((r) => [r.key, r.value]));
}

// --- Editor field markup -----------------------------------------------------
function fieldMarkup(f, working) {
  const has = working.has(f.key);
  const val = has ? working.get(f.key) : f.default;

  if (f.type === 'image') {
    const custom = has && working.get(f.key);
    return `
    <div class="cm-field" data-field="${f.key}" data-type="image">
      <label>${esc(f.label)}</label>
      <div class="cm-img-row">
        <img class="cm-img-preview" data-thumb alt="" src="${esc(custom || '')}" />
        <div class="cm-img-actions">
          <input type="hidden" class="cm-value" value="${esc(custom || '')}" />
          <span class="cm-img-tag" data-tag>${custom ? 'Custom image' : 'Built-in image'}</span>
          <label class="cm-upload-btn"><input type="file" accept="image/*" class="cm-file" hidden /> Replace / add</label>
          <button type="button" class="cm-reset" ${custom ? '' : 'disabled'}>Reset</button>
          <span class="cm-status" aria-live="polite"></span>
        </div>
      </div>
    </div>`;
  }

  const control =
    f.type === 'textarea'
      ? `<textarea class="cm-value" rows="3">${esc(val)}</textarea>`
      : `<input type="text" class="cm-value" value="${esc(val)}" />`;

  const hint =
    f.type === 'url' ? '<span class="cm-hint">· link / URL</span>' : f.html ? '<span class="cm-hint">· basic HTML</span>' : '';

  return `
    <div class="cm-field" data-field="${f.key}" data-type="${f.type}">
      <label>${esc(f.label)} ${hint}</label>
      ${control}
      <button type="button" class="cm-reset cm-reset--text">Reset</button>
    </div>`;
}

function viewMarkup(working) {
  const groups = contentGroups
    .map(
      (g) => `
    <details class="cm-group" open>
      <summary>${esc(g.group)}</summary>
      <div class="cm-group-body">${g.fields.map((f) => fieldMarkup(f, working)).join('')}</div>
    </details>`,
    )
    .join('');

  return `
  <div class="cm">
    <aside class="cm-editor">
      <div class="cm-editor-head">
        <h2>Website content</h2>
        <p class="cm-lede">Click anything in the preview — or a field here — to edit. Changes preview live and only go live when you Save.</p>
      </div>
      <div class="cm-fields">${groups}</div>
    </aside>

    <section class="cm-preview">
      <div class="cm-preview-bar">
        <div class="cm-view-toggle" id="cmViewToggle">
          <button class="chip is-active" data-view="desktop" type="button">Desktop</button>
          <button class="chip" data-view="mobile" type="button">Mobile</button>
        </div>
        <span class="cm-save-status" id="cmStatus"></span>
        <button class="dash-btn dash-btn--ghost" id="cmPreviewTab" type="button">Preview ↗</button>
        <button class="dash-btn dash-btn--ghost" id="cmRevert" type="button">Revert</button>
        <button class="dash-btn" id="cmSave" type="button">Save changes</button>
      </div>
      <div class="cm-frame-holder" id="cmFrameHolder">
        <iframe id="cmFrame" title="Live preview" src="/?kpsedit=1"></iframe>
      </div>
    </section>
  </div>`;
}

export async function renderContent(root, session) {
  root.innerHTML = `<div class="cm-loading">Loading content…</div>`;

  let saved;
  try {
    saved = await fetchOverrides();
  } catch (err) {
    root.innerHTML = `<p class="empty">Could not load content: ${esc(err.message)}</p>`;
    return;
  }

  const working = new Map(saved); // overrides only (defaults omitted)
  const origImg = {}; // key -> built-in image src (captured from the iframe)

  root.innerHTML = viewMarkup(working);

  const frame = root.querySelector('#cmFrame');
  const statusEl = root.querySelector('#cmStatus');
  const getDoc = () => {
    try {
      return frame.contentDocument;
    } catch {
      return null;
    }
  };

  const markStatus = (msg, tone = '') => {
    statusEl.textContent = msg;
    statusEl.className = `cm-save-status ${tone}`;
  };

  // --- Apply one key's current effective value into the preview iframe -------
  const applyKeyToFrame = (key) => {
    const doc = getDoc();
    if (!doc) return;
    const f = fieldByKey(key);
    if (!f) return;

    if (f.type === 'image') {
      const val = working.get(key) || origImg[key] || '';
      doc.querySelectorAll(`[data-ck-img="${key}"]`).forEach((el) => {
        if (val) {
          el.src = val;
          el.removeAttribute('srcset');
        }
      });
      return;
    }
    if (f.type === 'url') {
      const val = working.has(key) ? working.get(key) : f.default;
      doc.querySelectorAll(`[data-ck-href="${key}"]`).forEach((el) => el.setAttribute('href', val));
      return;
    }
    const val = working.has(key) ? working.get(key) : f.default;
    doc.querySelectorAll(`[data-ck="${key}"]`).forEach((el) => {
      if (isMultilineField(key)) el.innerHTML = nl2br(val);
      else if (isHtmlField(key)) el.innerHTML = val;
      else el.textContent = val;
    });
  };

  const setWorking = (key, value) => {
    const f = fieldByKey(key);
    if (value === defaultForSave(f)) working.delete(key);
    else working.set(key, value);
    applyKeyToFrame(key);
    markStatus('Unsaved changes', 'is-dirty');
  };

  // --- Highlight + scroll a field into view (from preview clicks) -----------
  const focusField = (key) => {
    const fieldEl = root.querySelector(`.cm-field[data-field="${key}"]`);
    if (!fieldEl) return;
    const details = fieldEl.closest('details');
    if (details) details.open = true;
    root.querySelectorAll('.cm-field.is-focused').forEach((el) => el.classList.remove('is-focused'));
    fieldEl.classList.add('is-focused');
    fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = fieldEl.querySelector('textarea, input[type="text"]');
    if (input) input.focus();
  };

  // --- Wire the side editor fields ------------------------------------------
  root.querySelectorAll('.cm-field').forEach((fieldEl) => {
    const key = fieldEl.dataset.field;
    const type = fieldEl.dataset.type;

    if (type === 'image') {
      const fileInput = fieldEl.querySelector('.cm-file');
      const hidden = fieldEl.querySelector('.cm-value');
      const thumb = fieldEl.querySelector('[data-thumb]');
      const tag = fieldEl.querySelector('[data-tag]');
      const statusInline = fieldEl.querySelector('.cm-status');
      const resetBtn = fieldEl.querySelector('.cm-reset');

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        statusInline.textContent = 'Uploading…';
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${key.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from(IMAGE_BUCKET)
          .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type || undefined });
        if (error) {
          statusInline.textContent = `Failed: ${error.message}`;
          return;
        }
        const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
        hidden.value = data.publicUrl;
        thumb.src = data.publicUrl;
        tag.textContent = 'Custom image';
        resetBtn.disabled = false;
        statusInline.textContent = 'Uploaded ✓';
        setWorking(key, data.publicUrl);
      });

      resetBtn.addEventListener('click', () => {
        hidden.value = '';
        thumb.src = origImg[key] || '';
        tag.textContent = 'Built-in image';
        resetBtn.disabled = true;
        statusInline.textContent = '';
        setWorking(key, '');
      });
      return;
    }

    const input = fieldEl.querySelector('.cm-value');
    input.addEventListener('input', () => setWorking(key, input.value));
    fieldEl.querySelector('.cm-reset').addEventListener('click', () => {
      input.value = fieldByKey(key).default ?? '';
      setWorking(key, input.value);
    });
  });

  // --- Inject click-to-edit affordances into the preview --------------------
  const injectEditAffordances = (doc) => {
    if (doc.getElementById('kps-edit-style')) return; // once per load
    const style = doc.createElement('style');
    style.id = 'kps-edit-style';
    style.textContent = EDIT_CSS;
    doc.head.appendChild(style);

    const badge = doc.createElement('div');
    badge.id = 'kps-badge';
    badge.hidden = true;
    badge.innerHTML = '✎ Edit';
    doc.body.appendChild(badge);

    let hoveredKey = null;
    const keyOf = (el) => el.dataset.ck || el.dataset.ckImg || el.dataset.ckHref;

    const positionBadge = (el) => {
      const win = doc.defaultView;
      const r = el.getBoundingClientRect();
      badge.style.top = `${r.top + win.scrollY - 12}px`;
      badge.style.left = `${r.left + win.scrollX}px`;
      badge.hidden = false;
    };

    doc.querySelectorAll('[data-ck], [data-ck-img], [data-ck-href]').forEach((el) => {
      el.classList.add('kps-editable');
      el.addEventListener('mouseenter', () => {
        hoveredKey = keyOf(el);
        positionBadge(el);
      });
      el.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          const k = keyOf(el);
          if (k) focusField(k);
        },
        true,
      );
    });

    badge.addEventListener('click', () => {
      if (hoveredKey) focusField(hoveredKey);
    });
    doc.addEventListener('scroll', () => (badge.hidden = true), true);
  };

  // --- On iframe load: capture built-in images, apply edits, add affordances -
  const onFrameLoad = () => {
    const doc = getDoc();
    if (!doc) return;

    doc.querySelectorAll('[data-ck-img]').forEach((el) => {
      origImg[el.dataset.ckImg] = el.getAttribute('src');
    });

    // Reflect current working edits in the preview.
    working.forEach((_v, k) => applyKeyToFrame(k));

    // Fill image field thumbnails that are showing the built-in photo.
    root.querySelectorAll('.cm-field[data-type="image"]').forEach((fieldEl) => {
      const key = fieldEl.dataset.field;
      const thumb = fieldEl.querySelector('[data-thumb]');
      if (!working.get(key) && origImg[key]) thumb.src = origImg[key];
    });

    injectEditAffordances(doc);
  };

  frame.addEventListener('load', onFrameLoad);

  // --- Toolbar --------------------------------------------------------------
  root.querySelectorAll('#cmViewToggle .chip').forEach((chip) =>
    chip.addEventListener('click', () => {
      root.querySelectorAll('#cmViewToggle .chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      root.querySelector('#cmFrameHolder').classList.toggle('is-mobile', chip.dataset.view === 'mobile');
    }),
  );

  root.querySelector('#cmPreviewTab').addEventListener('click', () => {
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(Object.fromEntries(working)));
    } catch {
      /* ignore */
    }
    window.open('/?kpspreview=1', '_blank', 'noopener');
  });

  root.querySelector('#cmRevert').addEventListener('click', () => {
    renderContent(root, session); // reload from last-saved state
  });

  root.querySelector('#cmSave').addEventListener('click', async () => {
    const btn = root.querySelector('#cmSave');
    btn.disabled = true;
    markStatus('Saving…');

    const now = new Date().toISOString();
    const uid = session?.user?.id || null;
    const toUpsert = [];
    const toDelete = [];

    contentFields.forEach((f) => {
      const v = working.get(f.key);
      if (v === undefined || v === defaultForSave(f)) toDelete.push(f.key);
      else toUpsert.push({ key: f.key, value: v, updated_at: now, updated_by: uid });
    });

    try {
      if (toUpsert.length) {
        const { error } = await supabase.from('site_content').upsert(toUpsert, { onConflict: 'key' });
        if (error) throw error;
      }
      if (toDelete.length) {
        const { error } = await supabase.from('site_content').delete().in('key', toDelete);
        if (error) throw error;
      }
      markStatus(`Saved ✓ ${new Date().toLocaleTimeString()}`, 'is-saved');
    } catch (err) {
      console.error('[KPS] content save failed:', err);
      markStatus(`Save failed: ${err.message}`, 'is-error');
    } finally {
      btn.disabled = false;
    }
  });
}
