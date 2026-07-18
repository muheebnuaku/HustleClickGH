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
      verified: user.verified,
      locationRequested: user.locationRequested,
      country: user.country,
      region: user.region,
      city: user.city,
      surveysCompleted: user._count.surveyResponses,
      referralCount: user._count.referrals,
      createdAt: user.createdAt,
    }));

    // Calculate stats
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === "active").length;
    const suspendedUsers = users.filter(u => u.status === "suspended").length;
    const flaggedEmails = users.filter(u => u.emailFlagged).length;
    const verifiedUsers = users.filter(u => u.verified).length;
    const missingLocation = users.filter(u => !u.country?.trim()).length;
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
        verifiedUsers,
        missingLocation,
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

    const VALID = ["suspend", "unsuspend", "verify", "unverify", "request_location"];
    if (!userId || !VALID.includes(action)) {
      return NextResponse.json(
        { message: "Invalid request: userId and a valid action are required" },
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

    let data: Record<string, unknown>;
    switch (action) {
      case "suspend":
        data = { status: "suspended" };
        break;
      case "unsuspend":
        data = { status: "active" };
        break;
      case "verify":
        data = { verified: true, verifiedAt: new Date() };
        break;
      case "unverify":
        data = { verified: false, verifiedAt: null };
        break;
      default: // request_location
        data = { locationRequested: true };
        break;
    }

    const updated = await prisma.user.update({ where: { id: userId }, data });

    return NextResponse.json({
      message: `User ${action} successful`,
      user: {
        id: updated.id,
        userId: updated.userId,
        fullName: updated.fullName,
        email: updated.email,
        status: updated.status,
        verified: updated.verified,
        locationRequested: updated.locationRequested,
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

// Admin: bulk-prompt every contributor who hasn't provided a location.
// Those users get a location modal the next time they open their dashboard.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { action } = await request.json();
    if (action !== "request_location_all") {
      return NextResponse.json({ message: "Invalid action" }, { status: 400 });
    }

    const result = await prisma.user.updateMany({
      where: {
        role: "user",
        OR: [{ country: null }, { country: "" }],
      },
      data: { locationRequested: true },
    });

    return NextResponse.json({
      message: `Location requested from ${result.count} user${result.count === 1 ? "" : "s"}.`,
      count: result.count,
    });
  } catch (error) {
    console.error("Bulk location request error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
