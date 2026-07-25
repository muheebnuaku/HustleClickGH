export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";

// GET /api/org/projects/[id]/withdrawn?format=json|csv
// Items a contributor has erased since delivery — the buyer purges these from any
// dataset they already downloaded (Ghana DPA / GDPR erasure propagation).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.dataProject.findUnique as any)({ where: { id } });
  if (!project || project.orgId !== org.id) {
    return NextResponse.json({ message: "Project not found" }, { status: 404 });
  }

  const tombstones = await prisma.erasureTombstone.findMany({
    where: { projectId: id, orgId: org.id },
    orderBy: { withdrawnAt: "desc" },
  });
  const rows = tombstones.map((t) => ({ submissionId: t.submissionRef, fileHash: t.fileHash ?? "", reason: t.reason, withdrawnAt: t.withdrawnAt.toISOString() }));

  if (req.nextUrl.searchParams.get("format") === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const cols = ["submissionId", "fileHash", "reason", "withdrawnAt"];
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="withdrawn-${id.slice(0, 6)}.csv"` } });
  }
  return NextResponse.json({ count: rows.length, withdrawn: rows, note: "Delete these rows (match by submissionId or fileHash) from any dataset you have downloaded." });
}
