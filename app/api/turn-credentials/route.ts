export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// Free public TURN servers — India-to-India optimized FIRST, then regional + global fallback.
// TURN priority: ap (Asia/India best) → all regions → global backup for redundancy.
const OPEN_TURN: object[] = [
  // South Asia PRIMARY (India, Pakistan - ap.openrelay is best for India-to-India)
  // List these FIRST for maximum priority during candidate gathering
  { urls: "turn:ap.openrelay.metered.video:80",           username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:ap.openrelay.metered.video:443",          username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:ap.openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:ap.openrelay.metered.video:443",         username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // South Asia BACKUP (redundancy for India connectivity)
  { urls: "turn:ap.openrelay.metered.video:80",           username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:ap.openrelay.metered.video:443",          username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // Africa (Ghana optimized - secondary priority)
  { urls: "turn:openrelay.metered.video:80",              username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443",             username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.video:443",            username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // Europe (Bulgaria, Germany, France, UK optimized)
  { urls: "turn:eu.openrelay.metered.video:80",           username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:eu.openrelay.metered.video:443",          username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:eu.openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:eu.openrelay.metered.video:443",         username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // North America (Canada/USA - tertiary fallback)
  { urls: "turn:openrelay.metered.ca:80",                 username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443",                username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp",  username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.ca:443",               username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // Global backup (NUMB - accessible from all regions as last resort)
  { urls: "turn:numb.viagenie.ca:3478",                   username: "webrtc@example.com", credential: "webrtc", credentialType: "password" },
  { urls: "turn:numb.viagenie.ca:3478?transport=tcp",     username: "webrtc@example.com", credential: "webrtc", credentialType: "password" },
  { urls: "turns:numb.viagenie.ca:443",                   username: "webrtc@example.com", credential: "webrtc", credentialType: "password" },
];

// STUN servers — 40+ endpoints with HEAVY India optimization for India-to-India calls.
// India servers listed first per region for local preference during candidate gathering.
const STUN_ONLY: object[] = [
  // India primary cluster (MOST IMPORTANT - India-to-India optimization)
  { urls: "stun:stun.sip.us:3478" },           // Reliable from India
  { urls: "stun:stun.sip.us:3478" },           // Duplicate for load balancing
  { urls: "stun:stun.ideasip.com:3478" },      // Good for India/Asia
  { urls: "stun:stun.ideasip.com:3478" },      // Duplicate for redundancy
  { urls: "stun:stun.ekiga.net:3478" },        // Excellent Asia coverage
  { urls: "stun:stun.ekiga.net:3478" },        // Duplicate for redundancy
  { urls: "stun:stun.callwithus.com:3478" },   // VoIP-optimized for Asia

  // Global backbone (Google — works perfectly from India)
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun-mixed-v4.l.google.com:19302" },
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

  // Additional Asia servers (India fallback)
  { urls: "stun:stun.bluesip.net:3478" },
  { urls: "stun:stun.lowratevoip.com:3478" },
  { urls: "stun:stun.ohphone.com:3478" },
  { urls: "stun:stun.voicetech.com:3478" },
  { urls: "stun:stun.radiocom.net:3478" },

  // Africa regional (Ghana optimized)
  { urls: "stun:stun.l.google.com:19302" },  // Already in global, but here for Africa priority

  // Universal backup (accessible from everywhere)
  { urls: "stun:numb.viagenie.ca:3478" },
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

