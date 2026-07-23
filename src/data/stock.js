// =============================================================================
// STOCK / INVENTORY — shared data access for the internal stock register.
// Separate from the public shop `products`. Admin and staff can read/write;
// each item is auto-assigned an SKU + design number by a DB trigger. All access
// is guarded by RLS (admin or active staff only).
// =============================================================================
import { supabase, isSupabaseConfigured } from '../config/supabase.js';

const MEDIA_BUCKET = 'product-media';

// Suggestions only — the category field is free text so new lines can be added.
export const STOCK_CATEGORIES = [
  'Pooja Articles',
  'Deities & Singhasans',
  'Gifting Trays',
  'Dinnerware',
  'Home Décor',
  'Clocks & Handbags',
];

export const STOCK_SUBCATEGORIES = [
  'Deepam / Vilakku',
  'Kalash',
  'Idol / Vigraham',
  'Singhasan',
  'Plate / Thali',
  'Bowl / Cup',
  'Tray',
  'Photo Frame',
  'Coin',
  'Utensil',
];

export async function fetchStockItems() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('stock_items')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function insertStockItem(payload) {
  const { data, error } = await supabase.from('stock_items').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateStockItem(id, payload) {
  const { error } = await supabase.from('stock_items').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteStockItem(id) {
  const { error } = await supabase.from('stock_items').delete().eq('id', id);
  if (error) throw error;
}

// ---- Inventory movements (opening / restock / sale / return ledger) --------
export async function fetchStockMovements(stockItemId) {
  if (!isSupabaseConfigured || !stockItemId) return [];
  const { data, error } = await supabase
    .from('stock_movements')
    .select('*')
    .eq('stock_item_id', stockItemId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ---- Master dropdown lists (category / subcategory / supplier / collection) --
// Persisted so options added "on the go" are reusable and carry proper details.
export async function fetchStockLists() {
  if (!isSupabaseConfigured) return { category: [], subcategory: [], supplier: [], collection: [] };
  const { data, error } = await supabase.from('stock_lists').select('*').order('name');
  const grouped = { category: [], subcategory: [], supplier: [], collection: [] };
  if (error) return grouped;
  (data || []).forEach((r) => {
    if (grouped[r.kind]) grouped[r.kind].push(r);
  });
  return grouped;
}

export async function insertStockList(payload) {
  const { data, error } = await supabase.from('stock_lists').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateStockList(id, payload) {
  const { error } = await supabase.from('stock_lists').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteStockList(id) {
  const { error } = await supabase.from('stock_lists').delete().eq('id', id);
  if (error) throw error;
}

// The stock item linked to a shop product (used to show inventory from Products).
export async function fetchStockItemByProduct(productId) {
  if (!isSupabaseConfigured || !productId) return null;
  const { data, error } = await supabase
    .from('stock_items')
    .select('id, sku, title, product_id, quantity')
    .eq('product_id', productId)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

// Manually add stock (returns the updated stock item). Logged as a movement.
export async function restockItem(stockItemId, qty, note = null) {
  const { data, error } = await supabase.rpc('restock_item', {
    p_stock_item_id: stockItemId,
    p_qty: Math.round(Number(qty) || 0),
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}

// Create a return against an original sale invoice. The backend verifies the
// item was actually sold on that invoice before restocking. Returns the new
// sale_return invoice.
export async function processReturn({ stockItemId, productId, invoiceNo, qty }) {
  const { data, error } = await supabase.rpc('process_return', {
    p_stock_item_id: stockItemId || null,
    p_product_id: productId || null,
    p_invoice_no: (invoiceNo || '').trim(),
    p_qty: Number(qty) || 0,
  });
  if (error) throw error;
  return data;
}

export async function uploadStockMedia(file) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `stock/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

// Sum of (gross weight × quantity) across all items, in grams.
export function totalGrossWeight(items) {
  return (items || []).reduce(
    (sum, it) => sum + (Number(it.gross_weight) || 0) * (Number(it.quantity) || 1),
    0,
  );
}

export function totalQuantity(items) {
  return (items || []).reduce((sum, it) => sum + (Number(it.quantity) || 1), 0);
}

export function formatGrams(g) {
  const n = Number(g) || 0;
  if (n >= 1000) return `${(n / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg`;
  return `${n.toLocaleString('en-IN', { maximumFractionDigits: 3 })} g`;
}

export function firstImage(item) {
  return Array.isArray(item?.images) && item.images.length ? item.images[0] : null;
}

// Distinct, sorted, non-empty values of a field across items — used to build the
// category / subcategory / supplier / collection dropdown suggestions.
export function distinctValues(items, field) {
  const set = new Set();
  for (const it of items || []) {
    const v = (it?.[field] ?? '').toString().trim();
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Merge previously-used values with a static seed list (deduped, sorted).
export function mergeSuggestions(used, seeds = []) {
  const set = new Set([...(seeds || []), ...(used || [])].map((s) => String(s).trim()).filter(Boolean));
  return [...set].sort((a, b) => a.localeCompare(b));
}
