// =============================================================================
// EDITABLE SITE CONTENT — SCHEMA + DEFAULTS
// Single source of truth for every field the super admin can edit from the
// admin panel. Drives three things:
//   1. The built-in default copy rendered by the section templates (via cd()).
//   2. The content-apply runtime that overrides those with saved values.
//   3. The Content Manager form in the admin dashboard.
// Add a field here + drop a data-ck / data-ck-img hook in the template and it
// becomes editable — no other wiring needed.
// =============================================================================

export const contentGroups = [
  {
    group: 'Hero',
    fields: [
      {
        key: 'hero.sub',
        label: 'Intro paragraph',
        type: 'textarea',
        html: true,
        default:
          'For three decades, the silver a devout home turns to. The <strong>kuthuvilakku</strong> lit at the doorway, the singhasan that seats the deity, the tray carried to a wedding. Not jewellery. Only the sacred silver of ritual, blessing and belonging, worked from 925 sterling to 999 fine.',
      },
    ],
  },
  {
    group: 'Showcase',
    fields: [
      { key: 'showcase.title', label: 'Heading', type: 'text', default: 'A closer look at the silver we make' },
      {
        key: 'showcase.lede',
        label: 'Description',
        type: 'textarea',
        default:
          'Each piece photographed in the setting it was made for, the pooja room, the table, the threshold. Swipe through, then find its kind in the collection below.',
      },
      { key: 'showcase.img1', label: 'Slide 1 image (Pooja Thali)', type: 'image', default: '' },
      { key: 'showcase.img2', label: 'Slide 2 image (Standing Deepam)', type: 'image', default: '' },
      { key: 'showcase.img3', label: 'Slide 3 image (Fruit Bowl)', type: 'image', default: '' },
      { key: 'showcase.img4', label: 'Slide 4 image (Silver Pots)', type: 'image', default: '' },
    ],
  },
  {
    group: 'Collections',
    fields: [
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
      { key: 'occasions.title', label: 'Heading', type: 'text', default: 'Silver for every threshold a family crosses' },
      {
        key: 'occasions.lede',
        label: 'Description',
        type: 'textarea',
        default:
          'Name the occasion and what you wish to spend, and we will bring out the pieces that honour both.',
      },
    ],
  },
  {
    group: 'Promise',
    fields: [
      { key: 'promise.title', label: 'Heading', type: 'text', default: 'Bought the way silver has always been bought' },
    ],
  },
  {
    group: 'Visit',
    fields: [
      { key: 'visit.title', label: 'Heading', type: 'text', default: 'Silver is bought in person' },
      {
        key: 'visit.lede',
        label: 'Description',
        type: 'textarea',
        default:
          'Hold it. Weigh it. Compare it under the light. Our store in Nagarthpet has worked that way since 1996. Come see why.',
      },
    ],
  },
];

// Flat lookups derived from the groups above.
export const contentFields = contentGroups.flatMap((g) => g.fields);
const byKey = Object.fromEntries(contentFields.map((f) => [f.key, f]));

// Built-in default for a key (used by the section templates).
export function cd(key) {
  return byKey[key]?.default ?? '';
}

export function isHtmlField(key) {
  return Boolean(byKey[key]?.html);
}
