export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";
import type { HandleUploadBody } from "@vercel/blob/client";

// Production: handle the client-side Vercel Blob token exchange
// The browser calls @vercel/blob/client upload() which sends a JSON body here
// The file then goes directly from the browser to Vercel Blob CDN
// ─────────────────────────────────────────────────────────────────────────────
// Local dev (no BLOB_READ_WRITE_TOKEN): accept FormData, write to public/uploads/

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") || "";

  if (process.env.BLOB_READ_WRITE_TOKEN && !contentType.includes("multipart/form-data")) {
    // ── Vercel Blob client upload (production) ────────────────────────────
    try {
      const { handleUpload } = await import("@vercel/blob/client");
      const body = await request.json() as HandleUploadBody;

      const jsonResponse = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async () => {
          return {
            allowedContentTypes: [
              "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/m4a",
              "audio/ogg", "audio/webm", "audio/mp4", "audio/aac",
              "video/mp4", "video/quicktime", "video/webm", "video/3gpp",
              "image/jpeg", "image/png",
            ],
            maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB
          };
        },
        onUploadCompleted: async () => {
          // Optional post-upload hook — nothing needed here
        },
      });

      return NextResponse.json(jsonResponse);
    } catch (error) {
      console.error("Blob client upload error:", error);
      return NextResponse.json(
        { message: (error as Error).message || "Upload failed" },
        { status: 400 }
      );
    }
  }

  // ── Local dev: FormData upload → public/uploads/ ──────────────────────
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = (formData.get("projectId") as string | null) || "general";

    if (!file) {
      return NextResponse.json({ message: "No file provided" }, { status: 400 });
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 50) {
      return NextResponse.json({ message: "File exceeds 50MB limit" }, { status: 400 });
    }

    const ext = file.name.split(".").pop() || "bin";
    const uniqueName = `${nanoid(12)}.${ext}`;
    const uploadsDir = path.join(process.cwd(), "public", "uploads", projectId);
    await mkdir(uploadsDir, { recursive: true });
    await writeFile(path.join(uploadsDir, uniqueName), Buffer.from(await file.arrayBuffer()));

    return NextResponse.json({
      url: `/uploads/${projectId}/${uniqueName}`,
      fileName: file.name,
      fileType: file.type,
      fileSizeMB: parseFloat(fileSizeMB.toFixed(2)),
    });
  } catch (error) {
    console.error("Local upload error:", error);
    return NextResponse.json({ message: "Upload failed" }, { status: 500 });
  }
}
