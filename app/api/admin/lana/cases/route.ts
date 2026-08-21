export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { resolveCase, proposeDeletion } from "@/lib/lana";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") return null;
  return session;
}

// GET: the case queue — open/auto-actioned cases plus a bit of recent history.
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const [openCases, recentResolved] = await Promise.all([
    prisma.lanaCase.findMany({ where: { status: { in: ["open", "auto_actioned"] } }, orderBy: { createdAt: "desc" } }),
    prisma.lanaCase.findMany({ where: { status: { notIn: ["open", "auto_actioned"] } }, orderBy: { resolvedAt: "desc" }, take: 15 }),
  ]);

  const allCases = [...openCases, ...recentResolved];
  const relatedIds = allCases.flatMap((c) => {
    try {
      return JSON.parse(c.relatedUserIds) as string[];
    } catch {
      return [];
    }
  });
  const allIds = [...new Set([...allCases.map((c) => c.subjectUserId), ...relatedIds])];
  const users = await prisma.user.findMany({
    where: { id: { in: allIds } },
    select: { id: true, fullName: true, userId: true, email: true, status: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));

  const attach = (c: (typeof openCases)[number]) => {
    let related: string[] = [];
    try {
      related = JSON.parse(c.relatedUserIds);
    } catch {
      // leave empty
    }
    return {
      ...c,
      subject: userMap.get(c.subjectUserId) ?? null,
      relatedUsers: related.map((id) => userMap.get(id)).filter((u): u is NonNullable<typeof u> => Boolean(u)),
    };
  };

  return NextResponse.json({
    openCases: openCases.map(attach),
    recentResolved: recentResolved.map(attach),
  });
}

// PATCH: resolve a case (approve / reject / dismiss), or ask Lana to draft a
// deletion proposal for a subject user (which itself becomes a new case).
export async function PATCH(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { caseId, decision, note, proposeDeleteForUserId, deleteReasoning } = body;

  try {
    if (proposeDeleteForUserId) {
      const kase = await proposeDeletion(proposeDeleteForUserId, deleteReasoning || "Requested by admin via Lana panel.");
      return NextResponse.json({ case: kase });
    }

    if (!caseId || !["approve", "reject", "dismiss"].includes(decision)) {
      return NextResponse.json({ message: "caseId and a valid decision are required" }, { status: 400 });
    }

    const updated = await resolveCase(caseId, decision, session.user.id, note);
    return NextResponse.json({ case: updated });
  } catch (error) {
    console.error("Lana case resolution error:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "An error occurred" }, { status: 500 });
  }
}
