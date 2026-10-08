export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";
import { getCryptoWallets } from "@/lib/crypto-wallets";

// GET /api/org/wallet — balance, where to send crypto, and recent transactions.
export async function GET() {
  const { org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const [transactions, cryptoWallets] = await Promise.all([
    prisma.orgTransaction.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    getCryptoWallets(),
  ]);

  return NextResponse.json({
    walletBalance: org.walletBalance,
    cryptoWallets,
    transactions: transactions.map((t) => ({
      id: t.id, type: t.type, amount: t.amount, status: t.status,
      provider: t.provider, createdAt: t.createdAt,
      meta: t.meta ? JSON.parse(t.meta) : null,
    })),
  });
}
