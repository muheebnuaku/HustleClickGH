export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";

// GET /api/org/projects/[id]/export?format=json|csv
// Dataset manifest of APPROVED submissions with consent provenance. Org must own the project.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const project = await (prisma.dataProject.findUnique as any)({ where: { id } });
  if (!project || project.orgId !== org.id) {
    return NextResponse.json({ message: "Project not found" }, { status: 404 });
  }

  const subs = await prisma.dataSubmission.findMany({
    where: { projectId: id, status: "approved" },
    orderBy: { reviewedAt: "asc" },
  });
  const userIds = Array.from(new Set(subs.map((s) => s.userId)));
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, userId: true, country: true, region: true, city: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));
  // Latest consent record per contributor = the provenance for their data.
  const consents = await prisma.consentRecord.findMany({
    where: { userId: { in: userIds } },
    orderBy: { signedAt: "desc" },
  });
  const consentByUser = new Map<string, (typeof consents)[number]>();
  for (const c of consents) if (!consentByUser.has(c.userId)) consentByUser.set(c.userId, c);

  const rows = subs.map((s) => {
    const u = userById.get(s.userId);
    const c = consentByUser.get(s.userId);
    return {
      submissionId: s.id,
      fileUrl: s.fileUrl,
      fileName: s.fileName,
      fileType: s.fileType,
      fileSizeMB: s.fileSizeMB,
      durationSecs: s.durationSecs ?? "",
      language: s.language ?? "",
      prompt: s.promptUsed ?? "",
      gender: s.gender ?? "",
      contributorRef: u?.userId ?? "",            // pseudonymous id, not personal name
      contributorCountry: u?.country ?? "",
      contributorRegion: u?.region ?? "",
      contributorCity: u?.city ?? "",
      submittedAt: s.submittedAt.toISOString(),
      consentGiven: s.consentGiven,
      consentSignedAt: c?.signedAt?.toISOString() ?? (s.consentGivenAt?.toISOString() ?? ""),
      consentDocument: c ? `${c.documentType} v${c.documentVersion}` : "",
    };
  });

  const summary = {
    project: { id: project.id, title: project.title, type: project.projectType },
    exportedAt: new Date().toISOString(),
    approvedCount: rows.length,
    consentCoverage: rows.length ? rows.filter((r) => r.consentGiven).length / rows.length : 0,
    note: "Contributor identity is pseudonymous (ref id only). Consent provenance included per row.",
  };

  const filename = `dataset-${project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${id.slice(0, 6)}`;

  if (format === "csv") {
    const cols = Object.keys(rows[0] || {
      submissionId: "", fileUrl: "", fileName: "", fileType: "", fileSizeMB: "", durationSecs: "",
      language: "", prompt: "", gender: "", contributorRef: "", contributorCountry: "",
      contributorRegion: "", contributorCity: "", submittedAt: "", consentGiven: "", consentSignedAt: "", consentDocument: "",
    });
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${filename}.csv"` },
    });
  }

  return new NextResponse(JSON.stringify({ summary, rows }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}.json"` },
  });
}
