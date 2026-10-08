export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { decideTopup } from "@/lib/org";
import { getCryptoWallets, saveCryptoWallets, explorerUrl } from "@/lib/crypto-wallets";
import { logActivity, getIp } from "@/lib/activity-log";

async function admin() {
  const s = await getServerSession(authOptions);
  return s?.user?.role === "admin" ? s : null;
}

// GET — crypto receiving wallets + client top-up claims (pending first).
export async function GET() {
  if (!(await admin())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const [wallets, txs] = await Promise.all([
    getCryptoWallets(),
    prisma.orgTransaction.findMany({ where: { type: "fund" }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  const orgs = new Map((await prisma.organization.findMany({ where: { id: { in: Array.from(new Set(txs.map((t) => t.orgId))) } }, select: { id: true, name: true, workEmail: true } })).map((o) => [o.id, o]));
  const topups = txs.map((t) => {
    let meta: Record<string, unknown> = {};
    try { meta = t.meta ? JSON.parse(t.meta) : {}; } catch { /* ignore */ }
    const txHash = typeof meta.txHash === "string" ? meta.txHash : null;
    return {
      id: t.id, amount: t.amount, status: t.status, provider: t.provider, createdAt: t.createdAt,
      org: orgs.get(t.orgId) ?? { id: t.orgId, name: "Organization", workEmail: "" },
      asset: meta.asset ?? null, network: meta.network ?? null, address: meta.address ?? null,
      txHash, proofUrl: meta.proofUrl ?? null, rejectReason: meta.rejectReason ?? null, claimedAmount: meta.claimedAmount ?? null,
      explorer: txHash && typeof meta.network === "string" ? explorerUrl(meta.network, txHash) : null,
    };
  }).sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending"));
  return NextResponse.json({ wallets, topups });
}

// POST — { action: "confirm", id, amount? } | { action: "reject", id, reason } | { action: "save_wallets", wallets }
export async function POST(request: Request) {
  const session = await admin();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const b = await request.json().catch(() => ({}));
  if (b.action === "save_wallets") {
    const err = await saveCryptoWallets(b.wallets);
    if (err) return NextResponse.json({ message: err }, { status: 400 });
    logActivity({ type: "settings_change", userId: session.user.id, userName: session.user.name ?? null, metadata: { area: "crypto_wallets", count: Array.isArray(b.wallets) ? b.wallets.length : 0 }, ip: getIp(request) });
    return NextResponse.json({ ok: true, message: "Crypto payment details saved." });
  }
  if (b.action === "confirm" || b.action === "reject") {
    const r = await decideTopup(String(b.id || ""), b.action, { amount: b.amount !== undefined && b.amount !== "" ? Number(b.amount) : undefined, reason: b.reason, adminId: session.user.id });
    if (r.ok) logActivity({ type: "org_topup_decision", userId: session.user.id, userName: session.user.name ?? null, metadata: { txId: b.id, decision: b.action, amount: b.amount ?? null, reason: b.reason ?? null }, ip: getIp(request) });
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  }
  return NextResponse.json({ message: "Unknown action" }, { status: 400 });
}
