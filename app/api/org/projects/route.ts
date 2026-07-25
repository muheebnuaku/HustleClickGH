export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";
import { allocateToProject } from "@/lib/org";

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
      reward: p.reward, maxSubmissions: p.maxSubmissions, currentSubmissions: p.currentSubmissions,
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
  const reward = Number(b.reward);
  const maxSubmissions = Number(b.maxSubmissions);

  if (!title || !description || !instructions) {
    return NextResponse.json({ message: "Title, description and instructions are required" }, { status: 400 });
  }
  if (!(reward > 0) || !(maxSubmissions > 0)) {
    return NextResponse.json({ message: "Reward and target submissions must be positive" }, { status: 400 });
  }

  const budget = Math.round(reward * maxSubmissions * 100) / 100;
  if (org.walletBalance < budget) {
    return NextResponse.json({ message: `Insufficient wallet balance. This project needs GH₵${budget.toFixed(2)}; top up first.` }, { status: 402 });
  }

  const languages = Array.isArray(b.languages) ? b.languages : (b.languages ? String(b.languages).split(",").map((s: string) => s.trim()).filter(Boolean) : []);
  const acceptedFormats = projectType === "voice" ? ["wav", "mp3", "m4a"] : ["mp4", "mov", "webm"];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.dataProject.create as any)({
    data: {
      title, description, instructions, projectType,
      reward, maxSubmissions,
      maxSubmissionsPerUser: Number(b.maxSubmissionsPerUser) || 1,
      minDurationSecs: Number(b.minDurationSecs) || 3,
      maxDurationSecs: Number(b.maxDurationSecs) || 60,
      maxFileSizeMB: Number(b.maxFileSizeMB) || 25,
      acceptedFormats: JSON.stringify(acceptedFormats),
      languages: languages.length ? JSON.stringify(languages) : null,
      samplePrompts: b.samplePrompts ? JSON.stringify(String(b.samplePrompts).split("\n").map((s: string) => s.trim()).filter(Boolean)) : null,
      status: "active",
      createdBy: session.user.id,
      orgId: org.id,
      budget: 0, // funded via allocateToProject below
    },
  });

  const ok = await allocateToProject(org.id, project.id, budget);
  if (!ok) {
    // Roll back the project if funding failed (shouldn't happen — checked above).
    await prisma.dataProject.delete({ where: { id: project.id } }).catch(() => {});
    return NextResponse.json({ message: "Could not fund the project from your wallet" }, { status: 402 });
  }

  return NextResponse.json({ ok: true, projectId: project.id, funded: budget });
}
