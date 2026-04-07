"use client";

import { SessionProvider } from "next-auth/react";
import { CallNotificationProvider } from "@/app/contexts/CallNotificationContext";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CallNotificationProvider>
        {children}
      </CallNotificationProvider>
    </SessionProvider>
  );
}
