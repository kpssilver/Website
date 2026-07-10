import { heritageMarks } from '../data/content.js';
import { cd } from '../content/schema.js';

// "The Heritage" — big animated 1996 numeral and the store's story.
export function Heritage() {
  const marks = heritageMarks
    .map(
      (m) => `
        <div class="mark rv"><b class="rosegold" data-count="${m.count}"${
          m.suffix ? ` data-suffix="${m.suffix}"` : ''
        }>0${m.suffix}</b><span>${m.label}</span></div>`,
    )
    .join('');

  return `
<section id="heritage" data-theme-trigger="rose">
  <div class="wrap heritage-grid">
    <div>
      <div class="heritage-year rosegold metal-sheen" id="bigYear" data-text="1996">1996<small>Nagarthpet · Bengaluru</small></div>
    </div>
    <div class="heritage-copy">
      <p class="eyebrow rv">The Heritage</p>
      <h2 data-split data-ck="heritage.title">${cd('heritage.title')}</h2>
      <p class="rv" data-ck="heritage.body1">${cd('heritage.body1')}</p>
      <p class="rv" data-ck="heritage.body2">${cd('heritage.body2')}</p>
      <div class="heritage-marks">${marks}
      </div>
    </div>
  </div>
</section>`;
}
