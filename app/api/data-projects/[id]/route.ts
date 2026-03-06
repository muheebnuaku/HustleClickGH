export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

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

    const userSubmission = await prisma.dataSubmission.findUnique({
      where: { projectId_userId: { projectId: id, userId } },
    });

    return NextResponse.json({
      project: {
        ...project,
        samplePrompts: project.samplePrompts ? JSON.parse(project.samplePrompts) : [],
        languages: project.languages ? JSON.parse(project.languages) : [],
        acceptedFormats: JSON.parse(project.acceptedFormats),
        slotsRemaining: project.maxSubmissions - project.currentSubmissions,
      },
      userSubmission,
    });
  } catch (error) {
    console.error("Data project detail error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
