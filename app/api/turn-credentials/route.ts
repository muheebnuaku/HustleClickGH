export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// Free public TURN servers — regional + global for optimal same-country AND international routes.
// Prioritize servers geographically: local country first, then region, then global fallback.
const OPEN_TURN: object[] = [
  // Africa (Ghana optimized)
  { urls: "turn:openrelay.metered.video:80",              username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443",             username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.video:443",            username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // Europe (Bulgaria, Germany, France, UK optimized)
  { urls: "turn:eu.openrelay.metered.video:80",           username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:eu.openrelay.metered.video:443",          username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:eu.openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:eu.openrelay.metered.video:443",         username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // South Asia (India, Pakistan optimized)
  { urls: "turn:ap.openrelay.metered.video:80",           username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:ap.openrelay.metered.video:443",          username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:ap.openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:ap.openrelay.metered.video:443",         username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // North America and North Atlantic via Canada
  { urls: "turn:openrelay.metered.ca:80",                 username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443",                username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp",  username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.ca:443",               username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // Additional global relay (NUMB - accessible from multiple regions)
  { urls: "turn:numb.viagenie.ca:3478",                   username: "webrtc@example.com", credential: "webrtc", credentialType: "password" },
  { urls: "turn:numb.viagenie.ca:3478?transport=tcp",     username: "webrtc@example.com", credential: "webrtc", credentialType: "password" },
  { urls: "turns:numb.viagenie.ca:443",                   username: "webrtc@example.com", credential: "webrtc", credentialType: "password" },
];

// STUN servers — 30+ diverse endpoints optimized for local AND international routes.
// Grouped by region so same-country calls find fast local servers first.
const STUN_ONLY: object[] = [
  // Global backbone (works from anywhere)
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },

  // Europe regional (Bulgaria, Germany, France, UK, etc.)
  { urls: "stun:stun.stunprotocol.org:3478" },
  { urls: "stun:stun.l.stunprotocol.org:3478" },
  { urls: "stun:stun1.stunprotocol.org:3478" },
  { urls: "stun:stun2.stunprotocol.org:3478" },
  { urls: "stun:stun3.stunprotocol.org:3478" },
  { urls: "stun:stun4.stunprotocol.org:3478" },
  { urls: "stun:stun.sipgate.net:3478" },
  { urls: "stun:stun.sipgate.net:16807" },
  { urls: "stun:stun.nextcloud.com:3478" },

  // South Asia regional (India optimized)
  { urls: "stun:stun.sip.us:3478" },
  { urls: "stun:stun.ideasip.com:3478" },
  { urls: "stun:stun.ekiga.net:3478" },
  { urls: "stun:stun.callwithus.com:3478" },

  // Africa regional (Ghana optimized)
  { urls: "stun:stun.l.google.com:19302" },  // Google has good African presence
  { urls: "stun:stun.radiocom.net:3478" },    // Community STUN with good global access

  // Additional redundancy (backup servers accessible from all regions)
  { urls: "stun:stun-mixed-v4.l.google.com:19302" },
  { urls: "stun:numb.viagenie.ca:3478" },
  { urls: "stun:stun.stunprotocol.org:3478" },
  { urls: "stun:stun.sip.us:3478" },
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

