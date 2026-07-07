// Balaji line-art centrepiece for the hero.
//
// The source artwork (src/assets/balaji-outline.svg) is a pure stroke drawing
// (every visible path uses stroke="black", no fills). We inline it ?raw and
// recolour every stroke to a moving silver gradient so the figure looks like
// gleaming, brushed silver — see .balaji-outline-svg in styles/balaji.css.
import balajiRaw from '../assets/balaji-outline.svg?raw';

// A metallic ramp (dark → bright → dark) that slides diagonally. With
// spreadMethod="reflect" and a translate of exactly one axis-length, the
// shimmer loops seamlessly, giving a continuous polished-silver gleam.
const GLEAM_DEFS = `<defs>
  <linearGradient id="balajiGleam" gradientUnits="userSpaceOnUse"
      x1="0" y1="0" x2="300" y2="120" spreadMethod="reflect">
    <stop offset="0" stop-color="#69707C"/>
    <stop offset="0.5" stop-color="#F1F4F9"/>
    <stop offset="1" stop-color="#69707C"/>
    <animateTransform attributeName="gradientTransform" type="translate"
      from="0 0" to="300 120" dur="5s" repeatCount="indefinite"/>
  </linearGradient>
</defs>`;

// Drop the fixed width/height so CSS controls the size, add our class, and
// inject the gleam gradient inside the SVG (userSpaceOnUse needs it in-scope).
const svg = balajiRaw.replace(
  /<svg[^>]*>/,
  `<svg viewBox="0 0 878 733" fill="none" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" class="balaji-outline-svg" role="img" aria-label="Lord Balaji">${GLEAM_DEFS}`,
);

export function BalajiOutline() {
  return `<div class="figure-balaji" role="img" aria-label="Lord Balaji — deities &amp; figures in pure silver">${svg}</div>`;
}
