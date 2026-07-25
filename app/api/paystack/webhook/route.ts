export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { verifyTransaction, verifyWebhookSignature } from "@/lib/paystack";
import { creditFundByRef } from "@/lib/org";

// POST /api/paystack/webhook — Paystack calls this on charge.success.
// Signature-verified, then re-verified against the API, then credits idempotently.
// (This route is public — no session — so signature verification is mandatory.)
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
  }

  let event: { event?: string; data?: { reference?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Bad payload" }, { status: 400 });
  }

  if (event.event === "charge.success" && event.data?.reference) {
    // Re-verify against the API before trusting the amount/status, then credit.
    const v = await verifyTransaction(event.data.reference);
    if (v.ok && v.success) {
      await creditFundByRef(event.data.reference).catch(() => {});
    }
  }

  // Always 200 so Paystack doesn't retry indefinitely.
  return NextResponse.json({ received: true });
}
