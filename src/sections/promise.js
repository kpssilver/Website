import { promises } from '../data/promise.js';
import { cd } from '../content/schema.js';

// "The KPS Promise" — the section where the backdrop flips to silver.
export function Promise() {
  const items = promises
    .map((_p, i) => {
      const kT = `promise.item${i + 1}_title`;
      const kC = `promise.item${i + 1}_copy`;
      return `
      <div class="promise-item">
        <h3 data-ck="${kT}">${cd(kT)}</h3>
        <p data-ck="${kC}">${cd(kC)}</p>
      </div>`;
    })
    .join('');

  return `
<section class="promise" id="promise" data-theme-trigger="silver">
  <div class="wrap">
    <div>
      <p class="eyebrow rv" data-ck="promise.eyebrow">${cd('promise.eyebrow')}</p>
      <h2 data-split data-ck="promise.title">${cd('promise.title')}</h2>
    </div>
    <div class="promise-grid">${items}
    </div>
  </div>
</section>`;
}
