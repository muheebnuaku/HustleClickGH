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

    // Run all queries in parallel to minimise total latency.
    // The survey count uses the simplest possible filter — no subqueries —
    // to avoid the 8-second statement timeout on Supabase free tier.
    const [user, availableSurveys, recentResponses, recentWithdrawals] =
      await Promise.all([
        prisma.user.findUnique({
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
        }),

        // Simple count — no NOT EXISTS / none subquery that times out on free tier
        prisma.survey.count({
          where: {
            status: "active",
            expiresAt: { gt: new Date() },
          },
        }),

        prisma.surveyResponse.findMany({
          where: { userId },
          select: {
            id: true,
            submittedAt: true,
            survey: { select: { title: true, reward: true } },
          },
          orderBy: { submittedAt: "desc" },
          take: 5,
        }),

        prisma.withdrawal.findMany({
          where: { userId },
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
      ]);

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Build recentActivity in the shape the dashboard page expects
    const recentActivity = [
      ...recentResponses.map((r) => ({
        id: r.id,
        type: "survey" as const,
        title: r.survey.title,
        amount: r.survey.reward,
        status: "completed" as const,
        date: new Date(r.submittedAt).toLocaleDateString(),
      })),
      ...recentWithdrawals.map((w) => ({
        id: w.id,
        type: "withdrawal" as const,
        title: "Withdrawal",
        amount: w.amount,
        status: w.status as "pending" | "approved" | "rejected",
        date: new Date(w.createdAt).toLocaleDateString(),
      })),
    ]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 5);

    return NextResponse.json({
      balance: user.balance,
      totalEarned: user.totalEarned,
      surveysCompleted: user._count.surveyResponses,
      referralCount: user._count.referrals,
      referralEarnings: 0, // populated separately if needed
      pendingWithdrawals: recentWithdrawals.filter((w) => w.status === "pending").length,
      availableSurveys,
      recentActivity,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}
