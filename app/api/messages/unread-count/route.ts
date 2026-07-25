export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { unreadCountForUser } from "@/lib/messaging";

// GET /api/messages/unread-count — total unread messages, for the nav badge.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ count: 0 });
  }
  const count = await unreadCountForUser(session.user.id);
  return NextResponse.json({ count });
}
