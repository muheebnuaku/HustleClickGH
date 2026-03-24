"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  RefreshCw,
  Circle,
  Square,
  ChevronLeft,
  AlertCircle,
  Loader2,
} from "lucide-react";

// ── ICE servers ──────────────────────────────────────────────────────────────
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:cloudflare-stun.cloudflare.com:3478" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turns:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

// ── Phase ────────────────────────────────────────────────────────────────────
type Phase =
  | "setup"
  | "calling"
  | "joining"
  | "connecting"
  | "connected"
  | "recording"
  | "ended"
  | "uploading"
  | "done"
  | "error";

// ── Inner component ──────────────────────────────────────────────────────────
function VideoCallInner() {
  const params = useParams();
  const projectId = params.id as string;
  const searchParams = useSearchParams();
  const joinCode = searchParams.get("join");

  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const callingPollRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callCodeRef = useRef("");

  // State
  const [phase, setPhase] = useState<Phase>("setup");
  const [targetCode, setTargetCode] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [remoteUserName, setRemoteUserName] = useState("");
  const [error, setError] = useState("");

  // ── Camera init ───────────────────────────────────────────────────────────
  async function initCamera(facingMode: "user" | "environment" = "user") {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  function cleanup() {
    [pollingRef, callingPollRef, timerRef].forEach((r) => {
      if (r.current) clearInterval(r.current);
    });
    peerRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
  }

  // ── Create peer ───────────────────────────────────────────────────────────
  function createPeer(code: string, asInitiator: boolean): RTCPeerConnection {
    peerRef.current?.close();
    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerRef.current = pc;
    callCodeRef.current = code;

    // Add local tracks
    localStreamRef.current
      ?.getTracks()
      .forEach((t) => pc.addTrack(t, localStreamRef.current!));

    // Remote stream
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;

    pc.ontrack = (e) =>
      e.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));

    pc.onicecandidate = async ({ candidate }) => {
      if (!candidate || !callCodeRef.current) return;
      await fetch(`/api/calls/${callCodeRef.current}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: asInitiator ? "ice-initiator" : "ice-receiver",
          candidate,
        }),
      });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setPhase("connected");
        startTimer();
        if (pollingRef.current) clearInterval(pollingRef.current);
      } else if (
        ["failed", "disconnected", "closed"].includes(pc.connectionState)
      ) {
        setPhase((p) =>
          p === "connected" || p === "recording" ? "ended" : p
        );
      }
    };

    return pc;
  }

  // ── Outgoing call ─────────────────────────────────────────────────────────
  async function handleStartCall() {
    if (!targetCode.trim()) return;
    setError("");
    try {
      await initCamera(isFrontCamera ? "user" : "environment");
      const pc = createPeer("", true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      setPhase("calling");

      const res = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer: { type: offer.type, sdp: offer.sdp },
          targetUserCode: targetCode.trim().toUpperCase(),
          projectId,
          callType: "video",
        }),
      });

      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.message || "Could not start call");
      }

      const { callCode, targetUserName } = await res.json();
      callCodeRef.current = callCode;
      setRemoteUserName(targetUserName || "");

      // Re-wire ICE with real code now that we have it
      pc.onicecandidate = async ({ candidate }) => {
        if (!candidate) return;
        await fetch(`/api/calls/${callCode}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ice-initiator", candidate }),
        });
      };

      startCallingPoll(callCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start call");
      setPhase("setup");
    }
  }

  // ── Poll for answer ───────────────────────────────────────────────────────
  function startCallingPoll(code: string) {
    if (callingPollRef.current) clearInterval(callingPollRef.current);
    callingPollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/calls/${code}`);
        const data = await res.json();

        if (data.status === "declined" || data.status === "missed") {
          clearInterval(callingPollRef.current!);
          setPhase("ended");
          setError("Call was declined.");
          return;
        }

        if (
          data.answer &&
          peerRef.current &&
          peerRef.current.signalingState !== "stable"
        ) {
          clearInterval(callingPollRef.current!);
          const answer =
            typeof data.answer === "string"
              ? JSON.parse(data.answer)
              : data.answer;
          await peerRef.current.setRemoteDescription(
            new RTCSessionDescription(answer)
          );
          setPhase("connecting");
          startIcePolling(code, true);
        }
      } catch {}
    }, 2000);
  }

  // ── Join incoming call ────────────────────────────────────────────────────
  async function handleJoinCall(code: string) {
    setPhase("joining");
    try {
      await initCamera("user");
      const res = await fetch(`/api/calls/${code}`);
      if (!res.ok) throw new Error("Call not found");
      const data = await res.json();

      const offer =
        typeof data.offer === "string" ? JSON.parse(data.offer) : data.offer;
      const pc = createPeer(code, false);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      setPhase("connecting");
      await fetch(`/api/calls/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "answer",
          answer: { type: answer.type, sdp: answer.sdp },
        }),
      });

      startIcePolling(code, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join call");
      setPhase("error");
    }
  }

  // ── ICE polling ───────────────────────────────────────────────────────────
  function startIcePolling(code: string, asInitiator: boolean) {
    if (pollingRef.current) clearInterval(pollingRef.current);
    let processed = 0;
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/calls/${code}`);
        const data = await res.json();
        const raw = data[asInitiator ? "receiverIce" : "initiatorIce"];
        const candidates: RTCIceCandidateInit[] =
          typeof raw === "string" ? JSON.parse(raw) : raw || [];
        const pc = peerRef.current;
        if (!pc || pc.signalingState === "closed") return;
        for (let i = processed; i < candidates.length; i++) {
          await pc.addIceCandidate(new RTCIceCandidate(candidates[i]));
        }
        processed = candidates.length;
      } catch {}
    }, 3000);
  }

  // ── Timer ─────────────────────────────────────────────────────────────────
  function startTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(
      () => setCallDuration((d) => d + 1),
      1000
    );
  }

  function fmt(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60)
      .toString()
      .padStart(2, "0")}`;
  }

  // ── Recording ─────────────────────────────────────────────────────────────
  function toggleRecord() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      setPhase("connected");
    } else {
      startRecording();
    }
  }

  function startRecording() {
    const remote = remoteStreamRef.current;
    const local = localStreamRef.current;
    if (!remote) return;

    recordedChunksRef.current = [];

    // Mix both sides' audio; keep remote video
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    if (local) ctx.createMediaStreamSource(local).connect(dest);
    ctx.createMediaStreamSource(remote).connect(dest);

    const combined = new MediaStream([
      ...dest.stream.getAudioTracks(),
      ...remote.getVideoTracks(),
    ]);

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
      ? "video/webm;codecs=vp9,opus"
      : "video/webm";

    const rec = new MediaRecorder(combined, { mimeType });
    mediaRecorderRef.current = rec;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    rec.start(1000);
    setIsRecording(true);
    setPhase("recording");
  }

  // ── Hang up ───────────────────────────────────────────────────────────────
  async function hangUp() {
    [timerRef, pollingRef, callingPollRef].forEach((r) => {
      if (r.current) clearInterval(r.current);
    });

    if (mediaRecorderRef.current?.state !== "inactive") {
      await new Promise<void>((resolve) => {
        mediaRecorderRef.current!.onstop = () => resolve();
        mediaRecorderRef.current!.stop();
      });
    }
    setIsRecording(false);

    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());

    const code = callCodeRef.current;
    if (code) {
      await fetch(`/api/calls/${code}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "status", status: "completed" }),
      });
    }

    if (recordedChunksRef.current.length > 0) {
      await uploadRecording();
    } else {
      setPhase("ended");
    }
  }

  // ── Upload recording ──────────────────────────────────────────────────────
  async function uploadRecording() {
    setPhase("uploading");
    try {
      const type = recordedChunksRef.current[0]?.type || "video/webm";
      const blob = new Blob(recordedChunksRef.current, { type });
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const file = new File(
        [blob],
        `video-call-${Date.now()}.${ext}`,
        { type }
      );
      const form = new FormData();
      form.append("file", file);
      form.append("consentGiven", "true");
      await fetch(`/api/data-projects/${projectId}/submit`, {
        method: "POST",
        body: form,
      });
      setPhase("done");
    } catch {
      setError("Upload failed. Please try again.");
      setPhase("ended");
    }
  }

  // ── Camera controls ───────────────────────────────────────────────────────
  async function switchCamera() {
    const newFacing = isFrontCamera ? "environment" : "user";
    setIsFrontCamera(!isFrontCamera);
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];
      const sender = peerRef.current
        ?.getSenders()
        .find((s) => s.track?.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);
      if (localStreamRef.current) {
        const old = localStreamRef.current.getVideoTracks()[0];
        old?.stop();
        localStreamRef.current.removeTrack(old);
        localStreamRef.current.addTrack(newTrack);
      }
      if (localVideoRef.current)
        localVideoRef.current.srcObject = localStreamRef.current;
    } catch {}
  }

  function toggleMute() {
    localStreamRef.current
      ?.getAudioTracks()
      .forEach((t) => { t.enabled = isMuted; });
    setIsMuted((m) => !m);
  }

  function toggleVideo() {
    localStreamRef.current
      ?.getVideoTracks()
      .forEach((t) => { t.enabled = isVideoOff; });
    setIsVideoOff((v) => !v);
  }

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    initCamera();
    if (joinCode) handleJoinCall(joinCode);
    return () => cleanup();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ────────────────────────────────────────────────────────────────

  /* Setup — enter call code */
  if (phase === "setup") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col">
        <div className="p-4">
          <Link
            href={`/data-projects/${projectId}`}
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white text-sm transition-colors"
          >
            <ChevronLeft size={18} /> Back to Project
          </Link>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4 gap-8">
          {/* Camera preview */}
          <div className="relative w-64 h-48 rounded-2xl overflow-hidden bg-zinc-800 border border-zinc-700 shadow-2xl">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          </div>

          {/* Dial pad */}
          <div className="bg-zinc-900 rounded-3xl p-8 w-full max-w-sm border border-zinc-800">
            <h2 className="text-white text-xl font-bold text-center mb-1">
              Video Call
            </h2>
            <p className="text-zinc-500 text-sm text-center mb-6">
              Enter the other person&apos;s 5-character call code
            </p>

            {error && (
              <div className="bg-red-900/30 text-red-400 rounded-xl p-3 text-sm mb-4 flex items-center gap-2">
                <AlertCircle size={16} /> {error}
              </div>
            )}

            <input
              value={targetCode}
              onChange={(e) =>
                setTargetCode(e.target.value.toUpperCase().slice(0, 5))
              }
              placeholder="AB3K7"
              className="w-full bg-zinc-800 text-white text-center text-3xl font-mono tracking-[0.35em] rounded-xl p-4 mb-6 border border-zinc-700 focus:border-green-500 outline-none uppercase placeholder:text-zinc-600"
            />

            <button
              onClick={handleStartCall}
              disabled={targetCode.trim().length < 3}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-semibold py-4 rounded-2xl flex items-center justify-center gap-2 transition-colors"
            >
              <Video size={20} />
              Start Video Call
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* Calling — outgoing, waiting for answer */
  if (phase === "calling") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-8 p-4">
        <div className="relative w-28 h-28">
          <div className="absolute inset-0 rounded-full border-4 border-green-500/20 animate-ping" />
          <div className="absolute inset-2 rounded-full border-4 border-green-500/40 animate-ping animation-delay-150" />
          <div className="w-28 h-28 rounded-full bg-zinc-800 border-4 border-green-500 flex items-center justify-center relative z-10">
            <Video size={44} className="text-white" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-white text-2xl font-bold">
            {remoteUserName || targetCode}
          </p>
          <p className="text-zinc-400 text-sm mt-2">Calling…</p>
        </div>
        <button
          onClick={hangUp}
          className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-xl"
        >
          <PhoneOff size={28} className="text-white" />
        </button>
      </div>
    );
  }

  /* Joining / Connecting */
  if (phase === "joining" || phase === "connecting") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <Loader2 size={48} className="text-green-500 animate-spin" />
        <p className="text-white text-lg font-semibold">
          {phase === "joining" ? "Joining call…" : "Connecting…"}
        </p>
      </div>
    );
  }

  /* Ended */
  if (phase === "ended" || phase === "done") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-center gap-4">
        <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center">
          <PhoneOff size={36} className="text-zinc-500" />
        </div>
        <div>
          <p className="text-white text-xl font-bold">Call Ended</p>
          <p className="text-zinc-500 text-sm mt-1">{fmt(callDuration)}</p>
        </div>
        {phase === "done" && (
          <p className="text-green-400 text-sm">
            Recording submitted successfully!
          </p>
        )}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <Link
          href={`/data-projects/${projectId}`}
          className="mt-4 bg-zinc-800 text-white px-8 py-3 rounded-2xl hover:bg-zinc-700 transition-colors"
        >
          Back to Project
        </Link>
      </div>
    );
  }

  /* Uploading */
  if (phase === "uploading") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <Loader2 size={48} className="text-green-500 animate-spin" />
        <p className="text-white text-lg font-semibold">
          Uploading recording…
        </p>
        <p className="text-zinc-500 text-sm">Please don&apos;t close this page</p>
      </div>
    );
  }

  /* Error */
  if (phase === "error") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 text-center gap-4">
        <AlertCircle size={48} className="text-red-500" />
        <p className="text-white text-xl font-bold">Something went wrong</p>
        <p className="text-red-400 text-sm">{error}</p>
        <Link
          href={`/data-projects/${projectId}`}
          className="mt-4 bg-zinc-800 text-white px-8 py-3 rounded-2xl hover:bg-zinc-700 transition-colors"
        >
          Back to Project
        </Link>
      </div>
    );
  }

  // ── Active call (connected / recording) ───────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black overflow-hidden select-none">
      {/* ── Remote video (full screen) ── */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Top gradient */}
      <div className="absolute top-0 left-0 right-0 h-36 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10" />

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/85 to-transparent pointer-events-none z-10" />

      {/* ── Top bar ── */}
      <div className="absolute top-0 left-0 right-0 px-5 pt-10 flex items-center gap-3 z-20">
        <button onClick={hangUp} className="text-white/70 hover:text-white">
          <ChevronLeft size={28} />
        </button>
        <div>
          <p className="text-white font-semibold text-lg leading-tight">
            {remoteUserName || "In Call"}
          </p>
          <p className="text-white/60 text-sm flex items-center gap-1.5">
            {fmt(callDuration)}
            {isRecording && (
              <>
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse ml-1" />
                <span className="text-red-400 font-medium">REC</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* ── Local PiP — bottom-right, above controls ── */}
      <div
        className="absolute bottom-36 right-4 z-20 w-28 h-44 rounded-2xl overflow-hidden shadow-2xl bg-zinc-900"
        style={{ border: "2px solid rgba(255,255,255,0.2)" }}
      >
        {isVideoOff ? (
          <div className="w-full h-full flex items-center justify-center">
            <VideoOff size={24} className="text-zinc-500" />
          </div>
        ) : (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
        )}
      </div>

      {/* ── Control bar ── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-10 flex items-center justify-center gap-4">
        {/* Flip camera */}
        <button
          onClick={switchCamera}
          className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors"
          title="Switch camera"
        >
          <RefreshCw size={22} className="text-white" />
        </button>

        {/* Mute */}
        <button
          onClick={toggleMute}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
            isMuted
              ? "bg-white text-black"
              : "bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white"
          }`}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>

        {/* Hang up — larger, centre */}
        <button
          onClick={hangUp}
          className="w-[72px] h-[72px] rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-2xl"
          title="End call"
        >
          <PhoneOff size={30} className="text-white" />
        </button>

        {/* Camera toggle */}
        <button
          onClick={toggleVideo}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
            isVideoOff
              ? "bg-white text-black"
              : "bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white"
          }`}
          title={isVideoOff ? "Turn on camera" : "Turn off camera"}
        >
          {isVideoOff ? <VideoOff size={22} /> : <Video size={22} />}
        </button>

        {/* Record */}
        <button
          onClick={toggleRecord}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
            isRecording
              ? "bg-red-600 hover:bg-red-700"
              : "bg-white/20 backdrop-blur-sm hover:bg-white/30"
          }`}
          title={isRecording ? "Stop recording" : "Start recording"}
        >
          {isRecording ? (
            <Square size={18} className="text-white" fill="white" />
          ) : (
            <Circle size={20} className="text-white" />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Page wrapper with Suspense ────────────────────────────────────────────────
export default function VideoCallPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <Loader2 size={48} className="text-green-500 animate-spin" />
        </div>
      }
    >
      <VideoCallInner />
    </Suspense>
  );
}
