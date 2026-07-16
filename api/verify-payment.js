// Vercel Serverless Function — POST /api/verify-payment
// Verifies the Razorpay payment signature. Returns success ONLY when the
// HMAC-SHA256 signature matches; never trust the client for payment status.
import { verifyPayment, readEnv } from './_lib/razorpay.js';

async function parseBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
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
  const { status, body: out } = verifyPayment(body, readEnv());
  return res.status(status).json(out);
}
