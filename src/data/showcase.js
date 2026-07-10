// =============================================================================
// SHOWCASE GALLERY — the swipeable "In Focus" carousel on the landing page.
// Defaults ship with the site; the super admin can add / remove / reorder
// slides from the admin Content tab (stored in site_content as `showcase.items`
// — a JSON array of { img, title, tag }). Shared by the section template, the
// content-apply runtime and the admin gallery editor.
// =============================================================================
import poojaThali from '../assets/gallery/pooja-thali.webp';
import fruitBowl from '../assets/gallery/fruit-bowl.webp';
import pots from '../assets/gallery/pots.webp';
import deepam from '../assets/gallery/deepam.webp';

export const defaultShowcase = [
  { img: poojaThali, title: 'Pooja Thali', tag: 'Pooja Articles' },
  { img: deepam, title: 'Standing Deepam', tag: 'Lamps & Diyas' },
  { img: fruitBowl, title: 'Fruit Bowl', tag: 'Gifting & Table' },
  { img: pots, title: 'Silver Pots', tag: 'Home & Ritual' },
];

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Parse the stored JSON gallery; returns null if empty/invalid (→ use defaults).
export function parseShowcaseItems(raw) {
  if (!raw) return null;
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr) && arr.length) return arr.filter((x) => x && x.img);
  } catch {
    /* fall through */
  }
  return null;
}

// Build the <li> slides markup for a set of gallery items.
export function showcaseSlidesHtml(items) {
  const list = Array.isArray(items) && items.length ? items : defaultShowcase;
  return list
    .map(
      (p, i) => `
      <li class="showcase-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${list.length}: ${esc(p.title)}">
        <figure class="showcase-fig">
          <div class="showcase-media">
            <img src="${esc(p.img)}" alt="${esc(p.title || 'Silver piece')} in silver by KPS Silver" loading="lazy" decoding="async" draggable="false" />
          </div>
          <figcaption class="showcase-cap">
            ${p.tag ? `<span class="showcase-cap-tag">${esc(p.tag)}</span>` : ''}
            ${p.title ? `<h3>${esc(p.title)}</h3>` : ''}
          </figcaption>
        </figure>
      </li>`,
    )
    .join('');
}
