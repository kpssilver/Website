// "The Showcase" — a swipeable carousel of real silver pieces, shown right
// before the Collections grid. Images are transparent product cutouts that
// float on the maroon backdrop. The carousel is a native CSS scroll-snap
// strip (touch-friendly on phones/tablets) with buttons + dots wired up in
// src/interactions/animations.js.
//
// Images are imported so Vite fingerprints + serves them from the build.
import poojaThali from '../assets/gallery/pooja-thali.webp';
import fruitBowl from '../assets/gallery/fruit-bowl.webp';
import pots from '../assets/gallery/pots.webp';
import deepam from '../assets/gallery/deepam.webp';
import { cd } from '../content/schema.js';

const pieces = [
  { src: poojaThali, title: 'Pooja Thali', tag: 'Pooja Articles' },
  { src: deepam, title: 'Standing Deepam', tag: 'Lamps & Diyas' },
  { src: fruitBowl, title: 'Fruit Bowl', tag: 'Gifting & Table' },
  { src: pots, title: 'Silver Pots', tag: 'Home & Ritual' },
];

export function Showcase() {
  const slides = pieces
    .map(
      (p, i) => `
      <li class="showcase-slide" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${pieces.length}: ${p.title}">
        <figure class="showcase-fig">
          <div class="showcase-media">
            <img src="${p.src}" data-ck-img="showcase.img${i + 1}" alt="${p.title} in silver, styled by KPS Silver" loading="lazy" decoding="async" draggable="false" />
          </div>
          <figcaption class="showcase-cap">
            <span class="showcase-cap-tag">${p.tag}</span>
            <h3>${p.title}</h3>
          </figcaption>
        </figure>
      </li>`,
    )
    .join('');

  return `
<section id="showcase" data-theme-trigger="hero" aria-roledescription="carousel" aria-label="Silver pieces in focus">
  <div class="wrap showcase-head">
    <p class="eyebrow rv">In Focus</p>
    <h2 data-split data-ck="showcase.title">${cd('showcase.title')}</h2>
    <p class="lede rv" data-ck="showcase.lede">${cd('showcase.lede')}</p>
  </div>

  <div class="showcase-rail rv">
    <button type="button" class="showcase-nav showcase-nav--prev" data-sc-prev aria-label="Previous piece">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="showcase-viewport" tabindex="0" aria-label="Silver pieces, scrollable">
      <ul class="showcase-track">${slides}
      </ul>
    </div>
    <button type="button" class="showcase-nav showcase-nav--next" data-sc-next aria-label="Next piece">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  </div>

  <div class="showcase-dots" role="tablist" aria-label="Choose a piece"></div>
</section>`;
}
