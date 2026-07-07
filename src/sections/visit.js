import { site } from '../config/site.js';

// "Visit Us" — address, hours, contact and the WhatsApp CTA.
// The Google Maps directions link and WhatsApp deep link both come from
// src/config/site.js, so updating the number/route is a one-line change.
export function Visit() {
  const { contact, address, hours } = site;

  return `
<section id="visit" data-theme-trigger="dusk">
  <div class="wrap visit-grid">
    <div>
      <p class="eyebrow rv">Visit Us</p>
      <h2 data-split>Silver is bought in person</h2>
      <p class="lede rv">Hold it. Weigh it. Compare it under the light. Our store in Nagarthpet has worked that way since 1996. Come see why.</p>

      <div class="visit-block rv">
        <h3>Address</h3>
        <p>${address.lines.join('<br>')}</p>
      </div>
      <div class="visit-block rv">
        <h3>Hours</h3>
        <p>${hours.lines.join('<br>')}</p>
      </div>
      <div class="visit-block rv">
        <h3>Contact</h3>
        <p><button type="button" class="linklike" data-contact>Call or WhatsApp · ${contact.phoneDisplay}</button><br>
        <a href="${contact.mapsDirectionsUrl}" target="_blank" rel="noopener">Get directions on Google Maps →</a></p>
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
