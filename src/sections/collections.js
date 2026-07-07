import { collections } from '../data/collections.js';

// "The Collections" — a responsive grid of category cards.
// Cards are generated from src/data/collections.js so adding a category
// (or later, wiring a card to a product page) is a data change, not markup.
export function Collections() {
  const cards = collections
    .map(
      (c) => `
      <article class="card">
        ${c.icon}
        <h3>${c.title}</h3>
        <p>${c.copy}</p>
      </article>`,
    )
    .join('');

  return `
<section id="collections" data-theme-trigger="hero">
  <div class="wrap">
    <div class="coll-head">
      <div>
        <p class="eyebrow rv">The Collections</p>
        <h2 data-split>For the altar, the table and every giving hand</h2>
      </div>
      <p class="lede rv" style="margin-top:0">Every article is genuine silver, graded plainly from 925 sterling to 999 fine, weighed before you and priced on the day's rate. Walk in, hold it, feel its weight settle in your palm, the way silver has been chosen in Nagarthpet for generations.</p>
    </div>

    <div class="grid" id="cardGrid">${cards}
    </div>
  </div>
</section>`;
}
