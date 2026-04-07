"use client";

import { createContext, useContext, useState, useCallback } from "react";

export interface CallNotification {
  type: "rejoin" | "callback";
  callCode: string;
  otherName?: string;
  otherCode?: string;
}

interface CallNotificationContextType {
  notification: CallNotification | null;
  setNotification: (notification: CallNotification | null) => void;
  clearNotification: () => void;
}

const CallNotificationContext = createContext<CallNotificationContextType | undefined>(undefined);

export function CallNotificationProvider({ children }: { children: React.ReactNode }) {
  const [notification, setNotification] = useState<CallNotification | null>(null);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  return (
    <CallNotificationContext.Provider value={{ notification, setNotification, clearNotification }}>
      {children}
    </CallNotificationContext.Provider>
  );
}

export function useCallNotification() {
  const context = useContext(CallNotificationContext);
  if (!context) {
    throw new Error("useCallNotification must be used within CallNotificationProvider");
  }
  return context;
}
