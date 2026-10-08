export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";
import { generateTeamCode, summarizeByCurrency, type LeaderRole, leaderLabel } from "@/lib/field-teams";
import { normalizeCurrency, currencyForCountry } from "@/lib/currency";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user?.role === "admin" ? session : null;
}

const USER_SELECT = { id: true, userId: true, fullName: true, email: true, phone: true, country: true, region: true, city: true, status: true } as const;

// GET — the whole field-team structure, what each leader is owed, and bulk payouts.
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const leaders = await prisma.user.findMany({
    where: { leaderRole: { not: null } },
    select: { ...USER_SELECT, leaderRole: true, leaderAlsoSupervisor: true, leaderCountry: true, leaderFeePercent: true, leaderCurrency: true, teamCode: true, teamLeaderId: true },
    orderBy: [{ leaderCountry: "asc" }, { fullName: "asc" }],
  });
  const ids = leaders.map((l) => l.id);
  const [memberCounts, payables, payouts, credits] = await Promise.all([
    ids.length ? prisma.user.groupBy({ by: ["teamLeaderId"], where: { teamLeaderId: { in: ids } }, _count: { _all: true } }) : [],
    ids.length ? prisma.leaderPayable.findMany({ where: { leaderId: { in: ids } }, select: { leaderId: true, amount: true, feeAmount: true, status: true, disputedAt: true, currency: true } }) : [],
    prisma.leaderPayout.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    ids.length ? prisma.leaderPayout.groupBy({ by: ["leaderId", "currency"], where: { kind: "advance", leaderId: { in: ids } }, _sum: { creditRemaining: true } }) : [],
  ]);
  const creditOf = (id: string) => Object.fromEntries(
    credits.filter((c) => c.leaderId === id && (c._sum.creditRemaining ?? 0) > 0.0001).map((c) => [c.currency, Math.round((c._sum.creditRemaining ?? 0) * 100) / 100]),
  );
  const membersOf = new Map(memberCounts.map((m) => [m.teamLeaderId, m._count._all]));

  return NextResponse.json({
    leaders: leaders.map((l) => {
      const mine = payables.filter((p) => p.leaderId === l.id);
      return {
        ...l,
        memberCount: membersOf.get(l.id) ?? 0,
        currency: l.leaderCurrency ?? currencyForCountry(l.leaderCountry),
        money: summarizeByCurrency(mine),
        disputes: mine.filter((p) => p.disputedAt).length,
        advanceCredit: creditOf(l.id),
      };
    }),
    payouts: payouts.map((p) => ({ ...p, leaderName: leaders.find((l) => l.id === p.leaderId)?.fullName ?? "—" })),
  });
}

