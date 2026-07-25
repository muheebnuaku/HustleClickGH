export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";

// Data-subject erasure request: permanently deletes the logged-in user's account.
// Related records are removed via the schema's onDelete: Cascade relations.
// Requires an explicit confirmation flag to prevent accidental deletion.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== "DELETE") {
      return NextResponse.json(
        { message: 'Please confirm deletion by sending confirm: "DELETE".' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    // Log the request before the record disappears (ActivityLog.userId is not an FK).
    await logActivity({
      type: "account_delete_request",
      userId: user.id,
      userName: user.fullName,
      severity: "warning",
      metadata: { userId: user.userId, email: user.email },
      ip: getIp(request),
    });

    // Erasure propagation: this user's approved data in *organization* projects has
    // likely been delivered to a buyer. Write a PII-free tombstone per item so the
    // buyer can purge it from any dataset they already downloaded — then the cascade
    // delete removes the live submission rows.
    const delivered = await prisma.dataSubmission.findMany({
      where: { userId: user.id, status: "approved", project: { orgId: { not: null } } },
      select: { id: true, projectId: true, fileHash: true, project: { select: { orgId: true } } },
    });
    if (delivered.length) {
      await prisma.erasureTombstone.createMany({
        data: delivered.map((s) => ({
          orgId: s.project.orgId as string,
          projectId: s.projectId,
          submissionRef: s.id,
          fileHash: s.fileHash,
          reason: "account_deletion",
        })),
      });
    }

    await prisma.user.delete({ where: { id: user.id } });

    return NextResponse.json({ message: "Your account and data have been deleted." });
  } catch (error) {
    console.error("Account delete error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
