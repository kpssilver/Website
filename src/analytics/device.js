// =============================================================================
// DEVICE / CONTEXT DETECTION
// Lightweight user-agent parsing so the super admin can segment visitors by
// device, browser and OS without pulling in a heavy library.
// =============================================================================

export function detectDeviceType() {
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return 'tablet';
  }
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

export function detectBrowser() {
  const ua = navigator.userAgent;
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome';
  if (/CriOS/i.test(ua)) return 'Chrome';
  if (/Firefox\/|FxiOS/i.test(ua)) return 'Firefox';
  if (/Safari\//i.test(ua) && /Version\//i.test(ua)) return 'Safari';
  return 'Other';
}

export function detectOS() {
  const ua = navigator.userAgent;
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Other';
}

export function collectContext() {
  return {
    user_agent: navigator.userAgent,
    device_type: detectDeviceType(),
    browser: detectBrowser(),
    os: detectOS(),
    language: navigator.language || null,
    referrer: document.referrer || null,
    entry_page: window.location.pathname + window.location.search,
    screen_width: window.screen?.width || null,
    screen_height: window.screen?.height || null,
  };
}
