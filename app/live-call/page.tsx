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

  // ── WebRTC refs ────────────────────────────────────────────────────────────
  const pcRef           = useRef<RTCPeerConnection | null>(null);
  const localStreamRef  = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null); // stored so we can wire it after video UI mounts
  const remoteAudioRef  = useRef<HTMLAudioElement | null>(null);
  const localVideoRef   = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef  = useRef<HTMLVideoElement | null>(null);
  const callCodeRef    = useRef("");
  const isInitiatorRef = useRef(false);
  const callTypeRef    = useRef<CallType>("audio"); // stable ref for closures

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

  useEffect(() => { phaseRef.current = phase; }, [phase]);

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
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ───────────────────────────────────────────────────────────────
  const stopPoll         = () => { if (pollRef.current)       { clearInterval(pollRef.current);        pollRef.current      = null; } };
  const stopTimer        = () => { if (timerRef.current)      { clearInterval(timerRef.current);       timerRef.current     = null; } };
  const clearConnectTO   = () => { if (connectTORef.current)  { clearTimeout(connectTORef.current);    connectTORef.current  = null; } };
  const clearReconnectTO = () => { if (reconnectTORef.current){ clearTimeout(reconnectTORef.current);  reconnectTORef.current = null; } };

  const cleanup = useCallback(() => {
    stopPoll(); stopTimer(); clearConnectTO(); clearReconnectTO();
    alreadyAnswered.current = false;
    seenInitIce.current = 0;
    seenRecvIce.current = 0;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
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
  const getMedia = (type: CallType, facingMode: "user" | "environment" = "user") =>
    navigator.mediaDevices.getUserMedia(
      type === "video"
        ? { audio: true, video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } } }
        : { audio: true, video: false }
    );

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

      // Always store so the useEffect below can wire it up once the video UI mounts
      remoteStreamRef.current = remote;

      // Try to assign immediately (works for audio mode where the <audio> is always in DOM)
      if (callTypeRef.current === "video") {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remote;
          remoteVideoRef.current.play().catch(() => {});
        }
        // local video PiP — also try now; the useEffect handles the late-mount case
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          localVideoRef.current.play().catch(() => {});
        }
      } else if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remote;
        remoteAudioRef.current.play().catch(() => {});
      }

      setPhase("active");
      setTimer(0);
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
      clientLog("call_connected", { callCode: callCodeRef.current, callType: callTypeRef.current }, "success");
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") { clearReconnectTO(); clearConnectTO(); }
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
    if (callCodeRef.current) {
      fetch(`/api/calls/${callCodeRef.current}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "status", status: "completed", reason }),
      }).catch(() => {});
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
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
  };

  // ── Active VIDEO call — full-screen layout (outside DashboardLayout) ───────
  if ((phase === "active" || phase === "reconnecting") && callTypeRef.current === "video") {
    return (
      <div className="fixed inset-0 bg-black overflow-hidden select-none">
        {/* Hidden audio — only used for audio mode; video uses the <video> element */}
        <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

        {/* Remote video — full screen */}
        <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />

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
        <div className="absolute top-0 left-0 right-0 px-5 pt-10 z-20">
          <p className="text-white font-semibold text-lg">{otherName || "In Call"}</p>
          <p className="text-white/60 text-sm">{fmt(timer)}</p>
        </div>

        {/* Local PiP — bottom right */}
        <div className="absolute bottom-44 right-4 z-20 w-28 h-44 rounded-2xl overflow-hidden shadow-2xl bg-zinc-900 border border-white/20">
          {isVideoOff ? (
            <div className="w-full h-full flex items-center justify-center">
              <VideoOff size={24} className="text-zinc-500" />
            </div>
          ) : (
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
          )}
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

        {/* ── LOADING STATES ── */}
        {phase === "requesting-media" && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Requesting {callType === "video" ? "camera & " : ""}microphone access…</p>
            <p className="text-sm text-zinc-400 mt-1">Please allow access when prompted</p>
          </Card>
        )}
        {phase === "creating-offer" && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Setting up call…</p>
          </Card>
        )}
        {phase === "joining" && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Joining call…</p>
          </Card>
        )}
        {phase === "connecting" && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Connecting…</p>
            <p className="text-sm text-zinc-400 mt-1">Establishing peer-to-peer connection</p>
          </Card>
        )}

        {/* ── CALLING ── */}
        {phase === "calling" && (
          <Card className="p-6 text-center space-y-4">
            <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center animate-pulse ${callType === "video" ? "bg-purple-100 dark:bg-purple-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
              <User className={`w-10 h-10 ${callType === "video" ? "text-purple-600" : "text-green-600"}`} />
            </div>
            <div>
              <p className="font-medium text-lg">Calling {otherName || "…"}…</p>
              <p className="text-sm text-zinc-500 mt-1">Waiting for them to answer</p>
            </div>
            <div className="flex items-center justify-center gap-2">
              {[0, 0.2, 0.4].map((d, i) => (
                <div key={i} className={`w-2 h-2 rounded-full animate-ping ${callType === "video" ? "bg-purple-500" : "bg-green-500"}`}
                  style={{ animationDelay: `${d}s` }} />
              ))}
            </div>
            <Button
              variant="outline"
              className="border-red-200 text-red-500 hover:bg-red-50"
              onClick={() => {
                if (callCodeRef.current) {
                  fetch(`/api/calls/${callCodeRef.current}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "cancel" }),
                  }).catch(() => {});
                }
                cleanup(); setPhase("ended");
              }}
            >
              <PhoneOff size={18} className="mr-2" />Cancel Call
            </Button>
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

        {/* ── RECONNECTING (audio mode) ── */}
        {phase === "reconnecting" && callTypeRef.current === "audio" && (
          <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl border border-amber-600/40">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600">
                  <User className="w-5 h-5 text-slate-300" />
                </div>
                <div>
                  <p className="text-white font-semibold text-base">{otherName || "Your Partner"}</p>
                  <p className="text-amber-400 text-xs">Reconnecting…</p>
                </div>
              </div>
              <Loader2 size={20} className="animate-spin text-amber-400" />
            </div>
            <div className="text-center py-6 px-5">
              <p className="text-amber-300 text-sm">Network interruption detected</p>
              <p className="text-slate-500 text-xs mt-1">Reconnecting automatically — do not close this page</p>
            </div>
            <div className="px-5 pb-5 flex justify-center">
              <Button variant="outline" className="border-slate-600 text-slate-400 hover:bg-slate-800 text-sm"
                onClick={() => handleHangUp("user_hangup_during_reconnect")}>
                <PhoneOff size={16} className="mr-2" />End Call
              </Button>
            </div>
          </div>
        )}

        {/* ── ACTIVE (audio mode) ── */}
        {phase === "active" && callTypeRef.current === "audio" && (
          <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl border border-slate-700">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600">
                  <User className="w-5 h-5 text-slate-300" />
                </div>
                <div>
                  <p className="text-white font-semibold text-base">{otherName || "Your Partner"}</p>
                  <p className="text-slate-400 text-xs">Live call</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 bg-green-600/20 border border-green-500/40 rounded-full px-3 py-1">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-400 text-xs font-semibold tracking-wide">LIVE</span>
              </div>
            </div>
            <div className="text-center py-8">
              <p className="text-5xl font-mono font-bold text-white tracking-wider">{fmt(timer)}</p>
            </div>
            {isMuted && (
              <div className="text-center mb-4">
                <span className="bg-red-500/20 border border-red-500/40 text-red-400 text-xs px-3 py-1 rounded-full">Microphone muted</span>
              </div>
            )}
            <div className="flex items-center justify-center gap-8 px-6 py-6 border-t border-slate-700/60">
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={toggleMute}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${isMuted ? "bg-red-600 hover:bg-red-700" : "bg-slate-700 hover:bg-slate-600"}`}>
                  {isMuted ? <MicOff size={22} className="text-white" /> : <Mic size={22} className="text-white" />}
                </button>
                <span className="text-slate-400 text-xs">{isMuted ? "Unmute" : "Mute"}</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <button onClick={() => handleHangUp()}
                  className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg">
                  <PhoneOff size={26} className="text-white" />
                </button>
                <span className="text-slate-400 text-xs">Hang Up</span>
              </div>
            </div>
          </div>
        )}

        {/* ── ENDED ── */}
        {phase === "ended" && (
          <Card className="p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
              <PhoneOff className="w-8 h-8 text-zinc-400" />
            </div>
            <p className="font-medium text-zinc-600 dark:text-zinc-400">Call ended</p>
            <Button onClick={resetToIdle} className="bg-blue-600 hover:bg-blue-700 text-white">New Call</Button>
          </Card>
        )}
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
