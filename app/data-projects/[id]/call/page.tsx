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

// Fallback ICE servers when TURN credentials are unavailable.
const FALLBACK_ICE: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
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

  // ── Refs — WebRTC ─────────────────────────────────────────────────────────
  const pcRef            = useRef<RTCPeerConnection | null>(null);
  const localStreamRef   = useRef<MediaStream | null>(null);
  const remoteAudioRef   = useRef<HTMLAudioElement | null>(null);
  const callCodeRef      = useRef("");
  const isInitiatorRef   = useRef(false);

  // ── Refs — Signaling ──────────────────────────────────────────────────────
  const pollRef          = useRef<ReturnType<typeof setInterval> | null>(null);
  const alreadyAnswered  = useRef(false);
  const seenInitIce      = useRef(0);
  const seenRecvIce      = useRef(0);

  // ── Refs — Timers ─────────────────────────────────────────────────────────
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTORef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTORef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Refs — Guards ─────────────────────────────────────────────────────────
  const hasAutoJoined    = useRef(false);
  const phaseRef         = useRef<Phase>("idle");

  // Keep phaseRef in sync with phase state
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const stopPoll          = () => { if (pollRef.current)       { clearInterval(pollRef.current);  pollRef.current      = null; } };
  const stopTimer         = () => { if (timerRef.current)      { clearInterval(timerRef.current); timerRef.current     = null; } };
  const clearConnectTO    = () => { if (connectTORef.current)  { clearTimeout(connectTORef.current);   connectTORef.current  = null; } };
  const clearReconnectTO  = () => { if (reconnectTORef.current){ clearTimeout(reconnectTORef.current); reconnectTORef.current = null; } };

  // Full cleanup — safe to call from anywhere
  const cleanup = useCallback(() => {
    stopPoll();
    stopTimer();
    clearConnectTO();
    clearReconnectTO();

    alreadyAnswered.current = false;
    seenInitIce.current     = 0;
    seenRecvIce.current     = 0;

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => cleanup(), [cleanup]);

  // ── beforeunload — warn on page close/refresh during active call ───────────
  useEffect(() => {
    const activePhases: Phase[] = ["active", "reconnecting", "connecting", "calling"];
    if (!activePhases.includes(phase)) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You have an active call. Are you sure you want to leave?";

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

  // Auto-join when arriving from an incoming call notification.
  useEffect(() => {
    if (joinCode && status === "authenticated" && phase === "idle" && !hasAutoJoined.current) {
      hasAutoJoined.current = true;
      handleJoinCall(joinCode);
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

  // ── WebRTC peer connection ─────────────────────────────────────────────────
  const createPC = (
    iceServers: RTCIceServer[],
    onIce: (c: RTCIceCandidate) => void,
  ): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers });
    pcRef.current = pc;

    pc.onicecandidate = e => { if (e.candidate) onIce(e.candidate); };

    pc.ontrack = e => {
      const remote = e.streams[0];
      if (!remote) return;

      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remote;
        remoteAudioRef.current.play().catch(() => {});
      }

      // Call is active — start timer
      setPhase("active");
      setTimer(0);
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);

      clientLog("call_connected", { callCode: callCodeRef.current }, "success");
    };

    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;

      if (s === "connected") {
        clearReconnectTO();
        clearConnectTO();
        // Keep ICE poll running to detect remote hangup
      }

      if (s === "disconnected" || s === "failed") {
        clearReconnectTO();
        setPhase("reconnecting");

        clientLog("call_reconnecting", { callCode: callCodeRef.current, connectionState: s }, "warning");

        if (callCodeRef.current && !pollRef.current) {
          startIcePoll(callCodeRef.current, isInitiatorRef.current);
        }

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

        // Detect when the OTHER side ends the call server-side.
        if (data.status === "completed" || data.status === "missed") {
          stopPoll();
          clientLog("call_end", { callCode: code, reason: "remote_hangup", detectedBy: "ice_poll" }, "info");
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
      } catch { /* ignore transient network errors */ } finally { busy = false; }
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

  // ── Start call (caller side) ──────────────────────────────────────────────
  const handleStartCall = async () => {
    const targetCode = targetCodeInput.trim().toUpperCase();
    if (targetCode.length < 5) { setError("Enter a valid 5-character call code"); return; }
    setError("");

    try {
      setPhase("requesting-mic");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      setPhase("creating-offer");
      isInitiatorRef.current = true;

      const iceServers = await fetchIceServers();

      const pc = createPC(iceServers, async candidate => {
        if (!callCodeRef.current) return;
        await fetch(`/api/calls/${callCodeRef.current}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ice-initiator", candidate }),
        }).catch(() => {});
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
      setOtherName(data.targetUserName || "");
      setPhase("calling");
      startCallingPoll(data.callCode);

      // 5-minute ring timeout
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

  // ── Join call (receiver side) ─────────────────────────────────────────────
  const handleJoinCall = async (codeOverride?: string) => {
    const code = (codeOverride || targetCodeInput).trim().toUpperCase();
    if (code.length < 5) { setError("Enter a valid call code"); return; }
    setError("");

    try {
      setPhase("requesting-mic");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      setPhase("joining");
      isInitiatorRef.current = false;
      callCodeRef.current    = code;

      const res = await fetch(`/api/calls/${code}`);
      if (!res.ok) throw new Error("Call not found. Check the code and try again.");
      const session = await res.json();
      if (!session.offer)                        throw new Error("Call setup not ready — try again in a moment.");
      if (session.status === "active")           throw new Error("This call is already in progress.");
      if (session.status === "completed")        throw new Error("This call has ended.");
      if (session.status === "declined")         throw new Error("This call was declined.");

      if (session.initiatorName) setOtherName(session.initiatorName);

      const iceServers = await fetchIceServers();

      const pc = createPC(iceServers, async candidate => {
        await fetch(`/api/calls/${code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
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
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "answer", answer }),
      });

      setPhase("connecting");
      startIcePoll(code, false);

      clientLog("call_connecting", { callCode: code, role: "receiver" }, "info");

      // 60s to establish peer-to-peer
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

    if (callCodeRef.current) {
      fetch(`/api/calls/${callCodeRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "status", status: "completed", reason }),
      }).catch(() => {});
    }

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      {/* Hidden audio element — plays remote stream to speakers */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

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
                  onClick={handleStartCall}
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

        {/* ── CALLING (waiting for receiver) ── */}
        {phase === "calling" && (
          <Card className="p-6 text-center space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-pulse">
              <User className="w-10 h-10 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-lg">Calling {otherName || "…"}…</p>
              <p className="text-sm text-zinc-500 mt-1">Waiting for them to answer</p>
            </div>
            <div className="flex items-center justify-center gap-2">
              {[0, 0.2, 0.4].map((d, i) => (
                <div key={i} className="w-2 h-2 rounded-full bg-green-500 animate-ping"
                  style={{ animationDelay: `${d}s` }} />
              ))}
            </div>
            <Button
              variant="outline"
              className="border-red-200 text-red-500 hover:bg-red-50"
              onClick={() => {
                if (callCodeRef.current) {
                  fetch(`/api/calls/${callCodeRef.current}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: "cancel" }),
                  }).catch(() => {});
                }
                cleanup();
                setPhase("ended");
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

        {/* ── RECONNECTING ── */}
        {phase === "reconnecting" && (
          <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl border border-amber-600/40">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600">
                  <User className="w-5 h-5 text-slate-300" />
                </div>
                <div>
                  <p className="text-white font-semibold text-base leading-tight">{otherName || "Your Partner"}</p>
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
              <Button
                variant="outline"
                className="border-slate-600 text-slate-400 hover:bg-slate-800 text-sm"
                onClick={() => handleHangUp("user_hangup_during_reconnect")}
              >
                <PhoneOff size={16} className="mr-2" />End Call
              </Button>
            </div>
          </div>
        )}

        {/* ── ACTIVE ── */}
        {phase === "active" && (
          <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 shadow-2xl border border-slate-700">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center border-2 border-slate-600">
                  <User className="w-5 h-5 text-slate-300" />
                </div>
                <div>
                  <p className="text-white font-semibold text-base leading-tight">{otherName || "Your Partner"}</p>
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
                <span className="bg-red-500/20 border border-red-500/40 text-red-400 text-xs px-3 py-1 rounded-full">
                  Microphone muted
                </span>
              </div>
            )}

            <div className="flex items-center justify-center gap-8 px-6 py-6 border-t border-slate-700/60">
              <div className="flex flex-col items-center gap-1.5">
                <button
                  onClick={toggleMute}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                    isMuted ? "bg-red-600 hover:bg-red-700" : "bg-slate-700 hover:bg-slate-600"
                  }`}
                >
                  {isMuted
                    ? <MicOff size={22} className="text-white" />
                    : <Mic size={22} className="text-white" />}
                </button>
                <span className="text-slate-400 text-xs">{isMuted ? "Unmute" : "Mute"}</span>
              </div>

              <div className="flex flex-col items-center gap-1.5">
                <button
                  onClick={() => handleHangUp()}
                  className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-lg"
                >
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
            <Radio size={40} className="mx-auto text-zinc-400" />
            <p className="font-medium text-zinc-600">Call ended</p>
            <Button
              onClick={() => {
                setError("");
                setPhase("idle");
                setTargetCodeInput("");
                setOtherName("");
                setTimer(0);
                setIsMuted(false);
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              New Call
            </Button>
          </Card>
        )}
      </div>
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
