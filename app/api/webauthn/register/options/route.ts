export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { RP_NAME, CHALLENGE_COOKIE, getRpID, getExpectedOrigin } from "@/lib/webauthn";

// Start enrolling a biometric/passkey for the logged-in user.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { webauthnCredentials: true },
  });
  if (!user) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: getRpID(request),
    userName: user.email || user.userId,
    userDisplayName: user.fullName,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: user.webauthnCredentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports ? JSON.parse(c.transports) : undefined,
    })),
    authenticatorSelection: {
      // "platform" = the device's own biometric (Face ID / Touch ID / Windows
      // Hello / Android fingerprint) rather than an external security key.
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const res = NextResponse.json(options);
  res.cookies.set(CHALLENGE_COOKIE, options.challenge, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
    secure: getExpectedOrigin(request).startsWith("https"),
  });
  return res;
}
