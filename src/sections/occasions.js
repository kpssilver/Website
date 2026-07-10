import { occasions } from '../data/occasions.js';
import { cd } from '../content/schema.js';

// "The Occasions" — a list of milestones KPS Silver serves.
export function Occasions() {
  const rows = occasions
    .map(
      (o) => `
      <div class="occ">
        <h3>${o.title}</h3>
        <p>${o.copy}</p>
      </div>`,
    )
    .join('');

  return `
<section id="occasions" data-theme-trigger="rose">
  <div class="wrap">
    <div>
      <p class="eyebrow rv" data-ck="occasions.eyebrow">${cd('occasions.eyebrow')}</p>
      <h2 data-split data-ck="occasions.title">${cd('occasions.title')}</h2>
      <p class="lede rv" data-ck="occasions.lede">${cd('occasions.lede')}</p>
    </div>
    <div class="occ-list">${rows}
    </div>
  </div>
</section>`;
}
