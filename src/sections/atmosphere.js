import { LogoDefs } from '../components/logo.js';

// Fixed background layers, cursor glow and scroll-progress bar.
// These sit behind everything and are driven by the interactions module.
// LogoDefs() renders the shared gradient used to recolour the brand logo.
export function Atmosphere() {
  return `
${LogoDefs()}
<div class="atmos" aria-hidden="true">
  <div class="bg-hero"></div>
  <div class="bg-rose"></div>
  <div class="bg-silver"></div>
  <div class="bg-dusk"></div>
</div>
<div class="cursor-glow" id="cursorGlow" aria-hidden="true"></div>
<div class="progress" id="progress" aria-hidden="true"></div>`;
}
