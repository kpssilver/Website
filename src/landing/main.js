// =============================================================================
// LANDING — "under construction" teaser.
// Shows the KPS emblem, a looping brand video, and a short holding message.
// =============================================================================
import '../styles/variables.css';
import '../styles/landing.css';
import logoRaw from '../assets/logo.svg?raw';

// Served from /public, so referenced by an absolute URL.
const VIDEO_SRC = '/landing.mp4';

function shell() {
  return `
  <svg class="lp-defs" width="0" height="0" aria-hidden="true">
    <defs>
      <linearGradient id="lpMetal" x1="0" y1="0" x2="0.18" y2="1">
        <stop offset="0%" stop-color="#F8FAFC"/>
        <stop offset="26%" stop-color="#D8DDE4"/>
        <stop offset="48%" stop-color="#9BA3B0"/>
        <stop offset="70%" stop-color="#E6E9EF"/>
        <stop offset="100%" stop-color="#B9C0CB"/>
      </linearGradient>
    </defs>
  </svg>

  <main class="lp">
    <div class="lp-aura"></div>
    <header class="lp-head">
      <span class="lp-logo">${logoRaw}</span>
      <span class="lp-brand">KPS Silver</span>
      <span class="lp-motto">Where trust is tradition</span>
    </header>

    <section class="lp-stage" aria-hidden="true">
      <video
        class="lp-video"
        src="${VIDEO_SRC}"
        autoplay
        loop
        muted
        playsinline
        preload="auto"
      ></video>
    </section>

    <section class="lp-copy">
      <span class="lp-chip">Being polished to perfection</span>
      <h1>Great silver is never rushed.</h1>
      <p>Every piece we make is melted, moulded and polished until it gleams — and our new home online is being crafted with that same patience. A little longer on the wheel, and it will shine. Do come back soon.</p>
      <span class="lp-since">Nagarthpet, Bengaluru · Since 1996</span>
    </section>
  </main>`;
}

function boot() {
  const root = document.getElementById('landing-root');
  root.innerHTML = shell();

  // Muted + playsinline lets autoplay work on mobile; nudge play() in case a
  // browser still holds it back.
  const video = root.querySelector('.lp-video');
  if (video) {
    video.muted = true;
    const tryPlay = () => video.play().catch(() => {});
    tryPlay();
    video.addEventListener('canplay', tryPlay, { once: true });
  }
}

boot();
