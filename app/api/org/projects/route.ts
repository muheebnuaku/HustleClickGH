export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";
import { LICENSES, DEFAULT_LICENSE } from "@/lib/licenses";

// GET /api/org/projects — the org's own projects with collection progress.
export async function GET() {
  const { org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects = await (prisma.dataProject.findMany as any)({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
  });
  const ids = (projects as Array<{ id: string }>).map((p) => p.id);
  const grouped = ids.length
    ? await prisma.dataSubmission.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: ids } },
        _count: { _all: true },
      })
    : [];
  const counts = new Map<string, { pending: number; approved: number; rejected: number }>();
  for (const g of grouped) {
    const c = counts.get(g.projectId) || { pending: 0, approved: 0, rejected: 0 };
    // @ts-expect-error status is one of the three
    c[g.status] = g._count._all;
    counts.set(g.projectId, c);
  }

  return NextResponse.json({
    walletBalance: org.walletBalance,
    projects: (projects as Array<Record<string, unknown>>).map((p) => ({
      id: p.id, title: p.title, projectType: p.projectType, status: p.status,
      reward: (p.orgPrice ?? p.reward), maxSubmissions: p.maxSubmissions, currentSubmissions: p.currentSubmissions,
      budget: p.budget, spent: p.spent, createdAt: p.createdAt,
      counts: counts.get(p.id as string) || { pending: 0, approved: 0, rejected: 0 },
    })),
  });
}

// POST /api/org/projects — create + fund a project from the org wallet.
export async function POST(request: Request) {
  const { session, org } = await currentOrg();
  if (!org || !session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const title = String(b.title || "").trim();
  const description = String(b.description || "").trim();
  const instructions = String(b.instructions || "").trim();
  const projectType = ["voice", "video"].includes(b.projectType) ? b.projectType : "voice";
  // The org sets the price THEY pay per approved item. The contributor reward is
  // set (lower) by an admin at approval; the difference is the platform's margin.
  const orgPrice = Number(b.reward);
  const maxSubmissions = Number(b.maxSubmissions);

  if (!title || !description || !instructions) {
    return NextResponse.json({ message: "Title, description and instructions are required" }, { status: 400 });
  }
  if (!(orgPrice > 0) || !(maxSubmissions > 0)) {
    return NextResponse.json({ message: "Price and target submissions must be positive" }, { status: 400 });
  }

  const estBudget = Math.round(orgPrice * maxSubmissions * 100) / 100;
  const languages = Array.isArray(b.languages) ? b.languages : (b.languages ? String(b.languages).split(",").map((s: string) => s.trim()).filter(Boolean) : []);
  const acceptedFormats = projectType === "voice" ? ["wav", "mp3", "m4a"] : ["mp4", "mov", "webm"];
  const license = LICENSES[b.license] ? b.license : DEFAULT_LICENSE;

  // Org projects require admin review before they go live. They are created in
  // "pending_review" (hidden from contributors) and no wallet funds are moved yet —
  // the admin may adjust the price, and the budget is only allocated on approval.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.dataProject.create as any)({
    data: {
      title, description, instructions, projectType,
      orgPrice,
      reward: orgPrice, // placeholder; the admin sets the real (lower) contributor reward at approval
      maxSubmissions,
      maxSubmissionsPerUser: Number(b.maxSubmissionsPerUser) || 1,
      minDurationSecs: Number(b.minDurationSecs) || 3,
      maxDurationSecs: Number(b.maxDurationSecs) || 60,
      maxFileSizeMB: Number(b.maxFileSizeMB) || 25,
      acceptedFormats: JSON.stringify(acceptedFormats),
      languages: languages.length ? JSON.stringify(languages) : null,
      samplePrompts: b.samplePrompts ? JSON.stringify(String(b.samplePrompts).split("\n").map((s: string) => s.trim()).filter(Boolean)) : null,
      status: "pending_review",
      createdBy: session.user.id,
      orgId: org.id,
      budget: 0, // allocated from the wallet when an admin approves
      license,
      usageTerms: b.usageTerms ? String(b.usageTerms).slice(0, 2000) : null,
    },
  });

  return NextResponse.json({ ok: true, projectId: project.id, status: "pending_review", estimatedBudget: estBudget });
}
