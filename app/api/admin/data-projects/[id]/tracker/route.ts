export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { buildTracker } from "@/lib/project-tracker";

// GET — the project's progress broken down by field team.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const t = await buildTracker(id);
  if (!t) return NextResponse.json({ message: "Project not found" }, { status: 404 });
  return NextResponse.json(t);
}
