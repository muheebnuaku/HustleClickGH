import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

// Shared deletion path — used by both the user's own "delete my account"
// request and an admin (or Lana, with admin approval) removing an account.
// Related records are removed via the schema's onDelete: Cascade relations.
export async function deleteUserAccount(
  userId: string,
  opts: { reason: "self_request" | "admin_action"; performedByUserId?: string | null; ip?: string | null }
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  // Log before the record disappears (ActivityLog.userId is not an FK).
  await logActivity({
    type: "account_delete_request",
    userId: user.id,
    userName: user.fullName,
    severity: "warning",
    metadata: {
      userId: user.userId,
      email: user.email,
      reason: opts.reason,
      performedBy: opts.performedByUserId ?? undefined,
    },
    ip: opts.ip ?? null,
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
        reason: opts.reason === "self_request" ? "account_deletion" : "admin_removal",
      })),
    });
  }

  await prisma.user.delete({ where: { id: user.id } });
  return user;
}
