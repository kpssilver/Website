// =============================================================================
// ADMIN API CLIENT
// Thin wrapper around the /api/admins/* serverless endpoints. Every call carries
// the caller's Supabase access token; the server verifies it belongs to an
// admin before using the service_role key to manage administrator accounts.
// =============================================================================
import { getAccessToken } from './auth.js';

async function post(action, body) {
  const token = await getAccessToken();
  const res = await fetch(`/api/admins/${action}`, {
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

export const adminApi = {
  create: (name, email, password) => post('create', { name, email, password }),
  list: () => post('list', {}),
  remove: (userId) => post('delete', { user_id: userId }),
};
