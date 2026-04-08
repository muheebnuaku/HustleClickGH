export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

// Free public TURN servers — truly global coverage for any-to-any calls.
// Multiple regions ensure calls connect from ANY country to ANYWHERE.
const OPEN_TURN: object[] = [
  // Africa/Global (primary)
  { urls: "turn:openrelay.metered.video:80",              username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443",             username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.video:443",            username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // Europe
  { urls: "turn:eu.openrelay.metered.video:80",           username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:eu.openrelay.metered.video:443",          username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:eu.openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // Asia-Pacific
  { urls: "turn:ap.openrelay.metered.video:80",           username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:ap.openrelay.metered.video:443",          username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:ap.openrelay.metered.video:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // North America
  { urls: "turn:openrelay.metered.ca:80",                 username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443",                username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp",  username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },
  { urls: "turns:openrelay.metered.ca:443",               username: "openrelayproject", credential: "openrelayproject", credentialType: "password" },

  // Backup: NUMB TURN (Canada-based, reliable fallback for any region)
  { urls: "turn:numb.viagenie.ca:3478",                   username: "webrtc@example.com", credential: "webrtc", credentialType: "password" },
  { urls: "turn:numb.viagenie.ca:3478?transport=tcp",     username: "webrtc@example.com", credential: "webrtc", credentialType: "password" },
  { urls: "turns:numb.viagenie.ca:443",                   username: "webrtc@example.com", credential: "webrtc", credentialType: "password" },
  { urls: "turns:numb.viagenie.ca:443?transport=tcp",     username: "webrtc@example.com", credential: "webrtc", credentialType: "password" },
];

// STUN servers — maximum global coverage for NAT traversal from ANY country.
// 20+ servers ensures we can discover public IP from remote locations, carrier NAT, etc.
const STUN_ONLY: object[] = [
  // Google STUN (global coverage, most reliable)
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },

  // Cloudflare STUN (global anycast, high reliability)
  { urls: "stun:stun.cloudflare.com:3478" },

  // Twilio STUN (reliable, global reach)
  { urls: "stun:stun.stunprotocol.org:3478" },
  { urls: "stun:stun.l.stunprotocol.org:3478" },
  { urls: "stun:stun1.stunprotocol.org:3478" },
  { urls: "stun:stun2.stunprotocol.org:3478" },
  { urls: "stun:stun3.stunprotocol.org:3478" },
  { urls: "stun:stun4.stunprotocol.org:3478" },

  // Nextcloud STUN (community-run, good coverage)
  { urls: "stun:stun.nextcloud.com:3478" },

  // Additional backup STUN servers
  { urls: "stun:stun.sip.us:3478" },
  { urls: "stun:stun.callwithus.com:3478" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },

  // Sipgate STUN (Europe, Asia coverage)
  { urls: "stun:stun.sipgate.net:3478" },
  { urls: "stun:stun.sipgate.net:16807" },

  // Public STUN (global)
  { urls: "stun:stun.ekiga.net:3478" },
  { urls: "stun:stun.ideasip.com:3478" },
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

