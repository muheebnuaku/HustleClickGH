"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Mic, MicOff, PhoneOff, PhoneCall, Copy, CheckCircle2,
  Loader2, AlertCircle, ArrowLeft, Radio
} from "lucide-react";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────
type Phase =
  | "idle"
  | "requesting-mic"
  | "creating-offer"
  | "waiting-for-partner"
  | "joining"
  | "connecting"
  | "recording"
  | "ended"
  | "submitting"
  | "done";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
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
  const projectId = params.id as string;
  const { data: session } = useSession();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("idle");
  const [myCallCode, setMyCallCode] = useState("");
  const [partnerCodeInput, setPartnerCodeInput] = useState("");
  const [timer, setTimer] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [projectTitle, setProjectTitle] = useState("");

  // ── WebRTC / recording refs ───────────────────────────────────────────────
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const isInitiatorRef = useRef(false);
  const callCodeRef = useRef("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const seenInitIce = useRef(0);
  const seenRecvIce = useRef(0);
  const alreadySetAnswer = useRef(false);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };

  const cleanup = useCallback(() => {
    stopPoll();
    stopTimer();
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  // ── Fetch project title ───────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/data-projects/${projectId}`)
      .then((r) => r.json())
      .then((d) => setProjectTitle(d.project?.title || "Dataset Project"));
  }, [projectId]);

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

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        startRecording();
      }
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
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
          // Initiator: apply incoming ICE from receiver
          const newRecvIce: RTCIceCandidateInit[] = data.receiverIce.slice(seenRecvIce.current);
          for (const c of newRecvIce) {
            if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          seenRecvIce.current += newRecvIce.length;
        } else {
          // Receiver: apply incoming ICE from initiator
          const newInitIce: RTCIceCandidateInit[] = data.initiatorIce.slice(seenInitIce.current);
          for (const c of newInitIce) {
            if (pc.remoteDescription) await pc.addIceCandidate(new RTCIceCandidate(c));
          }
          seenInitIce.current += newInitIce.length;
        }

        // Stop polling once recording or ended
        if (data.status === "completed" && phase !== "recording") {
          stopPoll();
        }
      } catch { /* ignore transient errors */ }
    }, 2500);
  };

  // ── START CALL (initiator) ────────────────────────────────────────────────
  const handleStartCall = async () => {
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

      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, offer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);

      callCodeRef.current = data.callCode;
      setMyCallCode(data.callCode);
      setPhase("waiting-for-partner");
      startPolling(data.callCode, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start call");
      setPhase("idle");
      cleanup();
    }
  };

  // ── JOIN CALL (receiver) ──────────────────────────────────────────────────
  const handleJoinCall = async () => {
    const code = partnerCodeInput.trim().toUpperCase();
    if (!code || code.length < 4) { setError("Enter a valid call code"); return; }
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
      if (!sessionData.offer) throw new Error("Waiting for caller — try again in a moment.");
      if (sessionData.status === "active") throw new Error("This call is already in progress.");
      if (sessionData.projectId !== projectId) throw new Error("This call code is for a different project.");

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
      // Upload
      const formData = new FormData();
      formData.append("file", blob, `call-recording-${Date.now()}.${ext}`);
      formData.append("projectId", projectId);

      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.message);

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
    navigator.clipboard.writeText(myCallCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
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

        {/* ── IDLE: entry screen ── */}
        {phase === "idle" && (
          <div className="space-y-4">
            <Card className="p-5 bg-blue-50 border-blue-100">
              <h2 className="font-semibold mb-2">How it works</h2>
              <ol className="text-sm text-zinc-600 space-y-1.5 list-decimal list-inside">
                <li>One person clicks <strong>Start Call</strong> and gets a code</li>
                <li>They share that code with their partner</li>
                <li>Partner enters the code and clicks <strong>Join Call</strong></li>
                <li>Both sides connect — audio records automatically</li>
                <li>Click <strong>Hang Up</strong> when done — recording submits itself</li>
              </ol>
            </Card>

            <Card className="p-5">
              <h2 className="font-semibold mb-4">Start a new call</h2>
              <Button onClick={handleStartCall} className="w-full bg-green-600 hover:bg-green-700 text-white">
                <PhoneCall size={18} className="mr-2" />Start Call — Get a Code
              </Button>
            </Card>

            <Card className="p-5">
              <h2 className="font-semibold mb-3">Join with a code</h2>
              <div className="flex gap-2">
                <Input
                  placeholder="Enter call code e.g. A3KP9XM2"
                  value={partnerCodeInput}
                  onChange={(e) => setPartnerCodeInput(e.target.value.toUpperCase())}
                  className="flex-1 tracking-widest font-mono uppercase"
                  maxLength={8}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinCall()}
                />
                <Button onClick={handleJoinCall} className="bg-blue-600 hover:bg-blue-700 text-white">
                  Join
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

        {/* ── WAITING FOR PARTNER ── */}
        {phase === "waiting-for-partner" && (
          <Card className="p-6 text-center space-y-4">
            <div className="flex items-center justify-center gap-2 text-green-600">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <span className="font-medium">Waiting for your partner...</span>
            </div>

            <div>
              <p className="text-xs text-zinc-400 mb-2 uppercase tracking-wide">Your call code</p>
              <div className="inline-flex items-center gap-3 bg-zinc-50 border-2 border-zinc-200 rounded-xl px-6 py-3">
                <span className="text-3xl font-bold tracking-[0.3em] font-mono text-foreground">
                  {myCallCode}
                </span>
                <button onClick={copyCode} className="text-zinc-400 hover:text-blue-600 transition-colors">
                  {copied ? <CheckCircle2 size={20} className="text-green-500" /> : <Copy size={20} />}
                </button>
              </div>
              <p className="text-xs text-zinc-400 mt-2">Share this code with your partner to connect</p>
            </div>

            <Button
              onClick={handleHangUp}
              variant="outline"
              className="border-red-200 text-red-500 hover:bg-red-50"
            >
              Cancel
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
            <Button onClick={() => { setError(""); setPhase("idle"); setMyCallCode(""); setPartnerCodeInput(""); setTimer(0); }} className="bg-blue-600 hover:bg-blue-700 text-white">
              Try Again
            </Button>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
