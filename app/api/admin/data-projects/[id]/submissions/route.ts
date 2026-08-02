export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getContributorQuality } from "@/lib/reputation";
import { getSupabaseAdmin, STORAGE_BUCKET } from "@/lib/supabase-admin";

// Turn a Supabase public URL into the object path inside the storage bucket.
function objectPathFromUrl(fileUrl: string): string | null {
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const i = fileUrl.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(fileUrl.slice(i + marker.length).split("?")[0]);
}

// Collect every stored file URL for a submission (primary + files JSON).
function submissionUrls(sub: { fileUrl: string; files: string | null }): string[] {
  const urls = new Set<string>();
  if (sub.fileUrl) urls.add(sub.fileUrl);
  if (sub.files) {
    try {
      const arr = JSON.parse(sub.files);
      if (Array.isArray(arr)) for (const f of arr) if (f?.url) urls.add(f.url);
    } catch {}
  }
  return [...urls];
}

// GET: All submissions for a project
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id: projectId } = await params;

    const submissions = await prisma.dataSubmission.findMany({
      where: { projectId },
      include: {
        user: {
          select: { id: true, userId: true, fullName: true, email: true, phone: true },
        },
      },
      orderBy: { submittedAt: "desc" },
    });

    // Contributor reputation (approval rate) as a reviewer signal.
    const userIds = Array.from(new Set(submissions.map((s) => s.userId)));
    const quality = await getContributorQuality(userIds);
    const enriched = submissions.map((s) => ({ ...s, contributorQuality: quality.get(s.userId) ?? null }));

    return NextResponse.json({ submissions: enriched });
  } catch (error) {
    console.error("Admin submissions fetch error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}

// DELETE: bulk-delete submissions (their DB rows + files in storage).
// Approved submissions are skipped — they've been counted/paid, so removing them
// would leave the project's counts and a contributor's balance inconsistent.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }
    const { id: projectId } = await params;
    const { ids } = await request.json().catch(() => ({}));
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ message: "No submissions selected" }, { status: 400 });
    }

    const subs = await prisma.dataSubmission.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true, status: true, fileUrl: true, files: true },
    });

    const deletable = subs.filter((s) => s.status !== "approved");
    const skippedApproved = subs.length - deletable.length;
    if (deletable.length === 0) {
      return NextResponse.json({ message: "Approved submissions can't be deleted.", deleted: 0, skippedApproved }, { status: 400 });
    }

    // Best-effort: remove the files from Supabase Storage first.
    const supabase = getSupabaseAdmin();
    if (supabase) {
      const paths = deletable
        .flatMap((s) => submissionUrls(s))
        .map(objectPathFromUrl)
        .filter((p): p is string => Boolean(p));
      if (paths.length) {
        try { await supabase.storage.from(STORAGE_BUCKET).remove(paths); } catch { /* keep going */ }
      }
    }

    const result = await prisma.dataSubmission.deleteMany({
      where: { id: { in: deletable.map((s) => s.id) }, projectId },
    });

    return NextResponse.json({ deleted: result.count, skippedApproved });
  } catch (error) {
    console.error("Admin submissions delete error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
