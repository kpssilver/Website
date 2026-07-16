// =============================================================================
// SILVER PRICING ENGINE
// A master silver rate (per gram, per purity) + per-product weightage, making
// charges and/or labour, plus GST, produce a transparent price breakdown shown
// on the storefront. Shared by the shop and the admin product manager so the
// numbers always match.
//
// Price = (weight × rate) + weightage% + [making] + [labour] + GST%
//   • charge_mode decides which of making / labour apply (or both, or none)
//   • making_charge_type: percent (of metal+weightage) | per_gram | flat
//   • labour_type: per_gram | flat
// =============================================================================
import { supabase, isSupabaseConfigured } from '../config/supabase.js';

export const DEFAULT_PRICING = {
  silver_rate_925: 0,
  silver_rate_999: 0,
  gst_percent: 3,
  silver_source: 'manual',
  silver_rate_updated_at: null,
  silver_market_timestamp: null,
};

export const PRICING_MODES = [
  { value: 'calculated', label: 'Auto-calculate from silver rate' },
  { value: 'fixed', label: 'Fixed price' },
  { value: 'on_request', label: 'Price on request' },
];

export const CHARGE_MODES = [
  { value: 'making', label: 'Making charges only' },
  { value: 'labour', label: 'Labour only' },
  { value: 'both', label: 'Making charges + Labour' },
  { value: 'none', label: 'No charges (metal only)' },
];

export function purityLabel(code) {
  if (code === '999') return '999 Fine Silver';
  if (code === '925') return '925 Sterling Silver';
  return '';
}

export function formatMoney(n) {
  return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
}

// The live per-gram silver price used for EVERY calculation. Purity is now
// descriptive only — pricing always uses 100% of the market silver price ×
// weight, regardless of whether the piece is 925 or 999.
export function rateFor(_product, settings) {
  const s = settings || DEFAULT_PRICING;
  return Number(s.silver_rate_999 || 0);
}

function makingLabel(p) {
  const v = Number(p.making_charge_value || 0);
  if (p.making_charge_type === 'percent') return `Making charges (${v}%)`;
  if (p.making_charge_type === 'per_gram') return `Making charges (₹${v.toLocaleString('en-IN')}/g)`;
  return 'Making charges';
}

function labourLabel(p) {
  const v = Number(p.labour_value || 0);
  return p.labour_type === 'per_gram' ? `Labour (₹${v.toLocaleString('en-IN')}/g)` : 'Labour';
}

// Returns { mode, total, lines: [{label, amount}], ...parts }.
// mode 'unset' means a calculated product whose rate/weight isn't set yet.
export function computePrice(product, settings) {
  const s = settings || DEFAULT_PRICING;
  const mode = product?.pricing_mode || 'calculated';

  if (mode === 'on_request') return { mode: 'on_request', total: null, lines: [] };
  if (mode === 'fixed') {
    const total = Number(product.price || 0);
    return { mode: 'fixed', total, lines: [{ label: 'Price', amount: total }] };
  }

  const weight = Number(product.weight_grams || 0);
  const rate = rateFor(product, s);
  if (!(rate > 0) || !(weight > 0)) return { mode: 'unset', total: null, lines: [] };

  const metal = weight * rate;
  const weightagePct = Number(product.weightage_percent || 0);
  const weightage = metal * (weightagePct / 100);
  const base = metal + weightage;

  const cm = product.charge_mode || 'making';
  let making = 0;
  let labour = 0;
  if (cm === 'making' || cm === 'both') {
    const t = product.making_charge_type;
    const v = Number(product.making_charge_value || 0);
    making = t === 'percent' ? base * (v / 100) : t === 'per_gram' ? weight * v : v;
  }
  if (cm === 'labour' || cm === 'both') {
    const v = Number(product.labour_value || 0);
    labour = product.labour_type === 'per_gram' ? weight * v : v;
  }

  const subtotal = base + making + labour;
  const gstPct = Number(s.gst_percent || 0);
  const gst = subtotal * (gstPct / 100);
  const total = subtotal + gst;

  const lines = [{ label: `Silver · ${weight} g × ₹${Number(rate).toLocaleString('en-IN')}/g`, amount: metal }];
  if (weightage > 0) lines.push({ label: `Weightage (${weightagePct}%)`, amount: weightage });
  if (making > 0) lines.push({ label: makingLabel(product), amount: making });
  if (labour > 0) lines.push({ label: labourLabel(product), amount: labour });
  lines.push({ label: `GST (${gstPct}%)`, amount: gst });

  return { mode: 'calculated', rate, metal, weightage, making, labour, subtotal, gst, gstPct, total, lines };
}

// Short price string for cards / lists.
export function priceLabel(product, settings) {
  const r = computePrice(product, settings);
  if (r.mode === 'on_request' || r.mode === 'unset') return 'Price on request';
  return formatMoney(r.total);
}

// Storefront price label — plain formatted price (no "approx" prefix).
export function shopPriceLabel(product, settings) {
  const r = computePrice(product, settings);
  if (r.mode === 'on_request' || r.mode === 'unset') return 'Price on request';
  return formatMoney(r.total);
}

// Note shown under the price on the product detail page for market-derived
// prices. The amount is already displayed above, so it isn't repeated here.
export function approxSentence() {
  return 'Based on current market prices, this is an approximate price.';
}

export async function fetchPricingSettings() {
  if (!isSupabaseConfigured) return { ...DEFAULT_PRICING };
  const { data, error } = await supabase.from('pricing_settings').select('*').eq('id', 1).single();
  if (error || !data) return { ...DEFAULT_PRICING };
  return data;
}
