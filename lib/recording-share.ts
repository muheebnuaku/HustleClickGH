/**
 * Server-side helper for auto-sharing recordings between call partners.
 * Downloads an existing recording and re-uploads it to Supabase Storage so the
 * other user gets their own copy.
 */

import { nanoid } from "nanoid";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase-admin";

function mimeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "mp4") return "video/mp4";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "webm") return "video/webm";
  return "audio/webm";
}

/**
 * Download a recording from its URL and re-upload it as a fresh Supabase object,
 * returning the new public URL.
 */
export async function downloadAndReuploadRecording(
  sourceUrl: string,
  suggestedFileName: string,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Storage not configured — SUPABASE_SERVICE_ROLE_KEY missing");

  const mime = mimeFromFileName(suggestedFileName);
  const buffer = await fetch(sourceUrl).then((res) => {
    if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
    return res.arrayBuffer();
  });

  const ext = suggestedFileName.includes(".")
    ? suggestedFileName.slice(suggestedFileName.lastIndexOf(".") + 1).replace(/[^a-zA-Z0-9]/g, "")
    : "webm";
  const objectPath = `recordings/${nanoid(16)}.${ext || "webm"}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(objectPath, Buffer.from(buffer), { contentType: mime, upsert: true });
  if (error) throw new Error(`Failed to re-upload recording: ${error.message}`);

  const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
  return pub.publicUrl;
}
