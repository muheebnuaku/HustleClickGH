"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { uploadFile } from "@/lib/upload-file";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mic, MicOff, PhoneOff, PhoneCall, Copy, CheckCircle2,
  Loader2, AlertCircle, ArrowLeft, Radio, User
} from "lucide-react";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────
type Phase =
  | "idle"
  | "requesting-mic"
  | "creating-offer"
  | "calling"        // caller is waiting for receiver to accept
  | "joining"
  | "connecting"
  | "recording"
  | "ended"
  | "submitting"
  | "done"
  | "declined";      // receiver declined the call

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  // TURN relays — required for mobile carrier NAT (MTN/Vodafone/AirtelTigo)
  { urls: "turn:openrelay.metered.ca:80",    username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443",   username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" },
  { urls: "turn:openrelay.metered.ca:3478",  username: "openrelayproject", credential: "openrelayproject" },
];

// Best supported audio MIME type for MediaRecorder
function getSupportedMimeType(): string {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

export default function CallRecordingPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const joinCode = searchParams.get("join"); // For incoming call acceptance
  const { status } = useSession();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("idle");
  const [myCallCode, setMyCallCode] = useState("");
  const [targetCodeInput, setTargetCodeInput] = useState("");
  const [targetUserName, setTargetUserName] = useState("");
  const [timer, setTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");
  const [personalCallCode, setPersonalCallCode] = useState("");

  // ── WebRTC / recording refs ───────────────────────────────────────────────
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isInitiatorRef = useRef(false);
  const callCodeRef = useRef("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenInitIce = useRef(0);
  const seenRecvIce = useRef(0);
  const alreadySetAnswer = useRef(false);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const clearConnectTimeout = () => { if (connectTimeoutRef.current) { clearTimeout(connectTimeoutRef.current); connectTimeoutRef.current = null; } };

  const cleanup = useCallback(() => {
    stopPoll();
    stopTimer();
    clearConnectTimeout();
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── Fetch project title and personal call code ────────────────────────────
  useEffect(() => {
    fetch(`/api/data-projects/${projectId}`)
      .then((r) => r.json())
      .then((d) => setProjectTitle(d.project?.title || "Dataset Project"));
  }, [projectId]);

  // ── Fetch user's personal call code when authenticated ────────────────────
  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/profile")
        .then((r) => r.json())
        .then((d) => {
          if (d.user?.personalCallCode) {
            setPersonalCallCode(d.user.personalCallCode);
          }
        })
        .catch(() => {});
    }
  }, [status]);

  // ── Auto-join if redirected from incoming call acceptance ─────────────────
  useEffect(() => {
    if (joinCode && status === "authenticated" && phase === "idle") {
      handleJoinCall(joinCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinCode, status, phase]);

  // ── Get microphone ────────────────────────────────────────────────────────
  const getMic = async (): Promise<MediaStream> => {
    setPhase("requesting-mic");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    streamRef.current = stream;
    return stream;
  };

  // ── Create RTCPeerConnection ──────────────────────────────────────────────
  const createPC = (onIceCandidate: (c: RTCIceCandidate) => void): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    pc.onicecandidate = (e) => { if (e.candidate) onIceCandidate(e.candidate); };

    // Play the remote audio stream as it arrives
    pc.ontrack = (e) => {
      if (e.streams[0] && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0];
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        stopPoll(); // no more DB polling needed once peer-to-peer is up
        clearConnectTimeout();
        startRecording();
      }
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        clearConnectTimeout();
        setError("Connection lost. Please try again.");
        setPhase("ended");
        stopPoll();
      }
    };

    return pc;
  };

  // ── Start MediaRecorder ───────────────────────────────────────────────────
  const startRecording = () => {
    if (!streamRef.current) return;
    setPhase("recording");

    const mimeType = getSupportedMimeType();
    const recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.start(1000); // collect chunks every second

    // Start timer
    setTimer(0);
    timerRef.current = setInterval(() => setTimer((t) => t + 1), 1000);
  };

  // ── Poll for signaling updates ────────────────────────────────────────────
  const startPolling = (code: string, asInitiator: boolean) => {
    pollRef.current = setInterval(async () => {
      // If WebRTC is already up, polling is no longer needed
      if (!pollRef.current) return;

      try {
        const res = await fetch(`/api/calls/${code}`);
        if (!res.ok) return;
        const data = await res.json();

        const pc = pcRef.current;
        if (!pc) return;

        if (asInitiator) {
          // Initiator: wait for answer
          if (data.answer && !alreadySetAnswer.current && pc.signalingState === "have-local-offer") {
            alreadySetAnswer.current = true;
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            setPhase("connecting");
          }
          // Initiator: apply incoming ICE from receiver — only increment counter when applied
          if (pc.remoteDescription) {
            const newRecvIce: RTCIceCandidateInit[] = data.receiverIce.slice(seenRecvIce.current);
            for (const c of newRecvIce) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            seenRecvIce.current += newRecvIce.length;
          }
        } else {
          // Receiver: apply incoming ICE from initiator — only increment counter when applied
          if (pc.remoteDescription) {
            const newInitIce: RTCIceCandidateInit[] = data.initiatorIce.slice(seenInitIce.current);
            for (const c of newInitIce) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            seenInitIce.current += newInitIce.length;
          }
        }
      } catch { /* ignore transient errors */ }
    }, 4000); // 4s interval — much gentler on the DB connection pool
  };

  // ── START CALL (initiator/caller - dialer mode) ────────────────────────────
  const handleStartCall = async () => {
    const targetCode = targetCodeInput.trim().toUpperCase();
    if (!targetCode || targetCode.length < 5) {
      setError("Enter a valid 5-character call code");
      return;
    }

    setError("");
    try {
      const stream = await getMic();
      setPhase("creating-offer");
      isInitiatorRef.current = true;

      const pc = createPC(async (candidate) => {
        if (callCodeRef.current) {
          await fetch(`/api/calls/${callCodeRef.current}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "ice-initiator", candidate }),
          });
        }
      });

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Call the target user by their personal code
      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, offer, targetUserCode: targetCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      callCodeRef.current = data.callCode;
      setMyCallCode(data.callCode);
      setTargetUserName(data.targetUserName || "Unknown");
      setPhase("calling");
      startCallingPoll(data.callCode);

      // 60s timeout — if receiver never accepts, bail out
      connectTimeoutRef.current = setTimeout(() => {
        if (pcRef.current && pcRef.current.connectionState !== "connected") {
          setError("No answer. The person may be unavailable.");
          setPhase("ended");
          cleanup();
        }
      }, 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start call");
      setPhase("idle");
      cleanup();
    }
  };

  // ── Poll while calling (waiting for receiver to accept/decline) ───────────
  const startCallingPoll = (code: string) => {
    pollRef.current = setInterval(async () => {
      if (!pollRef.current) return;

      try {
        const res = await fetch(`/api/calls/${code}`);
        if (!res.ok) return;
        const data = await res.json();

        // Check if receiver declined
        if (data.status === "declined") {
          setPhase("declined");
          cleanup();
          return;
        }

        // Check if receiver accepted and provided answer
        if (data.status === "active" || data.answer) {
          // Switch to regular polling for ICE candidates
          stopPoll();
          if (pcRef.current && !alreadySetAnswer.current) {
            alreadySetAnswer.current = true;
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
            setPhase("connecting");
            startPolling(code, true);
          }
        }
      } catch { /* ignore */ }
    }, 2000);
  };

  // ── JOIN CALL (receiver - either from dialer input or incoming call) ───────
  const handleJoinCall = async (codeOverride?: string) => {
    const code = (codeOverride || targetCodeInput).trim().toUpperCase();
    if (!code || code.length < 5) { setError("Enter a valid call code"); return; }
    setError("");

    try {
      const stream = await getMic();
      setPhase("joining");
      isInitiatorRef.current = false;
      callCodeRef.current = code;

      // Fetch the session to get the offer
      const res = await fetch(`/api/calls/${code}`);
      if (!res.ok) { throw new Error("Call not found. Check the code and try again."); }
      const sessionData = await res.json();
      if (!sessionData.offer) throw new Error("Call setup incomplete — try again in a moment.");
      if (sessionData.status === "active") throw new Error("This call is already in progress.");
      if (sessionData.status === "completed") throw new Error("This call has ended.");
      if (sessionData.status === "declined") throw new Error("This call was declined.");

      const pc = createPC(async (candidate) => {
        await fetch(`/api/calls/${code}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ice-receiver", candidate }),
        });
      });

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      await pc.setRemoteDescription(new RTCSessionDescription(sessionData.offer));

      // Apply any ICE candidates already received from initiator
      const initIce: RTCIceCandidateInit[] = sessionData.initiatorIce;
      for (const c of initIce) await pc.addIceCandidate(new RTCIceCandidate(c));
      seenInitIce.current = initIce.length;

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await fetch(`/api/calls/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "answer", answer }),
      });

      setPhase("connecting");
      startPolling(code, false);

      // 30 s timeout — if peer-to-peer never reaches "connected", bail out
      connectTimeoutRef.current = setTimeout(() => {
        if (pcRef.current && pcRef.current.connectionState !== "connected") {
          setError("Could not connect to the caller. Check your network and try again.");
          setPhase("ended");
          cleanup();
        }
      }, 30_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join call");
      setPhase("idle");
      cleanup();
    }
  };

  // ── HANG UP ───────────────────────────────────────────────────────────────
  const handleHangUp = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = handleRecordingDone;
      recorderRef.current.stop();
    } else {
      setPhase("ended");
    }
    stopPoll();
    stopTimer();
    if (callCodeRef.current) {
      fetch(`/api/calls/${callCodeRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "status", status: "completed" }),
      }).catch(() => {});
    }
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
  };

  // ── AUTO SUBMIT AFTER RECORDING STOPS ────────────────────────────────────
  const handleRecordingDone = async () => {
    setPhase("submitting");
    const mimeType = recorderRef.current?.mimeType || "audio/webm";
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "webm";
    const blob = new Blob(chunksRef.current, { type: mimeType });

    if (blob.size < 1000) {
      setError("Recording was too short. Please try again.");
      setPhase("ended");
      return;
    }

    try {
      // Upload directly to Vercel Blob (prod) or local FS (dev)
      const recordingName = `call-recording-${Date.now()}.${ext}`;
      const uploadData = await uploadFile(blob, projectId, recordingName);

      // Submit
      const submitRes = await fetch(`/api/data-projects/${projectId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: uploadData.url,
          fileName: uploadData.fileName,
          fileType: uploadData.fileType,
          fileSizeMB: uploadData.fileSizeMB,
          language: null,
          promptUsed: "Live call recording",
          consentGiven: true,
        }),
      });
      const submitData = await submitRes.json();

      if (!submitRes.ok && submitData.message !== "You have already submitted to this project") {
        throw new Error(submitData.message);
      }

      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Your recording was not saved.");
      setPhase("ended");
    }
  };

  const toggleMute = () => {
    if (!streamRef.current) return;
    streamRef.current.getAudioTracks().forEach((t) => { t.enabled = !t.enabled; });
    setIsMuted((m) => !m);
  };

  const copyCode = () => {
    const codeToCopy = myCallCode || personalCallCode;
    navigator.clipboard.writeText(codeToCopy).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      {/* Hidden audio element to play the remote stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
      <div className="max-w-lg space-y-5">
        <Link href={`/data-projects/${projectId}`} className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-foreground">
          <ArrowLeft size={16} />Back to project
        </Link>

        <div>
          <h1 className="text-xl font-bold text-foreground">Live Call Recording</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{projectTitle}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm flex gap-2">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />{error}
          </div>
        )}

        {/* ── IDLE: entry screen (Dialer UI) ── */}
        {phase === "idle" && (
          <div className="space-y-4">
            {/* Personal Call Code Display */}
            {personalCallCode && (
              <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
                <div className="text-center">
                  <p className="text-xs text-zinc-500 mb-1 uppercase tracking-wide">Your Personal Call Code</p>
                  <div className="inline-flex items-center gap-2">
                    <span className="text-2xl font-bold tracking-[0.3em] font-mono text-foreground">
                      {personalCallCode}
                    </span>
                    <button onClick={copyCode} className="text-zinc-400 hover:text-blue-600 transition-colors">
                      {copied ? <CheckCircle2 size={18} className="text-green-500" /> : <Copy size={18} />}
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
                <li>When they accept, you&apos;ll be connected</li>
                <li>Recording starts automatically — click <strong>Hang Up</strong> to finish</li>
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
                    onChange={(e) => setTargetCodeInput(e.target.value.toUpperCase())}
                    className="tracking-[0.3em] font-mono uppercase text-center text-xl py-6"
                    maxLength={5}
                    onKeyDown={(e) => e.key === "Enter" && handleStartCall()}
                  />
                </div>
                <Button 
                  onClick={handleStartCall} 
                  className="w-full bg-green-600 hover:bg-green-700 text-white py-6"
                  disabled={targetCodeInput.length < 5}
                >
                  <PhoneCall size={20} className="mr-2" />
                  Call
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* ── REQUESTING MIC ── */}
        {phase === "requesting-mic" && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Requesting microphone access...</p>
            <p className="text-sm text-zinc-400 mt-1">Please allow microphone access when prompted</p>
          </Card>
        )}

        {/* ── CREATING OFFER ── */}
        {phase === "creating-offer" && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Setting up call...</p>
          </Card>
        )}

        {/* ── CALLING (waiting for receiver to accept) ── */}
        {phase === "calling" && (
          <Card className="p-6 text-center space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center animate-pulse">
              <User className="w-10 h-10 text-green-600" />
            </div>
            
            <div>
              <p className="font-medium text-lg">Calling {targetUserName}...</p>
              <p className="text-sm text-zinc-500 mt-1">Waiting for them to answer</p>
            </div>

            <div className="flex items-center justify-center gap-2 text-green-600">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
              <div className="w-2 h-2 rounded-full bg-green-500 animate-ping" style={{ animationDelay: "0.2s" }} />
              <div className="w-2 h-2 rounded-full bg-green-500 animate-ping" style={{ animationDelay: "0.4s" }} />
            </div>

            <Button
              onClick={() => {
                // Cancel the call
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
              variant="outline"
              className="border-red-200 text-red-500 hover:bg-red-50"
            >
              <PhoneOff size={18} className="mr-2" />
              Cancel Call
            </Button>
          </Card>
        )}

        {/* ── DECLINED (receiver declined the call) ── */}
        {phase === "declined" && (
          <Card className="p-6 text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <PhoneOff className="w-8 h-8 text-red-600" />
            </div>
            <div>
              <p className="font-medium text-lg">Call Declined</p>
              <p className="text-sm text-zinc-500 mt-1">{targetUserName} declined your call</p>
            </div>
            <Button onClick={() => { setError(""); setPhase("idle"); setTargetCodeInput(""); }} className="bg-blue-600 hover:bg-blue-700 text-white">
              Try Again
            </Button>
          </Card>
        )}

        {/* ── JOINING ── */}
        {(phase === "joining") && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Joining call...</p>
          </Card>
        )}

        {/* ── CONNECTING ── */}
        {phase === "connecting" && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Connecting...</p>
            <p className="text-sm text-zinc-400 mt-1">Establishing peer-to-peer connection</p>
          </Card>
        )}

        {/* ── RECORDING ── */}
        {phase === "recording" && (
          <Card className="p-6 space-y-5">
            {/* Recording indicator */}
            <div className="text-center">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                <span className="font-bold text-red-600 text-lg">RECORDING</span>
              </div>
              <p className="text-4xl font-mono font-bold text-foreground">{formatTime(timer)}</p>
              <p className="text-xs text-zinc-400 mt-1">Both sides are being recorded</p>
            </div>

            {/* Audio bars animation */}
            <div className="flex items-end justify-center gap-1 h-12">
              {[...Array(12)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 bg-blue-500 rounded-full opacity-80"
                  style={{
                    height: `${20 + Math.sin(Date.now() / 200 + i) * 15}%`,
                    animation: `pulse ${0.5 + i * 0.1}s ease-in-out infinite alternate`,
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
              ))}
            </div>

            {/* Your call code (in case partner needs it again) */}
            {myCallCode && (
              <div className="text-center text-xs text-zinc-400">
                Your code: <span className="font-mono font-medium text-zinc-600">{myCallCode}</span>
              </div>
            )}

            {/* Controls */}
            <div className="flex gap-3">
              <Button
                onClick={toggleMute}
                variant="outline"
                className={`flex-1 ${isMuted ? "border-red-200 text-red-600 bg-red-50" : ""}`}
              >
                {isMuted ? <MicOff size={18} className="mr-2" /> : <Mic size={18} className="mr-2" />}
                {isMuted ? "Unmute" : "Mute"}
              </Button>
              <Button
                onClick={handleHangUp}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                <PhoneOff size={18} className="mr-2" />Hang Up
              </Button>
            </div>
          </Card>
        )}

        {/* ── SUBMITTING ── */}
        {phase === "submitting" && (
          <Card className="p-8 text-center">
            <Loader2 size={32} className="animate-spin mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Uploading your recording...</p>
            <p className="text-sm text-zinc-400 mt-1">Please wait, do not close this page</p>
          </Card>
        )}

        {/* ── DONE ── */}
        {phase === "done" && (
          <Card className="p-6 text-center space-y-4">
            <CheckCircle2 size={48} className="text-green-500 mx-auto" />
            <div>
              <p className="text-lg font-bold text-foreground">Recording Submitted!</p>
              <p className="text-sm text-zinc-500 mt-1">
                Your recording has been submitted for review. You&apos;ll be paid once it&apos;s approved.
              </p>
            </div>
            <div className="flex gap-3">
              <Link href={`/data-projects/${projectId}`} className="flex-1">
                <Button variant="outline" className="w-full">View Project</Button>
              </Link>
              <Link href="/data-projects" className="flex-1">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white">Browse More</Button>
              </Link>
            </div>
          </Card>
        )}

        {/* ── ENDED (no recording / error) ── */}
        {phase === "ended" && (
          <Card className="p-6 text-center space-y-4">
            <Radio size={40} className="mx-auto text-zinc-400" />
            <p className="font-medium text-zinc-600">Call ended</p>
            <Button onClick={() => { setError(""); setPhase("idle"); setMyCallCode(""); setTargetCodeInput(""); setTimer(0); }} className="bg-blue-600 hover:bg-blue-700 text-white">
              Try Again
            </Button>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
