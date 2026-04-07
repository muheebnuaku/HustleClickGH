"use client";

import { useCallNotification } from "@/app/contexts/CallNotificationContext";
import { Button } from "@/components/ui/button";
import { PhoneCall, X } from "lucide-react";

interface CallNotificationBannerProps {
  onRejoin?: (code: string) => void;
  onCallback?: (code: string) => void;
}

export function CallNotificationBanner({ onRejoin, onCallback }: CallNotificationBannerProps) {
  const { notification, clearNotification } = useCallNotification();

  if (!notification) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto">
      <div className="bg-blue-600 dark:bg-blue-700 rounded-lg shadow-lg p-4 border border-blue-500">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <PhoneCall size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm">
                {notification.type === "rejoin" ? "Rejoin Call" : "Call Back"}
              </p>
              <p className="text-blue-100 text-xs mt-0.5">
                {notification.type === "rejoin"
                  ? `${notification.otherName || "Your partner"} is waiting. Rejoin the call?`
                  : `Call back ${notification.otherName || "your contact"}?`}
              </p>
            </div>
          </div>
          <button
            onClick={clearNotification}
            className="text-white/70 hover:text-white hover:bg-white/10 rounded p-1 flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-2 mt-3">
          {notification.type === "rejoin" ? (
            <>
              <Button
                size="sm"
                onClick={() => {
                  onRejoin?.(notification.callCode);
                  clearNotification();
                }}
                className="flex-1 bg-white text-blue-600 hover:bg-blue-50 text-xs h-7"
              >
                <PhoneCall size={14} className="mr-1" />
                Rejoin
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={clearNotification}
                className="flex-1 border-white/30 text-white hover:bg-white/10 text-xs h-7"
              >
                Dismiss
              </Button>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => {
                  onCallback?.(notification.otherCode || notification.callCode);
                  clearNotification();
                }}
                className="flex-1 bg-white text-blue-600 hover:bg-blue-50 text-xs h-7"
              >
                <PhoneCall size={14} className="mr-1" />
                Call Back
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={clearNotification}
                className="flex-1 border-white/30 text-white hover:bg-white/10 text-xs h-7"
              >
                Dismiss
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
