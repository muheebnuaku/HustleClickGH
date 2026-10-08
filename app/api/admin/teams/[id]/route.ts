export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";
import { leaderScope, round2, summarizeByCurrency } from "@/lib/field-teams";
import { formatMoney, normalizeCurrency, currencyForCountry } from "@/lib/currency";

// GET /api/admin/teams/[id] — a leader's members and the payments a bulk payout
// to them would cover (their own team + supervisors under them, for a rep).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const leader = await prisma.user.findUnique({
    where: { id },
    select: { id: true, fullName: true, userId: true, leaderRole: true, leaderAlsoSupervisor: true, leaderCountry: true, leaderFeePercent: true, leaderCurrency: true, teamCode: true, phone: true },
  });
  if (!leader?.leaderRole) return NextResponse.json({ message: "Leader not found" }, { status: 404 });

  const scope = await leaderScope(id);
  const [members, payables, advances] = await Promise.all([
    prisma.user.findMany({
      where: { teamLeaderId: id },
      select: { id: true, userId: true, fullName: true, phone: true, country: true, city: true, status: true, leaderRole: true, leaderAlsoSupervisor: true, teamJoinedAt: true },
      orderBy: { fullName: "asc" },
    }),
    prisma.leaderPayable.findMany({ where: { leaderId: { in: scope } }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.leaderPayout.findMany({ where: { kind: "advance", leaderId: { in: scope } }, orderBy: { createdAt: "desc" } }),
  ]);
  const names = new Map(
    (await prisma.user.findMany({ where: { id: { in: Array.from(new Set(payables.flatMap((p) => [p.contributorId, p.leaderId]))) } }, select: { id: true, fullName: true, userId: true } }))
      .map((u) => [u.id, u]),
  );

  return NextResponse.json({
    leader,
    members,
    currency: leader.leaderCurrency ?? currencyForCountry(leader.leaderCountry),
    money: summarizeByCurrency(payables),
    advances,
    advanceCredit: advances.reduce<Record<string, number>>((m, a) => {
      if (a.creditRemaining > 0.0001) m[a.currency] = round2((m[a.currency] ?? 0) + a.creditRemaining);
      return m;
    }, {}),
    payables: payables.map((p) => ({
      ...p,
      contributorName: names.get(p.contributorId)?.fullName ?? "—",
      contributorRef: names.get(p.contributorId)?.userId ?? "",
      leaderName: names.get(p.leaderId)?.fullName ?? "—",
    })),
  });
}

// POST /api/admin/teams/[id] — send a bulk payout covering everything currently
// owed in this leader's scope. Body: { method, reference?, receiptUrl?, localCurrency?, localAmount?, notes? }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const leader = await prisma.user.findUnique({ where: { id }, select: { id: true, fullName: true, leaderRole: true, leaderCurrency: true, leaderCountry: true } });
  if (!leader?.leaderRole) return NextResponse.json({ message: "Leader not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const leaderCurrency = leader.leaderCurrency ?? currencyForCountry(leader.leaderCountry);
  const method = typeof body.method === "string" && body.method.trim() ? body.method.trim().slice(0, 60) : "";
  if (!method) return NextResponse.json({ message: "How did you send the money? (e.g. Mobile Money, bank transfer)" }, { status: 400 });
  const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  // Money moves outside the platform (MoMo, crypto, bank); the receipt is the record.
  if (!str(body.receiptUrl, 500)) return NextResponse.json({ message: "Upload the payment receipt or screenshot first." }, { status: 400 });
  const localAmount = Number(body.localAmount);

  // ── Advance: money paid upfront. Future approved items in this leader's
  // scope use it up automatically (see coverWithAdvance), so nothing is paid twice.
  if (body.kind === "advance") {
    const amt = round2(Number(body.amount));
    if (!(amt > 0)) return NextResponse.json({ message: "Enter the advance amount in GH₵." }, { status: 400 });
    let projectId: string | null = null;
    let currency = body.currency ? normalizeCurrency(body.currency) : leaderCurrency;
    if (body.projectId) {
      const proj = await prisma.dataProject.findUnique({ where: { id: String(body.projectId) }, select: { id: true, currency: true } });
      if (!proj) return NextResponse.json({ message: "Project not found." }, { status: 404 });
      projectId = proj.id;
      currency = proj.currency; // an advance for a project is in that project's currency
    }
    const advance = await prisma.leaderPayout.create({
      data: {
        leaderId: id,
        kind: "advance",
        currency,
        projectId,
        creditRemaining: amt,
        amount: amt,
        feeAmount: 0,
        total: amt,
        itemCount: Math.max(0, Math.floor(Number(body.items) || 0)),
        method,
        reference: str(body.reference, 120),
        receiptUrl: str(body.receiptUrl, 500),
        localCurrency: str(body.localCurrency, 8)?.toUpperCase() ?? null,
        localAmount: Number.isFinite(localAmount) && localAmount > 0 ? round2(localAmount) : null,
        notes: str(body.notes, 1000),
        createdBy: session.user.id,
      },
    });
    logActivity({
      type: "withdrawal_approved",
      userId: session.user.id,
      userName: session.user.name ?? null,
      severity: "success",
      metadata: { area: "field_teams", kind: "advance", payoutId: advance.id, leaderId: id, leaderName: leader.fullName, total: amt, projectId, method },
      ip: getIp(request),
    });
    return NextResponse.json({ message: `Advance of ${formatMoney(amt, currency)} to ${leader.fullName} recorded. Approved items will be counted against it.`, payout: advance });
  }

  const scope = await leaderScope(id);
  // One bulk payment = one currency. Pay each currency separately if a team has several.
  const owedAll = await prisma.leaderPayable.findMany({ where: { leaderId: { in: scope }, status: "owed" }, select: { id: true, amount: true, feeAmount: true, currency: true, contributorId: true, leaderId: true } });
  const owedCurrencies = Array.from(new Set(owedAll.map((p) => p.currency)));
  const currency = body.currency ? normalizeCurrency(body.currency) : owedCurrencies.length === 1 ? owedCurrencies[0] : "";
  if (!currency) return NextResponse.json({ message: `This team is owed in ${owedCurrencies.join(" and ")} — record each currency as its own payment.` }, { status: 400 });
  const owed = owedAll.filter((p) => p.currency === currency);
  if (!owed.length) return NextResponse.json({ message: "Nothing is owed to this team right now." }, { status: 400 });
  const amount = round2(owed.reduce((s, p) => s + p.amount, 0));
  const feeAmount = round2(owed.reduce((s, p) => s + p.feeAmount, 0));

  const payout = await prisma.$transaction(async (tx) => {
    const created = await tx.leaderPayout.create({
      data: {
        leaderId: id,
        currency,
        amount,
        feeAmount,
        total: round2(amount + feeAmount),
        itemCount: owed.length,
        method,
        reference: str(body.reference, 120),
        receiptUrl: str(body.receiptUrl, 500),
        localCurrency: str(body.localCurrency, 8)?.toUpperCase() ?? null,
        localAmount: Number.isFinite(localAmount) && localAmount > 0 ? round2(localAmount) : null,
        notes: str(body.notes, 1000),
        createdBy: session.user.id,
      },
    });
    // Only flip rows still "owed" — guards against a double click sending twice.
    const moved = await tx.leaderPayable.updateMany({
      where: { id: { in: owed.map((p) => p.id) }, status: "owed" },
      data: { status: "sent", payoutId: created.id },
    });
    if (moved.count !== owed.length) throw new Error("CONFLICT");
    // A leader's own items are theirs once the bulk payment arrives — nothing to pass on.
    const own = owed.filter((p) => p.contributorId === p.leaderId).map((p) => p.id);
    if (own.length) await tx.leaderPayable.updateMany({ where: { id: { in: own } }, data: { status: "paid", paidAt: new Date() } });
    return created;
  }).catch((e) => (e instanceof Error && e.message === "CONFLICT" ? null : Promise.reject(e)));

  if (!payout) return NextResponse.json({ message: "These payments changed while you were sending — refresh and try again." }, { status: 409 });

  logActivity({
    type: "withdrawal_approved",
    userId: session.user.id,
    userName: session.user.name ?? null,
    severity: "success",
    metadata: { area: "field_teams", payoutId: payout.id, leaderId: id, leaderName: leader.fullName, total: payout.total, items: payout.itemCount, method },
    ip: getIp(request),
  });

  return NextResponse.json({
    message: `Recorded ${formatMoney(payout.total, currency)} sent to ${leader.fullName} for ${payout.itemCount} approved item${payout.itemCount === 1 ? "" : "s"}.`,
    payout,
  });
}
