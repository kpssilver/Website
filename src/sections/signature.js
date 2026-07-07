import { BalajiOutline } from '../components/balajiOutline.js';
import { Deepam } from '../components/deepam.js';

// "The Signature" — sits right after the ticker of everything KPS Silver deals
// in. The gleaming Balaji line-art anchors the deities & figures, flanked by
// two standing deepams with every diya lit. All three shimmer in the same
// moving silver gleam.
export function Signature() {
  return `
<section id="signature" data-theme-trigger="hero">
  <div class="wrap signature-head">
    <p class="eyebrow rv">The Sanctum</p>
    <h2 data-split>Where the deity is seated and the lamp is kept lit</h2>
    <p class="lede rv">The murti that presides over the pooja room, the deepam whose every wick is woken at dusk — the silver through which a family keeps the divine close, morning after morning, generation after generation.</p>
  </div>
  <div class="signature-stage" aria-hidden="true">
    <div class="sig-lamp sig-lamp--left">${Deepam()}</div>
    <div class="sig-deity">${BalajiOutline()}</div>
    <div class="sig-lamp sig-lamp--right">${Deepam()}</div>
  </div>
</section>`;
}
