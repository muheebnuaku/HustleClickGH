export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { sendEmail, withdrawalApprovedEmail } from "@/lib/email";

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
    let receiptUrl = "";
    try {
      const body = await request.json();
      notes = body.notes || "";
      receiptUrl = typeof body.receiptUrl === "string" ? body.receiptUrl.trim() : "";
    } catch {
      // Body is empty, that's okay
    }

    // A payment receipt is required before a withdrawal can be approved.
    if (!receiptUrl) {
      return NextResponse.json(
        { message: "Upload the payment receipt before approving this withdrawal." },
        { status: 400 }
      );
    }

    // Approve + deduct atomically, GUARDING that the balance actually covers it.
    // Without this guard, approving several pending requests could drive a
    // balance negative (e.g. a GH₵30 balance with many GH₵30 requests).
    let approved;
    let user;
    try {
      const out = await prisma.$transaction(async (tx) => {
        const w = await tx.withdrawal.findUnique({ where: { id }, include: { user: true } });
        if (!w) throw new Error("NOT_FOUND");
        if (w.status !== "pending") throw new Error("ALREADY_PROCESSED");

        const u = await tx.user.findUnique({ where: { id: w.userId } });
        if (!u) throw new Error("NOT_FOUND");
        if (u.balance < w.amount) throw new Error("INSUFFICIENT_BALANCE");

        const updated = await tx.withdrawal.update({
          where: { id },
          data: { status: "approved", processedAt: new Date(), processedBy: session.user.id, notes, receiptUrl },
        });
        await tx.user.update({ where: { id: w.userId }, data: { balance: { decrement: w.amount } } });
        return { updated, user: w.user };
      });
      approved = out.updated;
      user = out.user;
    } catch (err) {
      const msg = (err as Error).message;
      if (msg === "NOT_FOUND") return NextResponse.json({ message: "Withdrawal not found" }, { status: 404 });
      if (msg === "ALREADY_PROCESSED") return NextResponse.json({ message: "Withdrawal has already been processed" }, { status: 400 });
      if (msg === "INSUFFICIENT_BALANCE")
        return NextResponse.json(
          { message: "The user's balance no longer covers this withdrawal (likely already paid out via another request). Reject this one instead." },
          { status: 400 }
        );
      throw err;
    }

    // Let the user know the money is on its way (fire-and-forget)
    if (user?.email) {
      const mail = withdrawalApprovedEmail(user.fullName, approved.amount, approved.paymentMethod, approved.mobileNumber);
      sendEmail({ to: user.email, subject: mail.subject, html: mail.html }).catch(() => {});
    }

    return NextResponse.json({
      message: "Withdrawal approved successfully",
      withdrawal: approved,
    });
  } catch (error) {
    console.error("Withdrawal approval error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}

// Also accept POST requests
export const POST = PUT;
