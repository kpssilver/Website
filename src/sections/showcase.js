// "The Showcase" — a swipeable carousel of real silver pieces, shown right
// before the Collections grid. The gallery is editable from the admin Content
// tab (add / remove / reorder slides); defaults live in src/data/showcase.js.
// The carousel behaviour is wired in src/interactions/animations.js and can be
// re-initialised when the gallery is replaced at runtime.
import { defaultShowcase, showcaseSlidesHtml } from '../data/showcase.js';
import { cd } from '../content/schema.js';

export function Showcase() {
  const slides = showcaseSlidesHtml(defaultShowcase);

  return `
<section id="showcase" data-theme-trigger="hero" aria-roledescription="carousel" aria-label="Silver pieces in focus">
  <div class="wrap showcase-head">
    <p class="eyebrow rv" data-ck="showcase.eyebrow">${cd('showcase.eyebrow')}</p>
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
