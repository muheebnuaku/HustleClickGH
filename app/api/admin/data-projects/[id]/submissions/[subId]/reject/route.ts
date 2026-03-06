export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id: projectId, subId } = await params;
    const body = await request.json();
    const { notes } = body;

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

    await prisma.dataSubmission.update({
      where: { id: subId },
      data: {
        status: "rejected",
        notes: notes || null,
        reviewedAt: new Date(),
        reviewedBy: session.user.id,
      },
    });

    return NextResponse.json({ message: "Submission rejected." });
  } catch (error) {
    console.error("Reject submission error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
