export const dynamic = "force-dynamic";
import { NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { confirmPaystackPayment, notifyPremiumActivated } from "@/lib/premium";

// Called by /premium when Paystack sends the member back (?ref=...). Confirms with Paystack itself.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const reference = new URL(request.url).searchParams.get("reference") || "";
  if (!reference) return NextResponse.json({ message: "reference required" }, { status: 400 });
  try {
    const r = await confirmPaystackPayment(reference, session.user.id);
    if (r.state === "approved" && r.justApproved && r.user) {
      const user = r.user;
      after(() => notifyPremiumActivated(user));
    }
    return NextResponse.json({ state: r.state });
  } catch (error) {
    console.error("Premium confirm failed:", error);
    return NextResponse.json({ state: "pending", message: "We couldn't reach Paystack yet; we'll confirm automatically." });
  }
}
