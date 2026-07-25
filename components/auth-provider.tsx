"use client";

import { SessionProvider } from "next-auth/react";
import { CallNotificationProvider } from "@/app/contexts/CallNotificationContext";
import { MessagesProvider } from "@/app/contexts/MessagesContext";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CallNotificationProvider>
        <MessagesProvider>
          {children}
        </MessagesProvider>
      </CallNotificationProvider>
    </SessionProvider>
  );
}
