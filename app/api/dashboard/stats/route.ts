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

    // Get user stats
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        balance: true,
        totalEarned: true,
        _count: {
          select: {
            surveyResponses: true,
            referrals: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Get available surveys
    const availableSurveys = await prisma.survey.count({
      where: {
        status: "active",
        expiresAt: { gt: new Date() },
        currentRespondents: { lt: prisma.survey.fields.maxRespondents },
        responses: {
          none: {
            userId: userId,
          },
        },
      },
    });

    // Get recent survey responses
    const recentEarnings = await prisma.surveyResponse.findMany({
      where: { userId },
      include: {
        survey: {
          select: {
            title: true,
            reward: true,
          },
        },
      },
      orderBy: { submittedAt: "desc" },
      take: 5,
    });

    return NextResponse.json({
      balance: user.balance,
      totalEarned: user.totalEarned,
      surveysCompleted: user._count.surveyResponses,
      availableSurveys,
      totalReferrals: user._count.referrals,
      recentEarnings: recentEarnings.map((r) => ({
        surveyTitle: r.survey.title,
        amount: r.survey.reward,
        date: r.submittedAt,
      })),
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}
