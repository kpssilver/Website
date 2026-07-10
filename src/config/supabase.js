// =============================================================================
// SUPABASE CLIENT — single shared browser client for the whole app.
// Reads the project URL + publishable (anon) key from Vite env vars so no
// secrets are hard-coded. Both values are safe to ship to the browser; all
// data access is guarded by Row Level Security on the Supabase side.
// =============================================================================
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Surfaced clearly in the console if the .env.local file is missing.
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[KPS] Supabase env vars missing. Copy .env.example to .env.local and set ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        // The landing page is anonymous; only the admin dashboard signs in.
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;
