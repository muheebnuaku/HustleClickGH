export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Admin: Delete a survey
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    // Check if survey exists
    const survey = await prisma.survey.findUnique({
      where: { id },
    });

    if (!survey) {
      return NextResponse.json({ message: "Survey not found" }, { status: 404 });
    }

    // Delete the survey (questions and responses will cascade delete)
    await prisma.survey.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Survey deleted successfully" });
  } catch (error) {
    console.error("Delete survey error:", error);
    return NextResponse.json(
      { message: "Failed to delete survey" },
      { status: 500 }
    );
  }
}

// Admin: Get single survey details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;

    const survey = await prisma.survey.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: "asc" } },
        _count: { select: { responses: true } },
      },
    });

    if (!survey) {
      return NextResponse.json({ message: "Survey not found" }, { status: 404 });
    }

    return NextResponse.json({
      survey: {
        ...survey,
        questions: survey.questions.map((q) => ({
          id: q.id,
          text: q.questionText,
          type: q.questionType,
          options: q.options ? JSON.parse(q.options) : [],
          required: q.required,
          order: q.order,
        })),
      },
    });
  } catch (error) {
    console.error("Get survey error:", error);
    return NextResponse.json(
      { message: "Failed to get survey" },
      { status: 500 }
    );
  }
}
