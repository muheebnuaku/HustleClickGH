export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";
import { orgProjectAccess } from "@/lib/org-access";
import { logActivity, getIp } from "@/lib/activity-log";

// PATCH /api/org/projects/[id]/submissions/[subId]  { verdict: "pass"|"fail"|null, note? }
// The client marks a submission pass/fail. Advisory: it doesn't pay or reject the
// contributor — the admin sees the verdict and makes the final decision.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; subId: string }> }) {
  const { session, org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id, subId } = await params;
  const { project } = await orgProjectAccess(org.id, id);
  if (!project) return NextResponse.json({ message: "Project not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const verdict = body.verdict === "pass" || body.verdict === "fail" ? body.verdict : null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (verdict === "fail" && !note) {
    return NextResponse.json({ message: "Add a short reason so the team knows what to fix." }, { status: 400 });
  }

  const updated = await prisma.dataSubmission.updateMany({
    where: { id: subId, projectId: id, status: { not: "rejected" } },
    data: {
      clientVerdict: verdict,
      clientNote: verdict ? note || null : null,
      clientReviewedAt: verdict ? new Date() : null,
    },
  });
  if (!updated.count) return NextResponse.json({ message: "Submission not found" }, { status: 404 });

  logActivity({
    type: "client_review",
    userId: session?.user?.id ?? null,
    userName: org.name,
    severity: verdict === "fail" ? "warning" : "info",
    metadata: { projectId: id, projectTitle: project.title, submissionId: subId, verdict, note: note || null },
    ip: getIp(request),
  });

  return NextResponse.json({ ok: true, verdict, note: verdict ? note || null : null });
}
