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
      emailFlagged: user.emailFlagged,
      surveysCompleted: user._count.surveyResponses,
      referralCount: user._count.referrals,
      createdAt: user.createdAt,
    }));

    // Calculate stats
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === "active").length;
    const suspendedUsers = users.filter(u => u.status === "suspended").length;
    const flaggedEmails = users.filter(u => u.emailFlagged).length;
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
        suspendedUsers,
        flaggedEmails,
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

// Admin: Suspend/Unsuspend user
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, action } = body;

    if (!userId || !["suspend", "unsuspend"].includes(action)) {
      return NextResponse.json(
        { message: "Invalid request: userId and action required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { message: "User not found" },
        { status: 404 }
      );
    }

    const newStatus = action === "suspend" ? "suspended" : "active";

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { status: newStatus },
    });

    console.log(`User ${updated.userId} ${action}ed successfully. New status: ${updated.status}`);

    return NextResponse.json({
      message: `User ${action === "suspend" ? "suspended" : "unsuspended"} successfully`,
      user: {
        id: updated.id,
        userId: updated.userId,
        fullName: updated.fullName,
        email: updated.email,
        status: updated.status,
      },
    });
  } catch (error) {
    console.error("User update error:", error);
    return NextResponse.json(
      { message: "An error occurred during update", error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
