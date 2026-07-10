import { promises } from '../data/promise.js';
import { cd } from '../content/schema.js';

// "The KPS Promise" — the section where the backdrop flips to silver.
export function Promise() {
  const items = promises
    .map(
      (p) => `
      <div class="promise-item">
        <h3>${p.title}</h3>
        <p>${p.copy}</p>
      </div>`,
    )
    .join('');

  return `
<section class="promise" id="promise" data-theme-trigger="silver">
  <div class="wrap">
    <div>
      <p class="eyebrow rv">The KPS Promise</p>
      <h2 data-split data-ck="promise.title">${cd('promise.title')}</h2>
    </div>
    <div class="promise-grid">${items}
    </div>
  </div>
</section>`;
}
