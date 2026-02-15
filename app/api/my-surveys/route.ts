export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

// GET - List user's surveys
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const surveys = await prisma.survey.findMany({
      where: {
        createdBy: session.user.id,
        surveyType: "user",
      },
      include: {
        questions: true,
        _count: {
          select: { responses: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(surveys);
  } catch (error) {
    console.error("Error fetching user surveys:", error);
    return NextResponse.json({ error: "Failed to fetch surveys" }, { status: 500 });
  }
}

// POST - Create a new survey
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check survey limit (max 10 per user)
    const existingSurveys = await prisma.survey.count({
      where: {
        createdBy: session.user.id,
        surveyType: "user",
      },
    });

    if (existingSurveys >= 10) {
      return NextResponse.json(
        { error: "You have reached the maximum limit of 10 surveys" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { title, description, headerImage, backgroundImage, questions, maxRespondents, expiresAt } = body;

    // Validate
    if (!title || !description || !questions || questions.length === 0) {
      return NextResponse.json(
        { error: "Title, description, and at least one question are required" },
        { status: 400 }
      );
    }

    if (questions.length > 15) {
      return NextResponse.json(
        { error: "Maximum 15 questions allowed per survey" },
        { status: 400 }
      );
    }

    // Generate unique share code
    const shareCode = nanoid(10);

    // Create survey with questions
    const survey = await prisma.survey.create({
      data: {
        title,
        description,
        headerImage: headerImage || null,
        backgroundImage: backgroundImage || null,
        reward: 0, // User surveys don't pay
        maxRespondents: maxRespondents || 100,
        surveyType: "user",
        shareCode,
        expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
        createdBy: session.user.id,
        questions: {
          create: questions.map((q: { questionText: string; questionType: string; options?: string[]; required?: boolean }, index: number) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            options: q.options ? JSON.stringify(q.options) : null,
            required: q.required ?? true,
            order: index + 1,
          })),
        },
      },
      include: {
        questions: true,
      },
    });

    return NextResponse.json(survey, { status: 201 });
  } catch (error) {
    console.error("Error creating survey:", error);
    return NextResponse.json({ error: "Failed to create survey" }, { status: 500 });
  }
}
