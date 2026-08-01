export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail, passwordResetEmail } from "@/lib/email";
import { logActivity, getIp } from "@/lib/activity-log";

// POST /api/auth/forgot-password { email }
// Always responds the same way whether or not the email exists, so the endpoint
// can't be used to discover which emails are registered.
export async function POST(request: Request) {
  try {
    const { email } = await request.json().catch(() => ({}));
    const generic = NextResponse.json({
      ok: true,
      message: "If an account exists for that email, a reset link is on its way.",
    });

    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return generic;
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: "insensitive" } },
      select: { id: true, email: true, fullName: true, userId: true, status: true },
    });

    // Don't send to suspended accounts; still return the generic response.
    if (!user || user.status === "suspended") return generic;

    // Invalidate any outstanding tokens for this user, then mint a fresh one.
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const base = process.env.NEXTAUTH_URL || new URL(request.url).origin;
    const resetUrl = `${base}/reset-password?token=${rawToken}`;
    const mail = passwordResetEmail(user.fullName, resetUrl, user.userId);
    // Fire-and-forget; never reveal success/failure to the caller.
    sendEmail({ to: user.email, subject: mail.subject, html: mail.html });

    logActivity({
      type: "password_reset_requested",
      userId: user.id,
      userName: user.fullName,
      severity: "info",
      ip: getIp(request),
    });

    return generic;
  } catch (error) {
    console.error("Forgot-password error:", error);
    // Still generic — don't leak internal state.
    return NextResponse.json({
      ok: true,
      message: "If an account exists for that email, a reset link is on its way.",
    });
  }
}
