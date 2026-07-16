// Vercel Serverless Function — POST /api/create-order
// Creates a Razorpay order server-side (KEY_SECRET never reaches the browser).
import { createOrder, readEnv } from './_lib/razorpay.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  // Fallback: read the raw stream (some runtimes don't pre-parse the body).
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const body = await parseBody(req);
  const { status, body: out } = await createOrder(body, readEnv());
  return res.status(status).json(out);
}
