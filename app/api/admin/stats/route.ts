export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Get statistics
    const [
      totalUsers,
      totalSurveys,
      activeSurveys,
      pendingWithdrawals,
      totalResponses,
      totalPaidOut,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.survey.count(),
      prisma.survey.count({ where: { status: "active" } }),
      prisma.withdrawal.count({ where: { status: "pending" } }),
      prisma.surveyResponse.count(),
      prisma.withdrawal.aggregate({
        where: { status: "approved" },
        _sum: { amount: true },
      }),
    ]);

    return NextResponse.json({
      totalUsers,
      totalSurveys,
      activeSurveys,
      pendingWithdrawals,
      totalResponses,
      totalPaidOut: totalPaidOut._sum.amount || 0,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}
