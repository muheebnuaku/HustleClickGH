import { prisma } from "@/lib/prisma";

export type LogType =
  | "register"
  | "login"
  | "login_failed"
  | "logout"
  | "call_start"
  | "call_connecting"
  | "call_connected"
  | "call_reconnecting"
  | "call_end"
  | "call_cancel"
  | "call_decline"
  | "call_error"
  | "call_timeout"
  | "submission"
  | "submission_approved"
  | "submission_rejected"
  | "withdrawal_request"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "page_close_during_call";

export type LogSeverity = "info" | "success" | "warning" | "error";

export interface LogOptions {
  type: LogType;
  userId?: string | null;
  userName?: string | null;
  severity?: LogSeverity;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

/**
 * Write an activity log entry to the database.
 * Fire-and-forget safe — errors are swallowed so they never break the caller.
 */
export async function logActivity(opts: LogOptions): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        type: opts.type,
        userId: opts.userId ?? null,
        userName: opts.userName ?? null,
        severity: opts.severity ?? "info",
        metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
        ip: opts.ip ?? null,
      },
    });
  } catch (err) {
    // Never let logging break the main flow
    console.error("[ActivityLog] Failed to write log:", err);
  }
}

/** Extract IP from a Request header (Vercel / Node) */
export function getIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}
