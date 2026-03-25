"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mic, MicOff, PhoneOff, PhoneCall, Copy, CheckCircle2,
  Loader2, AlertCircle, User, Video, VideoOff, RefreshCw,
  ScreenShare, StopCircle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
type CallType = "audio" | "video";
type Phase =
  | "idle"
  | "requesting-media"
  | "creating-offer"
  | "calling"
  | "joining"
  | "connecting"
  | "reconnecting"
  | "active"
  | "ended"
  | "declined";

const FALLBACK_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

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

// ── Inner component ───────────────────────────────────────────────────────────
function LiveCallInner() {
  const searchParams  = useSearchParams();
  const joinCode      = searchParams.get("join");
  const joinType      = (searchParams.get("type") || "audio") as CallType;
  const { status }    = useSession();

  // ── State ─────────────────────────────────────────────────────────────────
  const [phase,           setPhase]           = useState<Phase>("idle");
  const [callType,        setCallType]        = useState<CallType>("audio");
  const [timer,           setTimer]           = useState(0);
  const [isMuted,         setIsMuted]         = useState(false);
  const [isVideoOff,      setIsVideoOff]      = useState(false);
  const [isFrontCamera,   setIsFrontCamera]   = useState(true);
  const [error,           setError]           = useState("");
  const [copied,          setCopied]          = useState(false);
  const [personalCode,    setPersonalCode]    = useState("");
  const [targetCodeInput, setTargetCodeInput] = useState("");
  const [otherName,       setOtherName]       = useState("");
  const [isIOS,             setIsIOS]             = useState(false);
  const [isRecording,       setIsRecording]       = useState(false);
  const [supportsRecording, setSupportsRecording] = useState(false);
  const [swapped,           setSwapped]           = useState(false);
  const [pipPos,            setPipPos]            = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setIsIOS(/iPhone|iPad|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    setSupportsRecording(typeof (navigator.mediaDevices as unknown as Record<string, unknown>)?.getDisplayMedia === "function");
  }, []);

  // ── WebRTC refs ────────────────────────────────────────────────────────────
  const pcRef             = useRef<RTCPeerConnection | null>(null);
  const localStreamRef    = useRef<MediaStream | null>(null);
  const remoteStreamRef   = useRef<MediaStream | null>(null);
  const remoteAudioRef    = useRef<HTMLAudioElement | null>(null);
  const localVideoRef     = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef    = useRef<HTMLVideoElement | null>(null);
  // AudioContext approach for remote audio — bypasses mobile autoplay policy
  const remoteAudioCtxRef = useRef<AudioContext | null>(null);
  const remoteAudioSrcRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const callCodeRef    = useRef("");
  const isInitiatorRef = useRef(false);
  const callTypeRef    = useRef<CallType>("audio");

  // ── Recording refs ─────────────────────────────────────────────────────────
  const screenStreamRef   = useRef<MediaStream | null>(null);
  const mediaRecorderRef  = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioCtxRef       = useRef<AudioContext | null>(null);

  // ── Auto-recording refs ────────────────────────────────────────────────────
  const autoRecRef       = useRef<MediaRecorder | null>(null);
  const autoChunksRef    = useRef<Blob[]>([]);
  const autoAudioCtxRef  = useRef<AudioContext | null>(null);
  const autoCanvasRef    = useRef<HTMLCanvasElement | null>(null);
  const autoAnimRef      = useRef<number | null>(null);
  // Refs that mirror state so drawFrame (created inside a [] useCallback) sees live values
  const isMutedRef    = useRef(false);
  const isVideoOffRef = useRef(false);
  const timerValRef   = useRef(0);
  const otherNameRef  = useRef("");

  // ── PiP drag ref ──────────────────────────────────────────────────────────
  const pipDragRef = useRef<{ px: number; py: number; ex: number; ey: number; moved: boolean } | null>(null);

  // ── Signaling refs ─────────────────────────────────────────────────────────
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const alreadyAnswered = useRef(false);
  const seenInitIce    = useRef(0);
  const seenRecvIce    = useRef(0);

  // ── Timer / timeout refs ───────────────────────────────────────────────────
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTORef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTORef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Guard refs ─────────────────────────────────────────────────────────────
  const hasAutoJoined  = useRef(false);
  const phaseRef       = useRef<Phase>("idle");
  const swappedRef     = useRef(false);
  const pipPosRef      = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { swappedRef.current = swapped; }, [swapped]);
  useEffect(() => { pipPosRef.current = pipPos; }, [pipPos]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  useEffect(() => { isVideoOffRef.current = isVideoOff; }, [isVideoOff]);
  useEffect(() => { timerValRef.current = timer; }, [timer]);
  useEffect(() => { otherNameRef.current = otherName; }, [otherName]);

  // Wire up video streams after the full-screen video UI mounts.
  // ontrack fires during "connecting" when remoteVideoRef is null (video UI not rendered yet).
  // This effect runs once phase flips to "active" and the <video> elements exist in the DOM.
  useEffect(() => {
    if (phase !== "active" || callTypeRef.current !== "video") return;
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
      remoteVideoRef.current.play().catch(() => {});
    }
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
    // Re-connect remote audio through AudioContext after swap or reconnect
    if (remoteStreamRef.current) connectRemoteAudio(remoteStreamRef.current);
  }, [phase, swapped]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────
  // Route remote stream through AudioContext so audio plays even when called
  // from async ontrack (which is NOT a direct user gesture).
  // The AudioContext is created/unlocked during handleStartCall/handleJoinCall
  // (which ARE user gestures), so audio plays immediately when tracks arrive.
  const connectRemoteAudio = (stream: MediaStream) => {
    const ctx = remoteAudioCtxRef.current;
    if (!ctx) return;
    try { remoteAudioSrcRef.current?.disconnect(); } catch { /* ignore */ }
    const src = ctx.createMediaStreamSource(stream);
    src.connect(ctx.destination);
    remoteAudioSrcRef.current = src;
  };

  const stopPoll         = () => { if (pollRef.current)       { clearInterval(pollRef.current);        pollRef.current      = null; } };
  const stopTimer        = () => { if (timerRef.current)      { clearInterval(timerRef.current);       timerRef.current     = null; } };
  const clearConnectTO   = () => { if (connectTORef.current)  { clearTimeout(connectTORef.current);    connectTORef.current  = null; } };
  const clearReconnectTO = () => { if (reconnectTORef.current){ clearTimeout(reconnectTORef.current);  reconnectTORef.current = null; } };

  const cleanup = useCallback(() => {
    stopPoll(); stopTimer(); clearConnectTO(); clearReconnectTO();
    alreadyAnswered.current = false;
    seenInitIce.current = 0;
    seenRecvIce.current = 0;
    callCodeRef.current = "";
    // Stop manual screen recording
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    // Stop auto-recording (no upload on cleanup — call was aborted)
    if (autoAnimRef.current) { cancelAnimationFrame(autoAnimRef.current); autoAnimRef.current = null; }
    autoCanvasRef.current = null;
    if (autoRecRef.current?.state === "recording") autoRecRef.current.stop();
    autoRecRef.current = null;
    autoChunksRef.current = [];
    autoAudioCtxRef.current?.close();
    autoAudioCtxRef.current = null;
    // Close remote AudioContext
    try { remoteAudioSrcRef.current?.disconnect(); } catch { /* ignore */ }
    remoteAudioSrcRef.current = null;
    remoteAudioCtxRef.current?.close();
    remoteAudioCtxRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (pcRef.current) {
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.close();
      pcRef.current = null;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => cleanup(), [cleanup]);

  // ── beforeunload guard ─────────────────────────────────────────────────────
  useEffect(() => {
    const activePhases: Phase[] = ["active", "reconnecting", "connecting", "calling"];
    if (!activePhases.includes(phase)) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have an active call. Are you sure you want to leave?";
      try {
        const payload = JSON.stringify({
          type: "page_close_during_call", severity: "warning",
          metadata: { callCode: callCodeRef.current, phase: phaseRef.current },
        });
        navigator.sendBeacon("/api/activity-log", new Blob([payload], { type: "application/json" }));
      } catch { /* ignore */ }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  // ── Keyboard refresh block ─────────────────────────────────────────────────
  useEffect(() => {
    const activePhases: Phase[] = ["active", "reconnecting", "connecting", "calling"];
    if (!activePhases.includes(phase)) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && (e.key === "r" || e.key === "R"))) {
        e.preventDefault(); e.stopPropagation();
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [phase]);

  // ── Load personal code ─────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/profile")
      .then(r => r.json())
      .then(d => { if (d.user?.personalCallCode) setPersonalCode(d.user.personalCallCode); })
      .catch(() => {});
  }, [status]);

  // ── Auto-join (incoming call) ──────────────────────────────────────────────
  useEffect(() => {
    if (joinCode && status === "authenticated" && phase === "idle" && !hasAutoJoined.current) {
      hasAutoJoined.current = true;
      setCallType(joinType);
      callTypeRef.current = joinType;
      handleJoinCall(joinCode, joinType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCode, status, phase]);

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

  // ── Media helpers ─────────────────────────────────────────────────────────
  const getMedia = async (type: CallType, facingMode: "user" | "environment" = "user"): Promise<MediaStream> => {
    if (type === "video") {
      // 1. Try full video + audio
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch { /* camera denied or unavailable — fall through */ }

      // 2. Try audio only (camera blocked)
      try {
        callTypeRef.current = "audio";
        setCallType("audio");
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch { /* mic also denied — fall through */ }
    } else {
      // 3. Try audio only
      try {
        return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch { /* mic denied — fall through */ }
    }

    // 4. Last resort: receive-only — no tracks sent, call still connects
    return new MediaStream();
  };

  const attachLocalVideo = (stream: MediaStream) => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }
  };

  // ── Create peer connection ─────────────────────────────────────────────────
  const createPC = (iceServers: RTCIceServer[], onIce: (c: RTCIceCandidate) => void): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onicecandidate = e => { if (e.candidate) onIce(e.candidate); };

    pc.ontrack = e => {
      const remote = e.streams[0];
      if (!remote) return;

      remoteStreamRef.current = remote;

      // Route remote audio through AudioContext — bypasses mobile autoplay policy.
      // The AudioContext was created & unlocked during the user gesture (handleStartCall /
      // handleJoinCall), so connecting a source node here always succeeds even though
      // ontrack fires asynchronously.
      connectRemoteAudio(remote);

      if (callTypeRef.current === "video") {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remote;
          remoteVideoRef.current.play().catch(() => {});
        }
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          localVideoRef.current.play().catch(() => {});
        }
      }
    };

    // Use both events for cross-browser coverage (Safari, older Chromium)
    const handleConnected = () => {
      clearReconnectTO(); clearConnectTO();
      const inCall: Phase[] = ["calling", "joining", "connecting", "reconnecting"];
      if (inCall.includes(phaseRef.current)) {
        const isReconnect = phaseRef.current === "reconnecting";
        setPhase("active");
        if (!isReconnect) setTimer(0); // keep running timer on reconnect
        if (!timerRef.current) timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
        clientLog("call_connected", { callCode: callCodeRef.current, callType: callTypeRef.current }, "success");
      }
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") handleConnected();
      if (s === "disconnected" || s === "failed") {
        clearReconnectTO();
        setPhase("reconnecting");
        clientLog("call_reconnecting", { callCode: callCodeRef.current, connectionState: s }, "warning");
        if (callCodeRef.current && !pollRef.current) startIcePoll(callCodeRef.current, isInitiatorRef.current);
        reconnectTORef.current = setTimeout(() => {
          if (pcRef.current?.connectionState !== "connected") {
            clientLog("call_timeout", { callCode: callCodeRef.current, reason: "reconnect_timeout_10min" }, "error");
            setError("Connection lost. The call has ended.");
            handleHangUp("reconnect_timeout");
          }
        }, 600_000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") handleConnected();
    };

    pc.onicecandidateerror = (e: Event) => {
      const ev = e as RTCPeerConnectionIceErrorEvent;
      if (ev.errorCode >= 400) clientLog("call_error", { callCode: callCodeRef.current, error: "ICE", errorCode: ev.errorCode }, "warning");
    };

    return pc;
  };

  // ── Signaling ─────────────────────────────────────────────────────────────
  const startIcePoll = (code: string, asInitiator: boolean) => {
    if (pollRef.current) return;
    let busy = false;
    pollRef.current = setInterval(async () => {
      if (busy || !pollRef.current) return;
      busy = true;
      try {
        const res = await fetch(`/api/calls/${code}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === "completed" || data.status === "missed") {
          stopPoll();
          clientLog("call_end", { callCode: code, reason: "remote_hangup" }, "info");
          handleHangUp("remote_hangup");
          return;
        }
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) return;
        if (asInitiator) {
          const fresh: RTCIceCandidateInit[] = data.receiverIce.slice(seenRecvIce.current);
          for (const c of fresh) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          seenRecvIce.current += fresh.length;
        } else {
          const fresh: RTCIceCandidateInit[] = data.initiatorIce.slice(seenInitIce.current);
          for (const c of fresh) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          seenInitIce.current += fresh.length;
        }
      } catch { /* ignore */ } finally { busy = false; }
    }, 1500);
  };

  const startCallingPoll = (code: string) => {
    let busy = false;
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
          startIcePoll(code, true);
        }
      } catch { /* ignore */ } finally { busy = false; }
    }, 2000);
  };

  // ── Start call (caller) ───────────────────────────────────────────────────
  const handleStartCall = async () => {
    const targetCode = targetCodeInput.trim().toUpperCase();
    if (targetCode.length < 5) { setError("Enter a valid 5-character call code"); return; }
    setError("");
    // Create + unlock AudioContext during this user gesture so remote audio plays
    // on iOS/Android without hitting autoplay restrictions in async callbacks.
    if (!remoteAudioCtxRef.current) {
      remoteAudioCtxRef.current = new AudioContext();
    }
    remoteAudioCtxRef.current.resume().catch(() => {});
    try {
      setPhase("requesting-media");
      callTypeRef.current = callType;
      const stream = await getMedia(callType);
      localStreamRef.current = stream;
      if (callType === "video") attachLocalVideo(stream);

      setPhase("creating-offer");
      isInitiatorRef.current = true;
      const iceServers = await fetchIceServers();
      const pc = createPC(iceServers, async candidate => {
        if (!callCodeRef.current) return;
        await fetch(`/api/calls/${callCodeRef.current}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ice-initiator", candidate }),
        }).catch(() => {});
      });

      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await fetch("/api/calls", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: null, offer, targetUserCode: targetCode, callType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      callCodeRef.current = data.callCode;
      setOtherName(data.targetUserName || "");
      setPhase("calling");
      startCallingPoll(data.callCode);

      // 5-minute ring timeout
      connectTORef.current = setTimeout(() => {
        if (pcRef.current?.connectionState !== "connected") {
          clientLog("call_timeout", { callCode: callCodeRef.current, reason: "no_answer_5min" }, "warning");
          setError("No answer. The person may be unavailable.");
          setPhase("ended"); cleanup();
        }
      }, 300_000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start call";
      clientLog("call_error", { phase: "start", error: msg }, "error");
      setError(msg); setPhase("idle"); cleanup();
    }
  };

  // ── Join call (receiver) ──────────────────────────────────────────────────
  const handleJoinCall = async (codeOverride?: string, typeOverride?: CallType) => {
    const code = (codeOverride || targetCodeInput).trim().toUpperCase();
    if (code.length < 5) { setError("Enter a valid call code"); return; }
    setError("");
    const type = typeOverride || callType;
    callTypeRef.current = type;
    // Unlock AudioContext in this user gesture so remote audio plays without
    // hitting autoplay restrictions when ontrack fires asynchronously.
    if (!remoteAudioCtxRef.current) {
      remoteAudioCtxRef.current = new AudioContext();
    }
    remoteAudioCtxRef.current.resume().catch(() => {});
    try {
      setPhase("requesting-media");
      const stream = await getMedia(type);
      localStreamRef.current = stream;
      if (type === "video") attachLocalVideo(stream);

      setPhase("joining");
      isInitiatorRef.current = false;
      callCodeRef.current = code;

      const res = await fetch(`/api/calls/${code}`);
      if (!res.ok) throw new Error("Call not found. Check the code and try again.");
      const session = await res.json();
      if (!session.offer)               throw new Error("Call setup not ready — try again in a moment.");
      if (session.status === "active")  throw new Error("This call is already in progress.");
      if (session.status === "completed") throw new Error("This call has ended.");
      if (session.status === "declined") throw new Error("This call was declined.");
      if (session.initiatorName) setOtherName(session.initiatorName);

      const iceServers = await fetchIceServers();
      const pc = createPC(iceServers, async candidate => {
        await fetch(`/api/calls/${code}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ice-receiver", candidate }),
        }).catch(() => {});
      });

      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      await pc.setRemoteDescription(new RTCSessionDescription(session.offer));

      const initIce: RTCIceCandidateInit[] = session.initiatorIce || [];
      for (const c of initIce) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      seenInitIce.current = initIce.length;

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch(`/api/calls/${code}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "answer", answer }),
      });

      setPhase("connecting");
      startIcePoll(code, false);
      clientLog("call_connecting", { callCode: code, role: "receiver", callType: type }, "info");

      // 60s connect timeout
      connectTORef.current = setTimeout(() => {
        if (pcRef.current?.connectionState !== "connected") {
          clientLog("call_timeout", { callCode: code, reason: "connect_timeout_60s" }, "error");
          setError("Could not connect. Check your network and try again.");
          setPhase("ended"); cleanup();
        }
      }, 60_000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to join call";
      clientLog("call_error", { callCode: code, phase: "join", error: msg }, "error");
      setError(msg); setPhase("idle"); cleanup();
    }
  };

  // ── Hang up ───────────────────────────────────────────────────────────────
  const handleHangUp = (reason = "user_hangup") => {
    stopPoll(); stopTimer(); clearReconnectTO(); clearConnectTO();
    // Reset signaling state so the next call starts clean
    alreadyAnswered.current = false;
    seenInitIce.current     = 0;
    seenRecvIce.current     = 0;
    if (callCodeRef.current) {
      fetch(`/api/calls/${callCodeRef.current}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "status", status: "completed", reason }),
      }).catch(() => {});
    }
    // NOTE: callCodeRef.current is intentionally NOT cleared here — the auto-stop
    // recording effect reads it when phase flips to "ended". It gets cleared in resetToIdle.
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
  const toggleMute  = () => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; }); setIsMuted(m => !m); };
  const toggleVideo = () => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; }); setIsVideoOff(v => !v); };

  const switchCamera = async () => {
    const newFacing = isFrontCamera ? "environment" : "user";
    setIsFrontCamera(!isFrontCamera);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: newFacing }, audio: false });
      const newTrack = newStream.getVideoTracks()[0];
      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);
      if (localStreamRef.current) {
        const old = localStreamRef.current.getVideoTracks()[0];
        old?.stop();
        localStreamRef.current.removeTrack(old);
        localStreamRef.current.addTrack(newTrack);
      }
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
    } catch { /* ignore */ }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(personalCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const resetToIdle = () => {
    setError(""); setPhase("idle"); setTargetCodeInput("");
    setOtherName(""); setTimer(0); setIsMuted(false); setIsVideoOff(false);
    setSwapped(false); setPipPos(null);
    callCodeRef.current = "";
  };

  // Auto-return to idle 1.5 s after a call ends so the user can immediately redial
  useEffect(() => {
    if (phase !== "ended") return;
    const t = setTimeout(resetToIdle, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Screen recording ───────────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      // Capture screen + system audio (other person's voice via speaker)
      const displayStream = await (navigator.mediaDevices as unknown as {
        getDisplayMedia(c: object): Promise<MediaStream>;
      }).getDisplayMedia({ video: true, audio: true });

      screenStreamRef.current = displayStream;

      // Mix mic + display/system audio into one track via AudioContext
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const dest = audioCtx.createMediaStreamDestination();

      if (localStreamRef.current) {
        audioCtx.createMediaStreamSource(localStreamRef.current).connect(dest);
      }
      const sysAudio = displayStream.getAudioTracks();
      if (sysAudio.length > 0) {
        audioCtx.createMediaStreamSource(new MediaStream(sysAudio)).connect(dest);
      }

      // Combined: screen video + mixed audio
      const combined = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
        .find(t => MediaRecorder.isTypeSupported(t)) || "";

      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(combined, mimeType ? { mimeType } : {});
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType || "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `call-recording-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        recordedChunksRef.current = [];
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
        audioCtxRef.current?.close();
        audioCtxRef.current = null;
        setIsRecording(false);
      };

      // Auto-stop if user closes the screen-share picker
      displayStream.getVideoTracks()[0].onended = () => stopRecording();

      recorder.start(1000);
      setIsRecording(true);
    } catch {
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
  };

  // ── Auto-recording (starts automatically on call connect, uploads on end) ──
  const startAutoRecord = useCallback(() => {
    if (autoRecRef.current) return;
    setTimeout(() => {
      try {
        const isVideo = callTypeRef.current === "video";

        // Mix local + remote audio via AudioContext
        const audioCtx = new AudioContext();
        autoAudioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();
        const localAudio = localStreamRef.current?.getAudioTracks() ?? [];
        if (localAudio.length) audioCtx.createMediaStreamSource(new MediaStream(localAudio)).connect(dest);
        const remoteAudio = remoteStreamRef.current?.getAudioTracks() ?? [];
        if (remoteAudio.length) audioCtx.createMediaStreamSource(new MediaStream(remoteAudio)).connect(dest);
        const audioTracks = dest.stream.getAudioTracks();
        if (audioTracks.length === 0) { audioCtx.close(); return; }

        let mimeType: string;
        let recordStream: MediaStream;

        if (isVideo) {
          // Canvas-based recording: portrait orientation (720×1280) — mirrors phone screen layout
          const CW = 720, CH = 1280;
          const canvas = document.createElement("canvas");
          canvas.width = CW; canvas.height = CH;
          autoCanvasRef.current = canvas;
          const ctx = canvas.getContext("2d");
          if (!ctx) { audioCtx.close(); return; }

          const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.arcTo(x + w, y, x + w, y + r, r);
            ctx.lineTo(x + w, y + h - r);
            ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
            ctx.lineTo(x + r, y + h);
            ctx.arcTo(x, y + h, x, y + h - r, r);
            ctx.lineTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.closePath();
          };

          const drawFrame = () => {
            const sw     = swappedRef.current;
            const mainEl = (sw ? localVideoRef.current  : remoteVideoRef.current) as HTMLVideoElement | null;
            const pipEl  = (sw ? remoteVideoRef.current : localVideoRef.current)  as HTMLVideoElement | null;

            // ── Background ────────────────────────────────────────────────
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, CW, CH);

            // ── Main video — object-cover, fills full portrait canvas ─────
            if (mainEl && mainEl.readyState >= 2) {
              const vw = mainEl.videoWidth || CW, vh = mainEl.videoHeight || CH;
              const scale = Math.max(CW / vw, CH / vh);
              const dw = vw * scale, dh = vh * scale;
              ctx.drawImage(mainEl, (CW - dw) / 2, (CH - dh) / 2, dw, dh);
            }

            // ── PiP — portrait-shaped (9:16) in top-right corner ─────────
            const pipW = 160, pipH = 284; // 9:16 portrait phone shape
            const pos  = pipPosRef.current;
            const pipX = pos
              ? Math.max(0, Math.min(CW - pipW, Math.round((pos.x / Math.max(1, window.innerWidth  - 112)) * (CW - pipW))))
              : CW - pipW - 16;
            const pipY = pos
              ? Math.max(0, Math.min(CH - pipH, Math.round((pos.y / Math.max(1, window.innerHeight - 176)) * (CH - pipH))))
              : 80;

            if (pipEl && pipEl.readyState >= 2) {
              ctx.save();
              drawRoundedRect(pipX, pipY, pipW, pipH, 16);
              ctx.clip();
              // object-cover so face fills the PiP box regardless of source ratio
              const pvw = pipEl.videoWidth || pipW, pvh = pipEl.videoHeight || pipH;
              const ps  = Math.max(pipW / pvw, pipH / pvh);
              const pdw = pvw * ps, pdh = pvh * ps;
              ctx.drawImage(pipEl, pipX + (pipW - pdw) / 2, pipY + (pipH - pdh) / 2, pdw, pdh);
              ctx.restore();
              ctx.save();
              drawRoundedRect(pipX, pipY, pipW, pipH, 16);
              ctx.strokeStyle = "rgba(255,255,255,0.5)";
              ctx.lineWidth = 2.5;
              ctx.stroke();
              ctx.restore();
            }

            // ── Overlay ───────────────────────────────────────────────────
            ctx.save();

            // Top gradient scrim
            const topGrad = ctx.createLinearGradient(0, 0, 0, 260);
            topGrad.addColorStop(0, "rgba(0,0,0,0.80)");
            topGrad.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = topGrad;
            ctx.fillRect(0, 0, CW, 260);

            // REC pill — top-left
            const rpX = 20, rpY = 24;
            drawRoundedRect(rpX, rpY, 88, 34, 17);
            ctx.fillStyle = "rgba(239,68,68,0.35)";
            ctx.fill();
            ctx.fillStyle = "#ef4444";
            ctx.beginPath();
            ctx.arc(rpX + 18, rpY + 17, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = "bold 14px sans-serif";
            ctx.fillStyle = "rgba(252,165,165,0.95)";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText("REC", rpX + 31, rpY + 17);

            // Name — centered
            const tv = timerValRef.current;
            const ts = `${String(Math.floor(tv / 60)).padStart(2, "0")}:${String(tv % 60).padStart(2, "0")}`;
            ctx.fillStyle = "#fff";
            ctx.font = "bold 42px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";
            ctx.fillText(otherNameRef.current || "In Call", CW / 2, 140);

            // Timer — centered below name
            ctx.font = "24px sans-serif";
            ctx.fillStyle = "rgba(255,255,255,0.65)";
            ctx.fillText(ts, CW / 2, 180);

            // Bottom gradient scrim
            const botGrad = ctx.createLinearGradient(0, CH - 300, 0, CH);
            botGrad.addColorStop(0, "rgba(0,0,0,0)");
            botGrad.addColorStop(1, "rgba(0,0,0,0.95)");
            ctx.fillStyle = botGrad;
            ctx.fillRect(0, CH - 300, CW, 300);

            // Buttons — 5 round buttons, centered, larger than before
            const muted  = isMutedRef.current;
            const vidOff = isVideoOffRef.current;
            const bY  = CH - 110;
            const sp  = 90;
            const bX0 = CW / 2 - sp * 2;

            const drawBtn = (cx: number, r: number, bg: string, icon: string, lbl: string, fg: string) => {
              ctx.fillStyle = bg;
              ctx.beginPath(); ctx.arc(cx, bY, r, 0, Math.PI * 2); ctx.fill();
              ctx.fillStyle = fg;
              ctx.font = `bold ${Math.round(r * 0.55)}px sans-serif`;
              ctx.textAlign = "center"; ctx.textBaseline = "middle";
              ctx.fillText(icon, cx, bY);
              ctx.font = "20px sans-serif";
              ctx.fillStyle = "rgba(255,255,255,0.6)";
              ctx.textBaseline = "top";
              ctx.fillText(lbl, cx, bY + r + 10);
            };

            drawBtn(bX0,          30, "rgba(255,255,255,0.18)", "↺",  "Flip",                                muted  ? "#dc2626" : "#fff");
            drawBtn(bX0 + sp,     30, muted  ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.18)", muted  ? "✕" : "♪", muted ? "Unmute" : "Mute",  muted  ? "#dc2626" : "#fff");
            drawBtn(bX0 + sp * 2, 40, "#dc2626",                                                   "✕",  "End",                                 "#fff");
            drawBtn(bX0 + sp * 3, 30, vidOff ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.18)", vidOff ? "✕" : "▣", vidOff ? "Cam Off" : "Camera", vidOff ? "#dc2626" : "#fff");
            drawBtn(bX0 + sp * 4, 30, "rgba(255,255,255,0.18)",                                    "●",  "Rec",                                 "#ef4444");

            ctx.restore();

            autoAnimRef.current = requestAnimationFrame(drawFrame);
          };
          autoAnimRef.current = requestAnimationFrame(drawFrame);

          const canvasStream = canvas.captureStream(25);
          recordStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks]);
          mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
            .find(t => MediaRecorder.isTypeSupported(t)) || "";
        } else {
          // Audio call: mixed audio only
          mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"]
            .find(t => MediaRecorder.isTypeSupported(t)) || "";
          recordStream = new MediaStream(audioTracks);
        }

        const rec = new MediaRecorder(recordStream, {
          ...(mimeType ? { mimeType } : {}),
          ...(isVideo
            ? { videoBitsPerSecond: 800_000, audioBitsPerSecond: 64_000 }
            : { audioBitsPerSecond: 32_000 }),
        });
        autoRecRef.current = rec;
        autoChunksRef.current = [];
        rec.ondataavailable = e => { if (e.data.size > 0) autoChunksRef.current.push(e.data); };
        rec.start(1000);
      } catch { /* best-effort */ }
    }, 500);
  }, []); // eslint-disable-line

  // Auto-start recording when call becomes active
  useEffect(() => {
    if (phase !== "active") return;
    startAutoRecord();
  }, [phase]); // eslint-disable-line

  // Auto-stop and upload recording when call ends
  useEffect(() => {
    if (phase !== "ended") return;
    // Stop canvas animation loop before stopping the recorder
    if (autoAnimRef.current) { cancelAnimationFrame(autoAnimRef.current); autoAnimRef.current = null; }
    autoCanvasRef.current = null;
    const rec = autoRecRef.current;
    const code = callCodeRef.current;
    const dur  = timerRef.current ? 0 : 0; // captured below via closure
    void dur; // suppress lint; actual value captured inline
    const capturedTimer     = timer;
    const capturedType      = callTypeRef.current;
    const capturedOtherName = otherName;
    if (!rec || rec.state === "inactive") {
      autoAudioCtxRef.current?.close(); autoAudioCtxRef.current = null;
      autoRecRef.current = null; autoChunksRef.current = [];
      return;
    }
    rec.onstop = async () => {
      const chunks = [...autoChunksRef.current];
      autoChunksRef.current = [];
      autoAudioCtxRef.current?.close(); autoAudioCtxRef.current = null;
      autoRecRef.current = null;
      if (!code || chunks.length === 0) return;
      const mimeType = chunks[0].type || "audio/webm";
      const blob = new Blob(chunks, { type: mimeType });
      try {
        const { uploadFile } = await import("@/lib/upload-file");
        const fileName = `call-${code}-${Date.now()}.webm`;
        const { url, fileSizeMB } = await uploadFile(blob, "call-recordings", fileName);
        await fetch("/api/call-recordings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            callCode: code, fileUrl: url, duration: capturedTimer,
            callType: capturedType, otherName: capturedOtherName,
            fileSize: Math.round(fileSizeMB * 1024 * 1024),
          }),
        }).catch(() => {});
      } catch { /* best-effort */ }
    };
    rec.stop();
  }, [phase]); // eslint-disable-line

  // ── PiP drag / tap handlers ────────────────────────────────────────────────
  const handlePipPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    pipDragRef.current = { px: e.clientX, py: e.clientY, ex: rect.left, ey: rect.top, moved: false };
  };
  const handlePipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pipDragRef.current) return;
    const dx = e.clientX - pipDragRef.current.px;
    const dy = e.clientY - pipDragRef.current.py;
    if (!pipDragRef.current.moved && Math.abs(dx) + Math.abs(dy) > 6) pipDragRef.current.moved = true;
    if (!pipDragRef.current.moved) return;
    const W = 112, H = 176; // PiP size (w-28=112, h-44=176)
    setPipPos({
      x: Math.max(0, Math.min(window.innerWidth  - W, pipDragRef.current.ex + dx)),
      y: Math.max(0, Math.min(window.innerHeight - H, pipDragRef.current.ey + dy)),
    });
  };
  const handlePipPointerUp = () => {
    if (!pipDragRef.current?.moved) setSwapped(s => !s);
    pipDragRef.current = null;
  };

  // ── Active VIDEO call — full-screen layout (outside DashboardLayout) ───────
  if ((phase === "active" || phase === "reconnecting") && callTypeRef.current === "video") {
    return (
      <div className="fixed inset-0 bg-black overflow-hidden select-none">
        {/* Hidden audio — only used for audio mode; video uses the <video> element */}
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

        {/* Remote/main video — always muted; audio plays from the hidden <audio> element */}
        <video
          ref={swapped ? localVideoRef : remoteVideoRef}
          autoPlay playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {phase === "reconnecting" && (
          <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3 z-30">
            <Loader2 size={48} className="text-amber-400 animate-spin" />
            <p className="text-white text-lg font-semibold">Reconnecting…</p>
            <p className="text-zinc-400 text-sm">Do not close this page</p>
          </div>
        )}

        {/* Gradients */}
        <div className="absolute top-0 left-0 right-0 h-36 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10" />
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/85 to-transparent pointer-events-none z-10" />

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 px-5 pt-10 z-20 flex items-start justify-between">
          <div>
            <p className="text-white font-semibold text-lg">{otherName || "In Call"}</p>
            <p className="text-white/60 text-sm">{fmt(timer)}</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1.5 bg-red-500/30 border border-red-500/50 rounded-full px-3 py-1">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-300 text-xs font-semibold tracking-wide">REC</span>
            </div>
            {isRecording && (
              <div className="flex items-center gap-1.5 bg-purple-500/30 border border-purple-500/50 rounded-full px-3 py-1">
                <span className="text-purple-300 text-xs font-semibold tracking-wide">SCREEN</span>
              </div>
            )}
          </div>
        </div>

        {/* PiP — drag to move, tap to swap with main screen */}
        <div
          onPointerDown={handlePipPointerDown}
          onPointerMove={handlePipPointerMove}
          onPointerUp={handlePipPointerUp}
          onPointerCancel={handlePipPointerUp}
          className="absolute z-20 w-28 h-44 rounded-2xl overflow-hidden shadow-2xl bg-zinc-900 border-2 border-white/30 cursor-pointer touch-none select-none"
          style={pipPos ? { left: pipPos.x, top: pipPos.y } : { bottom: "11rem", right: "1rem" }}
        >
          <video
            ref={swapped ? remoteVideoRef : localVideoRef}
            autoPlay playsInline
            muted
            className={`w-full h-full object-cover ${!swapped ? "scale-x-[-1]" : ""}`}
          />
          {/* Swap hint */}
          <div className="absolute inset-0 flex items-end justify-center pb-1.5 pointer-events-none">
            <span className="text-white/50 text-[9px] font-medium bg-black/30 rounded px-1">tap to swap</span>
          </div>
        </div>

        {/* Controls */}
        <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-4 pb-10">
          <button
            onClick={switchCamera}
            className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30"
          >
            <RefreshCw size={20} className="text-white" />
          </button>
          <button
            onClick={toggleMute}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isMuted ? "bg-white text-black" : "bg-white/20 text-white hover:bg-white/30"}`}
          >
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button
            onClick={() => handleHangUp()}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center shadow-2xl"
          >
            <PhoneOff size={28} className="text-white" />
          </button>
          <button
            onClick={toggleVideo}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${isVideoOff ? "bg-white text-black" : "bg-white/20 text-white hover:bg-white/30"}`}
          >
            {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
          {supportsRecording && (
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isRecording ? "bg-red-500 hover:bg-red-600" : "bg-white/20 text-white hover:bg-white/30"
              }`}
            >
              {isRecording
                ? <StopCircle size={20} className="text-white" />
                : <ScreenShare size={20} className="text-white" />}
            </button>
          )}
          {phase === "reconnecting" && (
            <button
              onClick={() => handleHangUp("user_hangup_during_reconnect")}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 text-zinc-400 text-xs pb-2"
            >
              End Call
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── All other phases — inside DashboardLayout ─────────────────────────────
  return (
    <DashboardLayout>
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="max-w-lg space-y-5">
        <div>
          <h1 className="text-xl font-bold text-foreground">Live Call</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Make free audio or video calls using call codes</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {/* ── IDLE ── */}
        {phase === "idle" && (
          <div className="space-y-4">
            {personalCode && (
              <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
                <div className="text-center">
                  <p className="text-xs text-zinc-500 mb-1 uppercase tracking-wide">Your Call Code</p>
                  <div className="inline-flex items-center gap-2">
                    <span className="text-2xl font-bold tracking-[0.3em] font-mono text-foreground">{personalCode}</span>
                    <button onClick={copyCode} className="text-zinc-400 hover:text-blue-600 transition-colors">
                      {copied ? <CheckCircle2 size={18} className="text-green-500" /> : <Copy size={18} />}
                    </button>
                  </div>
                  <p className="text-xs text-zinc-500 mt-1">Share this so others can call you</p>
                </div>
              </Card>
            )}

            {isIOS && (
              <Card className="p-4 bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 mb-2">
                  📱 Screen recording on iPhone?
                </p>
                <ol className="text-xs text-amber-700 dark:text-amber-400 space-y-1 list-decimal list-inside">
                  <li>Open <strong>Control Centre</strong> → long-press the screen record button</li>
                  <li>Tap the <strong>Microphone</strong> icon so it turns red (on)</li>
                  <li>Tap <strong>Start Recording</strong>, then come back here and make your call</li>
                </ol>
                <p className="text-xs text-amber-600 dark:text-amber-500 mt-2">
                  Your voice and the other person's voice (from speaker) will both be captured.
                </p>
              </Card>
            )}

            <Card className="p-5">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <PhoneCall size={20} className="text-green-600" />Call Someone
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-zinc-500 block mb-1">Their call code</label>
                  <Input
                    placeholder="XXXXX"
                    value={targetCodeInput}
                    onChange={e => setTargetCodeInput(e.target.value.toUpperCase())}
                    className="tracking-[0.3em] font-mono uppercase text-center text-xl py-6"
                    maxLength={5}
                    onKeyDown={e => e.key === "Enter" && handleStartCall()}
                  />
                </div>

                {/* Call type selector */}
                <div>
                  <label className="text-sm text-zinc-500 block mb-2">Call type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setCallType("audio")}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium text-sm transition-colors ${
                        callType === "audio"
                          ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                          : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300"
                      }`}
                    >
                      <Mic size={18} />Audio
                    </button>
                    <button
                      onClick={() => setCallType("video")}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 font-medium text-sm transition-colors ${
                        callType === "video"
                          ? "border-purple-600 bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400"
                          : "border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:border-zinc-300"
                      }`}
                    >
                      <Video size={18} />Video
                    </button>
                  </div>
                </div>

                <Button
                  onClick={handleStartCall}
                  className={`w-full py-6 text-white ${callType === "video" ? "bg-purple-600 hover:bg-purple-700" : "bg-green-600 hover:bg-green-700"}`}
                  disabled={targetCodeInput.length < 5}
                >
                  {callType === "video"
                    ? <><Video size={20} className="mr-2" />Start Video Call</>
                    : <><PhoneCall size={20} className="mr-2" />Start Audio Call</>
                  }
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* ── PRE-CALL SETUP ── */}
        {(phase === "requesting-media" || phase === "creating-offer") && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">
              {phase === "requesting-media"
                ? `Requesting ${callType === "video" ? "camera & " : ""}microphone access…`
                : "Setting up call…"}
            </p>
            {phase === "requesting-media" && (
              <p className="text-sm text-zinc-400 mt-1">Please allow access when prompted</p>
            )}
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
              <p className="text-sm text-zinc-500 mt-1">{otherName || "The other person"} declined your call</p>
            </div>
            <Button onClick={resetToIdle} className="bg-blue-600 hover:bg-blue-700 text-white">Try Again</Button>
          </Card>
        )}

        {/* ── ENDED ── */}
        {phase === "ended" && (
          <Card className="p-6 text-center space-y-2">
            <div className="w-14 h-14 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <PhoneOff className="w-7 h-7 text-zinc-400" />
            </div>
            <p className="font-medium text-zinc-600 dark:text-zinc-400">Call ended</p>
            <p className="text-xs text-zinc-400">Returning to dial screen…</p>
          </Card>
        )}

        {/* ── DARK CALL INTERFACE — all in-call phases (audio) ── */}
        {(phase === "calling" || phase === "joining" || phase === "connecting" || phase === "reconnecting" || phase === "active") && (() => {
          const isActive = phase === "active";
          const isReconnecting = phase === "reconnecting";
          const statusLabel =
            phase === "calling"      ? "Ringing…"      :
            phase === "joining"      ? "Joining…"       :
            phase === "connecting"   ? "Connecting…"    :
            phase === "reconnecting" ? "Reconnecting…"  :
                                       "Live call";

          return (
            <div className={`rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl border ${isReconnecting ? "border-amber-600/40" : "border-slate-700"}`}>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center">
                    <User className="w-5 h-5 text-slate-300" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-base leading-tight">
                      {otherName || (phase === "calling" ? "…" : "Your Partner")}
                    </p>
                    <p className={`text-xs ${isReconnecting ? "text-amber-400" : "text-slate-400"}`}>{statusLabel}</p>
                  </div>
                </div>
                {isActive ? (
                  <div className="flex items-center gap-1.5 bg-green-600/20 border border-green-500/40 rounded-full px-3 py-1">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-green-400 text-xs font-semibold tracking-wide">LIVE</span>
                  </div>
                ) : (
                  <Loader2 size={20} className={`animate-spin ${isReconnecting ? "text-amber-400" : "text-slate-400"}`} />
                )}
              </div>

              {/* Body */}
              {isReconnecting ? (
                <div className="text-center py-6 px-5">
                  <p className="text-amber-300 text-sm">Network interruption detected</p>
                  <p className="text-slate-500 text-xs mt-1">Reconnecting automatically — do not close this page</p>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-5xl font-mono font-bold text-white tracking-wider">{fmt(timer)}</p>
                  {isRecording && (
                    <div className="inline-flex items-center gap-1.5 mt-3 bg-red-500/20 border border-red-500/40 rounded-full px-3 py-1">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-red-400 text-xs font-semibold tracking-wide">RECORDING</span>
                    </div>
                  )}
                </div>
              )}

              {/* Muted badge */}
              {isMuted && isActive && (
                <div className="text-center mb-4">
                  <span className="bg-red-500/20 border border-red-500/40 text-red-400 text-xs px-3 py-1 rounded-full">
                    Microphone muted
                  </span>
                </div>
              )}

              {/* Controls */}
              <div className="flex items-center justify-center gap-6 px-6 py-6 border-t border-slate-700/60">
                {isActive && (
                  <div className="flex flex-col items-center gap-1.5">
                    <button onClick={toggleMute}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? "bg-red-600 hover:bg-red-700" : "bg-slate-700 hover:bg-slate-600"}`}>
                      {isMuted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
                    </button>
                    <span className="text-slate-400 text-xs">{isMuted ? "Unmute" : "Mute"}</span>
                  </div>
                )}

                {isActive && supportsRecording && (
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                        isRecording ? "bg-red-500 hover:bg-red-600 animate-pulse" : "bg-slate-700 hover:bg-slate-600"
                      }`}
                    >
                      {isRecording
                        ? <StopCircle size={22} className="text-white" />
                        : <ScreenShare size={22} className="text-white" />}
                    </button>
                    <span className="text-slate-400 text-xs">{isRecording ? "Stop Rec" : "Record"}</span>
                  </div>
                )}

                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={() => {
                      if (phase === "calling" && callCodeRef.current) {
                        fetch(`/api/calls/${callCodeRef.current}`, {
                          method: "PATCH", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ type: "cancel" }),
                        }).catch(() => {});
                        cleanup(); setPhase("ended");
                      } else {
                        handleHangUp(isReconnecting ? "user_hangup_during_reconnect" : "user_hangup");
                      }
                    }}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg"
                  >
                    <PhoneOff size={26} className="text-white" />
                  </button>
                  <span className="text-slate-400 text-xs">{phase === "calling" ? "Cancel" : "Hang Up"}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </DashboardLayout>
  );
}

// ── Page wrapper ──────────────────────────────────────────────────────────────
export default function LiveCallPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 size={32} className="animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    }>
      <LiveCallInner />
    </Suspense>
  );
}
