export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";
import { encryptField, lastChars, isEncryptionConfigured } from "@/lib/crypto";
import { CONSENT_VERSION } from "@/lib/legal";

// Returns whether the current user still needs to complete onboarding.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      fullName: true,
      phone: true,
      country: true,
      region: true,
      city: true,
      idType: true,
      profileCompleted: true,
    },
  });
  return NextResponse.json({ user });
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { phone, country, region, city, idType, idNumber, consentAgreed, consentName } = body;

    if (!phone || String(phone).trim().length < 10) {
      return NextResponse.json({ message: "A valid phone number is required" }, { status: 400 });
    }
    if (!country || !region || !city) {
      return NextResponse.json({ message: "Country, region, and city are required" }, { status: 400 });
    }
    if (!idType || !idNumber || String(idNumber).trim().length < 4) {
      return NextResponse.json({ message: "A valid ID type and ID number are required" }, { status: 400 });
    }
    if (consentAgreed !== true || !consentName || String(consentName).trim().length < 2) {
      return NextResponse.json(
        { message: "You must read and sign the Data Processing Agreement to continue" },
        { status: 400 }
      );
    }

    const rawId = String(idNumber).trim();
    if (!isEncryptionConfigured()) {
      console.warn("[onboarding] FIELD_ENCRYPTION_KEY not set — storing ID number WITHOUT encryption.");
    }
    const storedId = isEncryptionConfigured() ? encryptField(rawId) : rawId;

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        phone: String(phone).trim(),
        country: String(country).trim(),
        region: String(region).trim(),
        city: String(city).trim(),
        idType: String(idType).trim(),
        idNumber: storedId,
        idNumberLast4: lastChars(rawId, 4),
        profileCompleted: true,
        consentSignedAt: new Date(),
        consentVersion: CONSENT_VERSION,
      },
    });

    await prisma.consentRecord.create({
      data: {
        userId: session.user.id,
        documentType: "data_processing_agreement",
        documentVersion: CONSENT_VERSION,
        signedName: String(consentName).trim(),
        agreed: true,
        ipAddress: getIp(request),
        userAgent: request.headers.get("user-agent"),
      },
    });

    logActivity({
      type: "profile_completed",
      userId: session.user.id,
      userName: session.user.name,
      severity: "success",
      metadata: { via: "onboarding" },
      ip: getIp(request),
    });

    return NextResponse.json({ message: "Onboarding complete" });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json({ message: "An error occurred. Please try again." }, { status: 500 });
  }
}
