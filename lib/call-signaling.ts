import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Call signaling transport.
 *
 * WebRTC needs two browsers to exchange SDP offers/answers and a trickle of ICE
 * candidates as fast as possible — connection setup races an ICE deadline, and
 * on high-latency / carrier-NAT networks a slow exchange means the call never
 * connects (or drops and can't reconnect).
 *
 * The original transport was HTTP polling against the database: each candidate
 * crossed a DB round-trip plus up to a full poll interval each way. This module
 * replaces that hot path with a Supabase Realtime broadcast channel (sub-100ms
 * push), while staying correct when Realtime is unavailable.
 *
 * Correctness across mixed transports — the key design point:
 *   A candidate is sent over EXACTLY ONE transport, chosen at send time:
 *     • peer is present on the Realtime channel  → broadcast (peer is listening)
 *     • peer is not present (or Realtime is off)  → PATCH to the DB (peer's poll
 *       will pick it up)
 *   The receiver listens on BOTH the broadcast channel and its existing DB poll,
 *   so whichever transport a candidate took, it arrives. When both peers are on
 *   Realtime (the goal state) no candidate touches the DB at all.
 *
 * Offers/answers are broadcast for speed AND still written to the DB by the
 * caller (the DB row remains the source of truth for call state, admin views,
 * late-join bootstrap, and recording auto-share). This module does not touch
 * those DB writes.
 */

export type CallRole = "initiator" | "receiver";

export interface SignalingCallbacks {
  onOffer?: (offer: RTCSessionDescriptionInit) => void;
  onAnswer?: (answer: RTCSessionDescriptionInit) => void;
  onCandidate?: (candidate: RTCIceCandidateInit) => void;
  /** The other participant appeared on the Realtime channel. */
  onPeerJoin?: () => void;
  /** The other participant dropped off the Realtime channel. */
  onPeerLeave?: () => void;
}

export interface CallSignaling {
  /** Resolves true if the Realtime channel subscribed, false if we're on the DB fallback. */
  readonly ready: Promise<boolean>;
  /** Whether the Realtime channel is currently subscribed. */
  readonly active: boolean;
  /** Whether the other participant is currently present on the channel. */
  readonly peerPresent: boolean;
  sendOffer(offer: RTCSessionDescriptionInit): void;
  sendAnswer(answer: RTCSessionDescriptionInit): void;
  sendCandidate(candidate: RTCIceCandidateInit): void;
  close(): void;
}

interface CreateOpts {
  callCode: string;
  /** Unguessable per-call token used as the channel name; null → DB fallback only. */
  signalToken: string | null;
  role: CallRole;
  callbacks: SignalingCallbacks;
}

const SUBSCRIBE_TIMEOUT_MS = 3000;
const DB_FLUSH_MS = 50;

export function createCallSignaling(opts: CreateOpts): CallSignaling {
  const { callCode, signalToken, role, callbacks } = opts;
  const peerRole: CallRole = role === "initiator" ? "receiver" : "initiator";
  const icePatchType = role === "initiator" ? "ice-initiator" : "ice-receiver";

  let channel: RealtimeChannel | null = null;
  let active = false;
  let peerPresent = false;
  let closed = false;

  // Batched DB fallback: coalesce candidates into one PATCH like the old path.
  let dbBatch: RTCIceCandidateInit[] = [];
  let dbFlushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushDbBatch = () => {
    dbFlushTimer = null;
    if (!dbBatch.length) return;
    const candidates = dbBatch;
    dbBatch = [];
    fetch(`/api/calls/${callCode}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: icePatchType, candidates }),
    }).catch(() => {});
  };

  const sendCandidateViaDb = (candidate: RTCIceCandidateInit) => {
    dbBatch.push(candidate);
    if (dbFlushTimer) clearTimeout(dbFlushTimer);
    dbFlushTimer = setTimeout(flushDbBatch, DB_FLUSH_MS);
  };

  const broadcast = (
    event: "offer" | "answer" | "candidate" | "hello" | "bye",
    payload?: unknown,
  ) => {
    if (!channel || !active) return false;
    channel.send({ type: "broadcast", event, payload: { from: role, data: payload } });
    return true;
  };

  // ── Try to open the Realtime channel; resolve false to trigger DB fallback ──
  const client = getSupabaseBrowser();

  const ready: Promise<boolean> = new Promise((resolve) => {
    if (!client || !signalToken) {
      resolve(false);
      return;
    }

    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const timeout = setTimeout(() => finish(false), SUBSCRIBE_TIMEOUT_MS);

    channel = client.channel(`call:${signalToken}`, {
      config: { broadcast: { self: false, ack: false } },
    });

    // Peer discovery over broadcast (not Supabase Presence, which doesn't
    // cross-sync reliably on this project). Each side announces "hello" on
    // subscribe; receiving the peer's hello proves they're on the channel and
    // listening, so it's now safe to broadcast candidates to them. We reply with
    // one hello back so a peer who subscribed first also learns we're here.
    const markPeerPresent = () => {
      if (peerPresent) return;
      peerPresent = true;
      broadcast("hello"); // let the peer know we're here too (idempotent — only fires on the transition)
      callbacks.onPeerJoin?.();
    };

    channel
      .on("broadcast", { event: "offer" }, ({ payload }) => {
        if (payload?.from === peerRole) callbacks.onOffer?.(payload.data);
      })
      .on("broadcast", { event: "answer" }, ({ payload }) => {
        if (payload?.from === peerRole) callbacks.onAnswer?.(payload.data);
      })
      .on("broadcast", { event: "candidate" }, ({ payload }) => {
        if (payload?.from === peerRole) callbacks.onCandidate?.(payload.data);
      })
      .on("broadcast", { event: "hello" }, ({ payload }) => {
        if (payload?.from === peerRole) markPeerPresent();
      })
      .on("broadcast", { event: "bye" }, ({ payload }) => {
        if (payload?.from === peerRole && peerPresent) {
          peerPresent = false;
          callbacks.onPeerLeave?.();
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          active = true;
          clearTimeout(timeout);
          broadcast("hello");
          finish(true);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          active = false;
          finish(false);
        }
      });
  });

  return {
    ready,
    get active() { return active; },
    get peerPresent() { return peerPresent; },

    sendOffer(offer) {
      // Broadcast for speed; the caller separately persists the offer to the DB.
      broadcast("offer", offer);
    },

    sendAnswer(answer) {
      broadcast("answer", answer);
    },

    sendCandidate(candidate) {
      // Broadcast only when the peer is actually on the channel to receive it;
      // otherwise the DB is the only way to reach them (they may be on the poll
      // fallback, or simply haven't subscribed yet — their fast connect-phase
      // poll will pick it up). This keeps mixed-transport calls correct.
      if (active && peerPresent) {
        broadcast("candidate", candidate);
      } else {
        sendCandidateViaDb(candidate);
      }
    },

    close() {
      if (closed) return;
      closed = true;
      if (dbFlushTimer) { clearTimeout(dbFlushTimer); flushDbBatch(); }
      if (channel) {
        const c = channel;
        broadcast("bye"); // best-effort: let the peer drop us immediately on a clean hangup
        channel = null;
        active = false;
        peerPresent = false;
        c.unsubscribe().catch(() => {});
        client?.removeChannel(c);
      }
    },
  };
}
