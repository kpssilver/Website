// =============================================================================
// COMBO FIELD — a "choose an existing value OR add a new one" control.
// Renders a <select> of known values plus an explicit "➕ Add new…" entry. A
// hidden input carries the resolved value under `name`, so a surrounding
// FormData read still works transparently.
//
// If wireCombos() is given an `onAddNew(kind)` handler and the field declares a
// `kind`, choosing "Add new…" calls that handler (e.g. to open a detail modal
// and persist the new option). Otherwise it falls back to an inline text input.
// =============================================================================
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// `extra` is appended inside the <label> after the text (e.g. an info button).
export function comboField({ name, label, value = '', options = [], required = false, extra = '', colSpan = 1, kind = '' }) {
  const opts = (options || []).map((o) => String(o)).filter(Boolean);
  const known = value !== '' && opts.includes(value);
  const isNew = value !== '' && !known;
  const optionHtml = opts
    .map((o) => `<option value="${esc(o)}" ${known && o === value ? 'selected' : ''}>${esc(o)}</option>`)
    .join('');
  return `
  <label class="pm-lbl${colSpan === 2 ? ' pm-col-2' : ''}">${label}${extra}
    <div class="kps-combo" data-combo${kind ? ` data-kind="${esc(kind)}"` : ''}>
      <select class="kps-combo-sel"${required ? ' data-req="1"' : ''}>
        <option value="">— Select —</option>
        ${optionHtml}
        <option value="__new__" ${isNew ? 'selected' : ''}>➕ Add new…</option>
      </select>
      <input class="kps-combo-new" type="text" placeholder="Type the new ${esc(String(label).replace(/[*].*$/, '').trim())}" value="${isNew ? esc(value) : ''}" ${isNew ? '' : 'hidden'} />
      <input class="kps-combo-val" type="hidden" name="${esc(name)}" value="${esc(value)}" />
    </div>
  </label>`;
}

// Wire every combo within `scope`. `opts.onAddNew(kind)` (optional) should return
// a Promise resolving to the new value string (or null/undefined if cancelled).
export function wireCombos(scope, opts = {}) {
  const onAddNew = opts.onAddNew;
  scope.querySelectorAll('[data-combo]').forEach((box) => {
    const sel = box.querySelector('.kps-combo-sel');
    const txt = box.querySelector('.kps-combo-new');
    const val = box.querySelector('.kps-combo-val');
    const kind = box.dataset.kind || '';

    // Ensure `v` exists as an option (inserting before "Add new…"), select it,
    // and hide the inline text input.
    const setValue = (v) => {
      if (v && ![...sel.options].some((o) => o.value === v)) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        sel.insertBefore(opt, sel.querySelector('option[value="__new__"]'));
      }
      sel.value = v || '';
      txt.hidden = true;
      txt.value = '';
      val.value = v || '';
    };

    sel.addEventListener('change', async () => {
      if (sel.value === '__new__') {
        if (onAddNew && kind) {
          // Revert the visible selection while the modal is open.
          sel.value = val.value && val.value !== '__new__' ? val.value : '';
          const v = await onAddNew(kind);
          if (v) setValue(v);
          return;
        }
        txt.hidden = false;
        val.value = txt.value.trim();
        txt.focus();
      } else {
        txt.hidden = true;
        val.value = sel.value;
      }
    });
    txt.addEventListener('input', () => {
      val.value = txt.value.trim();
    });
  });
}
