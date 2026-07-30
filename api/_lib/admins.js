// =============================================================================
// ADMINS — shared server-side core (create / list / reset password / delete).
//
// Server-only (service role). Lets an existing admin provision additional
// administrators. Each function returns { status, body } so both the Vercel
// functions and the Vite dev middleware can respond uniformly. Every action
// requires a signed-in admin (requireAdmin).
// =============================================================================
import { requireAdmin } from './supabaseAdmin.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

// POST /api/admins/delete  { user_id }
export async function deleteAdmin(payload, authHeader, env) {
  const gate = await requireAdmin(authHeader, env);
  if (gate.error) return { status: gate.error.status, body: { error: gate.error.message } };
  const { admin, user } = gate;

  const userId = String(payload?.user_id || '');
  if (!userId) return { status: 400, body: { error: 'Missing admin id.' } };
  if (userId === user.id) return { status: 400, body: { error: 'You cannot remove your own admin access.' } };

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
