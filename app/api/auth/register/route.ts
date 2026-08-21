export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { SITE_CONFIG, REFERRAL_CAP } from "@/lib/constants";
import { logActivity, getIp } from "@/lib/activity-log";
import { encryptField, lastChars, isEncryptionConfigured } from "@/lib/crypto";
import { CONSENT_VERSION } from "@/lib/legal";
import { sendEmail, welcomeEmail } from "@/lib/email";
import { checkDuplicateRisk } from "@/lib/fraud-check";

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
    const {
      fullName,
      email,
      phone,
      password,
      referralId,
      country,
      region,
      city,
      idType,
      idNumber,
      consentAgreed,
      consentName,
    } = body;

    // Validate required fields
    if (!fullName || !email || !phone || !password) {
      return NextResponse.json(
        { message: "All fields are required" },
        { status: 400 }
      );
    }

    // Location is required for contributors (Ghana Data Protection Act: purpose-bound collection)
    if (!country || !region || !city) {
      return NextResponse.json(
        { message: "Country, region, and city are required" },
        { status: 400 }
      );
    }

    // ID is optional for now — but if given it must look valid
    if (idNumber && String(idNumber).trim().length < 4) {
      return NextResponse.json(
        { message: "Please enter a valid ID number, or leave it blank" },
        { status: 400 }
      );
    }

    // Consent to the Data Processing Agreement is required and must be explicit
    if (consentAgreed !== true || !consentName || String(consentName).trim().length < 2) {
      return NextResponse.json(
        { message: "You must read and sign the Data Processing Agreement to register" },
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

    // Block re-registration on a phone number that's already tied to an
    // account — the clearest multi-accounting signal, so it's a hard reject
    // rather than just a flag.
    const existingPhone = await prisma.user.findFirst({
      where: { phone },
    });

    if (existingPhone) {
      return NextResponse.json(
        { message: "This phone number is already registered to an account" },
        { status: 400 }
      );
    }

    // AI-assisted check for near-duplicate accounts (similar phone/email/
    // location, not an exact match). Never blocks signup — flags the new
    // account for admin review. See lib/fraud-check.ts.
    const duplicateRisk = await checkDuplicateRisk({
      fullName,
      email,
      phone,
      city: String(city).trim(),
      region: String(region).trim(),
    });

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Generate unique user ID and referral code
    const userId = await generateUserId();
    const referralCode = generateReferralCode();
    const personalCallCode = generatePersonalCallCode();

    // Handle referral
    let referredBy = null;
    let referrerIsManager = false;
    if (referralId) {
      const referrer = await prisma.user.findUnique({
        where: { referralCode: referralId },
        select: { id: true, role: true },
      });
      if (referrer) {
        referredBy = referrer.id;
        referrerIsManager = referrer.role === "manager";
      }
    }

    // ID is optional. When supplied, encrypt it at rest and keep only the last
    // 4 characters in the clear for display.
    const rawId = idNumber ? String(idNumber).trim() : "";
    if (rawId && !isEncryptionConfigured()) {
      console.warn("[register] FIELD_ENCRYPTION_KEY not set — storing ID number WITHOUT encryption.");
    }
    const storedId = rawId ? (isEncryptionConfigured() ? encryptField(rawId) : rawId) : null;

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
        role: "user",
        country: String(country).trim(),
        region: String(region).trim(),
        city: String(city).trim(),
        idType: rawId && idType ? String(idType).trim() : null,
        idNumber: storedId,
        idNumberLast4: rawId ? lastChars(rawId, 4) : null,
        profileCompleted: true,
        consentSignedAt: new Date(),
        consentVersion: CONSENT_VERSION,
        ...(duplicateRisk.flagged
          ? {
              fraudRiskScore: duplicateRisk.riskScore,
              fraudRiskReason: duplicateRisk.reason,
              fraudFlaggedAt: new Date(),
              suspectedDuplicateOfUserId: duplicateRisk.suspectedDuplicateOfUserId,
            }
          : {}),
      },
    });

    if (duplicateRisk.flagged) {
      logActivity({
        type: "fraud_flagged",
        userId: user.id,
        userName: user.fullName,
        severity: "warning",
        metadata: {
          userId: user.userId,
          riskScore: duplicateRisk.riskScore,
          reason: duplicateRisk.reason,
          suspectedDuplicateOfUserId: duplicateRisk.suspectedDuplicateOfUserId,
        },
        ip: getIp(request),
      });
    }

    // Auditable consent record
    await prisma.consentRecord.create({
      data: {
        userId: user.id,
        documentType: "data_processing_agreement",
        documentVersion: CONSENT_VERSION,
        signedName: String(consentName).trim(),
        agreed: true,
        ipAddress: getIp(request),
        userAgent: request.headers.get("user-agent"),
      },
    });

    // If user was referred, check if referrer can accept more referrals (max 50)
    if (referredBy) {
      const referralCount = await prisma.referral.count({
        where: { referrerId: referredBy },
      });

      // Contributors are capped at REFERRAL_CAP; managers are unlimited.
      if (referrerIsManager || referralCount < REFERRAL_CAP) {
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

    // Welcome email with their User ID (fire-and-forget — never blocks signup)
    const welcome = welcomeEmail(user.fullName, user.userId);
    sendEmail({ to: user.email, subject: welcome.subject, html: welcome.html }).catch(() => {});

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
