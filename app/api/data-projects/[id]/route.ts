export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { checkLocationEligibility, parseCaptureConfig, parseMetadataFields, targetingSummary, parseStringList, contributorMoneyView } from "@/lib/project-config";
import { teamChain, canTakeAssigned } from "@/lib/field-teams";

// GET: Single project detail + user's submission if any
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const project = await prisma.dataProject.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ message: "Project not found" }, { status: 404 });
    }

    const [userSubmissions, me] = await Promise.all([
      prisma.dataSubmission.findMany({
        where: { projectId: id, userId },
        orderBy: { submittedAt: "desc" },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { country: true, region: true, city: true, teamLeaderId: true } }),
    ]);
    let elig: { eligible: true } | { eligible: false; reason: string; needsLocation: boolean } =
      session.user.role === "admin" ? { eligible: true as const } : checkLocationEligibility(project, me);
    if (elig.eligible && session.user.role !== "admin" && !canTakeAssigned(parseStringList(project.assignedLeaderIds), await teamChain(userId))) {
      elig = { eligible: false, reason: "This project is run by specific field teams. Ask your supervisor if you can join their team.", needsLocation: false };
    }
    const userSubmission = userSubmissions[0] ?? null; // newest, for back-compat
    // Rejected submissions don't count against the per-user limit (users may retry).
    const userSubmissionsUsed = userSubmissions.filter((s) => s.status !== "rejected").length;
    // Managers use their own admin-set limit (null = unlimited); others use the project's.
    const isManager = session.user.role === "manager";
    let maxPerUser: number | null = project.maxSubmissionsPerUser ?? 1;
    if (isManager) {
      const mgr = await prisma.user.findUnique({ where: { id: userId }, select: { managerSubmitLimit: true } });
      maxPerUser = mgr?.managerSubmitLimit ?? null;
    }
    const canSubmitMore = maxPerUser === null || userSubmissionsUsed < maxPerUser;

    // Count pending+approved submissions per gender so users see accurate remaining slots
    let malesFilled = 0;
    let femalesFilled = 0;
    if (project.malesNeeded !== null || project.femalesNeeded !== null) {
      [malesFilled, femalesFilled] = await Promise.all([
        prisma.dataSubmission.count({
          where: { projectId: id, gender: "male", status: { in: ["pending", "approved"] } },
        }),
        prisma.dataSubmission.count({
          where: { projectId: id, gender: "female", status: { in: ["pending", "approved"] } },
        }),
      ]);
    }

    return NextResponse.json({
      project: {
        ...project,
        samplePrompts: project.samplePrompts ? JSON.parse(project.samplePrompts) : [],
        sampleVideoUrls: project.sampleVideoUrls
          ? JSON.parse(project.sampleVideoUrls)
          : project.sampleVideoUrl
          ? [project.sampleVideoUrl]
          : [],
        languages: project.languages ? JSON.parse(project.languages) : [],
        acceptedFormats: JSON.parse(project.acceptedFormats),
        captureConfig: project.captureMode === "upload" ? null : parseCaptureConfig(project.captureConfig),
        metadataFields: parseMetadataFields(project.metadataFields),
        locationLabel: targetingSummary(project),
        ...(session.user.role === "admin" ? {} : contributorMoneyView(project)),
        // Internal labels — not for contributors.
        clientName: undefined,
        referenceCode: undefined,
        assignedLeaderIds: undefined,
        slotsRemaining: project.maxSubmissions - project.currentSubmissions,
        malesSlotsRemaining: project.malesNeeded !== null ? Math.max(0, project.malesNeeded - malesFilled) : null,
        femalesSlotsRemaining: project.femalesNeeded !== null ? Math.max(0, project.femalesNeeded - femalesFilled) : null,
      },
      userSubmission,
      userSubmissions,
      userSubmissionsUsed,
      maxSubmissionsPerUser: maxPerUser, // null = unlimited (managers)
      canSubmitMore,
      inTeam: !!me?.teamLeaderId,
      eligible: elig.eligible,
      ineligibleReason: elig.eligible ? null : elig.reason,
      needsLocation: elig.eligible ? false : elig.needsLocation,
      bypassSlots: isManager, // managers submit beyond the project's total slots/gender quota
    });
  } catch (error) {
    console.error("Data project detail error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
