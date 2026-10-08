export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";
import { orgProjectAccess } from "@/lib/org-access";
import { parseMetadataFields, sanitizeCaptureTrace } from "@/lib/project-config";

const PAGE = 20;

// GET /api/org/projects/[id]/submissions?filter=todo|pass|fail|all&skip=0
// Submissions for the client to review (pass/fail). Contributors are
// pseudonymous — ref id only, never name/phone/email. Submissions an admin has
// already rejected are hidden.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const { project } = await orgProjectAccess(org.id, id);
  if (!project) return NextResponse.json({ message: "Project not found" }, { status: 404 });

  const filter = req.nextUrl.searchParams.get("filter") || "todo";
  const skip = Math.max(0, Number(req.nextUrl.searchParams.get("skip")) || 0);
  const verdictWhere =
    filter === "pass" ? { clientVerdict: "pass" } :
    filter === "fail" ? { clientVerdict: "fail" } :
    filter === "all" ? {} : { clientVerdict: null };

  const where = { projectId: id, status: { not: "rejected" }, ...verdictWhere };
  const [rows, total] = await Promise.all([
    prisma.dataSubmission.findMany({
      where,
      orderBy: { submittedAt: filter === "todo" ? "asc" : "desc" }, // oldest first while working the queue
      skip,
      take: PAGE,
      include: { user: { select: { userId: true } } },
    }),
    prisma.dataSubmission.count({ where }),
  ]);

  const parse = <T,>(raw: string | null): T | null => {
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
  };

  // Names of the clients who gave verdicts (several clients can review one project).
  const byIds = Array.from(new Set(rows.map((s) => s.clientReviewedByOrgId).filter((x): x is string => !!x)));
  const byName = new Map((byIds.length ? await prisma.organization.findMany({ where: { id: { in: byIds } }, select: { id: true, name: true } }) : []).map((o) => [o.id, o.name]));

  return NextResponse.json({
    fields: parseMetadataFields(project.metadataFields),
    total,
    pageSize: PAGE,
    submissions: rows.map((s) => {
      const files = parse<{ url: string; name: string; type: string; sizeMB: number }[]>(s.files) ?? [
        { url: s.fileUrl, name: s.fileName, type: s.fileType, sizeMB: s.fileSizeMB },
      ];
      const trace = s.captureData ? sanitizeCaptureTrace(parse(s.captureData)) : null;
      return {
        id: s.id,
        contributorRef: s.user?.userId ?? "",
        submittedAt: s.submittedAt,
        gender: s.gender,
        language: s.language,
        files: files.map((f) => ({ url: f.url, name: f.name, type: f.type, sizeMB: f.sizeMB })),
        metadata: parse<Record<string, string>>(s.metadata) ?? {},
        location: parse<Record<string, unknown>>(s.location),
        capture: trace,
        clientVerdict: s.clientVerdict,
        clientNote: s.clientNote,
        clientReviewedAt: s.clientReviewedAt,
        reviewedBy: s.clientReviewedByOrgId ? byName.get(s.clientReviewedByOrgId) ?? "Another client" : null,
        reviewedByMe: s.clientReviewedByOrgId === org.id,
      };
    }),
  });
}
