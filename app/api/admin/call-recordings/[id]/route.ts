import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase-admin";

// Turn a Supabase public URL into the object path inside the storage bucket.
function objectPathFromUrl(fileUrl: string): string | null {
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const i = fileUrl.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(fileUrl.slice(i + marker.length));
}

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

  // Delete file from Supabase Storage — best-effort, don't fail if file is missing
  try {
    const supabase = getSupabaseAdmin();
    const objectPath = recording.fileUrl ? objectPathFromUrl(recording.fileUrl) : null;
    if (supabase && objectPath) {
      await supabase.storage.from(STORAGE_BUCKET).remove([objectPath]);
    }
  } catch {
    // Storage deletion failed — still delete the DB record
  }

  await prisma.callRecording.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
