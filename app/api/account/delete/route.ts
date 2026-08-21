export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getIp } from "@/lib/activity-log";
import { deleteUserAccount } from "@/lib/user-deletion";

// Data-subject erasure request: permanently deletes the logged-in user's account.
// Requires an explicit confirmation flag to prevent accidental deletion.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== "DELETE") {
      return NextResponse.json(
        { message: 'Please confirm deletion by sending confirm: "DELETE".' },
        { status: 400 }
      );
    }

    const deleted = await deleteUserAccount(session.user.id, {
      reason: "self_request",
      ip: getIp(request),
    });
    if (!deleted) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Your account and data have been deleted." });
  } catch (error) {
    console.error("Account delete error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
