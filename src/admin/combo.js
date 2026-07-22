// =============================================================================
// COMBO FIELD — a "choose an existing value OR add a new one" control.
// Renders a <select> of known values plus an explicit "➕ Add new…" entry; when
// chosen it reveals a text input. A hidden input carries the resolved value
// under `name`, so a surrounding FormData read still works transparently.
// =============================================================================
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// `extra` is appended inside the <label> after the text (e.g. an info button).
export function comboField({ name, label, value = '', options = [], required = false, extra = '', colSpan = 1 }) {
  const opts = (options || []).map((o) => String(o)).filter(Boolean);
  const known = value !== '' && opts.includes(value);
  const isNew = value !== '' && !known;
  const optionHtml = opts
    .map((o) => `<option value="${esc(o)}" ${known && o === value ? 'selected' : ''}>${esc(o)}</option>`)
    .join('');
  return `
  <label class="pm-lbl${colSpan === 2 ? ' pm-col-2' : ''}">${label}${extra}
    <div class="kps-combo" data-combo>
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

// Wire every combo within `scope`. Keeps the hidden value input in sync.
export function wireCombos(scope) {
  scope.querySelectorAll('[data-combo]').forEach((box) => {
    const sel = box.querySelector('.kps-combo-sel');
    const txt = box.querySelector('.kps-combo-new');
    const val = box.querySelector('.kps-combo-val');
    const sync = () => {
      if (sel.value === '__new__') {
        txt.hidden = false;
        val.value = txt.value.trim();
      } else {
        txt.hidden = true;
        val.value = sel.value;
      }
    };
    sel.addEventListener('change', () => {
      sync();
      if (sel.value === '__new__') txt.focus();
    });
    txt.addEventListener('input', () => {
      val.value = txt.value.trim();
    });
  });
}
