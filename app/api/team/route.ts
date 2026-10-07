export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";
import { leaderScope, summarizeByCurrency } from "@/lib/field-teams";
import { currencyForCountry } from "@/lib/currency";

const PERSON = { id: true, userId: true, fullName: true, phone: true, leaderRole: true, leaderAlsoSupervisor: true, leaderCountry: true } as const;

// GET /api/team — my team position. Leaders get their team, money owed/received
// and what they still have to pay out; everyone gets their own leader and the
// payments they're due through that leader.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, leaderRole: true, leaderAlsoSupervisor: true, leaderCountry: true, leaderFeePercent: true, leaderCurrency: true, teamCode: true, teamLeaderId: true, teamJoinedAt: true },
  });
  if (!me) return NextResponse.json({ message: "Not found" }, { status: 404 });

  const [myLeader, myPayables] = await Promise.all([
    me.teamLeaderId ? prisma.user.findUnique({ where: { id: me.teamLeaderId }, select: PERSON }) : null,
    prisma.leaderPayable.findMany({ where: { contributorId: me.id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);

  // Projects that hide pay from contributors → no amount in their own list.
  const hiddenProjects = new Set((await prisma.dataProject.findMany({
    where: { id: { in: Array.from(new Set(myPayables.map((p) => p.projectId))) }, payoutMode: "via_leader", showReward: false },
    select: { id: true },
  })).map((p) => p.id));
  const myPayablesView = myPayables.map((p) => ({
    ...p,
    amount: hiddenProjects.has(p.projectId) ? null : p.amount,
    feeAmount: undefined, // the leader's fee is between us and the leader
    feePercent: undefined,
  }));

  let leader = null;
  if (me.leaderRole) {
    const scope = await leaderScope(me.id);
    const [members, payables, payouts] = await Promise.all([
      prisma.user.findMany({
        where: { teamLeaderId: { in: scope } },
        select: { ...PERSON, city: true, status: true, teamLeaderId: true, teamJoinedAt: true },
        orderBy: { fullName: "asc" },
      }),
      prisma.leaderPayable.findMany({ where: { leaderId: { in: scope } }, orderBy: { createdAt: "desc" }, take: 1000 }),
      prisma.leaderPayout.findMany({ where: { leaderId: { in: scope } }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const people = new Map(
      (await prisma.user.findMany({
        where: { id: { in: Array.from(new Set(payables.flatMap((p) => [p.contributorId, p.leaderId]).concat(scope))) } },
        select: { id: true, fullName: true, userId: true, phone: true },
      })).map((u) => [u.id, u]),
    );
    leader = {
      members,
      currency: me.leaderCurrency ?? currencyForCountry(me.leaderCountry),
      money: summarizeByCurrency(payables),
      payouts,
      payables: payables.map((p) => ({
        ...p,
        contributorName: people.get(p.contributorId)?.fullName ?? "—",
        contributorRef: people.get(p.contributorId)?.userId ?? "",
        contributorPhone: people.get(p.contributorId)?.phone ?? "",
        leaderName: people.get(p.leaderId)?.fullName ?? "—",
      })),
    };
  }

  return NextResponse.json({ me, myLeader, myPayables: myPayablesView, leader });
}

// POST /api/team — { action: join | acknowledge | mark_paid | confirm | dispute, ... }
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  if (session.user.status === "suspended") return NextResponse.json({ message: "Your account has been suspended." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const meId = session.user.id;
  const me = await prisma.user.findUnique({ where: { id: meId }, select: { id: true, fullName: true, leaderRole: true, teamLeaderId: true } });
  if (!me) return NextResponse.json({ message: "Not found" }, { status: 404 });
  const log = (metadata: Record<string, unknown>) =>
    logActivity({ type: "role_change", userId: meId, userName: me.fullName, metadata: { area: "field_teams", ...metadata }, ip: getIp(request) });

  switch (body.action) {
    // Join a leader's team with their invite code.
    case "join": {
      const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
      const leader = code ? await prisma.user.findUnique({ where: { teamCode: code }, select: { id: true, fullName: true, leaderRole: true, leaderCountry: true } }) : null;
      if (!leader?.leaderRole) return NextResponse.json({ message: "That team code isn't valid. Check it with your supervisor." }, { status: 404 });
      if (leader.id === me.id) return NextResponse.json({ message: "That's your own team code." }, { status: 400 });
      if (me.teamLeaderId) return NextResponse.json({ message: "You're already in a team. Contact support to move to another team." }, { status: 400 });
      // A supervisor can only report to a representative; a representative reports to HustleClickGH.
      if (me.leaderRole === "representative") return NextResponse.json({ message: "Country Representatives report to HustleClickGH directly." }, { status: 400 });
      if (me.leaderRole === "supervisor" && leader.leaderRole !== "representative") return NextResponse.json({ message: "As a supervisor you can only join a Country Representative's team." }, { status: 400 });
      await prisma.user.update({ where: { id: me.id }, data: { teamLeaderId: leader.id, teamJoinedAt: new Date() } });
      log({ action: "join", leaderId: leader.id, code });
      return NextResponse.json({ message: `You joined ${leader.fullName}'s team.` });
    }

    // Leader confirms they received a bulk payment.
    case "acknowledge": {
      if (!me.leaderRole) return NextResponse.json({ message: "Only team leaders can do this." }, { status: 403 });
      const r = await prisma.leaderPayout.updateMany({
        where: { id: String(body.payoutId || ""), leaderId: me.id, status: "sent" },
        data: { status: "acknowledged", acknowledgedAt: new Date() },
      });
      if (!r.count) return NextResponse.json({ message: "Payment not found." }, { status: 404 });
      log({ action: "acknowledge_payout", payoutId: body.payoutId });
      return NextResponse.json({ message: "Thanks — marked as received." });
    }

    // Leader marks contributors as paid (only money HustleClickGH has already sent).
    case "mark_paid": {
      if (!me.leaderRole) return NextResponse.json({ message: "Only team leaders can do this." }, { status: 403 });
      const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown): x is string => typeof x === "string").slice(0, 500) : [];
      if (!ids.length) return NextResponse.json({ message: "Select who you paid." }, { status: 400 });
      const scope = await leaderScope(me.id);
      const r = await prisma.leaderPayable.updateMany({
        where: { id: { in: ids }, leaderId: { in: scope }, status: "sent" },
        data: {
          status: "paid",
          paidAt: new Date(),
          paidReceiptUrl: typeof body.receiptUrl === "string" && body.receiptUrl.trim() ? body.receiptUrl.trim().slice(0, 500) : null,
        },
      });
      log({ action: "mark_paid", count: r.count });
      return NextResponse.json({ message: `Marked ${r.count} payment${r.count === 1 ? "" : "s"} as paid.`, count: r.count });
    }

    // Contributor confirms they received a payment from their leader.
    case "confirm": {
      const r = await prisma.leaderPayable.updateMany({
        where: { id: String(body.id || ""), contributorId: me.id, status: "paid" },
        data: { contributorConfirmedAt: new Date(), disputeNote: null, disputedAt: null },
      });
      if (!r.count) return NextResponse.json({ message: "Payment not found." }, { status: 404 });
      return NextResponse.json({ message: "Thanks for confirming." });
    }

    // Contributor reports a problem (not received / wrong amount). Admins see it.
    case "dispute": {
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
      if (!note) return NextResponse.json({ message: "Tell us what went wrong." }, { status: 400 });
      const r = await prisma.leaderPayable.updateMany({
        where: { id: String(body.id || ""), contributorId: me.id, status: { in: ["sent", "paid"] } },
        data: { disputeNote: note, disputedAt: new Date(), contributorConfirmedAt: null },
      });
      if (!r.count) return NextResponse.json({ message: "Payment not found." }, { status: 404 });
      logActivity({ type: "role_change", userId: meId, userName: me.fullName, severity: "warning", metadata: { area: "field_teams", action: "dispute", payableId: body.id, note }, ip: getIp(request) });
      return NextResponse.json({ message: "Reported. Our team will look into it." });
    }

    default:
      return NextResponse.json({ message: "Unknown action" }, { status: 400 });
  }
}
