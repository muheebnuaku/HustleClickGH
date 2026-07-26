export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { allocateToProject } from "@/lib/org";

// POST /api/admin/data-projects/[id]/org-approve { action: "approve" | "reject" }
// Approves an org-submitted project: allocates its funded budget from the org
// wallet (at the CURRENT price, which the admin may have edited) and makes it live.
// Reject sends it back as rejected. Admin only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const { action, contributorReward } = await request.json().catch(() => ({}));
  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ message: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.dataProject.findUnique as any)({ where: { id } });
  if (!project) return NextResponse.json({ message: "Project not found" }, { status: 404 });
  if (!project.orgId) return NextResponse.json({ message: "Not an organization project" }, { status: 400 });
  if (project.status !== "pending_review") {
    return NextResponse.json({ message: "This project isn't awaiting review" }, { status: 400 });
  }

  if (action === "reject") {
    await prisma.dataProject.update({ where: { id }, data: { status: "rejected" } });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // Approve: the admin sets the contributor reward (what contributors earn/see).
  // It must not exceed the org's price — the platform keeps the difference.
  const orgPrice = project.orgPrice ?? project.reward;
  const reward = Number(contributorReward);
  if (!(reward > 0)) return NextResponse.json({ message: "Set a contributor reward greater than 0" }, { status: 400 });
  if (reward > orgPrice) {
    return NextResponse.json({ message: `Contributor reward can't exceed the buyer's price ($${orgPrice.toFixed(2)}).` }, { status: 400 });
  }

  // Fund the budget from the org wallet at the BUYER price, then go live.
  const budget = Math.round(orgPrice * project.maxSubmissions * 100) / 100;
  const funded = await allocateToProject(project.orgId, id, budget);
  if (!funded) {
    return NextResponse.json(
      { message: `The organization's wallet can't cover this project ($${budget.toFixed(2)}). Ask them to top up before approving.` },
      { status: 402 }
    );
  }
  await prisma.dataProject.update({ where: { id }, data: { status: "active", reward } });
  return NextResponse.json({ ok: true, status: "active", funded: budget, contributorReward: reward, margin: orgPrice - reward });
}
