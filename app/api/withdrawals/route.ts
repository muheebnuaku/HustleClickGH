export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { evaluateWithdrawal } from "@/lib/lana";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const withdrawals = await prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { requestedAt: "desc" },
    });

    return NextResponse.json({ withdrawals });
  } catch (error) {
    console.error("Withdrawals fetch error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (session.user.status === "suspended") {
      return NextResponse.json({ message: "Your account has been suspended." }, { status: 403 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { amount, paymentMethod, mobileNumber, accountName } = body;

    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount < 10) {
      return NextResponse.json(
        { message: "Minimum withdrawal amount is GH₵10" },
        { status: 400 }
      );
    }

    // Atomically check balance and create withdrawal in one transaction
    // to prevent race conditions from concurrent requests
    let withdrawal;
    try {
      withdrawal = await prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (!user) throw new Error("USER_NOT_FOUND");

        // Reserve money already tied up in pending requests, so a user can never
        // queue withdrawals whose total exceeds their balance. (Previously each
        // request was only checked against the full balance, letting a GH₵30
        // balance spawn many GH₵30 requests.)
        const pendingAgg = await tx.withdrawal.aggregate({
          where: { userId, status: "pending" },
          _sum: { amount: true },
        });
        const reserved = pendingAgg._sum.amount ?? 0;
        const available = user.balance - reserved;
        if (parsedAmount > available) {
          throw new Error(`INSUFFICIENT_AVAILABLE:${available.toFixed(2)}`);
        }

        return tx.withdrawal.create({
          data: {
            userId,
            amount: parsedAmount,
            paymentMethod,
            mobileNumber,
            accountName,
            status: "pending",
          },
        });
      });
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "USER_NOT_FOUND")
        return NextResponse.json({ message: "User not found" }, { status: 404 });
      if (msg.startsWith("INSUFFICIENT_AVAILABLE")) {
        const avail = msg.split(":")[1];
        return NextResponse.json(
          { message: `You can only withdraw up to GH₵${avail} — the rest of your balance is already in pending requests.` },
          { status: 400 }
        );
      }
      throw err;
    }

    // Fire-and-forget — never let Lana's review block or slow the withdrawal
    // request itself; she only ever flags for admin review on this path,
    // never auto-rejects.
    evaluateWithdrawal(withdrawal, { fullName: session.user.name ?? "", userId: session.user.userId ?? "" }).catch((err) =>
      console.error("[lana] withdrawal evaluation failed:", err)
    );

    return NextResponse.json({
      message: "Withdrawal request submitted successfully",
      withdrawal,
    });
  } catch (error) {
    console.error("Withdrawal request error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}
