export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";
import { initTransaction, isPaystackConfigured, chargeCurrency } from "@/lib/paystack";
import { getUsdToGhsRate, convertUsdToGhs } from "@/lib/fx";

// POST /api/org/wallet/fund { amount } — start a Paystack top-up.
// Creates a pending OrgTransaction (source of truth for orgId+amount) and returns
// the Paystack checkout URL to redirect the org to.
export async function POST(request: Request) {
  const { org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  if (!isPaystackConfigured()) {
    return NextResponse.json({ message: "Online funding isn't configured yet. Contact HustleClickGH to top up." }, { status: 503 });
  }

  const { amount } = await request.json().catch(() => ({}));
  const amountUsd = Math.round(Number(amount) * 100) / 100;
  if (!(amountUsd >= 1)) return NextResponse.json({ message: "Enter an amount of at least $1" }, { status: 400 });

  // The wallet is in $; Paystack charges in the account's currency (cedis by default).
  const currency = chargeCurrency();
  const rate = currency === "GHS" ? await getUsdToGhsRate() : 1;
  const charged = currency === "GHS" ? convertUsdToGhs(amountUsd, rate) : amountUsd;

  const reference = `org_${org.id.slice(0, 8)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  await prisma.orgTransaction.create({
    data: {
      orgId: org.id, type: "fund", amount: amountUsd, provider: "paystack", providerRef: reference, status: "pending",
      meta: JSON.stringify({ chargedCurrency: currency, chargedAmount: charged, rate }),
    },
  });

  const origin = new URL(request.url).origin;
  const init = await initTransaction({
    email: org.workEmail,
    amount: charged,
    currency,
    reference,
    callbackUrl: `${origin}/org/wallet?ref=${reference}`,
    metadata: { orgId: org.id, purpose: "wallet_topup", walletUsd: amountUsd, rate },
  });
  if (!init.ok || !init.authorizationUrl) {
    await prisma.orgTransaction.update({ where: { providerRef: reference }, data: { status: "failed" } }).catch(() => {});
    return NextResponse.json({ message: init.error || "Could not start payment" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, authorizationUrl: init.authorizationUrl, reference, charged, currency });
}
