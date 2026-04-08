export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// Free public TURN servers — geographically distributed for global coverage.
// These have bandwidth limits but are reliable for connection establishment.
// Prioritized by geography: Africa (primary), Europe/Asia (secondary), North America (legacy).
const OPEN_TURN: object[] = [
  // Africa-friendly TURN servers (primary for Ghana/India connections)
  { urls: "turn:openrelay.metered.video:80",              username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443",             username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.video:443",            username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  // Europe-friendly TURN servers (for Bulgaria → Bulgaria/India/Europe routes)
  { urls: "turn:openrelay.metered.video:80",              username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:eu.openrelay.metered.video:80",           username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:eu.openrelay.metered.video:443",          username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:eu.openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  // Asia-friendly TURN servers (for India/SE Asia routes)
  { urls: "turn:ap.openrelay.metered.video:80",           username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:ap.openrelay.metered.video:443",          username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:ap.openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  // North America fallback (legacy, still works)
  { urls: "turn:openrelay.metered.ca:80",                 username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443",                username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp",  username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.ca:443",               username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
];

// STUN servers — geographically diverse for optimal NAT traversal from any country.
// Multiple servers increase odds of successful candidate discovery for high-latency routes.
const STUN_ONLY: object[] = [
  // Google STUN (global coverage, highly reliable)
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  // Cloudflare STUN (good alternative, anycast, Europe-friendly)
  { urls: "stun:stun.cloudflare.com:3478" },
  // Twilio STUN (reliable, global)
  { urls: "stun:stun.stunprotocol.org:3478" },
  { urls: "stun:stun.l.stunprotocol.org:3478" },
  // Callwithus STUN (backup, multi-region)
  { urls: "stun:stun.callwithus.com:3478" },
  // Nextcloud STUN (community-run, reliable)
  { urls: "stun:stun.nextcloud.com:3478" },
  // Additional Asia/Europe STUN for better regional coverage
  { urls: "stun:stun.sip.us:3478" },
  { urls: "stun:stun1.stunprotocol.org:3478" },
  { urls: "stun:stun2.stunprotocol.org:3478" },
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

