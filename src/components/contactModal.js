import { site } from '../config/site.js';

// A small chooser shown when a customer taps a "Call or WhatsApp" action:
// it asks how they'd like to reach the store, then either opens the phone
// dialpad (tel:) or WhatsApp with a pre-filled message. Both choices are real
// anchors, so they work even before JS wires up the open/close behaviour.
export function ContactModal() {
  const { contact } = site;

  const phoneIcon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.5 3.5h3l1.2 4-2 1.4a12 12 0 0 0 5 5l1.4-2 4 1.2v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  const waIcon = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3.6a8.4 8.4 0 0 0-7.2 12.7L3.6 20.4l4.2-1.1A8.4 8.4 0 1 0 12 3.6Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 8.6c.2-.5.4-.5.7-.5h.5c.2 0 .4 0 .6.5l.6 1.4c.1.2 0 .4-.1.6l-.4.5c-.2.2-.2.4-.1.6a5 5 0 0 0 2.4 2.1c.3.1.5.1.7-.1l.5-.6c.2-.2.4-.2.6-.1l1.4.7c.2.1.4.3.4.5v.5c0 .4-.3.9-.8 1.1-.5.3-1.3.5-2.5.1a7.7 7.7 0 0 1-4.6-4.6c-.4-1.1-.2-2 .1-2.6Z" fill="currentColor"/></svg>`;

  return `
<div class="contact-modal" id="contactModal" role="dialog" aria-modal="true" aria-labelledby="contactModalTitle" hidden>
  <div class="contact-backdrop" data-contact-close></div>
  <div class="contact-panel">
    <button type="button" class="contact-close" data-contact-close aria-label="Close">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </button>
    <p class="contact-eyebrow">${site.brand} · Nagarthpet</p>
    <h3 id="contactModalTitle">How would you like to reach us?</h3>
    <p class="contact-note">Call the store directly, or send us a WhatsApp — we'll reply with photos and prices during store hours.</p>
    <div class="contact-choices">
      <a class="contact-choice" data-contact-choice href="${contact.phoneHref}">
        <span class="contact-choice-ic">${phoneIcon}</span>
        <span class="contact-choice-txt">
          <span class="contact-choice-t">Call the store</span>
          <span class="contact-choice-s">${contact.phoneDisplay}</span>
        </span>
      </a>
      <a class="contact-choice contact-choice--wa" data-contact-choice href="${contact.whatsappUrl}" target="_blank" rel="noopener">
        <span class="contact-choice-ic">${waIcon}</span>
        <span class="contact-choice-txt">
          <span class="contact-choice-t">Message on WhatsApp</span>
          <span class="contact-choice-s">Opens with a starting message</span>
        </span>
      </a>
    </div>
  </div>
</div>`;
}
