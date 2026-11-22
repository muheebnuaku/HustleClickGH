export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { PremiumInputError, getPremiumSettings, isPremium, submitPremiumRequest } from "@/lib/premium";
import { getIp, logActivity } from "@/lib/activity-log";

// The signed-in user's plan, how to pay, and their latest upgrade request.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const [user, settings, latest] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.user.id }, select: { premiumUntil: true, verified: true } }),
      getPremiumSettings(),
      prisma.premiumRequest.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, amount: true, reference: true, adminNote: true, createdAt: true, reviewedAt: true },
      }),
    ]);
    return NextResponse.json({
      premium: isPremium(user),
      premiumUntil: user?.premiumUntil ?? null,
      verified: !!user?.verified,
      settings,
      latest,
    });
  } catch (error) {
    console.error("Premium status failed:", error);
    return NextResponse.json({ message: "Could not load your plan" }, { status: 500 });
  }
}

// Submit a Mobile Money payment for review.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const req = await submitPremiumRequest(session.user.id, await request.json());
    logActivity({
      type: "premium_requested",
      userId: session.user.id,
      userName: session.user.name ?? undefined,
      metadata: { requestId: req.id, amount: req.amount, reference: req.reference },
      ip: getIp(request),
    });
    return NextResponse.json({ request: { id: req.id, status: req.status, amount: req.amount, reference: req.reference, createdAt: req.createdAt } });
  } catch (error) {
    if (error instanceof PremiumInputError) return NextResponse.json({ message: error.message }, { status: 400 });
    console.error("Premium request failed:", error);
    return NextResponse.json({ message: "Could not submit your payment" }, { status: 500 });
  }
}
