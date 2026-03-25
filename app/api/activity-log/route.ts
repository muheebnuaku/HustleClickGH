export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { logActivity, getIp, LogType, LogSeverity } from "@/lib/activity-log";

/**
 * POST /api/activity-log
 * Called from the client (call page) to log events the server can't see,
 * such as WebRTC connection states, recording start/stop, and page-close during call.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    const body = await request.json();
    const { type, severity, metadata } = body as {
      type: LogType;
      severity?: LogSeverity;
      metadata?: Record<string, unknown>;
    };

    if (!type) {
      return NextResponse.json({ message: "type is required" }, { status: 400 });
    }

    // Allowlist of types the client may log (prevents abuse)
    const allowed: LogType[] = [
      "call_connecting",
      "call_connected",
      "call_reconnecting",
      "call_end",
      "call_error",
      "call_timeout",
      "page_close_during_call",
    ];

    if (!allowed.includes(type)) {
      return NextResponse.json({ message: "Log type not allowed from client" }, { status: 403 });
    }

    await logActivity({
      type,
      userId: session?.user?.id ?? null,
      userName: session?.user?.name ?? null,
      severity: severity ?? "info",
      metadata,
      ip: getIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Failed to log" }, { status: 500 });
  }
}
