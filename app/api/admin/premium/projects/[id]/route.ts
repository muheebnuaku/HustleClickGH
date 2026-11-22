export const dynamic = "force-dynamic";
import { NextResponse, after } from "next/server";
import { adminUserId } from "@/lib/admin-guard";
import { announceOpenedProjects, openToEveryoneNow } from "@/lib/premium";

// Admin: end a project's Premium early-access window now and notify everyone else.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  if (!(await openToEveryoneNow(id))) return NextResponse.json({ message: "This project is already open to everyone." }, { status: 409 });
  after(() => announceOpenedProjects().catch((e) => console.error("[premium] announce failed:", e)));
  return NextResponse.json({ ok: true });
}
