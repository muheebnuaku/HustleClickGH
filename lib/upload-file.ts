import { getSupabaseBrowser } from "@/lib/supabase-browser";

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
