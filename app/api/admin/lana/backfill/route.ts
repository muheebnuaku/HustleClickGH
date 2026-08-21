export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { runLanaBackfill } from "@/lib/lana";

// Manually triggered from the Lana panel — retroactively scans existing
// accounts and withdrawal history for the same patterns Lana catches live
// going forward. Not run automatically; an admin consciously kicks this off
// since it can generate (and, per admin's own configured policy, act on)
// many cases at once.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  try {
    const result = await runLanaBackfill();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Lana backfill error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
