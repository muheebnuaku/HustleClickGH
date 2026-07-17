export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";
import { CONSENT_VERSION } from "@/lib/legal";

// Records the logged-in user's acceptance of the current Data Processing Agreement /
// Privacy Policy. Used by the post-login consent gate on the Data & Privacy page.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (body?.agreed !== true) {
      return NextResponse.json({ message: "You must agree to continue." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { consentSignedAt: new Date(), consentVersion: CONSENT_VERSION },
    });

    await prisma.consentRecord.create({
      data: {
        userId: user.id,
        documentType: "data_processing_agreement",
        documentVersion: CONSENT_VERSION,
        signedName: user.fullName,
        agreed: true,
        ipAddress: getIp(request),
        userAgent: request.headers.get("user-agent"),
      },
    });

    logActivity({
      type: "consent_signed",
      userId: user.id,
      userName: user.fullName,
      severity: "success",
      metadata: { version: CONSENT_VERSION, via: "login_gate" },
      ip: getIp(request),
    });

    return NextResponse.json({ message: "Consent recorded" });
  } catch (error) {
    console.error("Consent error:", error);
    return NextResponse.json({ message: "An error occurred. Please try again." }, { status: 500 });
  }
}
