export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id: projectId, subId } = await params;

    const submission = await prisma.dataSubmission.findUnique({
      where: { id: subId },
    });

    if (!submission || submission.projectId !== projectId) {
      return NextResponse.json({ message: "Submission not found" }, { status: 404 });
    }

    if (submission.status !== "pending") {
      return NextResponse.json(
        { message: "Submission has already been reviewed" },
        { status: 400 }
      );
    }

    const project = await prisma.dataProject.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ message: "Project not found" }, { status: 404 });
    }

    // Approve: credit user balance, increment project count — atomically
    const projectUpdate: Parameters<typeof prisma.dataProject.update>[0]["data"] = {
      currentSubmissions: { increment: 1 },
    };
    if (submission.gender === "male" && project.malesNeeded !== null) {
      projectUpdate.malesApproved = { increment: 1 };
    } else if (submission.gender === "female" && project.femalesNeeded !== null) {
      projectUpdate.femalesApproved = { increment: 1 };
    }

    await prisma.$transaction([
      prisma.dataSubmission.update({
        where: { id: subId },
        data: {
          status: "approved",
          rewarded: true,
          reviewedAt: new Date(),
          reviewedBy: session.user.id,
        },
      }),
      prisma.dataProject.update({
        where: { id: projectId },
        data: projectUpdate,
      }),
      prisma.user.update({
        where: { id: submission.userId },
        data: {
          balance: { increment: project.reward },
          totalEarned: { increment: project.reward },
        },
      }),
    ]);

    return NextResponse.json({
      message: `Submission approved. GH₵${project.reward.toFixed(2)} credited to user.`,
    });
  } catch (error) {
    console.error("Approve submission error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
