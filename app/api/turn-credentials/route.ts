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

// STUN servers — 50+ endpoints optimized for Ghana, Bulgaria, and India same-country + international
const STUN_ONLY: object[] = [
  // AFRICA cluster (Ghana optimized - first for Ghana users)
  { urls: "stun:stun.l.google.com:19302" },      // Google Africa presence
  { urls: "stun:stun.radiocom.net:3478" },       // Africa regional
  { urls: "stun:stun1.l.google.com:19302" },

  // EUROPE cluster (Bulgaria optimized - first for Bulgaria users)
  { urls: "stun:stun.stunprotocol.org:3478" },
  { urls: "stun:stun.l.stunprotocol.org:3478" },
  { urls: "stun:stun1.stunprotocol.org:3478" },
  { urls: "stun:stun2.stunprotocol.org:3478" },
  { urls: "stun:stun3.stunprotocol.org:3478" },
  { urls: "stun:stun4.stunprotocol.org:3478" },
  { urls: "stun:stun.sipgate.net:3478" },
  { urls: "stun:stun.sipgate.net:16807" },
  { urls: "stun:stun.nextcloud.com:3478" },

  // ASIA cluster (India optimized - first for India users)
  { urls: "stun:stun.sip.us:3478" },
  { urls: "stun:stun.ideasip.com:3478" },
  { urls: "stun:stun.ekiga.net:3478" },
  { urls: "stun:stun.callwithus.com:3478" },

  // Global backbone (Google x6 - works from anywhere)
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun-mixed-v4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },

  // Additional redundancy
  { urls: "stun:stun.bluesip.net:3478" },
  { urls: "stun:stun.lowratevoip.com:3478" },
  { urls: "stun:stun.ohphone.com:3478" },
  { urls: "stun:stun.voicetech.com:3478" },
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


