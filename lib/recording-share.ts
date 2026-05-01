/**
 * Server-side helper for auto-sharing recordings between call partners.
 * Downloads an existing recording and re-uploads it to create a copy.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Download and re-upload a recording to create a copy for the other user.
 * Handles both Vercel Blob URLs (production) and local file paths (dev).
 */
function mimeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "mp4") return "video/mp4";
  if (ext === "ogg") return "audio/ogg";
  if (ext === "webm") return "video/webm";
  return "audio/webm";
}

export async function downloadAndReuploadRecording(
  sourceUrl: string,
  suggestedFileName: string,
): Promise<string> {
  try {
    // Determine if URL is a Vercel Blob URL or local path
    const isLocalPath = sourceUrl.startsWith("/uploads/");
    const isBlob = sourceUrl.includes("blob.vercel-storage.com");

    if (isLocalPath) {
      // Local development: copy from public/uploads/ to public/uploads/
      const publicDir = join(process.cwd(), "public");
      const sourcePath = join(publicDir, sourceUrl);
      const fileName = `${Date.now()}-${suggestedFileName}`;
      const destPath = join(publicDir, "uploads", fileName);

      try {
        const content = readFileSync(sourcePath);
        writeFileSync(destPath, content);
        return `/uploads/${fileName}`;
      } catch {
        throw new Error(`Failed to copy local file: ${sourceUrl}`);
      }
    }

    if (isBlob) {
      // Production: download from Vercel Blob and re-upload
      const buffer = await fetch(sourceUrl).then((res) => {
        if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
        return res.arrayBuffer();
      });

      const mime = mimeFromFileName(suggestedFileName);
      const blob = new Blob([buffer], { type: mime });
      const file = new File([blob], suggestedFileName, { type: mime });

      // Import Vercel Blob server SDK
      const { put } = await import("@vercel/blob");

      // Generate a timestamp-based filename to avoid collisions
      const ext = suggestedFileName.includes(".")
        ? suggestedFileName.slice(suggestedFileName.lastIndexOf("."))
        : ".webm";
      const base = suggestedFileName.includes(".")
        ? suggestedFileName.slice(0, suggestedFileName.lastIndexOf("."))
        : suggestedFileName;
      const uniqueName = `${base}-${Date.now()}${ext}`;

      const result = await put(`recordings/${uniqueName}`, file, {
        access: "public",
      });

      return result.url;
    }

    throw new Error(`Unsupported URL format: ${sourceUrl}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    throw new Error(`Failed to download and re-upload recording: ${message}`);
  }
}
