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
// Processes one bounded batch per call and reports where it got to — the
// panel calls this repeatedly with an increasing `offset` until `done`, so
// progress is visible and no single request risks a serverless timeout.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const offset = Number.isFinite(body?.offset) ? Number(body.offset) : 0;

  try {
    const result = await runLanaBackfillBatch(offset);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Lana backfill error:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "An error occurred" }, { status: 500 });
  }
}
