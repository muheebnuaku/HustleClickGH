export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// GET - Get survey details with responses
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const survey = await prisma.survey.findFirst({
      where: {
        id,
        createdBy: session.user.id,
        surveyType: "user",
      },
      include: {
        questions: {
          orderBy: { order: "asc" },
        },
        responses: {
          include: {
            user: {
              select: {
                fullName: true,
                email: true,
              },
            },
          },
          orderBy: { submittedAt: "desc" },
        },
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    // Parse answers for each response
    const formattedResponses = survey.responses.map((response) => {
      let parsedAnswers: Record<string, string> = {};
      try {
        const answersArray = JSON.parse(response.answers);
        if (Array.isArray(answersArray)) {
          answersArray.forEach((item: { questionId: string; answer: string }) => {
            parsedAnswers[item.questionId] = item.answer;
          });
        } else {
          parsedAnswers = answersArray;
        }
      } catch {
        parsedAnswers = {};
      }
      return {
        ...response,
        answers: parsedAnswers,
      };
    });

    return NextResponse.json({
      ...survey,
      responses: formattedResponses,
    });
  } catch (error) {
    console.error("Error fetching survey:", error);
    return NextResponse.json({ error: "Failed to fetch survey" }, { status: 500 });
  }
}

// DELETE - Delete a survey
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    // Check ownership
    const survey = await prisma.survey.findFirst({
      where: {
        id,
        createdBy: session.user.id,
        surveyType: "user",
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    await prisma.survey.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Survey deleted successfully" });
  } catch (error) {
    console.error("Error deleting survey:", error);
    return NextResponse.json({ error: "Failed to delete survey" }, { status: 500 });
  }
}

// PATCH - Update survey status
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    // Check ownership
    const survey = await prisma.survey.findFirst({
      where: {
        id,
        createdBy: session.user.id,
        surveyType: "user",
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "Survey not found" }, { status: 404 });
    }

    const updatedSurvey = await prisma.survey.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json(updatedSurvey);
  } catch (error) {
    console.error("Error updating survey:", error);
    return NextResponse.json({ error: "Failed to update survey" }, { status: 500 });
  }
}
