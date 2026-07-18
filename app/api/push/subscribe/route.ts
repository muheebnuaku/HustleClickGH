export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

// Store (or refresh) this browser's push subscription for the logged-in user.
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const sub = await request.json();
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ message: "Invalid subscription" }, { status: 400 });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId: session.user.id,
        endpoint,
        p256dh,
        auth,
        userAgent: request.headers.get("user-agent"),
      },
      // Re-point an existing endpoint at the current user (shared devices)
      update: { userId: session.user.id, p256dh, auth },
    });

    return NextResponse.json({ message: "Subscribed" });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}

// Remove this browser's subscription.
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { endpoint } = await request.json().catch(() => ({ endpoint: null }));
  if (!endpoint) return NextResponse.json({ message: "endpoint required" }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: session.user.id } });
  return NextResponse.json({ message: "Unsubscribed" });
}
