export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";

const MAX_SIZE_MB = 50;

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const projectId = formData.get("projectId") as string | null;

    if (!file || !projectId) {
      return NextResponse.json(
        { message: "File and projectId are required" },
        { status: 400 }
      );
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > MAX_SIZE_MB) {
      return NextResponse.json(
        { message: `File exceeds maximum allowed size of ${MAX_SIZE_MB}MB` },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() || "bin";
    const uniqueName = `${nanoid(12)}.${ext}`;

    let fileUrl: string;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Production: upload to Vercel Blob
      const blob = await put(`datasets/${projectId}/${uniqueName}`, file, {
        access: "public",
      });
      fileUrl = blob.url;
    } else {
      // Local dev fallback: save to public/uploads/
      const uploadsDir = path.join(
        process.cwd(),
        "public",
        "uploads",
        projectId
      );
      await mkdir(uploadsDir, { recursive: true });
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadsDir, uniqueName), buffer);
      fileUrl = `/uploads/${projectId}/${uniqueName}`;
    }

    return NextResponse.json({
      url: fileUrl,
      fileName: file.name,
      fileType: file.type,
      fileSizeMB: parseFloat(fileSizeMB.toFixed(2)),
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { message: "Upload failed" },
      { status: 500 }
    );
  }
}
