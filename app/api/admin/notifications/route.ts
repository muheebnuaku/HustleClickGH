export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { sendPushToAll, isPushConfigured } from "@/lib/push";
import { logActivity, getIp } from "@/lib/activity-log";

// How many devices are currently subscribed (shown in the admin UI)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  const [devices, users] = await Promise.all([
    prisma.pushSubscription.count(),
    prisma.pushSubscription.findMany({ select: { userId: true }, distinct: ["userId"] }),
  ]);

  return NextResponse.json({
    devices,
    users: users.length,
    configured: isPushConfigured(),
  });
}

// Broadcast a push notification to every subscribed device.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    if (!isPushConfigured()) {
      return NextResponse.json(
        { message: "Push is not configured — set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY." },
        { status: 400 }
      );
    }

    const { title, body, url } = await request.json();
    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ message: "Title and message are required" }, { status: 400 });
    }

    const result = await sendPushToAll({
      title: String(title).trim().slice(0, 100),
      body: String(body).trim().slice(0, 300),
      url: url?.trim() || "/dashboard",
      tag: `broadcast-${Date.now()}`,
    });

    logActivity({
      type: "notification_broadcast",
      userId: session.user.id,
      userName: session.user.name,
      severity: "info",
      metadata: { title, ...result },
      ip: getIp(request),
    });

    return NextResponse.json({
      message: `Sent to ${result.sent} device${result.sent === 1 ? "" : "s"}.` +
        (result.removed ? ` Removed ${result.removed} expired.` : "") +
        (result.failed ? ` ${result.failed} failed.` : ""),
      ...result,
    });
  } catch (error) {
    console.error("Broadcast error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
