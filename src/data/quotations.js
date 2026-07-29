// =============================================================================
// QUOTATIONS DATA ACCESS
// Saved quotations & drafts live in the `quotations` table (columns + rows are
// stored as JSON so the flexible, admin-defined structure round-trips exactly).
// Reads/writes require a signed-in admin or staff member (enforced by RLS).
// =============================================================================
import { supabase, isSupabaseConfigured } from '../config/supabase.js';

export async function fetchQuotations() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('quotations')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function insertQuotation(payload) {
  const { data, error } = await supabase.from('quotations').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateQuotation(id, payload) {
  const { data, error } = await supabase.from('quotations').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteQuotation(id) {
  const { error } = await supabase.from('quotations').delete().eq('id', id);
  if (error) throw error;
}

// Ensure a quotation has a public share token, creating one if needed. Returns
// the token so the caller can build a /quote?t=<token> link.
export async function ensureShareToken(id, existing = null) {
  if (existing) return existing;
  const token = crypto.randomUUID();
  const { data, error } = await supabase
    .from('quotations')
    .update({ share_token: token })
    .eq('id', id)
    .select('share_token')
    .single();
  if (error) throw error;
  return data.share_token;
}

// Public (anon) read of a shared quotation via a SECURITY DEFINER RPC. Returns
// the quotation record, or null if the token is unknown/revoked.
export async function fetchSharedQuotation(token) {
  if (!isSupabaseConfigured || !token) return null;
  const { data, error } = await supabase.rpc('get_shared_quotation', { p_token: token });
  if (error) throw error;
  return Array.isArray(data) ? data[0] || null : data || null;
}
