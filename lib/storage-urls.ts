import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase-admin";

/**
 * Short-lived signed links for stored files.
 *
 * The database keeps each file's original Supabase public URL (no migration).
 * Routes that hand files to a browser pass those URLs through `signUrls` first,
 * so viewers get a link that expires. That works while the bucket is still
 * public, and keeps working once the bucket is switched to private — which is
 * the point: after the switch, the old public links stop working and only
 * links signed here (by a route that already checked who is asking) do.
 */

export const VIEW_TTL_SECONDS = 2 * 60 * 60; // review pages: 2 hours
export const EXPORT_TTL_SECONDS = 7 * 24 * 60 * 60; // dataset exports / manifests: 7 days

/** Object path inside the bucket for a stored Supabase URL, or null if it isn't one of ours. */
export function objectPathFromUrl(fileUrl: string): string | null {
  for (const kind of ["public", "sign", "authenticated"]) {
    const marker = `/storage/v1/object/${kind}/${STORAGE_BUCKET}/`;
    const i = fileUrl.indexOf(marker);
    if (i !== -1) return decodeURIComponent(fileUrl.slice(i + marker.length).split("?")[0]);
  }
  return null;
}

/**
 * Sign many stored URLs at once. Returns a map original → signed.
 * URLs that aren't in our bucket (or fail to sign) map to themselves, so a
 * storage hiccup degrades to the old behaviour instead of blanking a page.
 */
export async function signUrls(urls: (string | null | undefined)[], ttlSeconds = VIEW_TTL_SECONDS): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(urls.filter((u): u is string => !!u))];
  for (const u of unique) out.set(u, u);
  const supabase = getSupabaseAdmin();
  const byPath = new Map<string, string>();
  for (const u of unique) {
    const p = objectPathFromUrl(u);
    if (p) byPath.set(p, u);
  }
  if (!supabase || byPath.size === 0) return out;
  const paths = [...byPath.keys()];
  for (let i = 0; i < paths.length; i += 500) {
    const chunk = paths.slice(i, i + 500);
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(chunk, ttlSeconds);
    if (error || !data) {
      console.error("createSignedUrls failed:", error?.message);
      continue;
    }
    for (const row of data) {
      const original = row.path ? byPath.get(row.path) : undefined;
      if (original && row.signedUrl) out.set(original, row.signedUrl);
    }
  }
  return out;
}

/** Sign one stored URL. */
export async function signUrl(url: string | null | undefined, ttlSeconds = VIEW_TTL_SECONDS): Promise<string | null> {
  if (!url) return url ?? null;
  return (await signUrls([url], ttlSeconds)).get(url) ?? url;
}

/** Every file URL a submission references (primary + the files JSON). */
export function submissionFileUrls(sub: { fileUrl?: string | null; files?: string | null }): string[] {
  const urls: string[] = [];
  if (sub.fileUrl) urls.push(sub.fileUrl);
  if (sub.files) {
    try {
      const arr = JSON.parse(sub.files);
      if (Array.isArray(arr)) for (const f of arr) if (f?.url) urls.push(f.url);
    } catch {}
  }
  return urls;
}

/** Rewrite a submission's fileUrl and files JSON with signed links from `map`. */
export function withSignedFiles<T extends { fileUrl: string; files: string | null }>(sub: T, map: Map<string, string>): T {
  let files = sub.files;
  if (files) {
    try {
      const arr = JSON.parse(files);
      if (Array.isArray(arr)) files = JSON.stringify(arr.map((f) => (f?.url ? { ...f, url: map.get(f.url) ?? f.url } : f)));
    } catch {}
  }
  return { ...sub, fileUrl: map.get(sub.fileUrl) ?? sub.fileUrl, files };
}
