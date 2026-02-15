export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - Get public survey by share code
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    const survey = await prisma.survey.findFirst({
      where: {
        shareCode: code,
        status: "active",
      },
      include: {
        questions: {
          orderBy: { order: "asc" },
        },
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "Survey not found or inactive" }, { status: 404 });
    }

    // Check if survey is expired
    if (new Date(survey.expiresAt) < new Date()) {
      return NextResponse.json({ error: "This survey has expired" }, { status: 410 });
    }

    // Check if max respondents reached
    if (survey.currentRespondents >= survey.maxRespondents) {
      return NextResponse.json({ error: "This survey has reached its maximum responses" }, { status: 410 });
    }

    // Return survey without sensitive data
    return NextResponse.json({
      id: survey.id,
      title: survey.title,
      description: survey.description,
      headerImage: survey.headerImage,
      backgroundImage: survey.backgroundImage,
      questions: survey.questions.map((q) => ({
        id: q.id,
        questionText: q.questionText,
        questionType: q.questionType,
        options: q.options ? JSON.parse(q.options) : null,
        required: q.required,
        order: q.order,
      })),
    });
  } catch (error) {
    console.error("Error fetching public survey:", error);
    return NextResponse.json({ error: "Failed to fetch survey" }, { status: 500 });
  }
}

// POST - Submit response to public survey (no login required)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const body = await request.json();
    const { answers, respondentName, respondentEmail } = body;

    const survey = await prisma.survey.findFirst({
      where: {
        shareCode: code,
        status: "active",
      },
      include: {
        questions: true,
      },
    });

    if (!survey) {
      return NextResponse.json({ error: "Survey not found or inactive" }, { status: 404 });
    }

    // Check if survey is expired
    if (new Date(survey.expiresAt) < new Date()) {
      return NextResponse.json({ error: "This survey has expired" }, { status: 410 });
    }

    // Check if max respondents reached
    if (survey.currentRespondents >= survey.maxRespondents) {
      return NextResponse.json({ error: "This survey has reached its maximum responses" }, { status: 410 });
    }

    // For public surveys, we'll create a temporary/anonymous user or use existing
    // First, check if email already responded
    if (respondentEmail) {
      const existingUser = await prisma.user.findUnique({
        where: { email: respondentEmail },
      });

      if (existingUser) {
        // Check if user already responded
        const existingResponse = await prisma.surveyResponse.findUnique({
          where: {
            surveyId_userId: {
              surveyId: survey.id,
              userId: existingUser.id,
            },
          },
        });

        if (existingResponse) {
          return NextResponse.json(
            { error: "You have already responded to this survey" },
            { status: 400 }
          );
        }

        // Create response for existing user
        await prisma.$transaction([
          prisma.surveyResponse.create({
            data: {
              surveyId: survey.id,
              userId: existingUser.id,
              answers: JSON.stringify(answers),
              rewarded: false,
            },
          }),
          prisma.survey.update({
            where: { id: survey.id },
            data: { currentRespondents: { increment: 1 } },
          }),
        ]);

        return NextResponse.json({ message: "Response submitted successfully" });
      }
    }

    // Create anonymous user for public response
    const anonymousUserId = `anon_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const anonymousUser = await prisma.user.create({
      data: {
        userId: anonymousUserId,
        fullName: respondentName || "Anonymous",
        email: respondentEmail || `${anonymousUserId}@anonymous.hustleclickgh.com`,
        phone: "0000000000",
        password: "not-applicable",
        role: "anonymous",
        status: "active",
        referralCode: anonymousUserId,
        balance: 0,
        totalEarned: 0,
      },
    });

    // Create response
    await prisma.$transaction([
      prisma.surveyResponse.create({
        data: {
          surveyId: survey.id,
          userId: anonymousUser.id,
          answers: JSON.stringify(answers),
          rewarded: false,
        },
      }),
      prisma.survey.update({
        where: { id: survey.id },
        data: { currentRespondents: { increment: 1 } },
      }),
    ]);

    return NextResponse.json({ message: "Response submitted successfully" });
  } catch (error) {
    console.error("Error submitting response:", error);
    return NextResponse.json({ error: "Failed to submit response" }, { status: 500 });
  }
}
