import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/call-recordings/[id] — delete a recording (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const recording = await prisma.callRecording.findUnique({ where: { id } });
  if (!recording)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Delete file from storage — best-effort, don't fail if file is missing
  try {
    if (recording.fileUrl) {
      if (process.env.BLOB_READ_WRITE_TOKEN) {
        // Production: Vercel Blob
        const { del } = await import("@vercel/blob");
        await del(recording.fileUrl);
      } else {
        // Local dev: file lives in public/uploads/
        const { unlink } = await import("fs/promises");
        const { join } = await import("path");
        const relativePath = new URL(recording.fileUrl, "http://localhost").pathname;
        await unlink(join(process.cwd(), "public", relativePath)).catch(() => {});
      }
    }
  } catch {
    // Storage deletion failed — still delete the DB record
  }

  await prisma.callRecording.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
