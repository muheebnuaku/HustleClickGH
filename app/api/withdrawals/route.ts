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

    // Get user balance
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    if (user.balance < amount) {
      return NextResponse.json(
        { message: "Insufficient balance" },
        { status: 400 }
      );
    }

    // Create withdrawal request
    const withdrawal = await prisma.withdrawal.create({
      data: {
        userId,
        amount: parseFloat(amount),
        paymentMethod,
        mobileNumber,
        accountName,
        status: "pending",
      },
    });

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
