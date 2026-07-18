export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { encryptField, lastChars, isEncryptionConfigured } from "@/lib/crypto";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        userId: true,
        fullName: true,
        email: true,
        phone: true,
        image: true,
        nationalId: true,
        idNumberLast4: true,
        idType: true,
        role: true,
        verified: true,
        balance: true,
        totalEarned: true,
        referralCode: true,
        personalCallCode: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    // Get survey stats
    const surveysCompleted = await prisma.surveyResponse.count({
      where: { userId: user.id },
    });

    // Get referral stats
    const referralsCount = await prisma.referral.count({
      where: { referrerId: user.id },
    });

    return NextResponse.json({
      user,
      stats: {
        surveysCompleted,
        referrals: referralsCount,
      },
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session || !session.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { email, phone, nationalId, newPassword, image } = body;

    // Get current user to check whether an ID is already on file
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { nationalId: true, idNumber: true },
    });

    const updateData: {
      email?: string;
      phone?: string;
      idNumber?: string;
      idNumberLast4?: string;
      password?: string;
      image?: string;
    } = {};

    // Only update email and phone if provided
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;

    // The profile "National ID" is the same value captured at registration.
    // It is optional, write-once, and encrypted at rest.
    const rawId = nationalId ? String(nationalId).trim() : "";
    const alreadyHasId = Boolean(currentUser?.idNumber || currentUser?.nationalId);
    if (rawId && !alreadyHasId) {
      if (rawId.length < 4) {
        return NextResponse.json({ error: "Please enter a valid ID number" }, { status: 400 });
      }
      if (!isEncryptionConfigured()) {
        console.warn("[profile] FIELD_ENCRYPTION_KEY not set — storing ID number WITHOUT encryption.");
      }
      updateData.idNumber = isEncryptionConfigured() ? encryptField(rawId) : rawId;
      updateData.idNumberLast4 = lastChars(rawId, 4);
    }

    // If image is provided, update it
    if (image !== undefined) {
      updateData.image = image;
    }

    // If new password is provided, hash it
    if (newPassword && newPassword.trim()) {
      const { hash } = await import("bcryptjs");
      updateData.password = await hash(newPassword, 12);
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    return NextResponse.json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json(
      { message: "An error occurred" },
      { status: 500 }
    );
  }
}
