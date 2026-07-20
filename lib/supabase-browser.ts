import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client, used only for Realtime call signaling.
 *
 * This is NOT the database client — data access still goes through Prisma on the
 * server. Here we only open Realtime broadcast channels so two browsers can
 * exchange WebRTC offers/answers/ICE candidates in near real time, instead of
 * polling the database (which was too slow and caused calls to drop).
 *
 * The anon key is a public, browser-safe key. If either env var is missing the
 * getter returns null and callers fall back to the existing DB-poll signaling,
 * so calls keep working — just without the latency win.
 */

const globalForSupabase = globalThis as unknown as {
  supabaseRealtime: SupabaseClient | null | undefined;
};

export function isRealtimeConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Returns a shared browser client, or null when Realtime isn't configured. */
export function getSupabaseBrowser(): SupabaseClient | null {
  if (globalForSupabase.supabaseRealtime !== undefined) {
    return globalForSupabase.supabaseRealtime;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const client = url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: false },
        // Cap how fast a single client fans out signaling messages.
        realtime: { params: { eventsPerSecond: 40 } },
      })
    : null;

  globalForSupabase.supabaseRealtime = client;
  return client;
}
