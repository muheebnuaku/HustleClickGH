export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { SITE_CONFIG } from "@/lib/constants";

function generateUserId(): string {
  return `USER${Math.random().toString(36).substr(2, 6).toUpperCase()}${Date.now().toString(36).toUpperCase()}`;
}

function generateReferralCode(): string {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fullName, email, phone, password, referralId } = body;

    // Validate required fields
    if (!fullName || !email || !phone || !password) {
      return NextResponse.json(
        { message: "All fields are required" },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "User with this email already exists" },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Generate unique user ID and referral code
    const userId = generateUserId();
    const referralCode = generateReferralCode();

    // Handle referral
    let referredBy = null;
    if (referralId) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: referralId },
      });
      if (referrer) {
        referredBy = referrer.id;
      }
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        userId,
        fullName,
        email,
        phone,
        password: hashedPassword,
        referralCode,
        referredBy,
        role: "user",
      },
    });

    // If user was referred, create referral record and credit referrer
    if (referredBy) {
      await prisma.$transaction([
        prisma.referral.create({
          data: {
            referrerId: referredBy,
            referredId: user.id,
            earned: SITE_CONFIG.survey.referralBonus,
          },
        }),
        prisma.user.update({
          where: { id: referredBy },
          data: {
            balance: { increment: SITE_CONFIG.survey.referralBonus },
            totalEarned: { increment: SITE_CONFIG.survey.referralBonus },
          },
        }),
      ]);
    }

    return NextResponse.json({
      message: "User created successfully",
      userId: user.userId,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "An error occurred during registration" },
      { status: 500 }
    );
  }
}
