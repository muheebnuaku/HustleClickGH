export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// Free public TURN servers — always included as fallback alongside Metered.
// These have bandwidth limits but are reliable for connection establishment.
const OPEN_TURN: object[] = [
  { urls: "turn:openrelay.metered.video:80",              username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443",             username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.video:443",            username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:80",                 username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443",                username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp",  username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.ca:443",               username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
];

const STUN_ONLY: object[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

export async function GET() {
  const appName = process.env.METERED_APP_NAME;
  const apiKey  = process.env.METERED_API_KEY;

  if (appName && apiKey) {
    try {
      // no cache — credentials are time-limited (1h); fetch fresh each call
      const res = await fetch(
        `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const metered = await res.json() as object[];
        // Merge Metered (primary) + openrelay (backup) so the browser has
        // multiple TURN options and picks the one that works from Ghana.
        return NextResponse.json({ iceServers: [...metered, ...OPEN_TURN] });
      }
    } catch {
      // fall through
    }
  }

  // No Metered config — use public STUN + openrelay TURN
  return NextResponse.json({ iceServers: [...STUN_ONLY, ...OPEN_TURN] });
}

