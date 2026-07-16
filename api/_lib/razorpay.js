// =============================================================================
// RAZORPAY — shared server-side core (order creation + signature verification).
//
// This module is imported ONLY from server contexts: the Vercel serverless
// functions in /api and the local Vite dev middleware (see vite.config.js).
// It uses the Razorpay Node SDK and node:crypto, so it must NEVER be imported
// from browser/frontend code. RAZORPAY_KEY_SECRET stays here and never leaves
// the server.
//
// Each function returns { status, body } so both runtimes can respond uniformly.
// =============================================================================
import Razorpay from 'razorpay';
import crypto from 'node:crypto';

const MIN_AMOUNT_PAISE = 100; // Razorpay minimum is ₹1 = 100 paise.

// Reads the credentials from a process.env-shaped object.
export function readEnv(source = process.env) {
  return { keyId: source.RAZORPAY_KEY_ID, keySecret: source.RAZORPAY_KEY_SECRET };
}

// POST /api/create-order
// payload: { amount (paise), currency?, receipt?, notes? }
export async function createOrder(payload, env) {
  const { keyId, keySecret } = env || {};
  if (!keyId || !keySecret) {
    return { status: 500, body: { error: 'Payment gateway is not configured.' } };
  }

  const amount = Math.round(Number(payload?.amount));
  if (!Number.isFinite(amount) || amount < MIN_AMOUNT_PAISE) {
    return { status: 400, body: { error: `Amount must be at least ${MIN_AMOUNT_PAISE} paise (₹1).` } };
  }

  const currency = String(payload?.currency || 'INR').toUpperCase();
  const receipt = String(payload?.receipt || `rcpt_${Date.now()}`).slice(0, 40);
  const notes = payload?.notes && typeof payload.notes === 'object' ? payload.notes : {};

  try {
    const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
    const order = await razorpay.orders.create({ amount, currency, receipt, notes });
    return {
      status: 200,
      body: { order_id: order.id, amount: order.amount, currency: order.currency, key_id: keyId },
    };
  } catch (err) {
    // Razorpay auth failures surface as statusCode 401.
    if (err?.statusCode === 401) {
      return { status: 401, body: { error: 'Payment gateway authentication failed.' } };
    }
    // eslint-disable-next-line no-console
    console.error('[razorpay] create order failed:', err?.error?.description || err?.message || err);
    return { status: 500, body: { error: 'Could not create the order. Please try again.' } };
  }
}

// POST /api/verify-payment
// payload: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Signature = HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET).
export function verifyPayment(payload, env) {
  const { keySecret } = env || {};
  if (!keySecret) {
    return { status: 500, body: { error: 'Payment gateway is not configured.' } };
  }

  const orderId = payload?.razorpay_order_id;
  const paymentId = payload?.razorpay_payment_id;
  const signature = payload?.razorpay_signature;

  if (!orderId || !paymentId || !signature) {
    return { status: 400, body: { verified: false, error: 'Missing payment fields.' } };
  }

  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  // Constant-time comparison to avoid timing side-channels.
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    return { status: 400, body: { verified: false, error: 'Signature verification failed.' } };
  }
  return { status: 200, body: { verified: true, order_id: orderId, payment_id: paymentId } };
}
