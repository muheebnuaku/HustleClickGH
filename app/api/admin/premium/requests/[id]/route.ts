export const dynamic = "force-dynamic";
import { NextResponse, after } from "next/server";
import { adminUserId } from "@/lib/admin-guard";
import { reviewPremiumRequest } from "@/lib/premium";
import { premiumDecisionEmail, sendEmail } from "@/lib/email";
import { sendPushToAll } from "@/lib/push";
import { logActivity } from "@/lib/activity-log";

// Admin: approve (extends Premium) or reject a Mobile Money payment.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const adminId = await adminUserId();
  if (!adminId) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const { action, note } = await request.json().catch(() => ({}));
  if (action !== "approve" && action !== "reject") return NextResponse.json({ message: "Invalid action" }, { status: 400 });
  if (action === "reject" && !String(note ?? "").trim()) {
    return NextResponse.json({ message: "Say why it was rejected; the member sees this." }, { status: 400 });
  }
  try {
    const result = await reviewPremiumRequest(id, adminId, action === "approve", note);
    if (!result) return NextResponse.json({ message: "This payment was already reviewed." }, { status: 409 });
    const { user } = result;
    logActivity({
      type: action === "approve" ? "premium_approved" : "premium_rejected",
      userId: user.id,
      userName: user.fullName,
      severity: action === "approve" ? "success" : "warning",
      metadata: { by: adminId, requestId: id, reference: result.request.reference, premiumUntil: user.premiumUntil?.toISOString() ?? null },
    });
    after(async () => {
      const mail = premiumDecisionEmail(user.fullName, action === "approve", user.premiumUntil, note);
      await sendEmail({ to: user.email, subject: mail.subject, html: mail.html }).catch(() => {});
      await sendPushToAll(
        action === "approve"
          ? { title: "You're now Premium", body: "You'll get new projects first.", url: "/premium" }
          : { title: "Premium payment not confirmed", body: "Open Premium to see why.", url: "/premium" },
        [user.id],
      ).catch(() => {});
    });
    return NextResponse.json({ ok: true, premiumUntil: user.premiumUntil });
  } catch (error) {
    console.error("Premium review failed:", error);
    return NextResponse.json({ message: "Failed to review the payment" }, { status: 500 });
  }
}
