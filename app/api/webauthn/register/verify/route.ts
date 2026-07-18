export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { CHALLENGE_COOKIE, getRpID, getExpectedOrigin } from "@/lib/webauthn";

function deviceNameFromUA(ua: string | null): string {
  if (!ua) return "Passkey";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iPhone / iPad (Face ID / Touch ID)";
  if (/Macintosh/i.test(ua)) return "Mac (Touch ID)";
  if (/Android/i.test(ua)) return "Android device";
  if (/Windows/i.test(ua)) return "Windows (Hello)";
  return "Passkey";
}

// Finish enrolling: verify the attestation and store the credential.
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const expectedChallenge = request.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!expectedChallenge) {
    return NextResponse.json({ verified: false, message: "Challenge expired. Try again." }, { status: 400 });
  }

  const body = await request.json();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: getExpectedOrigin(request),
      expectedRPID: getRpID(request),
      requireUserVerification: false,
    });
  } catch (err) {
    return NextResponse.json(
      { verified: false, message: err instanceof Error ? err.message : "Verification failed" },
      { status: 400 }
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ verified: false, message: "Could not verify." }, { status: 400 });
  }

  const { credential } = verification.registrationInfo;

  try {
    await prisma.webAuthnCredential.create({
      data: {
        userId: session.user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: body?.response?.transports ? JSON.stringify(body.response.transports) : null,
        deviceName: deviceNameFromUA(request.headers.get("user-agent")),
      },
    });
  } catch {
    // Unique violation → this passkey is already enrolled
    return NextResponse.json({ verified: false, message: "This device is already set up." }, { status: 409 });
  }

  const res = NextResponse.json({ verified: true });
  res.cookies.delete(CHALLENGE_COOKIE);
  return res;
}
