export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Admin: Get survey responses
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
        responses: {
          include: {
            user: {
              select: {
                id: true,
                userId: true,
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
      return NextResponse.json(
        { message: "Survey not found" },
        { status: 404 }
      );
    }

    const formattedResponses = survey.responses.map((response) => {
      // Parse the answers - could be array [{questionId, answer}] or object {questionId: answer}
      const parsedAnswers = JSON.parse(response.answers);
      
      // Convert array format to object format if needed
      let answersObj: Record<string, string | string[]> = {};
      if (Array.isArray(parsedAnswers)) {
        parsedAnswers.forEach((item: { questionId: string; answer: string | string[] }) => {
          answersObj[item.questionId] = item.answer;
        });
      } else {
        answersObj = parsedAnswers;
      }

      return {
        id: response.id,
        answers: answersObj,
        completedAt: response.submittedAt,
        user: {
          id: response.user.id,
          userId: response.user.userId,
          fullName: response.user.fullName,
          email: response.user.email,
        },
      };
    });

    const formattedQuestions = survey.questions.map((q) => ({
      id: q.id,
      text: q.questionText,
      type: q.questionType,
      options: q.options ? JSON.parse(q.options) : [],
      order: q.order,
    }));

    return NextResponse.json({
      survey: {
        id: survey.id,
        title: survey.title,
      },
      questions: formattedQuestions,
      responses: formattedResponses,
    });
  } catch (error) {
    console.error("Survey responses fetch error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}
