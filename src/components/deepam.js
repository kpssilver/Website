// KPS Silver deepam — the standing lotus oil-lamp.
//
// The source artwork (src/assets/deepam.svg) is a pure stroke drawing of a
// five-flame lamp. We inline it ?raw so we can:
//   1. recolour every stroke to the same moving silver gleam as the Balaji, and
//   2. LIGHT every diya — the five flames are actual paths in the artwork, so
//      we fill those exact shapes with a volumetric 3D fire gradient (white-hot
//      core → yellow → orange → deep ember), edge them in warm gold and back
//      them with a soft blurred halo. They flicker gently, out of sync.
import deepamRaw from '../assets/deepam.svg?raw';

// The five flame bodies in the artwork (measured by inspecting each path):
//   1 far-left · 6 left-inner · 8+9 centre almond + eye · 7 right-inner · 2 far-right
const FLAME_DELAYS = { 1: 0, 2: 1.3, 6: 0.9, 7: 0.45, 8: 1.7, 9: 1.7 };

const DEFS = `
  <linearGradient id="deepamGleam" gradientUnits="userSpaceOnUse"
      x1="0" y1="0" x2="655" y2="655" spreadMethod="reflect">
    <stop offset="0" stop-color="#69707C"/>
    <stop offset="0.5" stop-color="#F1F4F9"/>
    <stop offset="1" stop-color="#69707C"/>
    <animateTransform attributeName="gradientTransform" type="translate"
      from="0 0" to="655 655" dur="6s" repeatCount="indefinite"/>
  </linearGradient>
  <radialGradient id="deepamFire" cx="0.5" cy="0.66" r="0.66">
    <stop offset="0" stop-color="#FFFEF6"/>
    <stop offset="18%" stop-color="#FFEC94"/>
    <stop offset="44%" stop-color="#FFBB38"/>
    <stop offset="72%" stop-color="#F5810F"/>
    <stop offset="100%" stop-color="#C9430A"/>
  </radialGradient>
  <linearGradient id="deepamEmber" gradientUnits="userSpaceOnUse" x1="327" y1="80" x2="327" y2="330">
    <stop offset="0" stop-color="#FFD066"/>
    <stop offset="0.5" stop-color="#FFF3CC"/>
    <stop offset="1" stop-color="#FFAA40"/>
  </linearGradient>
  <filter id="deepamHalo" x="-80%" y="-80%" width="260%" height="260%">
    <feGaussianBlur stdDeviation="9"/>
  </filter>`;

// Split the raw artwork into its <path> pieces. segments[0] is the <svg …>
// header; segments[k] (k ≥ 1) is path index k-1 plus its trailing markup.
const segments = deepamRaw.split(/(?=<path\b)/);

const flameDs = [];
const body = segments
  .slice(1)
  .map((seg, k) => {
    const pi = k; // path index
    if (pi in FLAME_DELAYS) {
      const delay = FLAME_DELAYS[pi];
      const d = seg.match(/d="([^"]+)"/)[1];
      flameDs.push({ d, delay });
      return seg
        .replace('<path', `<path class="deepam-fire" style="--flick-delay:${delay}s" fill="url(#deepamFire)" fill-rule="evenodd"`)
        .replace('stroke="black"', 'stroke="url(#deepamEmber)" stroke-width="2.4"');
    }
    return seg.replace('stroke="black"', 'stroke="url(#deepamGleam)"');
  })
  .join('');

// A soft, blurred copy of every flame sits behind the linework as the halo.
const halo = `<g class="deepam-halo" filter="url(#deepamHalo)" fill="#FF7A16">${flameDs
  .map((f) => `<path class="deepam-halo-fire" style="--flick-delay:${f.delay}s" d="${f.d}"/>`)
  .join('')}</g>`;

const header = `<svg viewBox="0 0 655 2108" fill="none" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" class="deepam-svg" role="img" aria-label="Silver deepam with all its diyas lit"><defs>${DEFS}</defs>${halo}`;

const baseSvg = header + body;

// Each rendered lamp needs unique ids (two lamps flank the deity), so we suffix
// every id + url(#…) reference per instance.
let instance = 0;
const IDS = ['deepamGleam', 'deepamFire', 'deepamEmber', 'deepamHalo'];

export function Deepam(variant = '') {
  const suffix = `-${++instance}`;
  let svg = baseSvg;
  IDS.forEach((id) => {
    svg = svg.replaceAll(`id="${id}"`, `id="${id}${suffix}"`).replaceAll(`url(#${id})`, `url(#${id}${suffix})`);
  });
  const modifier = variant ? ` figure-deepam--${variant}` : '';
  return `<div class="figure-deepam${modifier}" aria-hidden="true">${svg}</div>`;
}
