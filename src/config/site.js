// =============================================================================
// SITE CONFIG — single source of truth for business details & links.
// Edit these values in one place; every section reads from here.
// =============================================================================

// Raw WhatsApp number in international format, digits only (no +, spaces or -).
const WHATSAPP_NUMBER = '918660784494';

// Pre-filled message shown when a customer opens WhatsApp from the site.
const WHATSAPP_MESSAGE =
  "Namaste, I'm looking for silver articles at KPS Silver";

export const site = {
  brand: 'KPS Silver',
  // Brand motto — shown under the hero logo and in the footer.
  motto: 'Where trust is tradition',
  tagline: '925 sterling to 999 fine silver · Nagarthpet, Bengaluru · Since 1996',
  established: 1996,

  // Canonical production URL (no trailing slash). Used for the sitemap &
  // robots.txt. UPDATE THIS if the live domain differs, then also update the
  // same URL in public/sitemap.xml and public/robots.txt.
  url: 'https://www.kpssilver.com',

  // Feature flags.
  features: {
    // Online "Pay securely" checkout (Razorpay) on the shop. Off until the
    // catalogue is ready and we're taking online orders — flip to `true` to
    // re-enable the pay button (the checkout code stays wired, just hidden).
    payments: false,
  },

  contact: {
    // Displayed phone number (human friendly).
    phoneDisplay: '+91 86607 84494',
    // tel: link target (digits + leading +).
    phoneHref: 'tel:+918660784494',

    whatsappNumber: WHATSAPP_NUMBER,
    whatsappMessage: WHATSAPP_MESSAGE,
    // Ready-to-use WhatsApp deep link with the pre-filled message.
    whatsappUrl: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      WHATSAPP_MESSAGE,
    )}`,

    // "Get directions" — opens the KPS Silver store route in Google Maps.
    mapsDirectionsUrl:
      'https://www.google.com/maps/dir//KPS+Silver+or+KPS+JEWELLERS,+905,+Nagarathpet+Main+Rd,+Medarpet,+Kumbarpet,+Ganigarpet,+Nagarathpete,+Bengaluru,+Karnataka+560002/@12.9892352,77.5651328,13z/data=!4m8!4m7!1m0!1m5!1m1!1s0x3bae178a5e2b39e1:0x2a63f2136a2b6b5f!2m2!1d77.5811721!2d12.9666759?entry=ttu&g_ep=EgoyMDI2MDYyOS4wIKXMDSoASAFQAw%3D%3D',
  },

  address: {
    lines: [
      '905, Nagarathpet Main Rd, Medarpet, Kumbarpet',
      'Ganigarpet, Nagarathpete',
      'Bengaluru, Karnataka 560002',
    ],
  },

  hours: {
    lines: ['Monday – Saturday · 11:00 AM – 8:00 PM', 'Sunday · Holiday'],
  },
};
