export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id } = await params;
    
    // Parse body safely (may be empty)
    let notes = "";
    try {
      const body = await request.json();
      notes = body.notes || "";
    } catch {
      // Body is empty, that's okay
    }

    // Get withdrawal details
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id },
    });

    if (!withdrawal) {
      return NextResponse.json(
        { message: "Withdrawal not found" },
        { status: 404 }
      );
    }

    if (withdrawal.status !== "pending") {
      return NextResponse.json(
        { message: "Withdrawal has already been processed" },
        { status: 400 }
      );
    }

    // Reject withdrawal (balance remains unchanged)
    const updatedWithdrawal = await prisma.withdrawal.update({
      where: { id },
      data: {
        status: "rejected",
        processedAt: new Date(),
        processedBy: session.user.id,
        notes,
      },
    });

    return NextResponse.json({
      message: "Withdrawal rejected",
      withdrawal: updatedWithdrawal,
    });
  } catch (error) {
    console.error("Withdrawal rejection error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}

// Also accept POST requests
export const POST = PUT;
