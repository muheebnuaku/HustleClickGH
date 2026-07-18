export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { CHALLENGE_COOKIE, getRpID, getExpectedOrigin, signAuthToken } from "@/lib/webauthn";
import { logActivity, getIp } from "@/lib/activity-log";

// Verify the biometric assertion. On success return a short-lived signed token
// the login page hands to NextAuth to establish the session.
export async function POST(request: NextRequest) {
  const expectedChallenge = request.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) {
    return NextResponse.json({ verified: false, message: "Challenge expired. Try again." }, { status: 400 });
  }

  const body = await request.json();

  const cred = await prisma.webAuthnCredential.findUnique({
    where: { credentialId: body.id },
    include: { user: true },
  });
  if (!cred) {
    return NextResponse.json({ verified: false, message: "This passkey isn't recognized. Sign in with your User ID, then set up biometrics." }, { status: 404 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: getExpectedOrigin(request),
      expectedRPID: getRpID(request),
      credential: {
        id: cred.credentialId,
        publicKey: new Uint8Array(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined,
      },
      requireUserVerification: false,
    });
  } catch (err) {
    return NextResponse.json(
      { verified: false, message: err instanceof Error ? err.message : "Verification failed" },
      { status: 400 }
    );
  }

  if (!verification.verified) {
    return NextResponse.json({ verified: false, message: "Could not verify." }, { status: 400 });
  }

  if (cred.user.status !== "active") {
    await logActivity({
      type: "login_failed",
      userId: cred.user.id,
      userName: cred.user.fullName,
      severity: "warning",
      metadata: { method: "biometric", reason: "Account suspended" },
      ip: getIp(request),
    });
    return NextResponse.json({ verified: false, message: "Your account has been suspended." }, { status: 403 });
  }

  await prisma.webAuthnCredential.update({
    where: { id: cred.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
  });

  const token = signAuthToken(cred.userId);
  const res = NextResponse.json({ verified: true, userId: cred.user.userId, token });
  res.cookies.delete(CHALLENGE_COOKIE);
  return res;
}
