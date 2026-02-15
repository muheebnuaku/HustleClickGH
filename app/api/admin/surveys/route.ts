export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Admin: Get all surveys with stats
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const surveys = await prisma.survey.findMany({
      include: {
        _count: {
          select: {
            questions: true,
            responses: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedSurveys = surveys.map((survey) => ({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      reward: survey.reward,
      status: survey.status,
      currentRespondents: survey.currentRespondents,
      maxRespondents: survey.maxRespondents,
      visibility: survey.visibility,
      expiresAt: survey.expiresAt,
      createdAt: survey.createdAt,
      _count: { questions: survey._count.questions },
      questionsCount: survey._count.questions,
      responsesCount: survey._count.responses,
    }));

    return NextResponse.json({ surveys: formattedSurveys });
  } catch (error) {
    console.error("Admin surveys fetch error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}

// Admin: Create a new survey
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, reward, maxRespondents, expiresAt, questions } = body;

    // Validate required fields (allow 0 for numeric values)
    if (!title || !description || reward === undefined || reward === "" || 
        maxRespondents === undefined || maxRespondents === "" || !expiresAt) {
      return NextResponse.json(
        { message: "Missing required fields: title, description, reward, maxRespondents, and expiresAt are required" },
        { status: 400 }
      );
    }

    // Create the survey
    const survey = await prisma.survey.create({
      data: {
        title,
        description,
        reward: typeof reward === 'number' ? reward : parseFloat(reward),
        maxRespondents: typeof maxRespondents === 'number' ? maxRespondents : parseInt(maxRespondents),
        expiresAt: new Date(expiresAt),
        createdBy: session.user.id,
        status: "active",
        visibility: "public",
      },
    });

    // Create questions if provided
    if (questions && questions.length > 0) {
      const questionData = questions.map((q: { text: string; type: string; required?: boolean; options?: string[] }, index: number) => ({
        surveyId: survey.id,
        questionText: q.text,
        questionType: q.type,
        options: q.options ? JSON.stringify(q.options) : null,
        required: q.required ?? true,
        order: index + 1,
      }));

      await prisma.surveyQuestion.createMany({
        data: questionData,
      });
    }

    return NextResponse.json({
      message: "Survey created successfully",
      survey: {
        id: survey.id,
        title: survey.title,
      },
    });
  } catch (error) {
    console.error("Create survey error:", error);
    return NextResponse.json(
      { message: "Failed to create survey" },
      { status: 500 }
    );
  }
}
