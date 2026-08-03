export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { DEFAULT_MANAGER_COMMISSION } from "@/lib/constants";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, role: true, commissionPercent: true },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const isManager = user.role === "manager";

    // Get referrals
    const referrals = await prisma.referral.findMany({
      where: { referrerId: userId },
      include: {
        referred: {
          select: {
            fullName: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const totalReferrals = referrals.length;
    const totalEarnings = referrals.reduce((sum, ref) => sum + ref.earned, 0);

    // Managers also earn a % commission when their referrals get rewarded on projects.
    let commissionTotal = 0;
    let commissionCount = 0;
    if (isManager) {
      const agg = await prisma.managerCommission.aggregate({
        where: { managerId: userId },
        _sum: { amount: true },
        _count: { _all: true },
      });
      commissionTotal = agg._sum.amount ?? 0;
      commissionCount = agg._count._all;
    }

    return NextResponse.json({
      referralCode: user.referralCode,
      totalReferrals,
      totalEarnings,
      isManager,
      referralCap: isManager ? null : 50,
      commissionPercent: isManager ? (user.commissionPercent ?? DEFAULT_MANAGER_COMMISSION) : null,
      commissionTotal,
      commissionCount,
      referrals: referrals.map((ref) => ({
        id: ref.id,
        name: ref.referred.fullName,
        date: ref.createdAt,
        earned: ref.earned,
      })),
    });
  } catch (error) {
    console.error("Referrals fetch error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}
