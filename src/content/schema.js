// =============================================================================
// EDITABLE SITE CONTENT — SCHEMA + DEFAULTS
// Single source of truth for everything the super admin can edit from the
// admin panel: headings, sub-headings (eyebrows), body copy, images, button
// labels, links and URLs. Drives:
//   1. The built-in default copy rendered by the section templates (via cd()).
//   2. The content-apply runtime (data-ck / data-ck-img / data-ck-href).
//   3. The Content Manager (live preview + editor) in the admin dashboard.
// Add a field here + a matching hook in the template and it becomes editable.
// =============================================================================
import { site } from '../config/site.js';

const { contact } = site;

export const contentGroups = [
  {
    group: 'Navigation',
    fields: [
      { key: 'nav.cta_label', label: 'Nav button label', type: 'text', default: 'Visit the Store' },
    ],
  },
  {
    group: 'Hero',
    fields: [
      { key: 'hero.eyebrow', label: 'Eyebrow', type: 'text', default: `Nagarthpet · Bengaluru · Est. ${site.established}` },
      {
        key: 'hero.sub',
        label: 'Intro paragraph',
        type: 'textarea',
        html: true,
        default:
          'For three decades, the silver a devout home turns to. The <strong>kuthuvilakku</strong> lit at the doorway, the singhasan that seats the deity, the tray carried to a wedding. Not jewellery. Only the sacred silver of ritual, blessing and belonging, worked from 925 sterling to 999 fine.',
      },
      { key: 'hero.cta_primary_label', label: 'Primary button label', type: 'text', default: 'Explore Collections' },
      { key: 'hero.cta_secondary_label', label: 'Secondary button label', type: 'text', default: 'Visit the Store' },
    ],
  },
  {
    group: 'Showcase',
    fields: [
      { key: 'showcase.eyebrow', label: 'Eyebrow', type: 'text', default: 'In Focus' },
      { key: 'showcase.title', label: 'Heading', type: 'text', default: 'A closer look at the silver we make' },
      {
        key: 'showcase.lede',
        label: 'Description',
        type: 'textarea',
        default:
          'Each piece photographed in the setting it was made for, the pooja room, the table, the threshold. Swipe through, then find its kind in the collection below.',
      },
      { key: 'showcase.items', label: 'Showcase gallery', type: 'gallery', default: '' },
    ],
  },
  {
    group: 'Collections',
    fields: [
      { key: 'collections.eyebrow', label: 'Eyebrow', type: 'text', default: 'The Collections' },
      { key: 'collections.title', label: 'Heading', type: 'text', default: 'For the altar, the table and every giving hand' },
      {
        key: 'collections.lede',
        label: 'Description',
        type: 'textarea',
        default:
          "Every article is genuine silver, graded plainly from 925 sterling to 999 fine, weighed before you and priced on the day's rate. Walk in, hold it, feel its weight settle in your palm, the way silver has been chosen in Nagarthpet for generations.",
      },
    ],
  },
  {
    group: 'Heritage',
    fields: [
      { key: 'heritage.eyebrow', label: 'Eyebrow', type: 'text', default: 'The Heritage' },
      { key: 'heritage.title', label: 'Heading', type: 'text', default: 'Thirty years on the same street' },
      {
        key: 'heritage.body1',
        label: 'Paragraph 1',
        type: 'textarea',
        html: true,
        default:
          'Nagarthpet is where Bengaluru has bought its silver for generations, a street of weighing scales, purity marks and family shops that know their customers by name. <strong>KPS Silver has stood here since 1996.</strong>',
      },
      {
        key: 'heritage.body2',
        label: 'Paragraph 2',
        type: 'textarea',
        default:
          'We chose one thing and stayed with it: silver articles, not jewellery. The lamp lit at a gruhapravesha, the tray carried to a wedding, the murti installed in a new pooja room, pieces that enter a family and stay for generations.',
      },
    ],
  },
  {
    group: 'Occasions',
    fields: [
      { key: 'occasions.eyebrow', label: 'Eyebrow', type: 'text', default: 'The Occasions' },
      { key: 'occasions.title', label: 'Heading', type: 'text', default: 'Silver for every threshold a family crosses' },
      {
        key: 'occasions.lede',
        label: 'Description',
        type: 'textarea',
        default: 'Name the occasion and what you wish to spend, and we will bring out the pieces that honour both.',
      },
    ],
  },
  {
    group: 'Promise',
    fields: [
      { key: 'promise.eyebrow', label: 'Eyebrow', type: 'text', default: 'The KPS Promise' },
      { key: 'promise.title', label: 'Heading', type: 'text', default: 'Bought the way silver has always been bought' },
    ],
  },
  {
    group: 'Visit',
    fields: [
      { key: 'visit.eyebrow', label: 'Eyebrow', type: 'text', default: 'Visit Us' },
      { key: 'visit.title', label: 'Heading', type: 'text', default: 'Silver is bought in person' },
      {
        key: 'visit.lede',
        label: 'Description',
        type: 'textarea',
        default:
          'Hold it. Weigh it. Compare it under the light. Our store in Nagarthpet has worked that way since 1996. Come see why.',
      },
      { key: 'visit.address', label: 'Address', type: 'textarea', multiline: true, default: site.address.lines.join('\n') },
      { key: 'visit.hours', label: 'Opening hours', type: 'textarea', multiline: true, default: site.hours.lines.join('\n') },
      { key: 'visit.contact_label', label: 'Contact button label', type: 'text', default: `Call or WhatsApp · ${contact.phoneDisplay}` },
      { key: 'visit.directions_label', label: 'Directions link label', type: 'text', default: 'Get directions on Google Maps →' },
    ],
  },
  {
    group: 'Footer',
    fields: [
      {
        key: 'footer.tagline',
        label: 'Tagline',
        type: 'text',
        default: `925 sterling to 999 fine silver · Nagarthpet, Bengaluru · Since ${site.established}`,
      },
      { key: 'footer.copyright', label: 'Copyright', type: 'text', default: `© 2026 ${site.brand}. All rights reserved.` },
    ],
  },
  {
    group: 'Contact & Links',
    fields: [
      { key: 'links.phone_display', label: 'Phone (shown)', type: 'text', default: contact.phoneDisplay },
      { key: 'links.phone_href', label: 'Phone link (tel:)', type: 'url', default: contact.phoneHref },
      { key: 'links.whatsapp_url', label: 'WhatsApp link', type: 'url', default: contact.whatsappUrl },
      { key: 'links.maps_url', label: 'Google Maps directions URL', type: 'url', default: contact.mapsDirectionsUrl },
    ],
  },
];

// Flat lookups derived from the groups above.
export const contentFields = contentGroups.flatMap((g) => g.fields);
const byKey = Object.fromEntries(contentFields.map((f) => [f.key, f]));

export function fieldByKey(key) {
  return byKey[key];
}

// Built-in default for a key (used by the section templates).
export function cd(key) {
  return byKey[key]?.default ?? '';
}

export function isHtmlField(key) {
  return Boolean(byKey[key]?.html);
}

export function isMultilineField(key) {
  return Boolean(byKey[key]?.multiline);
}

// Escape + convert newlines to <br> — for multiline fields (address, hours).
export function nl2br(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}
