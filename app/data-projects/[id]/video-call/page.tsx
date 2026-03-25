"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { uploadFile } from "@/lib/upload-file";
import {
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  RefreshCw,
  ChevronLeft,
  AlertCircle,
  Loader2,
  Volume2,
  VolumeX,
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
  | "gender-select"
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
  const fullVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const callingPollRef = useRef<NodeJS.Timeout | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callCodeRef = useRef("");
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const isInitiatorRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const remoteGainRef = useRef<GainNode | null>(null);

  // State
  const [phase, setPhase] = useState<Phase>("setup");
  const [targetCode, setTargetCode] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [remoteUserName, setRemoteUserName] = useState("");
  const [requiresGender, setRequiresGender] = useState(false);
  const [selectedGender, setSelectedGender] = useState<"male" | "female" | "">("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSpeaker, setIsSpeaker] = useState(false);
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
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
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

    // Pre-create remote stream so we can add tracks as they arrive.
    // Use e.track directly — e.streams[0] can be undefined on Safari/mobile.
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (fullVideoRef.current) fullVideoRef.current.srcObject = remoteStream;

    pc.ontrack = (e) => {
      if (!remoteStream.getTrackById(e.track.id)) remoteStream.addTrack(e.track);
      // iOS requires explicit play() after tracks are added
      if (fullVideoRef.current) {
        fullVideoRef.current.srcObject = remoteStream;
        fullVideoRef.current.play().catch(() => {});
      }
    };

    pc.onicecandidate = async ({ candidate }) => {
      if (!candidate) return;
      if (!callCodeRef.current) {
        pendingIceRef.current.push(candidate.toJSON());
        return;
      }
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
    isInitiatorRef.current = true;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    await ctx.resume();
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

      // Re-wire ICE handler now that we have a real callCode
      pc.onicecandidate = async ({ candidate }) => {
        if (!candidate) return;
        await fetch(`/api/calls/${callCode}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ice-initiator", candidate }),
        });
      };

      // Flush buffered ICE candidates
      for (const candidate of pendingIceRef.current) {
        await fetch(`/api/calls/${callCode}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "ice-initiator", candidate }),
        });
      }
      pendingIceRef.current = [];

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
      } catch { /* ignore transient errors */ }
    }, 2000);
  }

  // ── Join incoming call ────────────────────────────────────────────────────
  async function handleJoinCall(code: string) {
    setPhase("joining");
    isInitiatorRef.current = false;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    ctx.resume().catch(() => {});
    const resumeOnGesture = () => { ctx.resume().catch(() => {}); };
    document.addEventListener("touchstart", resumeOnGesture, { once: true });
    document.addEventListener("click", resumeOnGesture, { once: true });
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
      } catch { /* ignore */ }
    }, 1500);
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
  function startRecording() {
    const remote = remoteStreamRef.current;
    const local = localStreamRef.current;
    if (!remote) return;

    recordedChunksRef.current = [];

    const canvas = document.createElement("canvas");
    canvas.width = 720;
    canvas.height = 1280;
    const ctx2d = canvas.getContext("2d")!;
    const fullEl = fullVideoRef.current;
    const pipEl = localVideoRef.current;

    function drawFrame() {
      ctx2d.fillStyle = "#000";
      ctx2d.fillRect(0, 0, canvas.width, canvas.height);
      if (fullEl && fullEl.readyState >= 2) {
        ctx2d.drawImage(fullEl, 0, 0, canvas.width, canvas.height);
      }
      if (pipEl && pipEl.readyState >= 2) {
        const pw = Math.round(canvas.width * 0.28);
        const ph = Math.round(pw * (4 / 3));
        const px = canvas.width - pw - 16;
        const py = canvas.height - ph - 220;
        ctx2d.drawImage(pipEl, px, py, pw, ph);
      }
      animFrameRef.current = requestAnimationFrame(drawFrame);
    }
    drawFrame();

    const canvasStream = canvas.captureStream(30);

    const audioCtx = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = audioCtx;
    audioCtx.resume().catch(() => {});
    const audioDest = audioCtx.createMediaStreamDestination();

    const remoteGain = audioCtx.createGain();
    remoteGain.gain.value = 3.0;
    remoteGainRef.current = remoteGain;
    const remoteSource = audioCtx.createMediaStreamSource(remote);
    remoteSource.connect(remoteGain);
    remoteGain.connect(audioDest);
    remoteGain.connect(audioCtx.destination);

    if (local) {
      const localGain = audioCtx.createGain();
      localGain.gain.value = 1.5;
      audioCtx.createMediaStreamSource(local).connect(localGain);
      localGain.connect(audioDest);
    }

    if (fullVideoRef.current) fullVideoRef.current.muted = true;

    const combined = new MediaStream([
      ...audioDest.stream.getAudioTracks(),
      ...canvasStream.getVideoTracks(),
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
  }

  // ── Hang up ───────────────────────────────────────────────────────────────
  async function hangUp() {
    [timerRef, pollingRef, callingPollRef].forEach((r) => {
      if (r.current) clearInterval(r.current);
    });

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

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

    if (requiresGender) {
      setPhase("gender-select");
    } else {
      await uploadRecording();
    }
  }

  // ── Upload recording ──────────────────────────────────────────────────────
  async function uploadRecording(gender?: string) {
    setPhase("uploading");
    setUploadProgress(0);
    try {
      const type = recordedChunksRef.current[0]?.type || "video/webm";
      const blob = new Blob(recordedChunksRef.current, { type });
      if (blob.size === 0) { setPhase("ended"); return; }
      const ext = type.includes("mp4") ? "mp4" : "webm";
      const fileName = `video-call-${Date.now()}.${ext}`;

      const uploadData = await uploadFile(blob, projectId, fileName, setUploadProgress);

      const submitRes = await fetch(`/api/data-projects/${projectId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileUrl: uploadData.url,
          fileName: uploadData.fileName,
          fileType: uploadData.fileType,
          fileSizeMB: uploadData.fileSizeMB,
          language: null,
          promptUsed: "Live video call recording",
          consentGiven: true,
          gender: gender || null,
        }),
      });

      const submitData = await submitRes.json();
      if (!submitRes.ok && submitData.message !== "You have already submitted to this project") {
        throw new Error(submitData.message);
      }

      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
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
    } catch { /* ignore */ }
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

  async function toggleSpeaker() {
    const newSpeaker = !isSpeaker;
    setIsSpeaker(newSpeaker);
    if (remoteGainRef.current) {
      remoteGainRef.current.gain.value = newSpeaker ? 6.0 : 3.0;
    }
    const el = fullVideoRef.current as (HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (el?.setSinkId) {
      try {
        if (newSpeaker) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const speaker = devices.find(
            (d) => d.kind === "audiooutput" && /speaker|loud/i.test(d.label)
          );
          await el.setSinkId(speaker?.deviceId ?? "default");
        } else {
          await el.setSinkId("");
        }
      } catch { /* not supported */ }
    }
  }

  // ── Swap local ↔ remote video positions ───────────────────────────────────
  function handleSwap() {
    if (!fullVideoRef.current || !localVideoRef.current) return;
    const newSwapped = !isSwapped;
    if (newSwapped) {
      fullVideoRef.current.srcObject = localStreamRef.current;
      fullVideoRef.current.muted = true;
      localVideoRef.current.srcObject = remoteStreamRef.current;
      localVideoRef.current.muted = false;
      localVideoRef.current.play().catch(() => {});
    } else {
      fullVideoRef.current.srcObject = remoteStreamRef.current;
      fullVideoRef.current.muted = false;
      fullVideoRef.current.play().catch(() => {});
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.muted = true;
    }
    setIsSwapped(newSwapped);
  }

  // ── Mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`/api/data-projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        const p = data.project;
        if (p?.malesNeeded || p?.femalesNeeded) setRequiresGender(true);
      })
      .catch(() => {});

    if (!joinCode) initCamera();
    if (joinCode) handleJoinCall(joinCode);
    return () => cleanup();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply streams when phase changes to connected/recording + auto-start recording
  useEffect(() => {
    if (phase === "connected" || phase === "recording") {
      if (localVideoRef.current && localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      if (fullVideoRef.current && remoteStreamRef.current) {
        fullVideoRef.current.srcObject = remoteStreamRef.current;
        fullVideoRef.current.play().catch(() => {});
      }
    }
    if (phase === "connected") {
      startRecording();
    }
  }, [phase]);

  // ── Render ────────────────────────────────────────────────────────────────

  /* Setup — camera preview + enter call code */
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
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <input
              type="text"
              value={targetCode}
              onChange={(e) => setTargetCode(e.target.value.toUpperCase().slice(0, 5))}
              placeholder="XXXXX"
              maxLength={5}
              className="w-full bg-zinc-800 border border-zinc-700 text-white text-center text-2xl font-mono tracking-[0.4em] rounded-xl px-4 py-4 mb-4 focus:outline-none focus:border-blue-500 placeholder:text-zinc-600"
              onKeyDown={(e) => e.key === "Enter" && handleStartCall()}
            />

            <button
              onClick={handleStartCall}
              disabled={targetCode.trim().length < 5}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold rounded-xl py-4 transition-colors"
            >
              Start Video Call
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* Calling — waiting for remote to answer */
  if (phase === "calling") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6 p-4">
        <div className="w-20 h-20 rounded-full bg-blue-600/20 border-2 border-blue-500/50 flex items-center justify-center animate-pulse">
          <Video size={32} className="text-blue-400" />
        </div>
        <div className="text-center">
          <p className="text-white text-lg font-semibold">
            Calling {remoteUserName || "…"}
          </p>
          <p className="text-zinc-500 text-sm mt-1">Waiting for them to answer</p>
        </div>
        <div className="flex gap-2">
          {[0, 0.15, 0.3].map((d, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-blue-500 animate-ping"
              style={{ animationDelay: `${d}s` }}
            />
          ))}
        </div>
        <button
          onClick={async () => {
            if (callCodeRef.current) {
              await fetch(`/api/calls/${callCodeRef.current}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "cancel" }),
              }).catch(() => {});
            }
            cleanup();
            setPhase("setup");
          }}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-6 py-3 rounded-full font-semibold transition-colors"
        >
          <PhoneOff size={20} /> Cancel
        </button>
      </div>
    );
  }

  /* Joining / Connecting — setup in progress */
  if (phase === "joining" || phase === "connecting") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 p-4">
        <Loader2 size={40} className="text-blue-500 animate-spin" />
        <p className="text-white text-lg font-semibold">
          {phase === "joining" ? "Joining call…" : "Connecting…"}
        </p>
        <p className="text-zinc-500 text-sm">
          {phase === "joining"
            ? "Setting up video…"
            : "Establishing peer-to-peer connection"}
        </p>
      </div>
    );
  }

  /* Connected / Recording — full-screen video UI */
  if (phase === "connected" || phase === "recording") {
    return (
      <div className="min-h-screen bg-black relative overflow-hidden">
        {/* Full-screen remote video */}
        <video
          ref={fullVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Local PiP — bottom-right */}
        <div
          className="absolute bottom-32 right-4 w-28 h-36 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl cursor-pointer"
          onClick={handleSwap}
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
          />
        </div>

        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/60 to-transparent">
          <div>
            <p className="text-white font-semibold">
              {remoteUserName || "Connected"}
            </p>
            <p className="text-green-400 text-sm font-mono">{fmt(callDuration)}</p>
          </div>
          <div className="flex items-center gap-2">
            {isRecording && (
              <span className="flex items-center gap-1.5 bg-red-600/80 text-white text-xs px-3 py-1 rounded-full">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                REC
              </span>
            )}
          </div>
        </div>

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-around px-6 py-8 bg-gradient-to-t from-black/80 to-transparent">
          {/* Mute */}
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              isMuted ? "bg-red-600" : "bg-white/20 backdrop-blur"
            }`}
          >
            {isMuted ? (
              <MicOff size={22} className="text-white" />
            ) : (
              <Mic size={22} className="text-white" />
            )}
          </button>

          {/* Hang up */}
          <button
            onClick={hangUp}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg transition-colors"
          >
            <PhoneOff size={26} className="text-white" />
          </button>

          {/* Video toggle */}
          <button
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              isVideoOff ? "bg-red-600" : "bg-white/20 backdrop-blur"
            }`}
          >
            {isVideoOff ? (
              <VideoOff size={22} className="text-white" />
            ) : (
              <Video size={22} className="text-white" />
            )}
          </button>

          {/* Switch camera */}
          <button
            onClick={switchCamera}
            className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center transition-colors"
          >
            <RefreshCw size={22} className="text-white" />
          </button>

          {/* Speaker */}
          <button
            onClick={toggleSpeaker}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
              isSpeaker ? "bg-blue-600" : "bg-white/20 backdrop-blur"
            }`}
          >
            {isSpeaker ? (
              <Volume2 size={22} className="text-white" />
            ) : (
              <VolumeX size={22} className="text-white" />
            )}
          </button>
        </div>
      </div>
    );
  }

  /* Gender select — shown after hang-up when project requires it */
  if (phase === "gender-select") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 gap-6">
        <div className="bg-zinc-900 rounded-3xl p-8 w-full max-w-sm border border-zinc-800 text-center">
          <h2 className="text-white text-xl font-bold mb-2">One more step</h2>
          <p className="text-zinc-400 text-sm mb-6">
            Please select your gender before we upload the recording.
          </p>
          <div className="flex gap-4 mb-6">
            {(["male", "female"] as const).map((g) => (
              <button
                key={g}
                onClick={() => setSelectedGender(g)}
                className={`flex-1 py-3 rounded-xl font-semibold capitalize transition-colors ${
                  selectedGender === g
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <button
            onClick={() => uploadRecording(selectedGender)}
            disabled={!selectedGender}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold rounded-xl py-4 transition-colors"
          >
            Submit Recording
          </button>
        </div>
      </div>
    );
  }

  /* Uploading */
  if (phase === "uploading") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6 p-4">
        <Loader2 size={40} className="text-blue-500 animate-spin" />
        <p className="text-white text-lg font-semibold">Uploading recording…</p>
        <div className="w-64 bg-zinc-800 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
        <p className="text-zinc-500 text-sm">{uploadProgress}%</p>
      </div>
    );
  }

  /* Done */
  if (phase === "done") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6 p-4">
        <div className="w-20 h-20 rounded-full bg-green-600/20 border-2 border-green-500/50 flex items-center justify-center">
          <svg className="w-10 h-10 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-white text-xl font-bold">Recording Submitted!</p>
          <p className="text-zinc-400 text-sm mt-2">
            Your video call has been recorded and submitted successfully.
          </p>
        </div>
        <Link
          href={`/data-projects/${projectId}`}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
        >
          Back to Project
        </Link>
      </div>
    );
  }

  /* Ended */
  if (phase === "ended") {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6 p-4">
        <div className="w-20 h-20 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <PhoneOff size={36} className="text-zinc-400" />
        </div>
        <div className="text-center">
          <p className="text-white text-xl font-bold">Call ended</p>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>
        <div className="flex gap-3">
          <Link
            href={`/data-projects/${projectId}`}
            className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Back to Project
          </Link>
          <button
            onClick={() => {
              setError("");
              setCallDuration(0);
              setIsRecording(false);
              setPhase("setup");
            }}
            className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            New Call
          </button>
        </div>
      </div>
    );
  }

  /* Error */
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6 p-4">
      <div className="w-20 h-20 rounded-full bg-red-900/30 border border-red-700/50 flex items-center justify-center">
        <AlertCircle size={36} className="text-red-400" />
      </div>
      <div className="text-center">
        <p className="text-white text-xl font-bold">Something went wrong</p>
        <p className="text-zinc-400 text-sm mt-2">{error || "An unexpected error occurred."}</p>
      </div>
      <div className="flex gap-3">
        <Link
          href={`/data-projects/${projectId}`}
          className="bg-zinc-800 hover:bg-zinc-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Back to Project
        </Link>
        <button
          onClick={() => {
            setError("");
            setPhase("setup");
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}

// ── Public export — wraps inner component in Suspense ─────────────────────────
export default function VideoCallPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-blue-500" />
        </div>
      }
    >
      <VideoCallInner />
    </Suspense>
  );
}
