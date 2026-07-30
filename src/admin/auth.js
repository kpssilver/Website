// =============================================================================
// ADMIN / STAFF AUTH
// Email/password sign-in against Supabase Auth.
//   • The super admin signs in with their email.
//   • Staff sign in with their mobile number, which maps to a deterministic
//     synthetic email (must match api/_lib/supabaseAdmin.js).
// Role is resolved from the admin_users / staff_users tables (via RLS).
// =============================================================================
import { supabase } from '../config/supabase.js';

// Keep in sync with STAFF_EMAIL_DOMAIN in api/_lib/supabaseAdmin.js.
const STAFF_EMAIL_DOMAIN = 'staff.kpssilver.app';

// Map a login identifier to an email. Anything containing "@" is treated as an
// email (admin); a plain number is treated as a staff mobile.
export function resolveLoginEmail(identifier) {
  const id = String(identifier || '').trim();
  if (id.includes('@')) return id;
  const digits = id.replace(/\D/g, '');
  return digits ? `${digits}@${STAFF_EMAIL_DOMAIN}` : id;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signIn(identifier, password) {
  const email = resolveLoginEmail(identifier);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export function onAuthChange(cb) {
  return supabase.auth.onAuthStateChange((_event, session) => cb(session));
}

// Resolve the signed-in user's role + profile.
// Returns one of:
//   { role: 'admin',    user, name }
//   { role: 'staff',    user, name, mustChange, mobile }
//   { role: 'disabled', user, name }   -> staff row exists but inactive
//   { role: 'none',     user }         -> authenticated but not authorised
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { role: 'none', user: null };

  // admin_users is readable only by admins (RLS), so a hit here means admin.
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (adminRow) return { role: 'admin', user, name: user.email || 'Admin' };

  // Staff can read their own row.
  const { data: staffRow } = await supabase
    .from('staff_users')
    .select('name, mobile, active, must_change_password')
    .eq('user_id', user.id)
    .maybeSingle();

  if (staffRow) {
    if (!staffRow.active) return { role: 'disabled', user, name: staffRow.name };
    return {
      role: 'staff',
      user,
      name: staffRow.name,
      mobile: staffRow.mobile,
      mustChange: staffRow.must_change_password,
    };
  }

  return { role: 'none', user };
}

// Access token for authenticated calls to the /api/staff serverless endpoints.
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

// =============================================================================
// TWO-FACTOR AUTHENTICATION (TOTP)  — Supabase Auth MFA
// An admin can enrol an authenticator app (Google Authenticator, Authy, …). Once
// a factor is verified, the session must be elevated to AAL2 with a 6-digit code
// at each login before the dashboard is shown.
// =============================================================================

// Returns { all, totp, phone } factor lists.
export async function listMfaFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data;
}

// The account's assurance state: { currentLevel, nextLevel }.
export async function getAuthenticatorLevels() {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data;
}

// A verified TOTP factor (or null) — i.e. 2FA is fully set up.
export async function getVerifiedTotpFactor() {
  const data = await listMfaFactors();
  return (data?.totp || []).find((f) => f.status === 'verified') || null;
}

// True when the signed-in account still owes a 2FA code this session.
export async function needsMfaChallenge() {
  const levels = await getAuthenticatorLevels();
  return levels.nextLevel === 'aal2' && levels.currentLevel !== 'aal2';
}

// Begin TOTP enrolment. Clears any half-finished (unverified) factors first so a
// fresh QR is always issued. Returns { id, totp: { qr_code, secret, uri } }.
export async function startTotpEnroll() {
  const existing = await listMfaFactors();
  const stale = (existing?.all || existing?.totp || []).filter((f) => f.status === 'unverified');
  for (const f of stale) {
    await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `KPS Authenticator ${Date.now()}`,
  });
  if (error) throw error;
  return data;
}

// Verify a 6-digit code against a factor (used for enrolment activation, login
// elevation, and re-authentication before sensitive actions).
export async function verifyTotpCode(factorId, code) {
  const { data, error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: String(code || '').trim(),
  });
  if (error) throw error;
  return data;
}

export async function unenrollTotp(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
