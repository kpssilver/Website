// =============================================================================
// CONTENT MANAGER (WYSIWYG)
// Shows the real landing page in a live preview iframe with in-place editing:
//   • Text / headings / body / labels are editable directly in the preview
//     (contenteditable) AND from the side panel — the two stay in sync.
//   • Images and link URLs are edited from the side panel (click opens them).
//   • Edits are kept as a draft (sessionStorage) so they survive any re-render
//     or tab switch, and preview live before saving.
//   • Saving is a safe diff: it upserts current overrides and only deletes
//     overrides the admin explicitly removed — it never mass-deletes.
// =============================================================================
import { supabase } from '../config/supabase.js';
import {
  contentGroups,
  contentFields,
  fieldByKey,
  nl2br,
  isHtmlField,
  isMultilineField,
} from '../content/schema.js';
import { defaultShowcase, showcaseSlidesHtml, parseShowcaseItems } from '../data/showcase.js';

const IMAGE_BUCKET = 'site-images';
const STORAGE_MARKER = '/storage/v1/object/public/';
const PREVIEW_KEY = 'kps_preview_overrides';
const DRAFT_KEY = 'kps_content_draft';

const EDIT_CSS = `
[data-intro], .rv, [data-split] { opacity: 1 !important; transform: none !important; filter: none !important; }
.kps-editable { cursor: pointer !important; }
.kps-editable:hover { outline: 2px dashed rgba(233,188,169,.65) !important; outline-offset: 2px; }
.kps-editable[contenteditable="true"] { cursor: text !important; }
.kps-editable[contenteditable="true"]:focus { outline: 2px solid #E9BCA9 !important; outline-offset: 2px; background: rgba(233,188,169,0.10) !important; }
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

async function uploadToBucket(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `showcase-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage
    .from(IMAGE_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Copy a bundled/built-in image URL into storage so it persists across deploys.
async function uploadUrlToBucket(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  const name = (url.split('/').pop() || 'image.webp').split('?')[0];
  const file = new File([blob], name, { type: blob.type || 'image/webp' });
  return uploadToBucket(file);
}

function readDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    // Keep only keys we still know about.
    const entries = Object.entries(obj).filter(([k]) => fieldByKey(k));
    return new Map(entries);
  } catch {
    return null;
  }
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

  if (f.type === 'gallery') {
    return `
    <div class="cm-field cm-field--gallery" data-field="${f.key}" data-type="gallery">
      <label>${esc(f.label)}</label>
      <p class="cm-hint">Add, remove, reorder or re-caption the homepage “In Focus” carousel slides.</p>
      <div class="cm-gallery" data-gallery></div>
      <div class="cm-gallery-actions">
        <label class="cm-upload-btn"><input type="file" accept="image/*" multiple class="cm-gallery-file" hidden /> Add image(s)</label>
        <button type="button" class="cm-reset" data-gallery-reset>Reset to built-in</button>
      </div>
      <span class="cm-status" data-gallery-status aria-live="polite"></span>
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
        <p class="cm-lede">Click text in the preview to edit it in place, or use the fields here. Images &amp; links are edited from these fields. Changes preview live and only go live when you Save.</p>
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

  // Unsaved edits from a previous render (tab switch / reload) take precedence,
  // so nothing is ever lost between editing and saving.
  const draft = readDraft();
  const working = draft ? new Map(draft) : new Map(saved);
  const origImg = {}; // key -> built-in image src (captured from the iframe)
  // Working copy of the showcase gallery (from override, else built-in defaults).
  let galleryItems = (parseShowcaseItems(working.get('showcase.items')) || defaultShowcase).map((x) => ({
    img: x.img,
    title: x.title || '',
    tag: x.tag || '',
  }));

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
  if (draft && draft.size) markStatus('Unsaved changes', 'is-dirty');

  const persistDraft = () => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(Object.fromEntries(working)));
    } catch {
      /* storage full / unavailable — non-fatal */
    }
  };

  // --- Write one key's effective value into the preview iframe ---------------
  const applyKeyToFrame = (key) => {
    const doc = getDoc();
    if (!doc) return;
    const f = fieldByKey(key);
    if (!f) return;

    if (f.type === 'gallery') {
      const items = parseShowcaseItems(working.get(key)) || defaultShowcase;
      const track = doc.querySelector('.showcase-track');
      if (track) {
        track.innerHTML = showcaseSlidesHtml(items);
        const w = doc.defaultView;
        if (w && typeof w.__kpsInitShowcase === 'function') w.__kpsInitShowcase();
      }
      return;
    }

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
      if (el === doc.activeElement) return; // don't clobber the caret while typing
      if (isMultilineField(key)) el.innerHTML = nl2br(val);
      else if (isHtmlField(key)) el.innerHTML = val;
      else el.textContent = val;
    });
  };

  // --- Keep the side-panel input in sync (skips the one being typed in) ------
  const syncSideInput = (key, value) => {
    const input = root.querySelector(`.cm-field[data-field="${key}"] .cm-value`);
    if (input && input !== document.activeElement) input.value = value;
  };

  // --- Single source of truth for a value change -----------------------------
  const setWorking = (key, value) => {
    const f = fieldByKey(key);
    if (value === defaultForSave(f)) working.delete(key);
    else working.set(key, value);
    persistDraft();
    applyKeyToFrame(key);
    syncSideInput(key, value);
    markStatus('Unsaved changes', 'is-dirty');
  };

  // --- Highlight + reveal a field in the side panel --------------------------
  const focusField = (key) => {
    const fieldEl = root.querySelector(`.cm-field[data-field="${key}"]`);
    if (!fieldEl) return;
    const details = fieldEl.closest('details');
    if (details) details.open = true;
    root.querySelectorAll('.cm-field.is-focused').forEach((el) => el.classList.remove('is-focused'));
    fieldEl.classList.add('is-focused');
    fieldEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const input = fieldEl.querySelector('textarea, input[type="text"], .cm-upload-btn');
    if (input && input.focus) input.focus();
  };

  // --- Showcase gallery editor ----------------------------------------------
  const wireGallery = (fieldEl) => {
    const wrap = fieldEl.querySelector('[data-gallery]');
    const fileInput = fieldEl.querySelector('.cm-gallery-file');
    const status = fieldEl.querySelector('[data-gallery-status]');
    const resetBtn = fieldEl.querySelector('[data-gallery-reset]');

    const commit = () => setWorking('showcase.items', JSON.stringify(galleryItems));

    const renderRows = () => {
      wrap.innerHTML = galleryItems.length
        ? galleryItems
            .map(
              (it, i) => `
        <div class="cm-gitem" data-i="${i}">
          <img src="${esc(it.img)}" alt="" />
          <div class="cm-gitem-fields">
            <input class="cm-gtitle" type="text" placeholder="Title (e.g. Standing Deepam)" value="${esc(it.title)}" />
            <input class="cm-gtag" type="text" placeholder="Tag (e.g. Lamps & Diyas)" value="${esc(it.tag)}" />
          </div>
          <div class="cm-gitem-btns">
            <button type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
            <button type="button" data-down="${i}" ${i === galleryItems.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            <button type="button" data-rm="${i}" aria-label="Remove">✕</button>
          </div>
        </div>`,
            )
            .join('')
        : '<p class="cm-hint">No slides yet — add at least one image.</p>';

      wrap.querySelectorAll('.cm-gtitle').forEach((inp) =>
        inp.addEventListener('input', () => {
          galleryItems[Number(inp.closest('.cm-gitem').dataset.i)].title = inp.value;
          commit();
        }),
      );
      wrap.querySelectorAll('.cm-gtag').forEach((inp) =>
        inp.addEventListener('input', () => {
          galleryItems[Number(inp.closest('.cm-gitem').dataset.i)].tag = inp.value;
          commit();
        }),
      );
      wrap.querySelectorAll('[data-rm]').forEach((b) =>
        b.addEventListener('click', () => {
          galleryItems.splice(Number(b.dataset.rm), 1);
          commit();
          renderRows();
        }),
      );
      wrap.querySelectorAll('[data-up]').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.up);
          [galleryItems[i - 1], galleryItems[i]] = [galleryItems[i], galleryItems[i - 1]];
          commit();
          renderRows();
        }),
      );
      wrap.querySelectorAll('[data-down]').forEach((b) =>
        b.addEventListener('click', () => {
          const i = Number(b.dataset.down);
          [galleryItems[i + 1], galleryItems[i]] = [galleryItems[i], galleryItems[i + 1]];
          commit();
          renderRows();
        }),
      );
    };
    renderRows();

    fileInput.addEventListener('change', async () => {
      const files = [...fileInput.files];
      if (!files.length) return;
      status.textContent = `Uploading ${files.length} image(s)…`;
      try {
        for (const file of files) {
          const url = await uploadToBucket(file);
          galleryItems.push({ img: url, title: '', tag: '' });
        }
        commit();
        renderRows();
        status.textContent = 'Uploaded ✓';
      } catch (err) {
        status.textContent = `Upload failed: ${err.message}`;
      }
      fileInput.value = '';
    });

    resetBtn.addEventListener('click', () => {
      galleryItems = defaultShowcase.map((x) => ({ img: x.img, title: x.title || '', tag: x.tag || '' }));
      working.delete('showcase.items');
      persistDraft();
      applyKeyToFrame('showcase.items');
      markStatus('Unsaved changes', 'is-dirty');
      renderRows();
    });
  };

  // --- Wire the side editor fields ------------------------------------------
  root.querySelectorAll('.cm-field').forEach((fieldEl) => {
    const key = fieldEl.dataset.field;
    const type = fieldEl.dataset.type;

    if (type === 'gallery') {
      wireGallery(fieldEl);
      return;
    }

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
      const def = fieldByKey(key).default ?? '';
      input.value = def;
      setWorking(key, def);
    });
  });

  // --- Read a value out of a contenteditable preview element -----------------
  const readEl = (el, key) => {
    if (isHtmlField(key)) return el.innerHTML.trim();
    if (isMultilineField(key)) return el.innerText.replace(/\u00a0/g, ' ').replace(/\n{2,}/g, '\n').trim();
    return el.textContent.replace(/\s+/g, ' ').trim();
  };

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
    const positionBadge = (el) => {
      const win = doc.defaultView;
      const r = el.getBoundingClientRect();
      badge.style.top = `${r.top + win.scrollY - 12}px`;
      badge.style.left = `${r.left + win.scrollX}px`;
      badge.hidden = false;
    };

    // Text — editable in place.
    doc.querySelectorAll('[data-ck]').forEach((el) => {
      const key = el.dataset.ck;
      const f = fieldByKey(key);
      if (!f) return;
      el.classList.add('kps-editable');

      // Flatten any GSAP letter-split so editing/caret behaves normally.
      if (!isHtmlField(key) && !isMultilineField(key)) {
        el.textContent = working.has(key) ? working.get(key) : f.default;
      }

      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'false');
      // If the element is (or is inside) a link, stop navigation on click.
      el.addEventListener('click', (e) => {
        if (el.closest('a')) e.preventDefault();
      });
      el.addEventListener('mouseenter', () => positionBadge(el));
      el.addEventListener('focus', () => {
        hoveredKey = key;
        const fieldEl = root.querySelector(`.cm-field[data-field="${key}"]`);
        if (fieldEl) {
          root.querySelectorAll('.cm-field.is-focused').forEach((x) => x.classList.remove('is-focused'));
          fieldEl.classList.add('is-focused');
          const d = fieldEl.closest('details');
          if (d) d.open = true;
        }
      });
      const onEdit = () => setWorking(key, readEl(el, key));
      el.addEventListener('input', onEdit);
      el.addEventListener('blur', onEdit);
    });

    // Images and pure link URLs — click opens the side field.
    doc.querySelectorAll('[data-ck-img], [data-ck-href]').forEach((el) => {
      const key = el.dataset.ckImg || el.dataset.ckHref;
      if (!key || el.hasAttribute('data-ck')) return; // text handler already owns it
      el.classList.add('kps-editable');
      el.addEventListener('mouseenter', () => {
        hoveredKey = key;
        positionBadge(el);
      });
      el.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          focusField(key);
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

    injectEditAffordances(doc);

    // Reflect current working edits in the preview.
    working.forEach((_v, k) => applyKeyToFrame(k));

    // Fill image thumbnails that are showing the built-in photo.
    root.querySelectorAll('.cm-field[data-type="image"]').forEach((fieldEl) => {
      const key = fieldEl.dataset.field;
      const thumb = fieldEl.querySelector('[data-thumb]');
      if (!working.get(key) && origImg[key]) thumb.src = origImg[key];
    });
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
    if (!confirm('Discard all unsaved changes?')) return;
    try {
      sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    renderContent(root, session); // reload from last-saved state
  });

  root.querySelector('#cmSave').addEventListener('click', async () => {
    const btn = root.querySelector('#cmSave');
    btn.disabled = true;
    markStatus('Saving…');

    const now = new Date().toISOString();
    const uid = session?.user?.id || null;

    // Normalise the showcase gallery: built-in/bundled image URLs aren't stable
    // across deploys, so copy any non-storage image into the bucket first.
    if (working.has('showcase.items')) {
      try {
        const items = JSON.parse(working.get('showcase.items'));
        let changed = false;
        for (const it of items) {
          if (it.img && !it.img.includes(STORAGE_MARKER)) {
            it.img = await uploadUrlToBucket(it.img);
            changed = true;
          }
        }
        if (changed) {
          working.set('showcase.items', JSON.stringify(items));
          galleryItems = items;
        }
      } catch (err) {
        console.error('[KPS] gallery normalise failed:', err);
        markStatus(`Save failed: could not process gallery images (${err.message})`, 'is-error');
        btn.disabled = false;
        return;
      }
    }

    // Safe diff: upsert current overrides; delete only overrides that were
    // saved before but the admin has since removed. Never mass-delete defaults.
    const toUpsert = [];
    working.forEach((v, key) => {
      const f = fieldByKey(key);
      if (f && v !== undefined && v !== defaultForSave(f)) {
        toUpsert.push({ key, value: v, updated_at: now, updated_by: uid });
      }
    });
    const toDelete = [];
    saved.forEach((_v, key) => {
      const f = fieldByKey(key);
      if (!working.has(key) || working.get(key) === defaultForSave(f)) toDelete.push(key);
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
      // Success — this is now the saved baseline; clear the draft.
      saved.clear();
      working.forEach((v, k) => saved.set(k, v));
      try {
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
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
