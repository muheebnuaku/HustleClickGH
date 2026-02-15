export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Admin: Get all withdrawals
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const withdrawals = await prisma.withdrawal.findMany({
      include: {
        user: {
          select: {
            userId: true,
            fullName: true,
            email: true,
          },
        },
      },
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
