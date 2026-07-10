import { collections } from '../data/collections.js';
import { cd } from '../content/schema.js';

// "The Collections" — a responsive grid of category cards.
// Cards are generated from src/data/collections.js so adding a category
// (or later, wiring a card to a product page) is a data change, not markup.
export function Collections() {
  const cards = collections
    .map(
      (c) => `
      <a class="card" href="/shop.html?category=${encodeURIComponent(c.category)}">
        ${c.icon}
        <h3>${c.title}</h3>
        <p>${c.copy}</p>
        <span class="card-cta">View collection <span aria-hidden="true">→</span></span>
      </a>`,
    )
    .join('');

  return `
<section id="collections" data-theme-trigger="hero">
  <div class="wrap">
    <div class="coll-head">
      <div>
        <p class="eyebrow rv" data-ck="collections.eyebrow">${cd('collections.eyebrow')}</p>
        <h2 data-split data-ck="collections.title">${cd('collections.title')}</h2>
      </div>
      <p class="lede rv" style="margin-top:0" data-ck="collections.lede">${cd('collections.lede')}</p>
    </div>

    <div class="grid" id="cardGrid">${cards}
    </div>
  </div>
</section>`;
}
