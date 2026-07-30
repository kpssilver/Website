// =============================================================================
// ADMINS — shared server-side core (create / list / delete).
//
// Server-only (service role). Lets an existing admin provision additional
// administrators. Each function returns { status, body } so both the Vercel
// functions and the Vite dev middleware can respond uniformly. Every action
// requires a signed-in admin (requireAdmin). Deleting another admin also
// requires the caller's own password + a current TOTP code (verified server-side).
// =============================================================================
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from './supabaseAdmin.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Confirm the caller's own password + authenticator code via a throwaway
// anon client. Does not touch the browser session. Returns { userId } or
// { error: { status, message } }.
async function verifyCallerPasswordAndTotp(email, password, totpCode, env) {
  const { url, anonKey } = env || {};
  if (!url || !anonKey) {
    return { error: { status: 500, message: 'Server is not configured for credential verification.' } };
  }
  if (!email) return { error: { status: 400, message: 'Could not confirm your account email.' } };
  if (!password) return { error: { status: 400, message: 'Your account password is required.' } };
  if (String(totpCode || '').replace(/\D/g, '').length !== 6) {
    return { error: { status: 400, message: 'A valid 6-digit authenticator code is required.' } };
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signed, error: pwErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (pwErr || !signed?.user) {
    return { error: { status: 401, message: 'That password is incorrect.' } };
  }

  const { data: factors, error: facErr } = await client.auth.mfa.listFactors();
  if (facErr) return { error: { status: 400, message: facErr.message } };

  const factor =
    (factors?.totp || []).find((f) => f.status === 'verified') ||
    (factors?.all || []).find((f) => f.factor_type === 'totp' && f.status === 'verified');
  if (!factor) {
    return {
      error: {
        status: 400,
        message: 'Enable an authenticator app in Security before removing other admins.',
      },
    };
  }

  const { error: totpErr } = await client.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code: String(totpCode).replace(/\D/g, ''),
  });
  if (totpErr) {
    return { error: { status: 401, message: 'That authenticator code was incorrect.' } };
  }

  return { userId: signed.user.id };
}

// POST /api/admins/create  { name, email, password }
export async function createAdmin(payload, authHeader, env) {
  const gate = await requireAdmin(authHeader, env);
  if (gate.error) return { status: gate.error.status, body: { error: gate.error.message } };
  const { admin, user } = gate;

  const name = String(payload?.name || '').trim();
  const email = String(payload?.email || '').trim().toLowerCase();
  const password = String(payload?.password || '');

  if (!name) return { status: 400, body: { error: 'Admin name is required.' } };
  if (!EMAIL_RE.test(email)) return { status: 400, body: { error: 'Enter a valid email address.' } };
  if (password.length < 8) return { status: 400, body: { error: 'Password must be at least 8 characters.' } };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role: 'admin' },
  });
  if (createErr || !created?.user) {
    const msg = /already|exists|registered/i.test(createErr?.message || '')
      ? 'An account with this email already exists.'
      : createErr?.message || 'Could not create the admin account.';
    return { status: 400, body: { error: msg } };
  }

  const { error: rowErr } = await admin.from('admin_users').insert({
    user_id: created.user.id,
    name,
    created_by: user.id,
  });
  if (rowErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { status: 400, body: { error: rowErr.message || 'Could not save the admin profile.' } };
  }

  return { status: 200, body: { ok: true, user_id: created.user.id, name, email } };
}

// POST /api/admins/list  {}
export async function listAdmins(payload, authHeader, env) {
  const gate = await requireAdmin(authHeader, env);
  if (gate.error) return { status: gate.error.status, body: { error: gate.error.message } };
  const { admin, user } = gate;

  const { data: rows, error } = await admin
    .from('admin_users')
    .select('user_id, name, created_at')
    .order('created_at', { ascending: true });
  if (error) return { status: 400, body: { error: error.message } };

  // Resolve each admin's email (and a fallback name) from the auth record.
  const admins = await Promise.all(
    (rows || []).map(async (r) => {
      let email = '';
      try {
        const { data } = await admin.auth.admin.getUserById(r.user_id);
        email = data?.user?.email || '';
        if (!r.name) r.name = data?.user?.user_metadata?.name || '';
      } catch {
        /* auth user may have been removed out-of-band */
      }
      return {
        user_id: r.user_id,
        name: r.name || email || 'Admin',
        email,
        created_at: r.created_at,
        is_self: r.user_id === user.id,
      };
    }),
  );

  return { status: 200, body: { ok: true, admins } };
}

// POST /api/admins/delete  { user_id, password, totp_code }
export async function deleteAdmin(payload, authHeader, env) {
  const gate = await requireAdmin(authHeader, env);
  if (gate.error) return { status: gate.error.status, body: { error: gate.error.message } };
  const { admin, user } = gate;

  const userId = String(payload?.user_id || '');
  const password = String(payload?.password || '');
  const totpCode = String(payload?.totp_code || payload?.code || '').replace(/\D/g, '');

  if (!userId) return { status: 400, body: { error: 'Missing admin id.' } };
  if (userId === user.id) return { status: 400, body: { error: 'You cannot remove your own admin access.' } };

  // Sensitive action: the signed-in admin must prove their own identity with
  // password + current authenticator code before another admin can be removed.
  const identity = await verifyCallerPasswordAndTotp(user.email, password, totpCode, env);
  if (identity.error) return { status: identity.error.status, body: { error: identity.error.message } };
  if (identity.userId !== user.id) {
    return { status: 403, body: { error: 'Credentials do not match the signed-in admin.' } };
  }

  const { data: row } = await admin.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
  if (!row) return { status: 404, body: { error: 'Admin not found.' } };

  // Never allow removing the last remaining administrator.
  const { count } = await admin.from('admin_users').select('user_id', { count: 'exact', head: true });
  if ((count ?? 0) <= 1) return { status: 400, body: { error: 'At least one administrator must remain.' } };

  // Deleting the auth user cascades to admin_users (FK on delete cascade).
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return { status: 400, body: { error: delErr.message || 'Could not remove the admin account.' } };
  await admin.from('admin_users').delete().eq('user_id', userId);
  return { status: 200, body: { ok: true } };
}

// Route an admin action by name — used by the Vite dev middleware.
export async function handleAdminAction(action, payload, authHeader, env) {
  switch (action) {
    case 'create':
      return createAdmin(payload, authHeader, env);
    case 'list':
      return listAdmins(payload, authHeader, env);
    case 'delete':
      return deleteAdmin(payload, authHeader, env);
    default:
      return { status: 404, body: { error: 'Unknown admin action.' } };
  }
}
