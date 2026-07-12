import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Read-only client for the dashboard. RLS only permits SELECT with this key;
// all writes go through the ingest_trip RPC using the secret key (see README).
export function getSupabase(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example)."
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}
