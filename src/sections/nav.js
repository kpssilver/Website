import { site } from '../config/site.js';
import { Logo } from '../components/logo.js';
import { cd } from '../content/schema.js';

// Fixed top navigation. Links are in-page anchors for now; when the site
// grows into a storefront these can point to routes (/collections, /cart …).
export function Nav() {
  return `
<nav id="nav">
  <a href="#top" class="nav-brand" aria-label="${site.brand} home">${Logo('nav')}</a>
  <button class="nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false">
    <span></span><span></span><span></span>
  </button>
  <div class="nav-links" id="navLinks">
    <a href="#collections">Collections</a>
    <a href="#heritage">Since ${site.established}</a>
    <a href="#occasions">Occasions</a>
    <a href="#promise">Our Promise</a>
    <a href="${site.contact.mapsDirectionsUrl}" target="_blank" rel="noopener" class="nav-cta" data-ck="nav.cta_label" data-ck-href="links.maps_url">${cd('nav.cta_label')}</a>
  </div>
</nav>`;
}
