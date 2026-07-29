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
