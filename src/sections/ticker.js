import { tickerItems } from '../data/content.js';

// Scrolling marquee of product categories.
// NOTE: the interactions module duplicates the track's content once at
// runtime so the loop is seamless — mirroring the original behaviour.
export function Ticker() {
  const spans = tickerItems
    .map((item) => `<span>${item} <i>✦</i></span>`)
    .join('');

  return `
<div class="ticker" aria-hidden="true">
  <div class="ticker-track" id="tickerTrack">
    ${spans}
  </div>
</div>`;
}
