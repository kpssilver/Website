import { site } from '../config/site.js';
import { HeroLogo } from '../components/logo.js';
import { cd } from '../content/schema.js';

// Hero — the gleaming KPS Silver brand logo is the centrepiece. Tagline +
// CTAs sit below; "Visit the Store" opens Google Maps. (The Balaji line-art
// now anchors the Signature section right after the ticker.)
export function Hero() {
  return `
<header class="hero" id="top">
  <div class="hero-inner" id="heroInner">
    <h1 class="sr-only">${site.brand}: silver articles from 925 sterling to 999 fine in Nagarthpet, Bengaluru since ${site.established}</h1>
    ${HeroLogo()}
    <p class="hero-eyebrow" data-intro data-ck="hero.eyebrow">${cd('hero.eyebrow')}</p>
    <p class="hero-sub" data-intro data-ck="hero.sub">${cd('hero.sub')}</p>
    <div class="hero-actions" data-intro>
      <a href="#collections" class="btn btn-solid" data-magnetic><span class="fill"></span><span class="lbl" data-ck="hero.cta_primary_label">${cd('hero.cta_primary_label')}</span></a>
      <a href="${site.contact.mapsDirectionsUrl}" target="_blank" rel="noopener" class="btn btn-ghost" data-magnetic data-ck-href="links.maps_url"><span class="fill"></span><span class="lbl" data-ck="hero.cta_secondary_label">${cd('hero.cta_secondary_label')}</span></a>
    </div>
  </div>
  <span class="hero-scroll">Scroll</span>
</header>`;
}
