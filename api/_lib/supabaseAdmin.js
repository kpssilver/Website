// =============================================================================
// SUPABASE ADMIN — shared server-side helper for staff management.
//
// Imported ONLY from server contexts: the Vercel serverless functions in
// /api/staff and the local Vite dev middleware (see vite.config.js). It uses
// the Supabase SERVICE ROLE key, which bypasses RLS and can create/manage auth
// users, so it must NEVER be imported from browser/frontend code.
// =============================================================================
import { createClient } from '@supabase/supabase-js';

// Staff log in with their mobile number; Supabase Auth is email-based, so we
// map each mobile to a deterministic synthetic email. This MUST match the
// mapping used on the client (src/admin/auth.js).
export const STAFF_EMAIL_DOMAIN = 'staff.kpssilver.app';

export function emailFromMobile(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  return `${digits}@${STAFF_EMAIL_DOMAIN}`;
}

// Reads Supabase server env (falls back to the VITE_ URL / anon key for local dev).
export function readSupabaseEnv(source = process.env) {
  return {
    url: source.SUPABASE_URL || source.VITE_SUPABASE_URL,
    serviceKey: source.SUPABASE_SERVICE_ROLE_KEY,
    anonKey: source.SUPABASE_ANON_KEY || source.VITE_SUPABASE_ANON_KEY,
  };
}

export function getAdminClient(env) {
  const { url, serviceKey } = env || {};
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Verify the caller is a signed-in super admin. `authHeader` is the incoming
// Authorization header ("Bearer <access_token>"). Returns { admin, user } on
// success or { error: { status, message } } on failure.
export async function requireAdmin(authHeader, env) {
  const client = getAdminClient(env);
  if (!client) {
    return { error: { status: 500, message: 'Server is not configured (missing SUPABASE_SERVICE_ROLE_KEY).' } };
  }
  const token = String(authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { error: { status: 401, message: 'Missing authentication token.' } };

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    // A malformed/expired user token AND a wrong server service key both land
    // here. Surface the underlying reason so misconfiguration is diagnosable
    // (e.g. "Invalid API key" means SUPABASE_SERVICE_ROLE_KEY is wrong).
    const reason = error?.message ? ` (${error.message})` : '';
    return { error: { status: 401, message: `Could not verify your session${reason}.` } };
  }

  const { data: row } = await client
    .from('admin_users')
    .select('user_id')
    .eq('user_id', data.user.id)
    .maybeSingle();
  if (!row) return { error: { status: 403, message: 'Only the super admin can manage staff.' } };

  return { admin: client, user: data.user };
}
