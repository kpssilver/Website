// =============================================================================
// CONTENT MANAGER VIEW
// Lets the super admin edit section titles / body text and upload section
// images without touching code. Values that differ from the built-in defaults
// are saved to public.site_content; values reset to default are removed so the
// code default takes over again. Images upload to the 'site-images' bucket.
// =============================================================================
import { supabase } from '../config/supabase.js';
import { contentGroups, contentFields } from '../content/schema.js';

const IMAGE_BUCKET = 'site-images';

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchOverrides() {
  const { data, error } = await supabase.from('site_content').select('key, value');
  if (error) throw error;
  return new Map((data || []).map((r) => [r.key, r.value]));
}

function fieldMarkup(f, currentValue) {
  const val = currentValue ?? '';
  const isOverridden = currentValue != null && currentValue !== '';

  if (f.type === 'image') {
    const preview = val
      ? `<img src="${esc(val)}" alt="" class="cm-img-preview" />`
      : `<div class="cm-img-preview cm-img-preview--empty">Using built-in image</div>`;
    return `
    <div class="cm-field" data-key="${f.key}" data-type="image">
      <label>${esc(f.label)}</label>
      <div class="cm-img-row">
        ${preview}
        <div class="cm-img-actions">
          <input type="hidden" class="cm-value" value="${esc(val)}" data-default="" />
          <label class="cm-upload-btn">
            <input type="file" accept="image/*" class="cm-file" hidden />
            Upload image
          </label>
          <button type="button" class="cm-reset" ${isOverridden ? '' : 'disabled'}>Reset</button>
          <span class="cm-status" aria-live="polite"></span>
        </div>
      </div>
    </div>`;
  }

  const input =
    f.type === 'textarea'
      ? `<textarea class="cm-value" rows="4" data-default="${esc(f.default)}">${esc(val)}</textarea>`
      : `<input type="text" class="cm-value" value="${esc(val)}" data-default="${esc(f.default)}" />`;

  return `
    <div class="cm-field" data-key="${f.key}" data-type="${f.type}">
      <label>${esc(f.label)} ${f.html ? '<span class="cm-hint">· basic HTML allowed</span>' : ''}</label>
      ${input}
      <div class="cm-field-actions">
        <button type="button" class="cm-reset">Reset to default</button>
      </div>
    </div>`;
}

function viewMarkup(overrides) {
  const groups = contentGroups
    .map(
      (g) => `
    <div class="panel cm-group">
      <div class="panel-head"><h2>${esc(g.group)}</h2></div>
      ${g.fields
        .map((f) => fieldMarkup(f, overrides.get(f.key)))
        .join('')}
    </div>`,
    )
    .join('');

  return `
  <div class="view-toolbar cm-toolbar">
    <p class="cm-lede">Edit the words and images on your website. Changes go live after you save (visitors see them on their next page load).</p>
    <div class="cm-toolbar-actions">
      <a class="dash-btn dash-btn--ghost" href="/" target="_blank" rel="noopener">View site ↗</a>
      <span class="cm-save-status" id="cmSaveStatus"></span>
      <button class="dash-btn" id="cmSaveBtn">Save changes</button>
    </div>
  </div>
  <div class="cm-grid">${groups}</div>`;
}

async function uploadImage(key, file, statusEl, valueInput, previewImg) {
  statusEl.textContent = 'Uploading…';
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${key.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
    contentType: file.type || undefined,
  });
  if (error) {
    statusEl.textContent = `Upload failed: ${error.message}`;
    return;
  }
  const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
  valueInput.value = data.publicUrl;
  if (previewImg) {
    previewImg.src = data.publicUrl;
    previewImg.classList.remove('cm-img-preview--empty');
    previewImg.textContent = '';
  }
  statusEl.textContent = 'Uploaded ✓';
}

export async function renderContent(root, session) {
  root.innerHTML = `<div class="cm-loading">Loading content…</div>`;

  let overrides;
  try {
    overrides = await fetchOverrides();
  } catch (err) {
    root.innerHTML = `<p class="empty">Could not load content: ${esc(err.message)}</p>`;
    return;
  }

  root.innerHTML = viewMarkup(overrides);

  // Wire image uploads.
  root.querySelectorAll('.cm-field[data-type="image"]').forEach((field) => {
    const fileInput = field.querySelector('.cm-file');
    const valueInput = field.querySelector('.cm-value');
    const statusEl = field.querySelector('.cm-status');
    const resetBtn = field.querySelector('.cm-reset');
    let preview = field.querySelector('.cm-img-preview');

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      // Swap an empty placeholder div for a real <img> so we can show a preview.
      if (preview && preview.classList.contains('cm-img-preview--empty')) {
        const img = document.createElement('img');
        img.className = 'cm-img-preview';
        img.alt = '';
        preview.replaceWith(img);
        preview = img;
      }
      await uploadImage(field.dataset.key, file, statusEl, valueInput, preview);
      resetBtn.disabled = false;
    });

    resetBtn.addEventListener('click', () => {
      valueInput.value = '';
      if (preview) {
        const empty = document.createElement('div');
        empty.className = 'cm-img-preview cm-img-preview--empty';
        empty.textContent = 'Using built-in image';
        preview.replaceWith(empty);
        preview = empty;
      }
      statusEl.textContent = 'Will reset on save';
      resetBtn.disabled = true;
    });
  });

  // Wire text/textarea reset buttons.
  root.querySelectorAll('.cm-field[data-type="text"], .cm-field[data-type="textarea"]').forEach((field) => {
    const input = field.querySelector('.cm-value');
    const resetBtn = field.querySelector('.cm-reset');
    resetBtn?.addEventListener('click', () => {
      input.value = input.dataset.default || '';
    });
  });

  // Save.
  root.querySelector('#cmSaveBtn').addEventListener('click', async () => {
    const btn = root.querySelector('#cmSaveBtn');
    const statusEl = root.querySelector('#cmSaveStatus');
    btn.disabled = true;
    statusEl.textContent = 'Saving…';

    const toUpsert = [];
    const toDelete = [];
    const now = new Date().toISOString();
    const uid = session?.user?.id || null;

    contentFields.forEach((f) => {
      const field = root.querySelector(`.cm-field[data-key="${CSS.escape(f.key)}"]`);
      if (!field) return;
      const value = field.querySelector('.cm-value').value;
      const isDefault = f.type === 'image' ? value === '' : value === (f.default ?? '');
      if (isDefault) {
        toDelete.push(f.key);
      } else {
        toUpsert.push({ key: f.key, value, updated_at: now, updated_by: uid });
      }
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
      statusEl.textContent = `Saved ✓ ${new Date().toLocaleTimeString()}`;
    } catch (err) {
      console.error('[KPS] content save failed:', err);
      statusEl.textContent = `Save failed: ${err.message}`;
    } finally {
      btn.disabled = false;
    }
  });
}
