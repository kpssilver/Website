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

export async function fetchRecentSessions(limit = 30) {
  const { data, error } = await supabase
    .from('visitor_sessions')
    .select(
      'session_key, started_at, total_time_seconds, city, region, country, country_code, device_type, browser, os, location_granted, location_source',
    )
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
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
