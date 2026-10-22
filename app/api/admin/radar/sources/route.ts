export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { DEFAULT_SOURCES, getRadarSources, saveRadarSources } from "@/lib/radar";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user && session.user.role === "admin";
}

// Admin: read the Radar source list (job boards, feeds, queries, keywords).
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  return NextResponse.json({ sources: await getRadarSources(), defaults: DEFAULT_SOURCES });
}

// Admin: replace the Radar source list. Invalid entries are dropped, not rejected.
export async function PUT(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    const body = await request.json();
    return NextResponse.json({ sources: await saveRadarSources(body?.sources) });
  } catch (error) {
    console.error("Radar sources save failed:", error);
    return NextResponse.json({ message: "Failed to save sources" }, { status: 500 });
  }
}