// POST — structure changes. Body: { action, ... }
export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");

  // Find a user by internal id, public user code (USER1234) or email.
  const findUser = async (ref: unknown) => {
    const r = typeof ref === "string" ? ref.trim() : "";
    if (!r) return null;
    return prisma.user.findFirst({
      where: { OR: [{ id: r }, { userId: r.toUpperCase() }, { email: r.toLowerCase() }] },
      select: { ...USER_SELECT, role: true, leaderRole: true, leaderCountry: true, teamLeaderId: true, teamCode: true },
    });
  };
  const fee = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
  };
  const log = (metadata: Record<string, unknown>) =>
    logActivity({ type: "role_change", userId: session.user.id, userName: session.user.name ?? null, metadata: { area: "field_teams", ...metadata }, ip: getIp(request) });

  switch (action) {
    // Give someone a leader position.
    case "appoint": {
      const user = await findUser(body.user);
      if (!user) return NextResponse.json({ message: "No user found with that ID or email." }, { status: 404 });
      if (user.role === "admin" || user.role === "organization") return NextResponse.json({ message: "Admin and client accounts can't lead field teams." }, { status: 400 });
      const role: LeaderRole = body.role === "representative" ? "representative" : "supervisor";
      const country = typeof body.country === "string" && body.country.trim() ? body.country.trim() : user.country;
      if (!country) return NextResponse.json({ message: "Set the country they'll run." }, { status: 400 });
      const pct = fee(body.feePercent);
      if (pct === null) return NextResponse.json({ message: "Fee must be between 0 and 100%." }, { status: 400 });
      let parentId: string | null = null;
      if (role === "supervisor" && body.parentId) {
        const parent = await prisma.user.findUnique({ where: { id: String(body.parentId) }, select: { id: true, leaderRole: true } });
        if (parent?.leaderRole !== "representative") return NextResponse.json({ message: "Supervisors can only report to a Country Representative." }, { status: 400 });
        parentId = parent.id;
      }
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          leaderRole: role,
          // Both positions: a representative who also leads contributors directly.
          leaderAlsoSupervisor: role === "representative" && body.alsoSupervisor === true,
          leaderCountry: country,
          leaderFeePercent: pct,
          leaderCurrency: body.currency ? normalizeCurrency(body.currency) : currencyForCountry(country),
          teamCode: user.teamCode ?? (await generateTeamCode(country)),
          // A representative reports to HustleClickGH directly.
          teamLeaderId: role === "representative" ? null : parentId ?? (user.teamLeaderId && user.teamLeaderId !== user.id ? user.teamLeaderId : null),
          teamJoinedAt: parentId ? new Date() : undefined,
        },
        select: { id: true, fullName: true, teamCode: true },
      });
      log({ action, target: user.id, targetName: user.fullName, role, country, feePercent: pct, parentId });
      return NextResponse.json({ message: `${updated.fullName} is now ${leaderLabel(role, role === "representative" && body.alsoSupervisor === true)} (team code ${updated.teamCode}).` });
    }

    // Change a leader's fee / country / representative.
    case "update": {
      const user = await findUser(body.userId);
      if (!user?.leaderRole) return NextResponse.json({ message: "Leader not found." }, { status: 404 });
      const data: Record<string, unknown> = {};
      if (body.feePercent !== undefined) {
        const pct = fee(body.feePercent);
        if (pct === null) return NextResponse.json({ message: "Fee must be between 0 and 100%." }, { status: 400 });
        data.leaderFeePercent = pct;
      }
      if (typeof body.country === "string" && body.country.trim()) data.leaderCountry = body.country.trim();
      if (body.currency) data.leaderCurrency = normalizeCurrency(body.currency);
      // Add or drop the Supervisor position on a representative.
      if (typeof body.alsoSupervisor === "boolean" && user.leaderRole === "representative") {
        if (!body.alsoSupervisor) {
          const direct = await prisma.user.count({ where: { teamLeaderId: user.id, leaderRole: null } });
          if (direct) return NextResponse.json({ message: `${user.fullName} leads ${direct} contributor${direct === 1 ? "" : "s"} directly. Move them to a supervisor first.` }, { status: 400 });
        }
        data.leaderAlsoSupervisor = body.alsoSupervisor;
      }
      if (user.leaderRole === "supervisor" && body.parentId !== undefined) {
        if (body.parentId) {
          const parent = await prisma.user.findUnique({ where: { id: String(body.parentId) }, select: { leaderRole: true } });
          if (parent?.leaderRole !== "representative") return NextResponse.json({ message: "Supervisors can only report to a Country Representative." }, { status: 400 });
        }
        data.teamLeaderId = body.parentId || null;
      }
      await prisma.user.update({ where: { id: user.id }, data });
      log({ action, target: user.id, targetName: user.fullName, ...data });
      return NextResponse.json({ message: "Saved." });
    }

    // Take away a leader position. Blocked while money is still owed/in transit
    // through them; their members move up to their representative (or no team).
    case "remove": {
      const user = await findUser(body.userId);
      if (!user?.leaderRole) return NextResponse.json({ message: "Leader not found." }, { status: 404 });
      const open = await prisma.leaderPayable.count({ where: { leaderId: user.id, status: { in: ["owed", "sent"] } } });
      if (open) return NextResponse.json({ message: `${user.fullName} still has ${open} contributor payment${open === 1 ? "" : "s"} owed or not yet paid out. Settle those first.` }, { status: 400 });
      const moveTo = user.leaderRole === "supervisor" ? user.teamLeaderId : null;
      await prisma.$transaction([
        prisma.user.updateMany({ where: { teamLeaderId: user.id }, data: { teamLeaderId: moveTo, teamJoinedAt: moveTo ? new Date() : null } }),
        prisma.user.update({ where: { id: user.id }, data: { leaderRole: null, leaderAlsoSupervisor: false, leaderFeePercent: null, teamCode: null, teamLeaderId: user.leaderRole === "representative" ? null : user.teamLeaderId } }),
      ]);
      log({ action, target: user.id, targetName: user.fullName, membersMovedTo: moveTo });
      // Projects assigned only to field teams stay closed to everyone else — tell the admin to reassign.
      const stillAssigned = await prisma.dataProject.findMany({
        where: { status: { in: ["active", "paused", "pending_review"] }, assignedLeaderIds: { contains: `"${user.id}"` } },
        select: { title: true },
      });
      const warn = stillAssigned.length
        ? ` Note: ${stillAssigned.map((p) => `"${p.title}"`).join(", ")} ${stillAssigned.length === 1 ? "is" : "are"} still assigned to their team — edit ${stillAssigned.length === 1 ? "it" : "them"} under Data Projects → Team & client to pick another team.`
        : "";
      return NextResponse.json({ message: `${user.fullName} no longer holds a leader position.${warn}` });
    }

    // Put a contributor in a leader's team (or move them).
    case "assign": {
      const user = await findUser(body.user);
      if (!user) return NextResponse.json({ message: "No user found with that ID or email." }, { status: 404 });
      if (user.leaderRole) return NextResponse.json({ message: "That person is a leader — set who they report to from their leader card instead." }, { status: 400 });
      const leader = await prisma.user.findUnique({ where: { id: String(body.leaderId || "") }, select: { id: true, fullName: true, leaderRole: true } });
      if (!leader?.leaderRole) return NextResponse.json({ message: "Pick a leader." }, { status: 400 });
      await prisma.user.update({ where: { id: user.id }, data: { teamLeaderId: leader.id, teamJoinedAt: new Date() } });
      log({ action, target: user.id, targetName: user.fullName, leaderId: leader.id });
      return NextResponse.json({ message: `${user.fullName} added to ${leader.fullName}'s team.` });
    }

    // Take a contributor out of their team.
    case "unassign": {
      const user = await findUser(body.userId);
      if (!user || user.leaderRole) return NextResponse.json({ message: "Member not found." }, { status: 404 });
      await prisma.user.update({ where: { id: user.id }, data: { teamLeaderId: null, teamJoinedAt: null } });
      log({ action, target: user.id, targetName: user.fullName });
      return NextResponse.json({ message: `${user.fullName} removed from the team.` });
    }

    default:
      return NextResponse.json({ message: "Unknown action" }, { status: 400 });
  }
}
