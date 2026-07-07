import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

// =============================================================================
// INTERACTIONS — all motion for the page (intro, scroll reveals, theme
// crossfades, counters, magnetic buttons, cursor glow …).
// Call initInteractions() AFTER the sections have been mounted to the DOM.
// =============================================================================
export function initInteractions() {
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- ticker: seamless loop ---------- */
  const track = document.getElementById('tickerTrack');
  track.innerHTML += track.innerHTML;

  /* ---------- mobile nav ---------- */
  const toggle = document.getElementById('navToggle'),
    links = document.getElementById('navLinks');
  toggle.addEventListener('click', () => {
    const open = links.classList.toggle('open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
  });
  links.querySelectorAll('a').forEach((a) =>
    a.addEventListener('click', () => {
      links.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }),
  );

  /* ---------- split h2 into words ---------- */
  document.querySelectorAll('[data-split]').forEach((h) => {
    const words = h.textContent.trim().split(/\s+/);
    h.innerHTML = words.map((w) => `<span class="w"><span>${w}</span></span>`).join(' ');
  });

  /* ---------- radial fill origin follows the cursor ---------- */
  document.querySelectorAll('.btn').forEach((btn) => {
    const setOrigin = (e) => {
      const r = btn.getBoundingClientRect();
      btn.style.setProperty('--x', e.clientX - r.left + 'px');
      btn.style.setProperty('--y', e.clientY - r.top + 'px');
    };
    btn.addEventListener('mouseenter', setOrigin);
    btn.addEventListener('mouseleave', setOrigin);
  });

  /* ---------- nav glass: works even without GSAP ---------- */
  const nav = document.getElementById('nav');
  const setGlass = () => nav.classList.toggle('scrolled', (window.scrollY || 0) > 12);
  addEventListener('scroll', setGlass, { passive: true });
  setGlass();

  if (reduceMotion) return; // static but fully readable fallback

  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Lenis smooth scroll ---------- */
  if (typeof Lenis !== 'undefined') {
    const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    // anchor links through lenis
    document.querySelectorAll('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const target = document.querySelector(a.getAttribute('href'));
        if (target) {
          e.preventDefault();
          lenis.scrollTo(target, { offset: -20 });
        }
      });
    });
  }

  /* ---------- hero intro choreography ---------- */
  // Reveal the gleaming brand logo, then the copy + CTAs.
  const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
  intro
    .from('.brand-logo--hero', { opacity: 0, scale: 0.92, duration: 1.4, ease: 'power3.out' })
    .from('[data-intro]', { y: 26, opacity: 0, duration: 0.8, stagger: 0.12 }, '-=.9')
    .from('.hero-scroll', { opacity: 0, duration: 0.6 }, '-=.3');

  /* ---------- hero parallax away on scroll ---------- */
  gsap.to('#heroInner', {
    yPercent: -22,
    opacity: 0,
    ease: 'none',
    scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom 35%', scrub: true },
  });

  /* ---------- theme crossfade per section ---------- */
  document.querySelectorAll('[data-theme-trigger]').forEach((sec) => {
    ScrollTrigger.create({
      trigger: sec,
      start: 'top 55%',
      end: 'bottom 55%',
      onEnter: () => (document.body.dataset.theme = sec.dataset.themeTrigger),
      onEnterBack: () => (document.body.dataset.theme = sec.dataset.themeTrigger),
    });
  });
  ScrollTrigger.create({
    trigger: '.hero',
    start: 'top top',
    end: 'bottom 55%',
    onEnter: () => (document.body.dataset.theme = 'hero'),
    onEnterBack: () => (document.body.dataset.theme = 'hero'),
  });

  /* ---------- split-word headline reveals ---------- */
  document.querySelectorAll('[data-split]').forEach((h) => {
    gsap.from(h.querySelectorAll('.w > span'), {
      yPercent: 115,
      rotate: 2,
      duration: 0.9,
      stagger: 0.06,
      ease: 'power4.out',
      scrollTrigger: { trigger: h, start: 'top 84%' },
    });
  });

  /* ---------- generic reveals ---------- */
  document.querySelectorAll('.rv').forEach((el) => {
    gsap.from(el, {
      y: 30,
      opacity: 0,
      duration: 0.9,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });

  /* ---------- signature: deity + flanking lamps rise together ---------- */
  gsap.from('.signature-stage > *', {
    y: 64,
    opacity: 0,
    duration: 1.15,
    stagger: 0.14,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.signature-stage', start: 'top 82%' },
  });

  /* ---------- cards: staggered rise with slight tilt ---------- */
  gsap.from('#cardGrid .card', {
    y: 60,
    opacity: 0,
    rotateX: 6,
    transformOrigin: '50% 100%',
    duration: 1,
    stagger: 0.1,
    ease: 'power3.out',
    scrollTrigger: { trigger: '#cardGrid', start: 'top 82%' },
  });

  /* ---------- big 1996: scrubbed scale + drift ---------- */
  gsap.fromTo(
    '#bigYear',
    { scale: 0.82, yPercent: 12 },
    {
      scale: 1,
      yPercent: -6,
      ease: 'none',
      scrollTrigger: { trigger: '#heritage', start: 'top 90%', end: 'bottom 30%', scrub: true },
    },
  );

  /* ---------- counters ---------- */
  document.querySelectorAll('[data-count]').forEach((el) => {
    const end = +el.dataset.count,
      suf = el.dataset.suffix || '';
    const obj = { v: 0 };
    gsap.to(obj, {
      v: end,
      duration: 1.6,
      ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 88%' },
      onUpdate: () => (el.textContent = Math.round(obj.v) + suf),
    });
  });

  /* ---------- occasions: slide in ---------- */
  gsap.utils.toArray('.occ').forEach((row, i) => {
    gsap.from(row, {
      x: -46,
      opacity: 0,
      duration: 0.8,
      ease: 'power3.out',
      delay: (i % 5) * 0.04,
      scrollTrigger: { trigger: row, start: 'top 90%' },
    });
  });

  /* ---------- promise items ---------- */
  gsap.from('.promise-item', {
    y: 44,
    opacity: 0,
    duration: 0.9,
    stagger: 0.12,
    ease: 'power3.out',
    scrollTrigger: { trigger: '.promise-grid', start: 'top 84%' },
  });

  /* ---------- ticker skew on scroll velocity ---------- */
  const skewSetter = gsap.quickSetter('.ticker-track', 'skewX', 'deg');
  let targetSkew = 0,
    currentSkew = 0;
  ScrollTrigger.create({
    onUpdate: (self) => {
      targetSkew = gsap.utils.clamp(-8, 8, self.getVelocity() / -320);
    },
  });
  gsap.ticker.add(() => {
    targetSkew *= 0.9; // decay toward rest
    currentSkew += (targetSkew - currentSkew) * 0.12; // lerp for smoothness
    skewSetter(currentSkew);
  });

  /* ---------- scroll progress ---------- */
  gsap.to('#progress', {
    scaleX: 1,
    ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
  });

  /* ---------- cursor glow (desktop) ---------- */
  if (matchMedia('(hover:hover)').matches) {
    const glow = document.getElementById('cursorGlow');
    const gx = gsap.quickTo(glow, 'x', { duration: 0.6, ease: 'power3' });
    const gy = gsap.quickTo(glow, 'y', { duration: 0.6, ease: 'power3' });
    addEventListener('mousemove', (e) => {
      gsap.to(glow, { opacity: 1, duration: 0.4 });
      gx(e.clientX);
      gy(e.clientY);
    });
    document.addEventListener('mouseleave', () => gsap.to(glow, { opacity: 0, duration: 0.4 }));
  }

  /* ---------- magnetic buttons ---------- */
  if (matchMedia('(hover:hover)').matches) {
    document.querySelectorAll('[data-magnetic]').forEach((btn) => {
      const xTo = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3' });
      const yTo = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3' });
      btn.addEventListener('mousemove', (e) => {
        const r = btn.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.28);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.32);
      });
      btn.addEventListener('mouseleave', () => {
        xTo(0);
        yTo(0);
      });
    });
  }
}
