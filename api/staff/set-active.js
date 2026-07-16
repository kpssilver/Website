// Vercel Serverless Function — POST /api/staff/set-active
import { setStaffActive } from '../_lib/staff.js';
import { readSupabaseEnv } from '../_lib/supabaseAdmin.js';
import { parseBody } from '../_lib/body.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const body = await parseBody(req);
  const { status, body: out } = await setStaffActive(body, req.headers.authorization, readSupabaseEnv());
  return res.status(status).json(out);
}
