// Reusable brand logo.
//
// The source artwork (src/assets/logo.svg) is solid black, so we recolor it
// via CSS (.brand-logo svg path { fill: url(#logoMetal) }) using the shared
// gradient rendered by LogoDefs(). Import as ?raw so we can inline the SVG
// and style its paths — a plain <img> could not be recoloured.
import logoRaw from '../assets/logo.svg?raw';

// Hidden <svg> holding the gradient every logo instance references.
// Render this ONCE near the top of the page.
export function LogoDefs() {
  return `
<svg class="logo-defs" width="0" height="0" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="logoMetal" x1="0" y1="0" x2="0.18" y2="1">
      <stop offset="0%" stop-color="#F8FAFC"/>
      <stop offset="26%" stop-color="#D8DDE4"/>
      <stop offset="48%" stop-color="#9BA3B0"/>
      <stop offset="70%" stop-color="#E6E9EF"/>
      <stop offset="100%" stop-color="#B9C0CB"/>
    </linearGradient>
  </defs>
</svg>`;
}

// `variant` adds a modifier class (e.g. 'nav', 'hero', 'foot') used for sizing.
export function Logo(variant = '') {
  const modifier = variant ? ` brand-logo--${variant}` : '';
  return `<span class="brand-logo${modifier}" role="img" aria-label="KPS Jewellers">${logoRaw}</span>`;
}

// Hero lockup — the same logo, but scaled up and given its own moving
// silver gleam (a userSpaceOnUse ramp that slides across the artwork, so the
// emblem looks like polished, gleaming silver). Kept separate from the flat
// nav/footer logos so the sweep never touches them.
const LOGO_GLEAM = `<defs>
  <linearGradient id="logoGleam" gradientUnits="userSpaceOnUse"
      x1="0" y1="0" x2="900" y2="620" spreadMethod="reflect">
    <stop offset="0" stop-color="#6C737F"/>
    <stop offset="0.5" stop-color="#F6F8FC"/>
    <stop offset="1" stop-color="#6C737F"/>
    <animateTransform attributeName="gradientTransform" type="translate"
      from="0 0" to="900 620" dur="6s" repeatCount="indefinite"/>
  </linearGradient>
</defs>`;

const heroLogoSvg = logoRaw.replace(/<svg([^>]*)>/, `<svg$1>${LOGO_GLEAM}`);

export function HeroLogo() {
  return `<span class="brand-logo brand-logo--hero" role="img" aria-label="KPS Silver">${heroLogoSvg}</span>`;
}
