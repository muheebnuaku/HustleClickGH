export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";
import { getCryptoWallets } from "@/lib/crypto-wallets";
import { logActivity, getIp } from "@/lib/activity-log";

// POST /api/org/wallet/claim { amount, walletId, txHash, proofUrl? }
// The client says "I've sent crypto". This records a PENDING top-up; nothing is
// added to the wallet until an admin checks the transaction and confirms it.
export async function POST(request: Request) {
  const { session, org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const b = await request.json().catch(() => ({}));
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!(amount >= 1)) return NextResponse.json({ message: "Enter the amount you sent (at least $1)." }, { status: 400 });
  const wallet = (await getCryptoWallets()).find((w) => w.id === b.walletId);
  if (!wallet) return NextResponse.json({ message: "Pick the wallet you sent to." }, { status: 400 });
  const txHash = String(b.txHash ?? "").trim();
  if (!/^[A-Za-z0-9]{16,128}$/.test(txHash.replace(/^0x/, ""))) {
    return NextResponse.json({ message: "Paste the transaction ID (hash) from your wallet or exchange." }, { status: 400 });
  }
  const proofUrl = typeof b.proofUrl === "string" && /^https?:\/\//.test(b.proofUrl) ? b.proofUrl : null;

  // One claim per transaction hash, ever.
  const ref = `crypto_${txHash.toLowerCase()}`;
  if (await prisma.orgTransaction.findUnique({ where: { providerRef: ref } })) {
    return NextResponse.json({ message: "That transaction ID was already submitted." }, { status: 409 });
  }
  await prisma.orgTransaction.create({
    data: {
      orgId: org.id, type: "fund", amount, provider: "crypto", providerRef: ref, status: "pending",
      meta: JSON.stringify({ asset: wallet.asset, network: wallet.network, address: wallet.address, txHash, proofUrl }),
    },
  });
  logActivity({
    type: "org_topup_claim", userId: session?.user?.id ?? null, userName: org.name, severity: "info",
    metadata: { orgId: org.id, amount, asset: wallet.asset, network: wallet.network, txHash },
    ip: getIp(request),
  });
  return NextResponse.json({ ok: true, message: "Thanks — we'll check the transaction and add it to your wallet shortly." });
}
