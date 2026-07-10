// =============================================================================
// LOCATION CONSENT
// A tasteful, on-brand banner that asks the visitor to share their location so
// KPS Silver can understand where across the country people discover the store.
// The choice is remembered in localStorage so returning visitors aren't nagged.
// Resolves with `true` when the visitor agrees to share precise location.
// =============================================================================

const STORAGE_KEY = 'kps_location_consent';

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* private mode — ignore */
  }
}

function bannerMarkup() {
  return `
<div class="loc-consent" id="locConsent" role="dialog" aria-live="polite" aria-label="Location sharing">
  <div class="loc-consent-ic" aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none">
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.5"/>
    </svg>
  </div>
  <div class="loc-consent-body">
    <strong>Share your location?</strong>
    <p>We'd love to know which corners of the country our silver reaches. It helps us serve you better — and it's never shared with anyone.</p>
  </div>
  <div class="loc-consent-actions">
    <button type="button" class="loc-btn loc-btn--ghost" data-loc="deny">Not now</button>
    <button type="button" class="loc-btn loc-btn--solid" data-loc="allow">Allow</button>
  </div>
</div>`;
}

function showBanner() {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.innerHTML = bannerMarkup();
    const banner = host.firstElementChild;
    document.body.appendChild(banner);

    requestAnimationFrame(() => banner.classList.add('is-in'));

    const finish = (granted) => {
      writeStored(granted ? 'granted' : 'denied');
      banner.classList.remove('is-in');
      const remove = () => banner.remove();
      banner.addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 500);
      resolve(granted);
    };

    banner.querySelector('[data-loc="allow"]').addEventListener('click', () => finish(true));
    banner.querySelector('[data-loc="deny"]').addEventListener('click', () => finish(false));
  });
}

// Returns a Promise<boolean> — true when the visitor allows precise location.
export async function requestLocationConsent() {
  // If the browser already has a decision on geolocation, honour it silently.
  if (navigator.permissions?.query) {
    try {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      if (status.state === 'granted') return true;
      if (status.state === 'denied') return false;
    } catch {
      /* Permissions API unavailable — fall back to our banner */
    }
  }

  const stored = readStored();
  if (stored === 'granted') return true;
  if (stored === 'denied') return false;

  // No prior decision — ask, after a short beat so it doesn't fight the hero.
  await new Promise((r) => setTimeout(r, 1800));
  return showBanner();
}
