import { occasions } from '../data/occasions.js';

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
      <p class="eyebrow rv">The Occasions</p>
      <h2 data-split>Silver for every threshold a family crosses</h2>
      <p class="lede rv">Name the occasion and what you wish to spend, and we will bring out the pieces that honour both.</p>
    </div>
    <div class="occ-list">${rows}
    </div>
  </div>
</section>`;
}
