import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service-role key.
 *
 * Used for Storage operations that must bypass RLS — chiefly issuing signed
 * upload URLs so the browser can upload a file DIRECTLY to Supabase Storage
 * (bypassing Vercel's 4.5 MB serverless body limit), and computing public URLs.
 *
 * NEVER import this into client components — the service-role key is a full
 * admin credential. It only reads env at call time so a missing key degrades to
 * a clear 503 instead of crashing the build.
 */

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "uploads";

const globalForSupabaseAdmin = globalThis as unknown as {
  supabaseAdmin: SupabaseClient | null | undefined;
};

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Returns a shared service-role client, or null when Storage isn't configured. */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (globalForSupabaseAdmin.supabaseAdmin !== undefined) {
    return globalForSupabaseAdmin.supabaseAdmin;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const client =
    url && serviceKey
      ? createClient(url, serviceKey, { auth: { persistSession: false } })
      : null;

  globalForSupabaseAdmin.supabaseAdmin = client;
  return client;
}
