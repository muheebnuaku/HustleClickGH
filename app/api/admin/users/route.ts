export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Admin: Get all users
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      where: { role: "user" },
      include: {
        _count: {
          select: {
            surveyResponses: true,
            referrals: true,
          },
        },
        withdrawals: {
          where: { status: "approved" },
          select: { amount: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedUsers = users.map((user) => ({
      id: user.id,
      userId: user.userId,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      balance: user.balance,
      totalEarned: user.totalEarned,
      role: user.role,
      status: user.status,
      surveysCompleted: user._count.surveyResponses,
      referralCount: user._count.referrals,
      createdAt: user.createdAt,
    }));

    // Calculate stats
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === "active").length;
    const totalBalance = users.reduce((sum, u) => sum + u.balance, 0);
    const totalPaidOut = users.reduce((sum, u) => {
      const paidOut = u.withdrawals.reduce((s, w) => s + w.amount, 0);
      return sum + paidOut;
    }, 0);

    return NextResponse.json({
      users: formattedUsers,
      stats: {
        totalUsers,
        activeUsers,
        totalPaidOut,
        totalBalance,
      },
    });
  } catch (error) {
    console.error("Users fetch error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}
