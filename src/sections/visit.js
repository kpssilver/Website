import { site } from '../config/site.js';
import { cd, nl2br } from '../content/schema.js';

// "Visit Us" — address, hours, contact and the WhatsApp CTA.
// The Google Maps directions link and WhatsApp deep link both come from
// src/config/site.js, so updating the number/route is a one-line change.
export function Visit() {
  const { contact } = site;

  return `
<section id="visit" data-theme-trigger="dusk">
  <div class="wrap visit-grid">
    <div>
      <p class="eyebrow rv" data-ck="visit.eyebrow">${cd('visit.eyebrow')}</p>
      <h2 data-split data-ck="visit.title">${cd('visit.title')}</h2>
      <p class="lede rv" data-ck="visit.lede">${cd('visit.lede')}</p>

      <div class="visit-block rv">
        <h3>Address</h3>
        <p data-ck="visit.address">${nl2br(cd('visit.address'))}</p>
      </div>
      <div class="visit-block rv">
        <h3>Hours</h3>
        <p data-ck="visit.hours">${nl2br(cd('visit.hours'))}</p>
      </div>
      <div class="visit-block rv">
        <h3>Contact</h3>
        <p><button type="button" class="linklike" data-contact data-ck="visit.contact_label">${cd('visit.contact_label')}</button><br>
        <a href="${contact.mapsDirectionsUrl}" target="_blank" rel="noopener" data-ck="visit.directions_label" data-ck-href="links.maps_url">${cd('visit.directions_label')}</a></p>
      </div>
    </div>

    <div class="visit-card rv">
      <h3 class="rosegold metal-sheen" data-text="Talk to the store">Talk to the store</h3>
      <p>Looking for a specific piece, a bulk gifting order, or today's silver rate? Call us or send a WhatsApp with the occasion and your budget, and we'll reply with photos and prices from the store.</p>
      <button type="button" class="btn btn-solid" data-magnetic data-contact><span class="fill"></span><span class="lbl">Call or WhatsApp</span></button>
      <p style="margin-top:1.6rem;margin-bottom:0;font-size:.78rem;color:var(--silver-dim)">Replies during store hours · Kannada, Hindi, Tamil &amp; English</p>
    </div>
  </div>
</section>`;
}
