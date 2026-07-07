import { heritageMarks } from '../data/content.js';

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
      <h2 data-split>Thirty years on the same street</h2>
      <p class="rv">Nagarthpet is where Bengaluru has bought its silver for generations, a street of weighing scales, purity marks and family shops that know their customers by name. <strong>KPS Silver has stood here since 1996.</strong></p>
      <p class="rv">We chose one thing and stayed with it: silver articles, not jewellery. The lamp lit at a gruhapravesha, the tray carried to a wedding, the murti installed in a new pooja room, pieces that enter a family and stay for generations.</p>
      <div class="heritage-marks">${marks}
      </div>
    </div>
  </div>
</section>`;
}
