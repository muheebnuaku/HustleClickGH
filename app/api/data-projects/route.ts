export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { checkLocationEligibility, targetingSummary, contributorMoneyView, parseStringList } from "@/lib/project-config";
import { teamChain, canTakeAssigned } from "@/lib/field-teams";

// GET: List all active data projects + user's submission status for each
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const projects = await prisma.dataProject.findMany({
      where: { status: "active" },
      orderBy: { createdAt: "desc" },
    });

    // Check which projects the user has already submitted to
    const [userSubmissions, me] = await Promise.all([
      prisma.dataSubmission.findMany({
        where: { userId },
        select: { projectId: true, status: true },
      }),
      prisma.user.findUnique({ where: { id: userId }, select: { country: true, region: true, city: true } }),
    ]);
    const isAdmin = session.user.role === "admin";
    const chain = await teamChain(userId);

    const submissionMap = new Map(
      userSubmissions.map((s) => [s.projectId, s.status])
    );

    const projectsWithStatus = projects.map((p) => {
      // Admins see everything (for testing); everyone else is matched on profile location.
      let elig: { eligible: true } | { eligible: false; reason: string; needsLocation: boolean; kind?: "team" } =
        isAdmin ? { eligible: true as const } : checkLocationEligibility(p, me);
      if (elig.eligible && !isAdmin && !canTakeAssigned(parseStringList(p.assignedLeaderIds), chain)) {
        elig = { eligible: false, reason: "This project is only for selected field teams. Ask your supervisor or country representative if you can join their team.", needsLocation: false, kind: "team" };
      }
      return {
        ...p,
        captureConfig: undefined, // not needed for the list
        metadataFields: undefined,
        clientName: undefined, // internal labels — not for contributors
        referenceCode: undefined,
      assignedLeaderIds: undefined,
        locationLabel: targetingSummary(p),
        ...(isAdmin ? {} : contributorMoneyView(p)),
        eligible: elig.eligible,
        ineligibleReason: elig.eligible ? null : elig.reason,
        needsLocation: elig.eligible ? false : elig.needsLocation,
        ineligibleKind: elig.eligible ? null : elig.kind === "team" ? "team" : "location",
        samplePrompts: p.samplePrompts ? JSON.parse(p.samplePrompts) : [],
        languages: p.languages ? JSON.parse(p.languages) : [],
        acceptedFormats: JSON.parse(p.acceptedFormats),
        userSubmissionStatus: submissionMap.get(p.id) || null,
        slotsRemaining: p.maxSubmissions - p.currentSubmissions,
      };
    });

    return NextResponse.json({ projects: projectsWithStatus });
  } catch (error) {
    console.error("Data projects fetch error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
