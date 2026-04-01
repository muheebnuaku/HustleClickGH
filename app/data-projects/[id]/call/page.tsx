"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mic, MicOff, PhoneOff, PhoneCall, Copy, CheckCircle2,
  Loader2, AlertCircle, ArrowLeft, Radio, User,
  Video, StopCircle, WifiOff, Zap,
} from "lucide-react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────
type Phase =
  | "idle"
  | "requesting-mic"
  | "creating-offer"
  | "calling"
  | "joining"
  | "connecting"
  | "reconnecting"
  | "active"
  | "ended"
  | "declined";

// Fallback ICE servers (STUN + openrelay TURN) when /api/turn-credentials fails.
const FALLBACK_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "turn:openrelay.metered.video:80",                username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.video:443",               username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.video:443?transport=tcp",  username: "openrelayproject", credential: "openrelayproject" },
];

/** Fire-and-forget client-side activity log */
function clientLog(
  type: string,
  metadata?: Record<string, unknown>,
  severity: "info" | "warning" | "error" | "success" = "info",
) {
  fetch("/api/activity-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, severity, metadata }),
  }).catch(() => {});
}

// ── Inner component (uses useSearchParams — must be inside Suspense) ──────────
function CallPageInner() {
  const params        = useParams();
  const searchParams  = useSearchParams();
  const projectId     = params.id as string;
  const joinCode      = searchParams.get("join");
  const { status }    = useSession();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [phase,           setPhase]           = useState<Phase>("idle");
  const [timer,           setTimer]           = useState(0);
  const [isMuted,         setIsMuted]         = useState(false);
  const [error,           setError]           = useState("");
  const [copied,          setCopied]          = useState(false);
  const [projectTitle,    setProjectTitle]    = useState("");
  const [personalCode,    setPersonalCode]    = useState("");
  const [targetCodeInput, setTargetCodeInput] = useState("");
  const [otherName,       setOtherName]       = useState("");
  const [isRecording,        setIsRecording]        = useState(false);
  const [isVideoRecording,   setIsVideoRecording]   = useState(false);
  const [supportsRecording,  setSupportsRecording]  = useState(false);
  const [uploadStatus,    setUploadStatus]    = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadPct,       setUploadPct]       = useState(0);
  const [vidUploadStatus, setVidUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [vidUploadPct,    setVidUploadPct]    = useState(0);
  const [endedReason,  setEndedReason]  = useState("");
  const [reconnectSecsLeft, setReconnectSecsLeft] = useState(0);
  const [connQuality,       setConnQuality]       = useState<"good" | "poor" | "bad">("good");
  const [pendingRejoinCode, setPendingRejoinCode] = useState("");
  const [pendingRejoinIsInitiator, setPendingRejoinIsInitiator] = useState(false);

  useEffect(() => {
    setSupportsRecording(typeof AudioContext !== "undefined" && typeof MediaRecorder !== "undefined");
  }, []);

  // ── Refs — WebRTC ─────────────────────────────────────────────────────────
  const pcRef            = useRef<RTCPeerConnection | null>(null);
  const localStreamRef   = useRef<MediaStream | null>(null);
  const remoteAudioRef   = useRef<HTMLAudioElement | null>(null);
  const callCodeRef      = useRef("");
  const isInitiatorRef   = useRef(false);
  const savedTargetCodeRef = useRef(""); // persists across cleanup for reconnect callback
  // ICE restart state — lets both sides coordinate a fresh ICE exchange
  const iceRestartPendingRef  = useRef(false); // initiator: restart offer sent, waiting for answer
  const lastProcessedOfferRef = useRef("");    // receiver: fingerprint of last processed offer

  // ── Refs — Recording ──────────────────────────────────────────────────────
  const screenStreamRef   = useRef<MediaStream | null>(null);
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioCtxRef       = useRef<AudioContext | null>(null);
  const recordingStartRef = useRef(0);
  const iceBufRef       = useRef<RTCIceCandidate[]>([]);
  const iceFlushRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrameRef      = useRef<number | null>(null);
  const callCardRef       = useRef<HTMLDivElement | null>(null);

  // ── Refs — Signaling ──────────────────────────────────────────────────────
  const pollRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const alreadyAnswered  = useRef(false);
  const seenInitIce      = useRef(0);
  const seenRecvIce      = useRef(0);

  // ── Refs — Timers ─────────────────────────────────────────────────────────
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTORef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTORef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsIntervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const disconnectGraceRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Refs — Guards ─────────────────────────────────────────────────────────
  const hasAutoJoined    = useRef(false);
  const phaseRef         = useRef<Phase>("idle");

  // Keep phaseRef in sync with phase state
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Optimize video bitrate based on connection quality
  const optimizeVideoQuality = useCallback(async (pc: RTCPeerConnection | null) => {
    if (!pc) return;
    const senders = pc.getSenders();
    for (const sender of senders) {
      if (sender.track?.kind !== "video") continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings) params.encodings = [{}];
        // High quality: 2.5Mbps max for 720p30, scale down with poor connection
        params.encodings[0].maxBitrate = connQuality === "good" ? 2_500_000 : connQuality === "poor" ? 1_500_000 : 800_000;
        await sender.setParameters(params);
      } catch { /* ignore */ }
    }
  }, [connQuality]);

  // ── Connection quality monitor (active calls only) ─────────────────────────
  useEffect(() => {
    if (phase !== "active") { clearStats(); setConnQuality("good"); return; }
    let prevLost = 0, prevPkts = 0;
    statsIntervalRef.current = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        const stats = await pc.getStats();
        stats.forEach((report) => {
          if (report.type !== "inbound-rtp" || report.kind !== "audio") return;
          const lost  = (report.packetsLost  ?? 0) - prevLost;
          const pkts  = (report.packetsReceived ?? 0) - prevPkts;
          prevLost += lost; prevPkts += pkts;
          const lossRate = pkts > 0 ? lost / (pkts + lost) : 0;
          const jitter   = report.jitter ?? 0;
          if (lossRate > 0.15 || jitter > 0.12)      setConnQuality("bad");
          else if (lossRate > 0.05 || jitter > 0.05) setConnQuality("poor");
          else                                        setConnQuality("good");
        });
        // Adapt video quality based on connection
        await optimizeVideoQuality(pc);
      } catch { /* ignore */ }
    }, 4000);
    return clearStats;
  }, [phase, connQuality, optimizeVideoQuality]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const stopPoll          = () => { if (pollRef.current)       { clearInterval(pollRef.current);  pollRef.current      = null; } };
  const stopTimer         = () => { if (timerRef.current)      { clearInterval(timerRef.current); timerRef.current     = null; } };
  const clearConnectTO    = () => { if (connectTORef.current)  { clearTimeout(connectTORef.current);   connectTORef.current  = null; } };
  const clearReconnectTO  = () => { if (reconnectTORef.current){ clearTimeout(reconnectTORef.current); reconnectTORef.current = null; } };
  const clearCountdown    = () => { if (reconnectCountdownRef.current) { clearInterval(reconnectCountdownRef.current); reconnectCountdownRef.current = null; } };
  const clearStats        = () => { if (statsIntervalRef.current)      { clearInterval(statsIntervalRef.current);      statsIntervalRef.current      = null; } };
  const clearDisconnectGrace = () => { if (disconnectGraceRef.current)  { clearTimeout(disconnectGraceRef.current);    disconnectGraceRef.current    = null; } };

  // Full cleanup — safe to call from anywhere
  const cleanup = useCallback(() => {
    stopPoll();
    stopTimer();
    clearConnectTO();
    clearReconnectTO();
    clearCountdown();
    clearStats();
    clearDisconnectGrace();

    alreadyAnswered.current = false;
    seenInitIce.current     = 0;
    seenRecvIce.current     = 0;
    callCodeRef.current     = "";

    // Stop any active recording
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    if (pcRef.current) {
      pcRef.current.onconnectionstatechange    = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onicecandidate             = null;
      pcRef.current.ontrack                    = null;
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── beforeunload — warn on page close/refresh during active call ───────────
  useEffect(() => {
    const activePhases: Phase[] = ["active", "reconnecting", "connecting", "calling"];
    if (!activePhases.includes(phase)) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();

      const callCode = callCodeRef.current;
      try {
        const payload = JSON.stringify({
          type: "page_close_during_call",
          severity: "warning",
          metadata: { callCode, phase: phaseRef.current },
        });
        navigator.sendBeacon(
          "/api/activity-log",
          new Blob([payload], { type: "application/json" }),
        );
      } catch { /* ignore */ }
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  // ── Keyboard refresh block — F5 / Ctrl+R / Cmd+R during active call ─────────
  useEffect(() => {
    const activePhases: Phase[] = ["active", "reconnecting", "connecting", "calling"];
    if (!activePhases.includes(phase)) return;

    const handler = (e: KeyboardEvent) => {
      const isRefresh =
        e.key === "F5" ||
        ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"));
      if (isRefresh) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [phase]);

  useEffect(() => {
    fetch(`/api/data-projects/${projectId}`)
      .then(r => r.json())
      .then(d => setProjectTitle(d.project?.title || "Dataset Project"))
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/profile")
      .then(r => r.json())
      .then(d => { if (d.user?.personalCallCode) setPersonalCode(d.user.personalCallCode); })
      .catch(() => {});
  }, [status]);

  // Auto-join when arriving from an incoming call notification OR recovering from page refresh during call
  useEffect(() => {
    if (status !== "authenticated" || phase !== "idle" || hasAutoJoined.current) return;

    // Try to rejoin if redirected with ?join param
    if (joinCode) {
      hasAutoJoined.current = true;
      handleJoinCall(joinCode);
      return;
    }

    // Check if there's a call in progress we should offer to rejoin
    // (does NOT auto-rejoin, just detects and shows button)
    (async () => {
      try {
        const allCallsRes = await fetch("/api/calls?active-only=true");
        if (allCallsRes.ok) {
          const { calls } = await allCallsRes.json();
          const profileRes = await fetch("/api/profile");
          const profileData = profileRes.ok ? await profileRes.json() : {};
          const currentUserId = profileData.user?.id;

          if (currentUserId && Array.isArray(calls)) {
            // Find active call where user is part of
            const userCall = calls.find(c =>
              c.status === "active" &&
              (c.initiatorId === currentUserId || c.receiverId === currentUserId)
            );
            if (userCall && userCall.callCode) {
              // Don't auto-rejoin; show button instead so user can grant permission explicitly
              const isInitiator = userCall.initiatorId === currentUserId;
              setPendingRejoinCode(userCall.callCode);
              setPendingRejoinIsInitiator(isInitiator);
              if (userCall.initiatorName) setOtherName(userCall.initiatorName);
              if (userCall.receiverName && !isInitiator) setOtherName(userCall.receiverName);
            }
          }
        }
      } catch {
        // Silently fail — user can manually rejoin
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, phase]);

  // ── TURN credentials ──────────────────────────────────────────────────────
  const fetchIceServers = async (): Promise<RTCIceServer[]> => {
    try {
      const res = await fetch("/api/turn-credentials");
      if (res.ok) {
        const d = await res.json();
        if (Array.isArray(d.iceServers) && d.iceServers.length) return d.iceServers;
      }
    } catch { /* fall through */ }
    return FALLBACK_ICE;
  };

  // ── WebRTC peer connection ─────────────────────────────────────────────────
  const beginReconnectFlow = (pc: RTCPeerConnection) => {
    clearReconnectTO();
    setPhase("reconnecting");
    setConnQuality("good");
    clearStats();

    clientLog("call_reconnecting", { callCode: callCodeRef.current, connectionState: pc.connectionState }, "warning");

    // Update DB status to reconnecting so both sides & admin know
    if (callCodeRef.current) {
      fetch(`/api/calls/${callCodeRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "status", status: "reconnecting" }),
      }).catch(() => {});
    }

    // Start fast polling immediately (250ms during reconnect vs 1500ms normal)
    // Always stop and restart polling to switch to fast interval
    if (callCodeRef.current) {
      stopPoll();
      startIcePoll(callCodeRef.current, isInitiatorRef.current, true);
    }

    // Initiator immediately sends restart offer (no delay)
    if (isInitiatorRef.current && pcRef.current && callCodeRef.current && !iceRestartPendingRef.current) {
      const pc2   = pcRef.current;
      const code2 = callCodeRef.current;
      iceRestartPendingRef.current = true;
      seenRecvIce.current = 0;
      pc2.createOffer({ iceRestart: true })
        .then(offer => pc2.setLocalDescription(offer).then(() => offer))
        .then(offer => fetch(`/api/calls/${code2}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "restart-offer", offer }),
        }))
        .catch(() => {
          iceRestartPendingRef.current = false;
        });
    }

    const RECONNECT_SECS = 90;
    setReconnectSecsLeft(RECONNECT_SECS);
    clearCountdown();
    reconnectCountdownRef.current = setInterval(() => {
      setReconnectSecsLeft(s => {
        if (s <= 1) { clearCountdown(); return 0; }
        return s - 1;
      });
    }, 1000);

    reconnectTORef.current = setTimeout(() => {
      if (pcRef.current?.connectionState !== "connected") {
        clientLog("call_timeout", { callCode: callCodeRef.current, reason: "reconnect_timeout_90s" }, "error");
        setError("Connection lost. The call has ended.");
        handleHangUp("reconnect_timeout");
      }
    }, RECONNECT_SECS * 1000);
  };

  const createPC = (
    iceServers: RTCIceServer[],
    onIce: (c: RTCIceCandidate) => void,
  ): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers,
      iceCandidatePoolSize: 16,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });
    pcRef.current = pc;

    pc.onicecandidate = e => { if (e.candidate) onIce(e.candidate); };

    const remoteStream = new MediaStream();

    pc.ontrack = e => {
      if (!remoteStream.getTrackById(e.track.id)) remoteStream.addTrack(e.track);

      if (remoteAudioRef.current && !remoteAudioRef.current.srcObject) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;

      if (s === "connected") {
        clearDisconnectGrace();
        clearReconnectTO();
        clearConnectTO();
        clearCountdown();
        iceRestartPendingRef.current  = false;
        lastProcessedOfferRef.current = "";
        setReconnectSecsLeft(0);

        const inCall: Phase[] = ["calling", "joining", "connecting", "reconnecting"];
        if (inCall.includes(phaseRef.current)) {
          if (targetCodeInput) savedTargetCodeRef.current = targetCodeInput;
          setPhase("active");
          setTimer(0);
          if (!timerRef.current) timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
          optimizeVideoQuality(pc);
          clientLog("call_connected", { callCode: callCodeRef.current }, "success");
        }
      }

      if (s === "failed") {
        clearDisconnectGrace();
        beginReconnectFlow(pc);
      }

      if (s === "closed") {
        clearDisconnectGrace();
        // Connection is closed, try to reconnect
        if (phaseRef.current === "active" || phaseRef.current === "connecting" || phaseRef.current === "joining") {
          beginReconnectFlow(pc);
        }
      }

      if (s === "disconnected") {
        // Quick reconnect on disconnection (1s grace for network blips)
        clearDisconnectGrace();
        disconnectGraceRef.current = setTimeout(() => {
          if (pcRef.current?.connectionState === "disconnected" || pcRef.current?.connectionState === "failed") {
            beginReconnectFlow(pc);
          }
        }, 1000);
      }
    };

    pc.onicecandidateerror = (e: Event) => {
      const ev = e as RTCPeerConnectionIceErrorEvent;
      if (ev.errorCode >= 400) {
        clientLog("call_error", {
          callCode: callCodeRef.current,
          error: "ICE candidate error",
          errorCode: ev.errorCode,
          errorText: ev.errorText,
          url: ev.url,
        }, "warning");
      }
    };

    return pc;
  };

  // ── Signaling polls ───────────────────────────────────────────────────────
  const startIcePoll = (code: string, asInitiator: boolean, isReconnecting = false) => {
    if (pollRef.current) return;
    let busy = false;
    // Fast poll during reconnect (250ms for faster recovery), normal poll otherwise (1500ms)
    const pollInterval = isReconnecting ? 250 : 1500;

    pollRef.current = setInterval(async () => {
      if (busy || !pollRef.current) return;
      busy = true;
      try {
        const res = await fetch(`/api/calls/${code}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "completed" || data.status === "missed") {
          stopPoll();
          const reason = phaseRef.current === "reconnecting"
            ? "remote_hangup_during_reconnect"
            : "remote_hangup";
          clientLog("call_end", { callCode: code, reason, detectedBy: "ice_poll" }, "info");
          handleHangUp(reason);
          return;
        }

        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) return;

        // Admin-triggered reconnect: if status is "reconnecting", start reconnect flow
        // (works whether we're in "active" or already in "reconnecting" phase)
        if (data.status === "reconnecting" && phaseRef.current !== "reconnecting") {
          clientLog("call_reconnecting", { callCode: code, reason: "admin_triggered", connectionState: pc.connectionState }, "warning");
          beginReconnectFlow(pc);
          return;
        }

        // Initiator: if still reconnecting and got offer, process it immediately
        if (
          asInitiator &&
          phaseRef.current === "reconnecting" &&
          !iceRestartPendingRef.current &&
          data.status !== "reconnecting"
        ) {
          const pc2 = pc, code2 = code;
          iceRestartPendingRef.current = true;
          seenRecvIce.current = 0;
          pc2.createOffer({ iceRestart: true })
            .then(offer => pc2.setLocalDescription(offer).then(() => offer))
            .then(offer => fetch(`/api/calls/${code2}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: "restart-offer", offer }),
            }))
            .catch(() => { iceRestartPendingRef.current = false; });
        }

        // Receiver: process restart offer immediately
        if (!asInitiator && data.status === "reconnecting" && data.offer) {
          const offerFingerprint = (data.offer.sdp ?? "").slice(0, 80);
          if (offerFingerprint && offerFingerprint !== lastProcessedOfferRef.current) {
            seenInitIce.current = 0;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              await fetch(`/api/calls/${code}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "answer", answer }),
              });
              lastProcessedOfferRef.current = offerFingerprint;
            } catch { /* retry next poll tick */ }
            return;
          }
        }

        // Initiator: process answer from receiver
        if (asInitiator && iceRestartPendingRef.current && data.answer && data.status !== "reconnecting") {
          iceRestartPendingRef.current = false;
          seenRecvIce.current = 0;
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(() => {});
        }

        // Batch add ICE candidates (more efficient than one-by-one)
        if (asInitiator) {
          const fresh: RTCIceCandidateInit[] = data.receiverIce.slice(seenRecvIce.current);
          if (fresh.length > 0) {
            await Promise.all(fresh.map(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})));
            seenRecvIce.current += fresh.length;
          }
        } else {
          const fresh: RTCIceCandidateInit[] = data.initiatorIce.slice(seenInitIce.current);
          if (fresh.length > 0) {
            await Promise.all(fresh.map(c => pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})));
            seenInitIce.current += fresh.length;
          }
        }
      } catch { /* ignore transient network errors */ } finally { busy = false; }
    }, pollInterval);
  };

  const startCallingPoll = (code: string) => {
    let busy = false;
    // Initial poll faster (800ms vs 2000ms) for quicker call acceptance detection
    const pollInterval = 800;
    pollRef.current = setInterval(async () => {
      if (busy || !pollRef.current) return;
      busy = true;
      try {
        const res = await fetch(`/api/calls/${code}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "declined") { stopPoll(); setPhase("declined"); cleanup(); return; }
        if (data.status === "completed" || data.status === "missed") { stopPoll(); setPhase("ended"); cleanup(); return; }

        if ((data.status === "active" || data.answer) && !alreadyAnswered.current) {
          alreadyAnswered.current = true;
          stopPoll();
          const pc = pcRef.current;
          if (!pc) return;
          await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
          setPhase("connecting");
          startIcePoll(code, true, false);
        }
      } catch { /* ignore */ } finally { busy = false; }
    }, pollInterval);
  };

  // ── Start call (caller side) ──────────────────────────────────────────────
  const handleStartCall = async (codeOverride?: string) => {
    const targetCode = (codeOverride || targetCodeInput).trim().toUpperCase();
    if (targetCode.length < 5) { setError("Enter a valid 5-character call code"); return; }
    setError("");

    try {
      setPhase("requesting-mic");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      });
      localStreamRef.current = stream;

      setPhase("creating-offer");
      isInitiatorRef.current = true;

      const iceServers = await fetchIceServers();

      const pc = createPC(iceServers, (candidate) => {
        iceBufRef.current.push(candidate);
        if (iceFlushRef.current) clearTimeout(iceFlushRef.current);
        iceFlushRef.current = setTimeout(() => {
          if (!callCodeRef.current || !iceBufRef.current.length) return;
          const batch = iceBufRef.current.splice(0);
          fetch(`/api/calls/${callCodeRef.current}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "ice-initiator", candidates: batch }),
          }).catch(() => {});
        }, 50);  // Faster flushing for quick candidate delivery
      });

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, offer, targetUserCode: targetCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      callCodeRef.current = data.callCode;
      if (iceBufRef.current.length) {
        const batch = iceBufRef.current.splice(0);
        fetch(`/api/calls/${data.callCode}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ice-initiator", candidates: batch }),
        }).catch(() => {});
      }
      setOtherName(data.targetUserName || "");
      setPhase("calling");
      startCallingPoll(data.callCode);

      connectTORef.current = setTimeout(() => {
        if (pcRef.current?.connectionState !== "connected") {
          clientLog("call_timeout", { callCode: callCodeRef.current, reason: "no_answer_5min" }, "warning");
          setError("No answer. The person may be unavailable.");
          setPhase("ended");
          cleanup();
        }
      }, 300_000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start call";
      clientLog("call_error", { phase: "start", error: msg }, "error");
      setError(msg);
      setPhase("idle");
      cleanup();
    }
  };

  // ── Reconnect to existing call (after page refresh during active call) ─────────
  const handleReconnectToCall = async (code: string, wasInitiator: boolean) => {
    if (!code) return;
    callCodeRef.current = code;
    isInitiatorRef.current = wasInitiator;

    try {
      setError("");
      setPhase("requesting-mic");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      });
      localStreamRef.current = stream;

      const iceServers = await fetchIceServers();
      const pc = createPC(iceServers, (candidate) => {
        iceBufRef.current.push(candidate);
        if (iceFlushRef.current) clearTimeout(iceFlushRef.current);
        iceFlushRef.current = setTimeout(() => {
          const batch = iceBufRef.current.splice(0);
          if (!batch.length) return;
          const iceType = wasInitiator ? "ice-initiator" : "ice-receiver";
          fetch(`/api/calls/${code}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: iceType, candidates: batch }),
          }).catch(() => {});
        }, 50);
      });

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const res = await fetch(`/api/calls/${code}`);
      if (!res.ok) throw new Error("Call not found.");
      const session = await res.json();

      if (session.status === "completed" || session.status === "declined") {
        throw new Error("This call has ended.");
      }

      setOtherName(session.initiatorName || session.receiverName || "");

      if (wasInitiator) {
        // Initiator: create a fresh offer with ICE restart
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        iceRestartPendingRef.current = true;
        seenRecvIce.current = 0;

        // Send restart offer
        await fetch(`/api/calls/${code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "restart-offer", offer }),
        }).catch(() => {});

        setPhase("connecting");
        startIcePoll(code, true, true); // true for reconnecting flag
      } else {
        // Receiver: fetch current offer and respond
        if (session.offer) {
          await pc.setRemoteDescription(new RTCSessionDescription(session.offer));
          const initIce: RTCIceCandidateInit[] = session.initiatorIce || [];
          for (const c of initIce) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          seenInitIce.current = initIce.length;

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await fetch(`/api/calls/${code}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "answer", answer }),
          }).catch(() => {});
        }

        setPhase("connecting");
        startIcePoll(code, false, true); // true for reconnecting flag
      }

      clientLog("call_reconnect", { callCode: code, role: wasInitiator ? "initiator" : "receiver" }, "info");

      connectTORef.current = setTimeout(() => {
        if (pcRef.current?.connectionState !== "connected") {
          clientLog("call_timeout", { callCode: code, reason: "reconnect_timeout_60s" }, "error");
          setError("Could not reconnect. Try refreshing the page again.");
          setPhase("ended");
          cleanup();
        }
      }, 60_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reconnect";
      clientLog("call_error", { callCode: code, phase: "reconnect", error: msg }, "error");
      setError(msg);
      setPhase("idle");
      cleanup();
    }
  };

  // ── Join call (receiver side) ─────────────────────────────────────────────
  const handleJoinCall = async (codeOverride?: string) => {
    const code = (codeOverride || targetCodeInput).trim().toUpperCase();
    if (code.length < 5) { setError("Enter a valid call code"); return; }
    setError("");

    try {
      setPhase("requesting-mic");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      });
      localStreamRef.current = stream;

      setPhase("joining");
      isInitiatorRef.current = false;
      callCodeRef.current    = code;

      // Fetch current user's ID with retry logic
      let currentUserId: string | undefined;
      for (let attempts = 0; attempts < 2; attempts++) {
        try {
          const profileRes = await fetch("/api/profile", { signal: AbortSignal.timeout(5000) });
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            currentUserId = profileData.user?.id;
            break;
          }
        } catch { /* retry */ }
      }

      const res = await fetch(`/api/calls/${code}`);
      if (!res.ok) throw new Error("Call not found. Check the code and try again.");
      const session = await res.json();
      if (!session.offer)                        throw new Error("Call setup not ready — try again in a moment.");

      // Check if user is already part of this call
      const isAlreadyPartOfCall = currentUserId && (session.receiverId === currentUserId || session.initiatorId === currentUserId);

      // If call is active/reconnecting but user is not part of it, reject
      if ((session.status === "active" || session.status === "reconnecting") && !isAlreadyPartOfCall) {
        throw new Error("This call is already in progress.");
      }

      // If user IS already part of an active/reconnecting call, they're reconnecting — use the reconnect flow instead
      if ((session.status === "active" || session.status === "reconnecting") && isAlreadyPartOfCall) {
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
        setPhase("idle");
        const wasInitiator = session.initiatorId === currentUserId;
        await handleReconnectToCall(code, wasInitiator);
        return;
      }

      if (session.status === "completed")        throw new Error("This call has ended.");
      if (session.status === "declined")         throw new Error("This call was declined.");

      if (session.initiatorName) setOtherName(session.initiatorName);

      const iceServers = await fetchIceServers();

      const pc = createPC(iceServers, (candidate) => {
        iceBufRef.current.push(candidate);
        if (iceFlushRef.current) clearTimeout(iceFlushRef.current);
        iceFlushRef.current = setTimeout(() => {
          const batch = iceBufRef.current.splice(0);
          if (!batch.length) return;
          fetch(`/api/calls/${code}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "ice-receiver", candidates: batch }),
          }).catch(() => {});
        }, 50);  // Faster flushing for quick candidate delivery
      });

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(session.offer));

      const initIce: RTCIceCandidateInit[] = session.initiatorIce || [];
      for (const c of initIce) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      seenInitIce.current = initIce.length;

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch(`/api/calls/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "answer", answer }),
      });

      setPhase("connecting");
      startIcePoll(code, false, false);

      clientLog("call_connecting", { callCode: code, role: "receiver" }, "info");

      connectTORef.current = setTimeout(() => {
        if (pcRef.current?.connectionState !== "connected") {
          clientLog("call_timeout", { callCode: code, reason: "connect_timeout_60s" }, "error");
          setError("Could not connect to the caller. Check your network and try again.");
          setPhase("ended");
          cleanup();
        }
      }, 60_000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to join call";
      clientLog("call_error", { callCode: code, phase: "join", error: msg }, "error");
      setError(msg);
      setPhase("idle");
      cleanup();
    }
  };

  // ── Hang up ───────────────────────────────────────────────────────────────
  const handleHangUp = (reason = "user_hangup") => {
    stopPoll();
    stopTimer();
    clearReconnectTO();
    clearConnectTO();

    const effectiveReason =
      phaseRef.current === "reconnecting" && reason === "remote_hangup"
        ? "remote_hangup_during_reconnect"
        : reason;
    setEndedReason(effectiveReason);

    if (callCodeRef.current) {
      fetch(`/api/calls/${callCodeRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "status", status: "completed", reason }),
      }).catch(() => {});
    }

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (pcRef.current) {
      pcRef.current.onconnectionstatechange    = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onicecandidate             = null;
      pcRef.current.ontrack                    = null;
      pcRef.current.close();
      pcRef.current = null;
    }

    setPhase("ended");
  };

  // ── Controls ──────────────────────────────────────────────────────────────
  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(m => !m);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(personalCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Audio-only recording (mic + remote stream mix) ────────────────────────
  const startRecording = async () => {
    setUploadStatus("idle");
    setUploadPct(0);
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();

      if (localStreamRef.current) {
        audioCtx.createMediaStreamSource(localStreamRef.current).connect(dest);
      }
      const remoteStream = remoteAudioRef.current?.srcObject as MediaStream | null;
      if (remoteStream) {
        audioCtx.createMediaStreamSource(remoteStream).connect(dest);
      }

      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg",
      ].find(t => MediaRecorder.isTypeSupported(t)) || "";

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      const capturedCallCode  = callCodeRef.current;
      const capturedOtherName = otherName;

      recorder.onstop = async () => {
        const ext  = mimeType.startsWith("audio/ogg") ? "ogg" : "webm";
        const blob = new Blob(recordedChunksRef.current, { type: mimeType || "audio/webm" });
        const duration = Math.floor((Date.now() - recordingStartRef.current) / 1000);

        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = `call-recording-${Date.now()}.${ext}`;
        a.click();
        URL.revokeObjectURL(objUrl);

        recordedChunksRef.current = [];
        audioCtxRef.current?.close();
        audioCtxRef.current = null;
        setIsRecording(false);

        setUploadStatus("uploading");
        setUploadPct(0);
        try {
          const { uploadFile } = await import("@/lib/upload-file");
          const fileName = `call-${capturedCallCode || Date.now()}.${ext}`;
          const result   = await uploadFile(blob, "recordings", fileName, setUploadPct);

          await fetch("/api/call-recordings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              callCode:  capturedCallCode,
              fileUrl:   result.url,
              duration,
              fileSize:  blob.size,
              otherName: capturedOtherName,
              callType:  "audio",
            }),
          });

          setUploadStatus("done");
          setTimeout(() => setUploadStatus("idle"), 4000);
        } catch {
          setUploadStatus("error");
          setTimeout(() => setUploadStatus("idle"), 6000);
        }
      };

      recordingStartRef.current = Date.now();
      recorder.start(1000);
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  // ── Screen-crop video recording — crops display capture to call card ────────
  const startVideoRecording = async () => {
    setVidUploadStatus("idle");
    setVidUploadPct(0);
    try {
      const cardEl = callCardRef.current;
      if (!cardEl) return;

      // Capture the current browser tab — user will see a share-screen dialog
      const displayStream = await (navigator.mediaDevices as unknown as {
        getDisplayMedia(c: object): Promise<MediaStream>;
      }).getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      screenStreamRef.current = displayStream;

      // Hidden video receives the display stream
      const dispVideo = document.createElement("video");
      dispVideo.srcObject = displayStream;
      dispVideo.muted = true;
      dispVideo.play();
      await new Promise<void>(res => { dispVideo.onloadedmetadata = () => res(); });

      // Audio: mix mic + remote
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();
      if (localStreamRef.current)
        audioCtx.createMediaStreamSource(localStreamRef.current).connect(dest);
      const remoteStream = remoteAudioRef.current?.srcObject as MediaStream | null;
      if (remoteStream)
        audioCtx.createMediaStreamSource(remoteStream).connect(dest);

      // Canvas sized exactly to the call card element
      const rect = cardEl.getBoundingClientRect();
      const W = Math.round(rect.width);
      const H = Math.round(rect.height);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;

      const drawFrame = () => {
        const r = cardEl.getBoundingClientRect();
        const scaleX = dispVideo.videoWidth  / window.innerWidth;
        const scaleY = dispVideo.videoHeight / window.innerHeight;
        ctx.drawImage(dispVideo, r.left * scaleX, r.top * scaleY, r.width * scaleX, r.height * scaleY, 0, 0, W, H);
        animFrameRef.current = requestAnimationFrame(drawFrame);
      };
      drawFrame();

      const canvasStream = canvas.captureStream(30);
      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        .find(t => MediaRecorder.isTypeSupported(t)) || "";

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(combined, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };

      const capturedCallCode  = callCodeRef.current;
      const capturedOtherName = otherName;
      recorder.onstop = async () => {
        if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
        const blob     = new Blob(recordedChunksRef.current, { type: mimeType || "video/webm" });
        const duration = Math.floor((Date.now() - recordingStartRef.current) / 1000);

        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objUrl;
        a.download = "call-recording-" + Date.now() + ".webm";
        a.click();
        URL.revokeObjectURL(objUrl);

        recordedChunksRef.current = [];
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        audioCtxRef.current?.close();
        audioCtxRef.current = null;
        setIsVideoRecording(false);

        setVidUploadStatus("uploading"); setVidUploadPct(0);
        try {
          const { uploadFile } = await import("@/lib/upload-file");
          const fileName = "call-video-" + (capturedCallCode || Date.now()) + ".webm";
          const result   = await uploadFile(blob, "recordings", fileName, setVidUploadPct);
          await fetch("/api/call-recordings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              callCode:  capturedCallCode,
              fileUrl:   result.url,
              duration,
              fileSize:  blob.size,
              otherName: capturedOtherName,
              callType:  "video",
            }),
          });
          setVidUploadStatus("done");
          setTimeout(() => setVidUploadStatus("idle"), 4000);
        } catch {
          setVidUploadStatus("error");
          setTimeout(() => setVidUploadStatus("idle"), 6000);
        }
      };

      displayStream.getVideoTracks()[0].onended = () => stopRecording();
      recordingStartRef.current = Date.now();
      recorder.start(1000);
      setIsVideoRecording(true);
    } catch {
      setIsVideoRecording(false);
    }
  };
  const resetToIdle = () => {
    clearCountdown(); clearStats();
    setError(""); setPhase("idle"); setTargetCodeInput("");
    setOtherName(""); setTimer(0); setIsMuted(false);
    setUploadStatus("idle"); setUploadPct(0);
    setVidUploadStatus("idle"); setVidUploadPct(0);
    setEndedReason("");
    setReconnectSecsLeft(0); setConnQuality("good");
  };

  // Auto-return to idle 1.5 s after a clean call end.
  useEffect(() => {
    if (phase !== "ended") return;
    const isReconnectEnd =
      endedReason === "reconnect_timeout" ||
      endedReason === "remote_hangup_during_reconnect";
    if (isReconnectEnd) return;
    const t = setTimeout(resetToIdle, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, endedReason]);

  return (
    <DashboardLayout>
      {/* Hidden audio element — plays remote stream to speakers */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* Local video preview (mirror) — shown during active call */}
      {phase === "active" && (
        <div className="fixed top-4 right-4 z-40 w-32 h-32 rounded-lg overflow-hidden shadow-lg border-2 border-white/30 bg-black">
          <video
            ref={ref => {
              if (ref && localStreamRef.current && !ref.srcObject) {
                ref.srcObject = localStreamRef.current;
                ref.play().catch(() => {});
              }
            }}
            muted
            playsInline
            autoPlay
            className="w-full h-full object-cover scale-x-[-1]"
          />
        </div>
      )}

      <div className="max-w-lg space-y-5">
        <Link
          href={`/data-projects/${projectId}`}
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-foreground"
        >
          <ArrowLeft size={16} />Back to project
        </Link>

        <div>
          <h1 className="text-xl font-bold text-foreground">Live Call</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{projectTitle}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {/* ── PENDING REJOIN (call in progress after refresh) ── */}
        {pendingRejoinCode && phase === "idle" && (
          <Card className="p-6 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 border-2 border-blue-400 dark:border-blue-600">
            <div className="space-y-4">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center border-2 border-blue-400 mb-3">
                  <PhoneCall size={24} className="text-blue-600 dark:text-blue-400" />
                </div>
                <p className="font-semibold text-lg text-blue-900 dark:text-blue-300">Call in Progress</p>
                <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                  You were disconnected. {otherName ? `Your call with ${otherName} is still active.` : "Your call is still active."}
                </p>
              </div>
              <Button
                onClick={() => {
                  hasAutoJoined.current = true;
                  handleReconnectToCall(pendingRejoinCode, pendingRejoinIsInitiator);
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-6 text-base"
              >
                <PhoneCall size={20} className="mr-2" />
                Rejoin Call
              </Button>
              <button
                onClick={() => {
                  setPendingRejoinCode("");
                  setPendingRejoinIsInitiator(false);
                }}
                className="w-full text-sm text-blue-700 dark:text-blue-400 hover:underline py-2"
              >
                Dismiss
              </button>
            </div>
          </Card>
        )}

        {/* ── IDLE ── */}
        {phase === "idle" && (
          <div className="space-y-4">
            {personalCode && (
              <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
                <div className="text-center">
                  <p className="text-xs text-zinc-500 mb-1 uppercase tracking-wide">Your Personal Call Code</p>
                  <div className="inline-flex items-center gap-2">
                    <span className="text-2xl font-bold tracking-[0.3em] font-mono text-foreground">
                      {personalCode}
                    </span>
                    <button onClick={copyCode} className="text-zinc-400 hover:text-blue-600 transition-colors">
                      {copied
                        ? <CheckCircle2 size={18} className="text-green-500" />
                        : <Copy size={18} />}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Share this with others so they can call you</p>
                </div>
              </Card>
            )}

            <Card className="p-5 bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-800">
              <h2 className="font-semibold mb-2">How the Dialer Works</h2>
              <ol className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1.5 list-decimal list-inside">
                <li>Get the <strong>5-character code</strong> of the person you want to call</li>
                <li>Enter their code below and click <strong>Call</strong></li>
                <li>They&apos;ll see an incoming call notification</li>
                <li>When they accept, you&apos;ll be connected automatically</li>
                <li>Click <strong>Hang Up</strong> when you&apos;re done</li>
              </ol>
            </Card>

            <Card className="p-5">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <PhoneCall size={20} className="text-green-600" />
                Call Someone
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-zinc-500 block mb-1">Enter their call code</label>
                  <Input
                    placeholder="XXXXX"
                    value={targetCodeInput}
                    onChange={e => setTargetCodeInput(e.target.value.toUpperCase())}
                    className="tracking-[0.3em] font-mono uppercase text-center text-xl py-6"
                    maxLength={5}
                    onKeyDown={e => e.key === "Enter" && handleStartCall()}
                  />
                </div>
                <Button
                  onClick={() => handleStartCall()}
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-6"
                  disabled={targetCodeInput.length < 5}
                >
                  <PhoneCall size={20} className="mr-2" />Call
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* ── INTERMEDIATE LOADING STATES ── */}
        {phase === "requesting-mic" && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Requesting microphone access…</p>
            <p className="text-sm text-zinc-400 mt-1">Please allow microphone access when prompted</p>
          </Card>
        )}
        {phase === "creating-offer" && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Setting up call…</p>
          </Card>
        )}

        {/* ── DECLINED ── */}
        {phase === "declined" && (
          <Card className="p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <PhoneOff className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <p className="font-medium text-lg">Call Declined</p>
              <p className="text-sm text-zinc-500 mt-1">
                {otherName || "The other person"} declined your call
              </p>
            </div>
            <Button
              onClick={() => { setError(""); setPhase("idle"); setTargetCodeInput(""); setOtherName(""); }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Try Again
            </Button>
          </Card>
        )}

        {/* ── DARK CALL INTERFACE ── */}
        {(phase === "calling" || phase === "joining" || phase === "connecting" || phase === "reconnecting" || phase === "active") && (() => {
          const statusText =
            phase === "calling"      ? "Ringing…" :
            phase === "joining"      ? "Joining…" :
            phase === "connecting"   ? "Connecting…" :
            phase === "reconnecting" ? "Reconnecting…" :
                                       "Live call";

          const borderColor  = phase === "reconnecting" ? "border-amber-600/40" : "border-slate-700";
          const statusColor  = phase === "reconnecting" ? "text-amber-400"      : "text-slate-400";
          const spinnerColor = phase === "reconnecting" ? "text-amber-400"      : "text-slate-400";

          return (
            <div ref={callCardRef} className={`rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl border ${borderColor}`}>
              {/* Remote video display */}
              {phase === "active" && (
                <div className="w-full aspect-video bg-black flex items-center justify-center overflow-hidden">
                  <video
                    ref={ref => {
                      if (ref && remoteAudioRef.current?.srcObject && !ref.srcObject) {
                        ref.srcObject = remoteAudioRef.current.srcObject;
                        ref.play().catch(() => {});
                      }
                    }}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600">
                    <User className="w-5 h-5 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-base leading-tight">
                      {otherName || (phase === "calling" ? "…" : "Your Partner")}
                    </p>
                    <p className={`text-xs ${statusColor}`}>{statusText}</p>
                  </div>
                </div>
                {phase === "active" ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-end gap-[3px] h-4">
                      {[45, 72, 100].map((pct, i) => {
                        const lit =
                          connQuality === "good" ||
                          (connQuality === "poor" && i < 2) ||
                          (connQuality === "bad"  && i < 1);
                        const barColor =
                          connQuality === "good" ? "bg-green-400" :
                          connQuality === "poor" ? "bg-amber-400" : "bg-red-400";
                        return (
                          <div
                            key={i}
                            style={{ height: `${pct}%` }}
                            className={`w-[3px] rounded-sm transition-colors duration-700 ${lit ? barColor : "bg-slate-600"}`}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-600/20 border border-green-500/40 rounded-full px-3 py-1">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-green-400 text-xs font-semibold tracking-wide">LIVE</span>
                    </div>
                  </div>
                ) : (
                  <Loader2 size={20} className={`animate-spin ${spinnerColor}`} />
                )}
              </div>

              {/* Timer / status body */}
              {phase === "reconnecting" ? (
                <div className="text-center py-7 px-5 space-y-2.5">
                  <div className="w-10 h-10 mx-auto rounded-full bg-amber-500/20 ring-2 ring-amber-400/30 flex items-center justify-center">
                    <Loader2 size={20} className="text-amber-400 animate-spin" />
                  </div>
                  <p className="text-amber-300 text-sm font-semibold">Reconnecting…</p>
                  <p className="text-slate-300 text-xs">
                    {isInitiatorRef.current
                      ? "Sending reconnect request to partner"
                      : "Waiting for partner to reconnect"}
                  </p>
                  {reconnectSecsLeft > 0 && (
                    <div className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/25 rounded-full px-3 py-1">
                      <span className="text-slate-300 text-xs">Give up in</span>
                      <span className="font-mono text-amber-300 font-bold text-sm">
                        {Math.floor(reconnectSecsLeft / 60).toString().padStart(2, "0")}
                        :{(reconnectSecsLeft % 60).toString().padStart(2, "0")}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      if (pcRef.current) {
                        clientLog("call_reconnecting", {
                          callCode: callCodeRef.current,
                          reason: "user_manual_reconnect"
                        }, "info");
                        beginReconnectFlow(pcRef.current);
                      }
                    }}
                    className="mt-3 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition"
                  >
                    Try to Reconnect Now
                  </button>
                  <p className="text-slate-500 text-[11px]">Do not close this page</p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-5xl font-mono font-bold text-white tracking-wider">{fmt(timer)}</p>
                  {isRecording && (
                    <div className="inline-flex items-center gap-1.5 mt-3 bg-red-500/20 border border-red-500/40 rounded-full px-3 py-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-red-400 text-xs font-semibold tracking-wide">🎙 AUDIO REC</span>
                    </div>
                  )}
                  {isVideoRecording && (
                    <div className="inline-flex items-center gap-1.5 mt-3 bg-red-500/20 border border-red-500/40 rounded-full px-3 py-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-red-400 text-xs font-semibold tracking-wide">📹 VIDEO REC</span>
                    </div>
                  )}
                  {uploadStatus === "uploading" && (
                    <div className="inline-flex items-center gap-1.5 mt-2 bg-blue-500/20 border border-blue-500/40 rounded-full px-3 py-1">
                      <Loader2 size={11} className="animate-spin text-blue-400" />
                      <span className="text-blue-400 text-xs font-semibold tracking-wide">
                        🎙 SAVING{uploadPct > 0 ? ` ${uploadPct}%` : "…"}
                      </span>
                    </div>
                  )}
                  {uploadStatus === "done" && (
                    <div className="inline-flex items-center gap-1.5 mt-2 bg-green-500/20 border border-green-500/40 rounded-full px-3 py-1">
                      <CheckCircle2 size={11} className="text-green-400" />
                      <span className="text-green-400 text-xs font-semibold tracking-wide">🎙 AUDIO SAVED</span>
                    </div>
                  )}
                  {uploadStatus === "error" && (
                    <div className="inline-flex items-center gap-1.5 mt-2 bg-amber-500/20 border border-amber-500/40 rounded-full px-3 py-1">
                      <span className="text-amber-400 text-xs font-semibold tracking-wide">🎙 DOWNLOADED ONLY</span>
                    </div>
                  )}
                  {vidUploadStatus === "uploading" && (
                    <div className="inline-flex items-center gap-1.5 mt-2 bg-blue-500/20 border border-blue-500/40 rounded-full px-3 py-1">
                      <Loader2 size={11} className="animate-spin text-blue-400" />
                      <span className="text-blue-400 text-xs font-semibold tracking-wide">
                        📹 SAVING{vidUploadPct > 0 ? ` ${vidUploadPct}%` : "…"}
                      </span>
                    </div>
                  )}
                  {vidUploadStatus === "done" && (
                    <div className="inline-flex items-center gap-1.5 mt-2 bg-green-500/20 border border-green-500/40 rounded-full px-3 py-1">
                      <CheckCircle2 size={11} className="text-green-400" />
                      <span className="text-green-400 text-xs font-semibold tracking-wide">📹 VIDEO SAVED</span>
                    </div>
                  )}
                  {vidUploadStatus === "error" && (
                    <div className="inline-flex items-center gap-1.5 mt-2 bg-amber-500/20 border border-amber-500/40 rounded-full px-3 py-1">
                      <span className="text-amber-400 text-xs font-semibold tracking-wide">📹 DOWNLOADED ONLY</span>
                    </div>
                  )}
                </div>
              )}

              {/* Controls */}
              <div className="px-6 pb-7 pt-5 border-t border-white/5">
                <div className="flex items-center justify-center gap-4">

                  {/* Mute */}
                  {phase === "active" && (
                    <button
                      onClick={toggleMute}
                      className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-105 shadow-lg ${
                        isMuted
                          ? "bg-red-500/30 ring-2 ring-red-400/60 shadow-red-500/20"
                          : "bg-white/10 ring-1 ring-white/10 hover:bg-white/15 hover:ring-white/20"
                      }`}
                    >
                      {isMuted
                        ? <MicOff size={21} className="text-red-300" />
                        : <Mic size={21} className="text-white/90" />}
                    </button>
                  )}

                  {/* Reconnect */}
                  {(phase === "active" || phase === "reconnecting") && connQuality !== "good" && (
                    <button
                      onClick={() => {
                        if (pcRef.current) {
                          clientLog("call_reconnecting", { callCode: callCodeRef.current, reason: "user_triggered" }, "warning");
                          beginReconnectFlow(pcRef.current);
                        }
                      }}
                      title="Reconnect if experiencing connection issues"
                      className="relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-105 shadow-lg bg-blue-500/30 ring-2 ring-blue-400/60 hover:bg-blue-500/40 shadow-blue-500/20"
                    >
                      <Zap size={21} className="text-blue-300" />
                    </button>
                  )}

                  {/* End call */}
                  <button
                    onClick={() => {
                      if (phase === "calling" && callCodeRef.current) {
                        fetch(`/api/calls/${callCodeRef.current}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ type: "cancel" }),
                        }).catch(() => {});
                        cleanup();
                        setPhase("ended");
                      } else {
                        handleHangUp(phase === "reconnecting" ? "user_hangup_during_reconnect" : "user_hangup");
                      }
                    }}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-105 shadow-xl shadow-red-600/40 ring-1 ring-red-400/30"
                  >
                    <PhoneOff size={24} className="text-white" />
                  </button>

                  {/* Audio record */}
                  {phase === "active" && supportsRecording && (
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={isVideoRecording}
                        title={isRecording ? "Stop audio recording" : "Record audio"}
                        className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-105 shadow-lg disabled:opacity-30 ${
                          isRecording
                            ? "bg-red-500/30 ring-2 ring-red-400/60 shadow-red-500/20"
                            : "bg-white/10 ring-1 ring-white/10 hover:bg-white/15 hover:ring-white/20"
                        }`}
                      >
                        {isRecording && <span className="absolute inset-0 rounded-full animate-ping bg-red-500/20" />}
                        {isRecording
                          ? <StopCircle size={18} className="text-red-300 relative z-10" />
                          : <Radio size={18} className="text-white/90" />}
                      </button>
                      <span className="text-[10px] font-medium tracking-wide text-slate-400">
                        {isRecording ? "Stop" : "Audio"}
                      </span>
                    </div>
                  )}

                  {/* Video record */}
                  {phase === "active" && supportsRecording && (
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={isVideoRecording ? stopRecording : startVideoRecording}
                        disabled={isRecording}
                        title={isVideoRecording ? "Stop video recording" : "Record video"}
                        className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-105 shadow-lg disabled:opacity-30 ${
                          isVideoRecording
                            ? "bg-red-500/30 ring-2 ring-red-400/60 shadow-red-500/20"
                            : "bg-white/10 ring-1 ring-white/10 hover:bg-white/15 hover:ring-white/20"
                        }`}
                      >
                        {isVideoRecording && <span className="absolute inset-0 rounded-full animate-ping bg-red-500/20" />}
                        {isVideoRecording
                          ? <StopCircle size={18} className="text-red-300 relative z-10" />
                          : <Video size={18} className="text-white/90" />}
                      </button>
                      <span className="text-[10px] font-medium tracking-wide text-slate-400">
                        {isVideoRecording ? "Stop" : "Video"}
                      </span>
                    </div>
                  )}

                </div>
              </div>
            </div>
          );
        })()}

        {/* ── ENDED ── */}
        {phase === "ended" && (() => {
          const isReconnectEnd =
            endedReason === "reconnect_timeout" ||
            endedReason === "remote_hangup_during_reconnect";

          if (!isReconnectEnd) {
            return (
              <Card className="p-6 text-center space-y-2">
                <Radio size={36} className="mx-auto text-zinc-400" />
                <p className="font-medium text-zinc-600 dark:text-zinc-400">Call ended</p>
                <p className="text-xs text-zinc-400">Returning to dial screen…</p>
              </Card>
            );
          }

          const canCallBack = isInitiatorRef.current && !!savedTargetCodeRef.current;

          return (
            <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl border border-amber-600/30">
              <div className="text-center px-6 pt-8 pb-6">
                <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 ring-2 ring-amber-400/40 flex items-center justify-center mb-4">
                  <PhoneOff className="w-8 h-8 text-amber-400" />
                </div>
                <p className="text-white font-semibold text-lg">Connection Lost</p>
                <p className="text-slate-400 text-sm mt-1">
                  {endedReason === "remote_hangup_during_reconnect"
                    ? `${otherName || "Your partner"} ended the call during reconnection`
                    : `Could not reconnect with ${otherName || "your partner"}`}
                </p>
              </div>

              <div className="px-6 pb-7 pt-4 border-t border-white/5 flex items-end justify-center gap-8">
                {canCallBack ? (
                  <div className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => {
                        const code = savedTargetCodeRef.current;
                        setError(""); setOtherName(""); setTimer(0); setIsMuted(false);
                        setUploadStatus("idle"); setUploadPct(0); setEndedReason("");
                        setTargetCodeInput(code);
                        handleStartCall(code);
                      }}
                      className="w-16 h-16 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-105 shadow-xl shadow-green-600/40 ring-1 ring-green-400/30"
                    >
                      <PhoneCall size={24} className="text-white" />
                    </button>
                    <span className="text-[11px] font-medium tracking-wide text-slate-400">Call back</span>
                  </div>
                ) : (
                  <p className="text-amber-400 text-sm text-center pb-2">
                    Ask {otherName || "them"} to call you back
                  </p>
                )}

                <div className="flex flex-col items-center gap-2">
                  <button
                    onClick={resetToIdle}
                    className="w-14 h-14 rounded-full bg-white/10 ring-1 ring-white/10 hover:bg-white/15 hover:ring-white/20 flex items-center justify-center transition-all duration-200 active:scale-90 hover:scale-105 shadow-lg"
                  >
                    <ArrowLeft size={20} className="text-white/90" />
                  </button>
                  <span className="text-[11px] font-medium tracking-wide text-slate-400">Dismiss</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── RECONNECTING MODAL ── */}
      {phase === "reconnecting" && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl border border-amber-500/30 w-full max-w-sm">

            <div className="text-center px-6 pt-8 pb-4 space-y-3">
              <div className="relative mx-auto w-16 h-16">
                <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping" />
                <div className="relative w-16 h-16 rounded-full bg-amber-500/20 ring-2 ring-amber-400/40 flex items-center justify-center">
                  <WifiOff className="w-7 h-7 text-amber-400" />
                </div>
              </div>
              <div>
                <p className="text-white font-semibold text-lg">Connection Interrupted</p>
                <p className="text-slate-400 text-sm mt-1">
                  {isInitiatorRef.current
                    ? `Reconnecting to ${otherName || "your partner"}…`
                    : `Waiting for ${otherName || "your partner"} to reconnect…`}
                </p>
              </div>
            </div>

            <div className="text-center px-6 pb-5 space-y-3">
              <div className="flex items-center justify-center gap-2 text-slate-400 text-xs">
                <Loader2 size={14} className="animate-spin text-amber-400" />
                <span>Reconnecting automatically — do not close this page</span>
              </div>
              {reconnectSecsLeft > 0 && (
                <div className="inline-flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/25 rounded-full px-4 py-1.5">
                  <span className="text-slate-300 text-xs">Giving up in</span>
                  <span className="font-mono text-amber-300 font-bold text-sm">
                    {Math.floor(reconnectSecsLeft / 60).toString().padStart(2, "0")}
                    :{(reconnectSecsLeft % 60).toString().padStart(2, "0")}
                  </span>
                </div>
              )}
            </div>

            <div className="px-6 pb-7 border-t border-white/5 pt-4 flex flex-col items-center gap-1.5">
              <button
                onClick={() => handleHangUp("user_hangup_during_reconnect")}
                className="w-14 h-14 rounded-full bg-red-500/20 ring-1 ring-red-400/40 hover:bg-red-500/30 hover:ring-red-400/60 flex items-center justify-center text-red-400 transition-all duration-200 hover:scale-105 active:scale-90 shadow-lg"
              >
                <PhoneOff size={22} />
              </button>
              <span className="text-[11px] font-medium tracking-wide text-slate-500">Give up</span>
            </div>
          </div>
        </div>
      )}

    </DashboardLayout>
  );
}

// ── Public export — wraps inner component in Suspense ─────────────────────────
export default function CallPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 size={32} className="animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    }>
      <CallPageInner />
    </Suspense>
  );
}
