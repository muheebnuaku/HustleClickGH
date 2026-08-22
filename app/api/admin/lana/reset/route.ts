export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { resetLanaState } from "@/lib/lana";

// Testing/demo utility — wipes all Lana cases + chat history and reactivates
// every account she suspended, so the backfill scan can be re-run from a
// clean slate. Not a routine action; see lib/lana.ts resetLanaState().
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  try {
    const result = await resetLanaState();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Lana reset error:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "An error occurred" }, { status: 500 });
  }
}
