import { NextResponse } from "next/server";

/**
 * GET /api/turn-credentials
 *
 * Returns ICE server config (STUN + TURN) for use in RTCPeerConnection.
 *
 * If METERED_APP_NAME and METERED_API_KEY environment variables are set,
 * fetches properly time-limited TURN credentials from Metered.ca (valid for
 * 1 hour per session — eliminates the 60-second session limit on free static
 * credentials like openrelayproject).
 *
 * Without those env vars, returns a set of public STUN servers only.
 * TURN relay may not work reliably behind carrier-grade NAT without proper
 * credentials — for Ghana mobile networks (MTN/Vodafone/AirtelTigo) set up
 * Metered.ca credentials.
 */
export async function GET() {
  const appName = process.env.METERED_APP_NAME;
  const apiKey = process.env.METERED_API_KEY;

  // If Metered credentials are configured, fetch time-limited TURN servers.
  // These credentials are valid for 1 hour — no 60-second session cutoff.
  if (appName && apiKey) {
    try {
      const res = await fetch(
        `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`,
        { next: { revalidate: 3000 } } // cache for 50 min (credentials valid 1h)
      );
      if (res.ok) {
        const iceServers = await res.json();
        return NextResponse.json({ iceServers });
      }
    } catch {
      // Fall through to static servers on fetch error
    }
  }

  // Fallback: public STUN servers (no TURN — will not work behind carrier NAT)
  // To enable TURN relay for Ghana networks, add METERED_APP_NAME + METERED_API_KEY
  // to your Vercel environment variables. Sign up free at https://metered.ca
  const iceServers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:stun.services.mozilla.com" },
  ];

  return NextResponse.json({ iceServers });
}
