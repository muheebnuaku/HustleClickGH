export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { parseMetadataFields, sanitizeCaptureTrace } from "@/lib/project-config";

// GET /api/admin/data-projects/[id]/export?format=csv|json&status=approved|pending|all
// Delivery manifest for a client: one row per submission with its files, the
// per-submission details (metadata), where it was recorded, consent, and — for
// in-app captures — the dot pattern and when each dot was connected (JSON also
// carries the full nose path). Contributors are pseudonymous (ref id only).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format") === "json" ? "json" : "csv";
  const statusParam = req.nextUrl.searchParams.get("status") || "approved";
  const statusWhere = ["approved", "pending", "rejected"].includes(statusParam) ? { status: statusParam } : {};

  const project = await prisma.dataProject.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ message: "Project not found" }, { status: 404 });

  const subs = await prisma.dataSubmission.findMany({
    where: { projectId: id, ...statusWhere },
    orderBy: { submittedAt: "asc" },
    include: { user: { select: { userId: true, country: true, region: true, city: true } } },
  });
  const fields = parseMetadataFields(project.metadataFields);

  const rows = subs.map((s) => {
    let files: { url: string; name: string; type: string; sizeMB: number }[] = [
      { url: s.fileUrl, name: s.fileName, type: s.fileType, sizeMB: s.fileSizeMB },
    ];
    if (s.files) {
      try { const a = JSON.parse(s.files); if (Array.isArray(a) && a.length) files = a; } catch {}
    }
    let meta: Record<string, string> = {};
    try { meta = s.metadata ? JSON.parse(s.metadata) : {}; } catch {}
    let loc: { country?: string | null; region?: string | null; city?: string | null; lat?: number; lng?: number; accuracyM?: number | null } = {};
    try { loc = s.location ? JSON.parse(s.location) : {}; } catch {}
    let trace = null;
    try { trace = s.captureData ? sanitizeCaptureTrace(JSON.parse(s.captureData)) : null; } catch {}

    const row: Record<string, unknown> = {
      submissionId: s.id,
      status: s.status,
      contributorRef: s.user?.userId ?? "",
      gender: s.gender ?? "",
      language: s.language ?? "",
      prompt: s.promptUsed ?? "",
      // Snapshot at submit time; older submissions fall back to the current profile.
      country: loc.country ?? s.user?.country ?? "",
      region: loc.region ?? s.user?.region ?? "",
      city: loc.city ?? s.user?.city ?? "",
      gpsLat: loc.lat ?? "",
      gpsLng: loc.lng ?? "",
      gpsAccuracyM: loc.accuracyM ?? "",
      fileCount: files.length,
      fileUrls: files.map((f) => f.url).join(" "),
      fileTypes: files.map((f) => f.type).join(" "),
      totalSizeMB: Math.round(files.reduce((a, f) => a + (f.sizeMB || 0), 0) * 100) / 100,
      durationSecs: s.durationSecs ?? (trace ? Math.round(trace.durationMs / 100) / 10 : ""),
    };
    for (const f of fields) row[`meta:${f.label}`] = meta[f.key] ?? "";
    if (project.captureMode !== "upload") {
      row.captureCompleted = trace?.completed ?? "";
      row.dotsConnected = trace ? `${trace.hits.length}/${trace.dots.length}` : "";
      row.dotTimesSecs = trace ? trace.hits.map((h) => `${h.index + 1}:${(h.tMs / 1000).toFixed(2)}`).join(" ") : "";
      row.dotPositions = trace ? trace.dots.map((d, i) => `${i + 1}:${d.x},${d.y}`).join(" ") : "";
      row.videoSize = trace ? `${trace.videoWidth}x${trace.videoHeight}` : "";
      row.mirroredView = trace?.mirrored ?? "";
      row.visibleCrop = trace?.crop ? `${trace.crop.x},${trace.crop.y},${trace.crop.w},${trace.crop.h}` : "";
    }
    row.submittedAt = s.submittedAt.toISOString();
    row.reviewedAt = s.reviewedAt?.toISOString() ?? "";
    row.consentGiven = s.consentGiven;
    row.consentGivenAt = s.consentGivenAt?.toISOString() ?? "";
    return { row, files, trace };
  });

  const slug = project.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().replace(/^-|-$/g, "");
  const filename = `${project.referenceCode ? `${project.referenceCode}-` : ""}${slug}-${statusParam}`;

  if (format === "json") {
    const body = {
      project: {
        id: project.id,
        title: project.title,
        type: project.projectType,
        captureMode: project.captureMode,
        clientName: project.clientName,
        referenceCode: project.referenceCode,
        metadataFields: fields,
      },
      exportedAt: new Date().toISOString(),
      count: rows.length,
      note: "Dot and nose-path coordinates are 0..1 of the 3:4 frame the contributor saw (mirrored for the selfie camera). visibleCrop = x,y,w,h of that frame within the raw video. The video files contain no overlay.",
      rows: rows.map((r) => ({ ...r.row, files: r.files, capture: r.trace })),
    };
    return new NextResponse(JSON.stringify(body, null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${filename}.json"` },
    });
  }

  const cols = rows.length ? Object.keys(rows[0].row) : ["submissionId", "status", "contributorRef"];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  // BOM so Excel opens UTF-8 (Twi characters, ₵) correctly.
  const csv = "﻿" + [cols.map(esc).join(","), ...rows.map((r) => cols.map((c) => esc(r.row[c])).join(","))].join("\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.csv"` },
  });
}
