export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";
import { isPaystackConfigured } from "@/lib/paystack";

// GET /api/org/wallet — balance + recent transactions.
export async function GET() {
  const { org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const transactions = await prisma.orgTransaction.findMany({
    where: { orgId: org.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    walletBalance: org.walletBalance,
    paystackConfigured: isPaystackConfigured(),
    transactions: transactions.map((t) => ({
      id: t.id, type: t.type, amount: t.amount, status: t.status,
      provider: t.provider, createdAt: t.createdAt,
      meta: t.meta ? JSON.parse(t.meta) : null,
    })),
  });
}
