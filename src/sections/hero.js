import { site } from '../config/site.js';
import { HeroLogo } from '../components/logo.js';

// Hero — the gleaming KPS Silver brand logo is the centrepiece. Tagline +
// CTAs sit below; "Visit the Store" opens Google Maps. (The Balaji line-art
// now anchors the Signature section right after the ticker.)
export function Hero() {
  return `
<header class="hero" id="top">
  <div class="hero-inner" id="heroInner">
    <h1 class="sr-only">${site.brand} — Pure silver articles in Nagarthpet, Bengaluru since ${site.established}</h1>
    ${HeroLogo()}
    <p class="hero-eyebrow" data-intro>Nagarthpet · Bengaluru · Est. ${site.established}</p>
    <p class="hero-sub" data-intro>For three decades, the silver a devout home turns to — the <strong>kuthuvilakku</strong> lit at the doorway, the singhasan that seats the deity, the tray carried to a wedding. Not jewellery. Only the sacred silver of ritual, blessing and belonging.</p>
    <div class="hero-actions" data-intro>
      <a href="#collections" class="btn btn-solid" data-magnetic><span class="fill"></span><span class="lbl">Explore Collections</span></a>
      <a href="${site.contact.mapsDirectionsUrl}" target="_blank" rel="noopener" class="btn btn-ghost" data-magnetic><span class="fill"></span><span class="lbl">Visit Nagarthpet Store</span></a>
    </div>
  </div>
  <span class="hero-scroll">Scroll</span>
</header>`;
}
