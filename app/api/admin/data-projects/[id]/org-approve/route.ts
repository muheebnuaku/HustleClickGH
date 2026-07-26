export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { allocateToProject } from "@/lib/org";
import { getUsdToGhsRate, convertUsdToGhs } from "@/lib/fx";

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

  // Approve: the buyer pays in USD; the contributor is paid in Cedis. The admin
  // sets the contributor reward (GH₵), which can't exceed the Cedi value of the
  // buyer's payment — the platform keeps the difference (in Cedis).
  const orgPriceUsd = project.orgPrice ?? project.reward;
  const rate = await getUsdToGhsRate();
  const buyerGhs = convertUsdToGhs(orgPriceUsd, rate);
  const reward = Number(contributorReward); // GH₵
  if (!(reward > 0)) return NextResponse.json({ message: "Set a contributor reward greater than 0" }, { status: 400 });
  if (reward > buyerGhs) {
    return NextResponse.json({ message: `Contributor reward can't exceed the buyer's payment (GH₵${buyerGhs.toFixed(2)}).` }, { status: 400 });
  }

  // Fund the budget from the org wallet at the BUYER price (USD), then go live.
  const budget = Math.round(orgPriceUsd * project.maxSubmissions * 100) / 100;
  const funded = await allocateToProject(project.orgId, id, budget);
  if (!funded) {
    return NextResponse.json(
      { message: `The organization's wallet can't cover this project ($${budget.toFixed(2)}). Ask them to top up before approving.` },
      { status: 402 }
    );
  }
  await prisma.dataProject.update({ where: { id }, data: { status: "active", reward } });
  return NextResponse.json({ ok: true, status: "active", funded: budget, contributorReward: reward, marginGhs: buyerGhs - reward });
}
