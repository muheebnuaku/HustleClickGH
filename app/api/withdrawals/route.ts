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
        if (user.balance < parsedAmount) throw new Error("INSUFFICIENT_BALANCE");

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
      if (msg === "INSUFFICIENT_BALANCE")
        return NextResponse.json({ message: "Insufficient balance" }, { status: 400 });
      throw err;
    }

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
