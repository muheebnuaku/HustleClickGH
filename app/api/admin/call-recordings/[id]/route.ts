import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// DELETE /api/admin/call-recordings/[id] — delete a recording (admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (user?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const recording = await prisma.callRecording.findUnique({
    where: { id },
    select: { id: true, fileUrl: true },
  });
  if (!recording)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Try to delete the stored file
  try {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Production: delete from Vercel Blob
      const { del } = await import("@vercel/blob");
      await del(recording.fileUrl);
    } else {
      // Dev: delete from public/uploads/
      const { unlink } = await import("fs/promises");
      const { join } = await import("path");
      const urlPath = new URL(recording.fileUrl).pathname; // e.g. /uploads/xxx/file.webm
      const filePath = join(process.cwd(), "public", urlPath);
      await unlink(filePath);
    }
  } catch {
    // File already gone or inaccessible — continue to remove the DB row
  }

  await prisma.callRecording.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
