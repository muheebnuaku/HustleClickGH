"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Phone, PhoneOff, User, Video } from "lucide-react";

interface IncomingCallData {
  callCode: string;
  callerName: string;
  callerImage: string | null;
  projectId: string | null;
  projectTitle: string | null;
  callType: string;
  createdAt: string;
}

export function IncomingCallListener() {
  const { status } = useSession();
  const router = useRouter();
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [audio] = useState(() => {
    if (typeof window !== "undefined") {
      const a = new Audio("/ringtone.mp3");
      a.loop = true;
      return a;
    }
    return null;
  });

  const checkForIncomingCalls = useCallback(async () => {
    if (status !== "authenticated") return;
    
    try {
      const res = await fetch("/api/calls", { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        if (data.incomingCall) {
          setIncomingCall(data.incomingCall);
          // Play ringtone
          audio?.play().catch(() => {});
        } else {
          setIncomingCall(null);
          audio?.pause();
          if (audio) audio.currentTime = 0;
        }
      }
    } catch (error) {
      console.error("Error checking incoming calls:", error);
    }
  }, [status, audio]);

  useEffect(() => {
    if (status !== "authenticated") return;

    // Check immediately
    checkForIncomingCalls();

    // Poll every 2 seconds
    const interval = setInterval(checkForIncomingCalls, 2000);

    return () => {
      clearInterval(interval);
      audio?.pause();
    };
  }, [status, checkForIncomingCalls, audio]);

  const handleAccept = async () => {
    if (!incomingCall) return;
    setIsAccepting(true);
    audio?.pause();

    try {
      // Accept the call
      const res = await fetch(`/api/calls/${incomingCall.callCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "accept" }),
      });

      if (res.ok) {
        const data = await res.json();
        const isVideo = incomingCall.callType === "video";
        if (data.projectId) {
          const callPath = isVideo ? "video-call" : "call";
          router.push(
            `/data-projects/${data.projectId}/${callPath}?join=${incomingCall.callCode}`
          );
        } else {
          router.push(`/data-projects/incoming?callCode=${incomingCall.callCode}`);
        }
      }
    } catch (error) {
      console.error("Error accepting call:", error);
    } finally {
      setIsAccepting(false);
      setIncomingCall(null);
    }
  };

  const handleDecline = async () => {
    if (!incomingCall) return;
    setIsDeclining(true);
    audio?.pause();

    try {
      await fetch(`/api/calls/${incomingCall.callCode}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "decline" }),
      });
    } catch (error) {
      console.error("Error declining call:", error);
    } finally {
      setIsDeclining(false);
      setIncomingCall(null);
    }
  };

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl animate-pulse-slow">
        <div className="text-center">
          {/* Caller Avatar */}
          <div className="mx-auto w-24 h-24 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4 ring-4 ring-green-400 animate-pulse overflow-hidden">
            {incomingCall.callerImage ? (
              <Image
                src={incomingCall.callerImage}
                alt={incomingCall.callerName}
                width={96}
                height={96}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              <User className="w-12 h-12 text-green-600 dark:text-green-400" />
            )}
          </div>

          {/* Caller Info */}
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
            Incoming {incomingCall.callType === "video" ? "Video " : ""}Call
          </h2>
          <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
            {incomingCall.callerName}
          </p>
          {incomingCall.projectTitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Project: {incomingCall.projectTitle}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-8 mt-6">
            {/* Decline Button */}
            <button
              onClick={handleDecline}
              disabled={isDeclining || isAccepting}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center transition-all transform hover:scale-105 disabled:opacity-50"
            >
              <PhoneOff className="w-8 h-8" />
            </button>

            {/* Accept Button */}
            <button
              onClick={handleAccept}
              disabled={isAccepting || isDeclining}
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center transition-all transform hover:scale-105 disabled:opacity-50 animate-bounce"
            >
              {incomingCall.callType === "video" ? (
                <Video className="w-8 h-8" />
              ) : (
                <Phone className="w-8 h-8" />
              )}
            </button>
          </div>

          {isAccepting && (
            <p className="text-sm text-green-600 dark:text-green-400 mt-4">
              Connecting...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
