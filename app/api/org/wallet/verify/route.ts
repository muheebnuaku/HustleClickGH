export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";
import { verifyTransaction } from "@/lib/paystack";
import { creditFundByRef } from "@/lib/org";

// POST /api/org/wallet/verify { reference } — confirm a top-up on return from Paystack.
// The webhook is the primary path; this makes the wallet update immediately when
// the org lands back on the page. Both are idempotent.
export async function POST(request: Request) {
  const { org } = await currentOrg();
  if (!org) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const { reference } = await request.json().catch(() => ({}));
  if (!reference) return NextResponse.json({ message: "reference required" }, { status: 400 });

  // The reference must belong to this org.
  const tx = await prisma.orgTransaction.findUnique({ where: { providerRef: String(reference) } });
  if (!tx || tx.orgId !== org.id) return NextResponse.json({ message: "Unknown reference" }, { status: 404 });
  if (tx.status === "success") {
    return NextResponse.json({ ok: true, credited: false, status: "already_credited" });
  }

  const v = await verifyTransaction(String(reference));
  if (!v.ok) return NextResponse.json({ message: v.error || "Verification failed" }, { status: 502 });
  if (!v.success) {
    await prisma.orgTransaction.updateMany({ where: { providerRef: String(reference), status: "pending" }, data: { status: "failed" } });
    return NextResponse.json({ ok: true, credited: false, status: "not_successful" });
  }

  const r = await creditFundByRef(String(reference));
  const updated = await prisma.organization.findUnique({ where: { id: org.id }, select: { walletBalance: true } });
  return NextResponse.json({ ok: true, credited: r.credited, walletBalance: updated?.walletBalance ?? org.walletBalance });
}
