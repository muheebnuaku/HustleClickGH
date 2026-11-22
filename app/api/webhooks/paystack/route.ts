export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { isValidWebhookSignature } from "@/lib/paystack";
import { confirmPaystackPayment, notifyPremiumActivated } from "@/lib/premium";

// Paystack webhook (set in the Paystack dashboard: Settings → API Keys & Webhooks).
// Covers members who close the browser before returning. The signature is checked,
// and the payment is re-verified with Paystack rather than trusting this body.
export async function POST(request: Request) {
  const raw = await request.text();
  if (!isValidWebhookSignature(raw, request.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ message: "Invalid signature" }, { status: 401 });
  }
  let event: { event?: string; data?: { reference?: string; metadata?: { purpose?: string } | string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ message: "Bad payload" }, { status: 400 });
  }
  const meta = typeof event.data?.metadata === "string" ? JSON.parse(event.data.metadata || "{}") : event.data?.metadata;
  if (event.event === "charge.success" && meta?.purpose === "premium" && event.data?.reference) {
    try {
      const r = await confirmPaystackPayment(event.data.reference);
      if (r.state === "approved" && r.justApproved && r.user) await notifyPremiumActivated(r.user);
    } catch (error) {
      console.error("[paystack webhook] confirm failed:", error);
      return NextResponse.json({ message: "Retry later" }, { status: 500 }); // Paystack retries
    }
  }
  return NextResponse.json({ ok: true });
}
