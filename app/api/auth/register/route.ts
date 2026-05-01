export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { SITE_CONFIG } from "@/lib/constants";
import { logActivity, getIp } from "@/lib/activity-log";

async function generateUserId(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const digits = Math.floor(1000 + Math.random() * 9000).toString();
    const userId = `USER${digits}`;
    const existing = await prisma.user.findUnique({ where: { userId } });
    if (!existing) return userId;
  }
  // Fallback to 6 digits if 4-digit space is nearly exhausted
  const digits = Math.floor(100000 + Math.random() * 900000).toString();
  return `USER${digits}`;
}

function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

const FREE_EMAIL_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "yahoo.co.uk", "yahoo.com.gh",
  "outlook.com", "hotmail.com", "hotmail.co.uk",
  "icloud.com", "me.com", "mac.com",
  "aol.com", "protonmail.com", "proton.me",
  "live.com", "msn.com", "ymail.com",
]);

function isEmailFlagged(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  return FREE_EMAIL_PROVIDERS.has(domain);
}

function generatePersonalCallCode(): string {
  // Generate a unique 5-character alphanumeric code (letters + digits, easy to share verbally)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars: 0, O, I, 1
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
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
    const userId = await generateUserId();
    const referralCode = generateReferralCode();
    const personalCallCode = generatePersonalCallCode();

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
        personalCallCode,
        referredBy,
        emailFlagged: isEmailFlagged(email),
        role: "user",
      },
    });

    // If user was referred, check if referrer can accept more referrals (max 50)
    if (referredBy) {
      const referralCount = await prisma.referral.count({
        where: { referrerId: referredBy },
      });

      if (referralCount < 50) {
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
    }

    logActivity({
      type: "register",
      userId: user.id,
      userName: user.fullName,
      severity: "success",
      metadata: { userId: user.userId, email: user.email, referredBy: referredBy ?? undefined },
      ip: getIp(request),
    });

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
