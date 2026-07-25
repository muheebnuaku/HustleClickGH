export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";
import { getLicense } from "@/lib/licenses";

// GET /api/org/projects/[id] — detail + submission summary (org must own it).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.dataProject.findUnique as any)({ where: { id } });
  if (!project || project.orgId !== org.id) {
    return NextResponse.json({ message: "Project not found" }, { status: 404 });
  }

  const grouped = await prisma.dataSubmission.groupBy({
    by: ["status"],
    where: { projectId: id },
    _count: { _all: true },
  });
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const g of grouped) {
    // @ts-expect-error status ∈ counts
    counts[g.status] = g._count._all;
  }
  const withdrawnCount = await prisma.erasureTombstone.count({ where: { projectId: id, orgId: org.id } });
  const lic = getLicense(project.license);

  return NextResponse.json({
    project: {
      id: project.id, title: project.title, description: project.description,
      projectType: project.projectType, status: project.status,
      reward: project.reward, maxSubmissions: project.maxSubmissions,
      currentSubmissions: project.currentSubmissions,
      budget: project.budget, spent: project.spent, createdAt: project.createdAt,
      languages: project.languages ? JSON.parse(project.languages) : [],
      license: { key: lic.key, label: lic.label, description: lic.description },
      usageTerms: project.usageTerms ?? null,
    },
    counts,
    approvedReady: counts.approved, // downloadable
    withdrawnCount,
  });
}
