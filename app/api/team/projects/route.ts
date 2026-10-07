export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { leaderScope } from "@/lib/field-teams";
import { buildTracker } from "@/lib/project-tracker";
import { parseStringList } from "@/lib/project-config";

// GET — projects a leader's team is working on (assigned to them, or where their
// people have submitted), each with their team's progress.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { leaderRole: true, teamLeaderId: true } });
  if (!me?.leaderRole) return NextResponse.json({ projects: [] });
  const scope = await leaderScope(session.user.id);

  const [assigned, touched] = await Promise.all([
    prisma.dataProject.findMany({ where: { assignedLeaderIds: { not: null }, status: { in: ["active", "paused", "completed"] } }, select: { id: true, assignedLeaderIds: true } }),
    prisma.dataSubmission.findMany({ where: { user: { teamLeaderId: { in: scope } } }, select: { projectId: true }, distinct: ["projectId"] }),
  ]);
  // A supervisor also sees projects assigned to their representative.
  const visibleTo = [...scope, ...(me.teamLeaderId ? [me.teamLeaderId] : [])];
  const ids = new Set([
    ...assigned.filter((p) => parseStringList(p.assignedLeaderIds).some((x) => visibleTo.includes(x))).map((p) => p.id),
    ...touched.map((t) => t.projectId),
  ]);

  const projects = [];
  for (const id of ids) {
    const t = await buildTracker(id, scope);
    if (t) projects.push({ project: t.project, total: t.total, rows: t.rows });
  }
  projects.sort((a, b) => (a.project.status === "active" ? -1 : 1) - (b.project.status === "active" ? -1 : 1));
  return NextResponse.json({ projects });
}
