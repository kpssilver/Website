// =============================================================================
// BUSINESS / BILLING — data access for parties (customers & sellers), invoices
// (sale / sale return / purchase / purchase return), line items and payments.
// Receivables & payables are derived server-side by party_balances().
// All access is admin-or-staff (enforced by RLS).
// =============================================================================
import { supabase, isSupabaseConfigured } from '../config/supabase.js';

export const INVOICE_KINDS = [
  { value: 'sale', label: 'Sale invoice', party: 'customer', short: 'Sale' },
  { value: 'sale_return', label: 'Sales return', party: 'customer', short: 'Sale return' },
  { value: 'purchase', label: 'Purchase invoice', party: 'seller', short: 'Purchase' },
  { value: 'purchase_return', label: 'Purchase return', party: 'seller', short: 'Purchase return' },
];

export function invoiceKind(value) {
  return INVOICE_KINDS.find((k) => k.value === value) || INVOICE_KINDS[0];
}

// ---- Parties ---------------------------------------------------------------
export async function fetchParties(kind = null) {
  if (!isSupabaseConfigured) return [];
  let q = supabase.from('parties').select('*').order('name');
  if (kind) q = q.eq('kind', kind);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function insertParty(payload) {
  const { data, error } = await supabase.from('parties').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateParty(id, payload) {
  const { error } = await supabase.from('parties').update(payload).eq('id', id);
  if (error) throw error;
}

export async function deleteParty(id) {
  const { error } = await supabase.from('parties').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchPartyBalances() {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('party_balances');
  if (error) throw error;
  return data || [];
}

// ---- Invoices --------------------------------------------------------------
export async function fetchInvoices({ limit = 200 } = {}) {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('invoices')
    .select('*, party:parties(id,name,kind,mobile)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchInvoice(id) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, party:parties(*), items:invoice_items(*)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Creates the invoice header, then its line items.
export async function createInvoice(invoice, items) {
  const { data: inv, error } = await supabase.from('invoices').insert(invoice).select().single();
  if (error) throw error;
  if (items && items.length) {
    const rows = items.map((it) => ({ ...it, invoice_id: inv.id }));
    const { error: e2 } = await supabase.from('invoice_items').insert(rows);
    if (e2) throw e2;
  }
  return inv;
}

export async function deleteInvoice(id) {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
}

// ---- Payments (settlements) ------------------------------------------------
export async function createPayment(payload) {
  const { data, error } = await supabase.from('payments').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function fetchPayments(partyId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchInvoicesByParty(partyId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('party_id', partyId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Map of user_id -> { name, role } for admins + staff, used to show who did what.
export async function fetchUserDirectory() {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await supabase.rpc('user_directory');
  if (error) return {};
  const map = {};
  (data || []).forEach((u) => {
    map[u.user_id] = { name: u.name, role: u.role };
  });
  return map;
}

// Human label for an actor id using a directory map from fetchUserDirectory().
export function actorLabel(dir, uid) {
  if (!uid) return '—';
  const u = dir && dir[uid];
  if (!u) return 'Unknown';
  return u.role && u.role !== 'user' ? `${u.name} (${u.role})` : u.name;
}

export function money(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
