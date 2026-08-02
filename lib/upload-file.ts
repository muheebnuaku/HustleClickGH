import { getSupabaseBrowser } from "@/lib/supabase-browser";

/**
 * SHA-256 of a file, computed in the browser (native crypto.subtle). Sent with a
 * submission so the server can dedup WITHOUT re-downloading the file — this keeps
 * the submit endpoint thin under load (hundreds of concurrent submissions).
 * Requires a secure context (https / localhost); returns undefined otherwise.
 */
export async function sha256Hex(blob: Blob): Promise<string | undefined> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) return undefined;
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}

/** Append Supabase's ?download param so browsers (esp. mobile) SAVE the file
 *  with Content-Disposition: attachment instead of opening it inline. */
export function toDownloadUrl(url: string, filename?: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("download", filename || "");
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}download=${encodeURIComponent(filename || "")}`;
  }
}

/**
 * Uploads a file/blob to Supabase Storage.
 *
 * Flow (same in dev and prod — all files live in Supabase):
 *   1. Ask /api/upload for a signed upload token (server authenticates the
 *      session and reserves a unique object path).
 *   2. Upload the file DIRECTLY from the browser to Supabase Storage with that
 *      token — the bytes never pass through the Next.js serverless function, so
 *      there is no 4.5 MB body limit.
 *   3. Return the file's public URL.
 *
 * `projectId` is used as the storage folder prefix (e.g. "recordings",
 * "sample-videos", or an actual project id).
 */
export async function uploadFile(
  file: File | Blob,
  projectId: string,
  suggestedName?: string,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; fileName: string; fileType: string; fileSizeMB: number }> {
  const name =
    suggestedName ||
    (file instanceof File ? file.name : `recording-${Date.now()}.webm`);

  const fileSizeMB = parseFloat((file.size / (1024 * 1024)).toFixed(2));
  const uploadBlob =
    file instanceof File ? file : new File([file], name, { type: file.type });

  onProgress?.(5);

  // 1. Reserve a signed upload URL from the server.
  const signRes = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, fileName: name }),
  });
  if (!signRes.ok) {
    let msg = "Upload failed";
    try { msg = (await signRes.json()).message || msg; } catch {}
    throw new Error(msg);
  }
  const { bucket, path, token, publicUrl } = await signRes.json();

  // 2. Upload straight to Supabase Storage with the signed token.
  const supabase = getSupabaseBrowser();
  if (!supabase) throw new Error("Storage unavailable — Supabase is not configured");

  onProgress?.(15);
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, uploadBlob, {
      contentType: uploadBlob.type || "application/octet-stream",
      upsert: true,
    });
  if (error) throw new Error(error.message || "Upload failed");
  onProgress?.(100);

  return {
    url: publicUrl,
    fileName: name,
    fileType: file.type,
    fileSizeMB,
  };
}
