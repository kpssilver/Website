// =============================================================================
// STAFF API CLIENT
// Thin wrapper around the /api/staff/* serverless endpoints. Every call carries
// the admin's Supabase access token; the server verifies it's a super admin
// before using the service_role key to manage staff auth accounts.
// =============================================================================
import { getAccessToken } from './auth.js';

async function post(action, body) {
  const token = await getAccessToken();
  const res = await fetch(`/api/staff/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  });
  let json = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
  return json;
}

export const staffApi = {
  create: (name, mobile, password, mustChange = true) => post('create', { name, mobile, password, mustChange }),
  resetPassword: (userId, password) => post('reset-password', { user_id: userId, password }),
  setActive: (userId, active) => post('set-active', { user_id: userId, active }),
  remove: (userId) => post('delete', { user_id: userId }),
};
