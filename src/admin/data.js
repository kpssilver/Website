// =============================================================================
// DASHBOARD DATA ACCESS
// Thin wrappers over Supabase queries. Every call runs as the signed-in admin,
// so Row Level Security returns the real analytics data. Views are used for the
// heavier aggregations; a single RPC returns the KPI summary.
// =============================================================================
import { supabase } from '../config/supabase.js';

function sinceIso(days) {
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function fetchSummary() {
  const { data, error } = await supabase.rpc('dashboard_summary');
  if (error) throw error;
  return data;
}

export async function fetchDailyTraffic() {
  const { data, error } = await supabase
    .from('v_daily_traffic')
    .select('*')
    .order('day', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchSectionEngagement() {
  const { data, error } = await supabase
    .from('v_section_engagement')
    .select('*');
  if (error) throw error;
  return data;
}

export async function fetchDeviceBreakdown() {
  const { data, error } = await supabase.from('v_device_breakdown').select('*');
  if (error) throw error;
  return data;
}

export async function fetchCountryBreakdown() {
  const { data, error } = await supabase
    .from('v_country_breakdown')
    .select('*')
    .limit(12);
  if (error) throw error;
  return data;
}

export async function fetchCityBreakdown() {
  const { data, error } = await supabase
    .from('v_city_breakdown')
    .select('*')
    .limit(12);
  if (error) throw error;
  return data;
}

export async function fetchEventCounts() {
  const { data, error } = await supabase.from('v_event_counts').select('*');
  if (error) throw error;
  return data;
}

export async function fetchRecentEvents(limit = 60) {
  const { data, error } = await supabase
    .from('page_events')
    .select('event_type, event_label, section, created_at, session_key')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// All shop/storefront engagement events (product views, category views,
// searches and enquiries), tagged with section = 'shop' by the storefront.
export async function fetchShopEvents(limit = 2000) {
  const { data, error } = await supabase
    .from('page_events')
    .select('event_type, event_label, created_at, session_key')
    .eq('section', 'shop')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

const SESSION_LIST_COLUMNS =
  'session_key, started_at, last_seen_at, total_time_seconds, city, region, country, country_code, device_type, browser, os, location_granted, location_source';

export async function fetchRecentSessions(limit = 30) {
  const { data, error } = await supabase
    .from('visitor_sessions')
    .select(SESSION_LIST_COLUMNS)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function fetchAllSessions(limit = 300) {
  const { data, error } = await supabase
    .from('visitor_sessions')
    .select(SESSION_LIST_COLUMNS)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// Sessions whose heartbeat fired recently — i.e. "viewing right now".
export async function fetchLiveSessions(windowSeconds = 45) {
  const since = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const { data, error } = await supabase
    .from('visitor_sessions')
    .select(SESSION_LIST_COLUMNS)
    .gte('last_seen_at', since)
    .order('last_seen_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Full drill-down for one visitor: their session, section time and event trail.
export async function fetchSessionDetail(sessionKey) {
  const [sessionRes, sectionsRes, eventsRes] = await Promise.all([
    supabase.from('visitor_sessions').select('*').eq('session_key', sessionKey).single(),
    supabase
      .from('section_views')
      .select('section, time_spent_seconds, view_count, updated_at')
      .eq('session_key', sessionKey)
      .order('time_spent_seconds', { ascending: false }),
    supabase
      .from('page_events')
      .select('event_type, event_label, section, created_at')
      .eq('session_key', sessionKey)
      .order('created_at', { ascending: true }),
  ]);
  if (sessionRes.error) throw sessionRes.error;
  return {
    session: sessionRes.data,
    sections: sectionsRes.data || [],
    events: eventsRes.data || [],
  };
}

// Sessions that resolved to real coordinates — for the map.
export async function fetchLocatedSessions(days = null) {
  let q = supabase
    .from('visitor_sessions')
    .select('latitude, longitude, city, region, country, total_time_seconds, location_source, started_at')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .limit(1000);
  const since = sinceIso(days);
  if (since) q = q.gte('started_at', since);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
