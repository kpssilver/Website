// =============================================================================
// LOCATION RESOLUTION
// Two strategies, in order of precision:
//   1. Precise GPS via the browser Geolocation API (needs user permission),
//      reverse-geocoded to a city/region/country with a free, key-less API.
//   2. Coarse IP-based lookup (no permission needed) as a graceful fallback so
//      the admin still sees *roughly* where a visitor came from.
// Both endpoints are free, client-side and require no API key.
// =============================================================================

// --- Precise: browser geolocation -------------------------------------------
export function getPreciseCoords({ timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 },
    );
  });
}

// Turn lat/lng into a human place name (BigDataCloud, no key required).
export async function reverseGeocode(latitude, longitude) {
  const url =
    'https://api.bigdatacloud.net/data/reverse-geocode-client' +
    `?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Reverse geocode failed');
  const d = await res.json();
  return {
    city: d.city || d.locality || null,
    region: d.principalSubdivision || null,
    country: d.countryName || null,
    country_code: d.countryCode || null,
  };
}

// --- Coarse: IP-based lookup (fallback) --------------------------------------
export async function getLocationByIp() {
  const res = await fetch('https://ipapi.co/json/');
  if (!res.ok) throw new Error('IP lookup failed');
  const d = await res.json();
  return {
    ip_address: d.ip || null,
    city: d.city || null,
    region: d.region || null,
    country: d.country_name || null,
    country_code: d.country_code || null,
    latitude: typeof d.latitude === 'number' ? d.latitude : null,
    longitude: typeof d.longitude === 'number' ? d.longitude : null,
  };
}

// High-level helper: try precise GPS first (caller must have consent), then
// fall back to IP. Returns a patch object ready to write to visitor_sessions.
export async function resolveLocation({ allowPrecise }) {
  if (allowPrecise) {
    try {
      const coords = await getPreciseCoords();
      let place = {};
      try {
        place = await reverseGeocode(coords.latitude, coords.longitude);
      } catch {
        /* keep coords even if reverse-geocode fails */
      }
      return {
        location_granted: true,
        location_source: 'gps',
        ...coords,
        ...place,
      };
    } catch {
      /* permission denied or timed out — fall through to IP */
    }
  }

  try {
    const ip = await getLocationByIp();
    return {
      location_granted: false,
      location_source: 'ip',
      ...ip,
    };
  } catch {
    return { location_granted: false, location_source: null };
  }
}
