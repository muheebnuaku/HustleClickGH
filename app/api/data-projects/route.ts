export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

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
    const userSubmissions = await prisma.dataSubmission.findMany({
      where: { userId },
      select: { projectId: true, status: true },
    });

    const submissionMap = new Map(
      userSubmissions.map((s) => [s.projectId, s.status])
    );

    const projectsWithStatus = projects.map((p) => ({
      ...p,
      samplePrompts: p.samplePrompts ? JSON.parse(p.samplePrompts) : [],
      languages: p.languages ? JSON.parse(p.languages) : [],
      acceptedFormats: JSON.parse(p.acceptedFormats),
      userSubmissionStatus: submissionMap.get(p.id) || null,
      slotsRemaining: p.maxSubmissions - p.currentSubmissions,
    }));

    return NextResponse.json({ projects: projectsWithStatus });
  } catch (error) {
    console.error("Data projects fetch error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
