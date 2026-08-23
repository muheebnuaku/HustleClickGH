export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { bulkDeleteConfirmedDuplicates } from "@/lib/lana";

// Deletes every account Lana has already auto-suspended as a high-confidence
// duplicate (single or cluster), after re-verifying fresh that each one still
// has zero approved activity. Answers the real operational problem of a
// backfill/fraud wave producing more auto-suspended cases than is practical
// to review one delete-proposal click at a time — see lib/lana.ts
// bulkDeleteConfirmedDuplicates() for exactly what is and isn't in scope.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  try {
    const result = await bulkDeleteConfirmedDuplicates(session.user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Lana bulk cleanup error:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "An error occurred" }, { status: 500 });
  }
}
