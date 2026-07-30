// =============================================================================
// ANALYTICS DEVICE EXCLUSION
// A persistent, per-device opt-out so the shop's own team never inflates the
// visitor insights — even when they browse the public site later signed out.
//
// The flag lives in localStorage (survives tab close and sign-out) and is set:
//   • immediately on visiting /admin or /staff (login screen counts — no sign-in
//     required), and
//   • on demand by visiting any public page with ?kpsnotrack=1 (undo: ?kpstrack=1).
// =============================================================================
const NO_TRACK_KEY = 'kps_no_track';

export function excludeThisDevice() {
  try {
    localStorage.setItem(NO_TRACK_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

export function includeThisDevice() {
  try {
    localStorage.removeItem(NO_TRACK_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function isDeviceExcludedFlag() {
  try {
    return localStorage.getItem(NO_TRACK_KEY) === '1';
  } catch {
    return false;
  }
}

// Read the exclusion state, first honouring ?kpsnotrack=1 / ?kpstrack=1 URL
// overrides so a link can turn tracking off (or back on) for this device.
export function isDeviceExcluded() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.has('kpsnotrack')) excludeThisDevice();
    if (params.has('kpstrack')) includeThisDevice();
  } catch {
    /* ignore */
  }
  return isDeviceExcludedFlag();
}
