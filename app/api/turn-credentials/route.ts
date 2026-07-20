export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// Multi-region TURN optimization: Ghana + Bulgaria + India for any-to-any calls
// TURN prioritization ensures fast same-region connections + optimal international routing
const OPEN_TURN: object[] = [
  // AFRICA - Ghana PRIMARY
  { urls: "turn:openrelay.metered.video:80",                username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443",               username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.video:443",              username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // EUROPE - Bulgaria / EU
  { urls: "turn:eu.openrelay.metered.video:80",               username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:eu.openrelay.metered.video:443",              username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:eu.openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:eu.openrelay.metered.video:443",             username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // ASIA - India
  { urls: "turn:ap.openrelay.metered.video:80",               username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:ap.openrelay.metered.video:443",              username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:ap.openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:ap.openrelay.metered.video:443",             username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // NORTH AMERICA - Canada fallback
  { urls: "turn:openrelay.metered.ca:80",                 username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443",                username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp",  username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.ca:443",               username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
];

// STUN servers — a small set of reliable, globally-anycast endpoints.
// A long list doesn't improve NAT traversal: the ICE agent probes every server
// while gathering, so dead/slow entries only add latency before the useful
// candidates arrive. Google and Cloudflare STUN are anycast and answer quickly
// from Ghana, Europe and Asia alike. TURN relay (below / Metered) is what
// actually carries the call through carrier NAT.
const STUN_ONLY: object[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
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
        // multiple TURN options optimized for each user's region.
        return NextResponse.json({ iceServers: [...metered, ...OPEN_TURN] });
      }
    } catch {
      // fall through
    }
  }

  // No Metered config — use public STUN + openrelay TURN
  return NextResponse.json({ iceServers: [...STUN_ONLY, ...OPEN_TURN] });
}


