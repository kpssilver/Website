// =============================================================================
// RAZORPAY — Standard Checkout (frontend)
// Loads checkout.js on demand, creates an order via our serverless API, opens
// the payment modal, then verifies the signature server-side. No secret ever
// lives here — only the public key id (VITE_RAZORPAY_KEY_ID) is used.
// =============================================================================
const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
let sdkPromise = null;

function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => res(window.Razorpay);
    s.onerror = () => {
      sdkPromise = null;
      rej(new Error('Could not load the payment gateway. Check your connection and retry.'));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response (e.g. static host with no API) */
  }
  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status}).`;
    throw new Error(msg);
  }
  return data || {};
}

// startCheckout({ amountPaise, currency?, receipt?, name?, description?, notes?,
//                 prefill?, theme?, onSuccess?, onError?, onDismiss? })
export async function startCheckout(options = {}) {
  const {
    amountPaise,
    currency = 'INR',
    receipt,
    name = 'KPS Silver',
    description = '',
    notes = {},
    prefill = {},
    theme = { color: '#4A0E14' },
    onSuccess,
    onError,
    onDismiss,
  } = options;

  const amount = Math.round(Number(amountPaise));
  if (!Number.isFinite(amount) || amount < 100) {
    onError?.(new Error('This item is not available for online payment.'));
    return;
  }

  try {
    const [Razorpay, order] = await Promise.all([
      loadCheckout(),
      postJson('/api/create-order', { amount, currency, receipt, notes }),
    ]);

    const keyId = import.meta.env.VITE_RAZORPAY_KEY_ID || order.key_id;
    if (!keyId) throw new Error('Payment key is not configured.');

    const rzp = new Razorpay({
      key: keyId,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name,
      description,
      notes,
      prefill,
      theme,
      handler: async (response) => {
        try {
          const result = await postJson('/api/verify-payment', {
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          if (result?.verified) onSuccess?.(result);
          else onError?.(new Error('Payment could not be verified. If money was debited it will be refunded.'));
        } catch (err) {
          onError?.(err);
        }
      },
      modal: {
        ondismiss: () => onDismiss?.(),
      },
    });

    // Razorpay fires this when a payment attempt fails inside the modal.
    rzp.on('payment.failed', (resp) => {
      onError?.(new Error(resp?.error?.description || 'Payment failed. Please try again.'));
    });

    rzp.open();
  } catch (err) {
    onError?.(err);
  }
}
