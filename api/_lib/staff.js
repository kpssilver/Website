// =============================================================================
// STAFF — shared server-side core (create / reset password / activate / delete).
//
// Server-only (service role). Each function returns { status, body } so both
// the Vercel functions and the Vite dev middleware can respond uniformly.
// Authorization: every action requires a signed-in super admin (requireAdmin).
// =============================================================================
import { requireAdmin, emailFromMobile } from './supabaseAdmin.js';

const BAN_FOREVER = '876000h'; // ~100 years — effectively disables login.

function cleanMobile(mobile) {
  return String(mobile || '').replace(/\D/g, '');
}

// POST /api/staff/create  { name, mobile, password, mustChange? }
export async function createStaff(payload, authHeader, env) {
  const gate = await requireAdmin(authHeader, env);
  if (gate.error) return { status: gate.error.status, body: { error: gate.error.message } };
  const { admin, user } = gate;

  const name = String(payload?.name || '').trim();
  const mobile = cleanMobile(payload?.mobile);
  const password = String(payload?.password || '');
  const mustChange = payload?.mustChange !== false;

  if (!name) return { status: 400, body: { error: 'Staff name is required.' } };
  if (mobile.length < 8) return { status: 400, body: { error: 'Enter a valid mobile number.' } };
  if (password.length < 8) return { status: 400, body: { error: 'Password must be at least 8 characters.' } };

  const email = emailFromMobile(mobile);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, mobile, role: 'staff' },
  });
  if (createErr || !created?.user) {
    const msg = /already|exists|registered/i.test(createErr?.message || '')
      ? 'A staff member with this mobile number already exists.'
      : createErr?.message || 'Could not create the staff account.';
    return { status: 400, body: { error: msg } };
  }

  const { error: rowErr } = await admin.from('staff_users').insert({
    user_id: created.user.id,
    name,
    mobile,
    must_change_password: mustChange,
    created_by: user.id,
  });
  if (rowErr) {
    // Roll back the orphaned auth user so a retry can succeed.
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    const msg = /duplicate|unique/i.test(rowErr.message || '')
      ? 'A staff member with this mobile number already exists.'
      : rowErr.message || 'Could not save the staff profile.';
    return { status: 400, body: { error: msg } };
  }

  return { status: 200, body: { ok: true, user_id: created.user.id, name, mobile } };
}

// POST /api/staff/reset-password  { user_id, password }
export async function resetStaffPassword(payload, authHeader, env) {
  const gate = await requireAdmin(authHeader, env);
  if (gate.error) return { status: gate.error.status, body: { error: gate.error.message } };
  const { admin } = gate;

  const userId = String(payload?.user_id || '');
  const password = String(payload?.password || '');
  if (!userId) return { status: 400, body: { error: 'Missing staff id.' } };
  if (password.length < 8) return { status: 400, body: { error: 'Password must be at least 8 characters.' } };

  // Only allow resetting an actual staff member (not the admin or others).
  const { data: staff } = await admin.from('staff_users').select('user_id').eq('user_id', userId).maybeSingle();
  if (!staff) return { status: 404, body: { error: 'Staff member not found.' } };

  const { error: updErr } = await admin.auth.admin.updateUserById(userId, { password });
  if (updErr) return { status: 400, body: { error: updErr.message || 'Could not reset the password.' } };

  await admin.from('staff_users').update({ must_change_password: true, updated_at: new Date().toISOString() }).eq('user_id', userId);
  return { status: 200, body: { ok: true } };
}

// POST /api/staff/set-active  { user_id, active }
export async function setStaffActive(payload, authHeader, env) {
  const gate = await requireAdmin(authHeader, env);
  if (gate.error) return { status: gate.error.status, body: { error: gate.error.message } };
  const { admin } = gate;

  const userId = String(payload?.user_id || '');
  const active = Boolean(payload?.active);
  if (!userId) return { status: 400, body: { error: 'Missing staff id.' } };

  const { data: staff } = await admin.from('staff_users').select('user_id').eq('user_id', userId).maybeSingle();
  if (!staff) return { status: 404, body: { error: 'Staff member not found.' } };

  const { error: rowErr } = await admin
    .from('staff_users')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (rowErr) return { status: 400, body: { error: rowErr.message } };

  // Also block/allow login at the auth layer.
  await admin.auth.admin.updateUserById(userId, { ban_duration: active ? 'none' : BAN_FOREVER }).catch(() => {});
  return { status: 200, body: { ok: true, active } };
}

// POST /api/staff/delete  { user_id }
export async function deleteStaff(payload, authHeader, env) {
  const gate = await requireAdmin(authHeader, env);
  if (gate.error) return { status: gate.error.status, body: { error: gate.error.message } };
  const { admin } = gate;

  const userId = String(payload?.user_id || '');
  if (!userId) return { status: 400, body: { error: 'Missing staff id.' } };

  const { data: staff } = await admin.from('staff_users').select('user_id').eq('user_id', userId).maybeSingle();
  if (!staff) return { status: 404, body: { error: 'Staff member not found.' } };

  // Deleting the auth user cascades to staff_users (FK on delete cascade).
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return { status: 400, body: { error: delErr.message || 'Could not remove the staff account.' } };
  await admin.from('staff_users').delete().eq('user_id', userId);
  return { status: 200, body: { ok: true } };
}

// Route a staff action by name — used by the Vite dev middleware.
export async function handleStaffAction(action, payload, authHeader, env) {
  switch (action) {
    case 'create':
      return createStaff(payload, authHeader, env);
    case 'reset-password':
      return resetStaffPassword(payload, authHeader, env);
    case 'set-active':
      return setStaffActive(payload, authHeader, env);
    case 'delete':
      return deleteStaff(payload, authHeader, env);
    default:
      return { status: 404, body: { error: 'Unknown staff action.' } };
  }
}
