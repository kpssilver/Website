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
  tagline: 'Pure silver articles · Nagarthpet, Bengaluru · Since 1996',
  established: 1996,

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
    lines: ['KPS Silver, Nagarthpet Main Road,', 'Bengaluru — 560002, Karnataka'],
  },

  hours: {
    lines: ['Monday – Saturday · 11:00 AM – 8:00 PM', 'Sunday · Holiday'],
  },
};
