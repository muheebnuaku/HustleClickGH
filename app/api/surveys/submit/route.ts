export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { surveyId, answers } = body;

    // Check if survey exists and is active
    const survey = await prisma.survey.findUnique({
      where: { id: surveyId },
    });

    if (!survey) {
      return NextResponse.json(
        { message: "Survey not found" },
        { status: 404 }
      );
    }

    if (survey.status !== "active" || survey.expiresAt < new Date()) {
      return NextResponse.json(
        { message: "Survey is no longer available" },
        { status: 400 }
      );
    }

    if (survey.currentRespondents >= survey.maxRespondents) {
      return NextResponse.json(
        { message: "Survey has reached maximum respondents" },
        { status: 400 }
      );
    }

    // Check if user already responded
    const existingResponse = await prisma.surveyResponse.findUnique({
      where: {
        surveyId_userId: {
          surveyId,
          userId,
        },
      },
    });

    if (existingResponse) {
      return NextResponse.json(
        { message: "You have already completed this survey" },
        { status: 400 }
      );
    }

    // Create response and update user balance in a transaction
    const result = await prisma.$transaction([
      prisma.surveyResponse.create({
        data: {
          surveyId,
          userId,
          answers: JSON.stringify(answers),
          rewarded: true,
        },
      }),
      prisma.survey.update({
        where: { id: surveyId },
        data: {
          currentRespondents: { increment: 1 },
        },
      }),
      prisma.user.update({
        where: { id: userId },
        data: {
          balance: { increment: survey.reward },
          totalEarned: { increment: survey.reward },
        },
      }),
    ]);

    const updatedUser = result[2];

    return NextResponse.json({
      message: "Survey completed successfully!",
      earned: survey.reward,
      newBalance: updatedUser.balance,
    });
  } catch (error) {
    console.error("Survey response error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}
