// =============================================================================
// PRODUCTS — shared data access + helpers used by both the storefront (Shop)
// and the admin product manager. Reads are public (anon); writes require the
// signed-in super admin (enforced by RLS).
// =============================================================================
import { supabase, isSupabaseConfigured } from '../config/supabase.js';
import { site } from '../config/site.js';

// Categories mirror the landing-page "Collections" grid so a card can deep-link
// straight into the matching shop filter.
export const PRODUCT_CATEGORIES = [
  'Pooja Articles',
  'Deities & Singhasans',
  'Gifting Trays',
  'Dinnerware',
  'Home Décor',
  'Clocks & Handbags',
];

// Fetch products. `category` filters by exact category; `onlyInStock` hides
// sold-out items (used by the public shop).
export async function fetchProducts({ category = null, onlyInStock = false } = {}) {
  if (!isSupabaseConfigured) return [];
  let q = supabase
    .from('products')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });
  if (category) q = q.eq('category', category);
  if (onlyInStock) q = q.eq('in_stock', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchProduct(id) {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.from('products').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export function firstImage(product) {
  return Array.isArray(product?.images) && product.images.length ? product.images[0] : null;
}

export function formatWeight(product) {
  if (!product?.weight_grams) return '';
  const g = Number(product.weight_grams);
  if (g >= 1000) return `${(g / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg`;
  return `${g.toLocaleString('en-IN', { maximumFractionDigits: 2 })} g`;
}

// Pre-filled WhatsApp enquiry for a specific product. Includes the product
// title and (when provided) a direct link back to the listing.
export function productWhatsAppUrl(product, link) {
  const lines = [`Namaste, I'm interested in "${product?.title || 'a silver piece'}" at KPS Silver.`];
  if (link) lines.push(`Product link: ${link}`);
  lines.push('Could you please share more details — price, weight and availability?');
  return `https://wa.me/${site.contact.whatsappNumber}?text=${encodeURIComponent(lines.join('\n'))}`;
}

// WhatsApp enquiry for a whole category (used by the empty-state prompt).
export function categoryWhatsAppUrl(category) {
  const msg = category
    ? `Namaste, I'm looking for "${category}" at KPS Silver. Could you please share what's available?`
    : `Namaste, I'd like to know what silver pieces are available at KPS Silver.`;
  return `https://wa.me/${site.contact.whatsappNumber}?text=${encodeURIComponent(msg)}`;
}

// Shareable direct link to a product on the shop page.
export function productLink(product) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/shop.html?product=${product?.id ?? ''}`;
}
