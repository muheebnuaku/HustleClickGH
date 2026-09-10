export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { runLanaBackfillBatch } from "@/lib/lana";

// Manually triggered from the Lana panel — retroactively scans existing
// accounts and withdrawal history for the same patterns Lana catches live
// going forward. Not run automatically; an admin consciously kicks this off
// since it can generate (and, per admin's own configured policy, act on)
// many cases at once.
//
// Processes one bounded batch of similarity groups per call and reports how
// many are left — the panel calls this repeatedly until `done`, so progress
// is visible and no single request risks a serverless timeout. Already-cased
// groups are skipped on every call, so this is safe to just call again with
// no state to pass in.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  try {
    const result = await runLanaBackfillBatch();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Lana backfill error:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "An error occurred" }, { status: 500 });
  }
}
