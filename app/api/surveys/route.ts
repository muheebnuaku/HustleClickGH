export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get active platform surveys that user hasn't completed
    // Note: User-created surveys are NOT shown here - they're only accessible via share link
    const surveys = await prisma.survey.findMany({
      where: {
        status: "active",
        surveyType: "platform", // Only show admin/platform surveys, NOT user-created surveys
        expiresAt: { gt: new Date() },
        responses: {
          none: {
            userId: userId,
          },
        },
      },
      include: {
        questions: {
          orderBy: { order: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter surveys that haven't reached max respondents
    const availableSurveys = surveys.filter(
      (survey) => survey.currentRespondents < survey.maxRespondents
    );

    return NextResponse.json({ surveys: availableSurveys });
  } catch (error) {
    console.error("Surveys fetch error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}

// Admin: Create survey
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      reward,
      maxRespondents,
      visibility,
      expiresAt,
      questions,
    } = body;

    const survey = await prisma.survey.create({
      data: {
        title,
        description,
        reward: parseFloat(reward),
        maxRespondents: parseInt(maxRespondents),
        visibility: visibility || "public",
        expiresAt: new Date(expiresAt),
        createdBy: session.user.id,
        questions: {
          create: questions.map((q: { text: string; type: string; options?: string[]; required?: boolean }, index: number) => ({
            questionText: q.text,
            questionType: q.type,
            options: q.options ? JSON.stringify(q.options) : null,
            required: q.required !== false,
            order: index,
          })),
        },
      },
      include: {
        questions: true,
      },
    });

    return NextResponse.json({
      message: "Survey created successfully",
      survey,
    });
  } catch (error) {
    console.error("Survey creation error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}
