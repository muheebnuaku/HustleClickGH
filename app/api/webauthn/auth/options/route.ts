export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { CHALLENGE_COOKIE, getRpID, getExpectedOrigin } from "@/lib/webauthn";

// Start biometric sign-in. Usernameless: the browser offers any passkey the
// device holds for this site (discoverable credentials).
export async function POST(request: NextRequest) {
  const options = await generateAuthenticationOptions({
    rpID: getRpID(request),
    userVerification: "preferred",
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
