export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logActivity, getIp } from "@/lib/activity-log";

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

// Look up a live (unused, unexpired) token by its raw value.
async function findLiveToken(rawToken: string) {
  if (!rawToken || typeof rawToken !== "string") return null;
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(rawToken) },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) return null;
  return record;
}

// GET /api/auth/reset-password?token=... — lets the reset page check validity
// before showing the form.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const record = await findLiveToken(token);
  return NextResponse.json({ valid: Boolean(record) });
}

// POST /api/auth/reset-password { token, password }
export async function POST(request: Request) {
  try {
    const { token, password } = await request.json().catch(() => ({}));

    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ message: "Password must be at least 8 characters." }, { status: 400 });
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return NextResponse.json(
        { message: "Password needs an uppercase letter, a number and a symbol." },
        { status: 400 }
      );
    }

    const record = await findLiveToken(token);
    if (!record) {
      return NextResponse.json({ message: "This reset link is invalid or has expired." }, { status: 400 });
    }

    const hashed = await hash(password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { password: hashed } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // Invalidate any other outstanding tokens for this user.
      prisma.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } }),
    ]);

    logActivity({
      type: "password_reset_completed",
      userId: record.userId,
      severity: "success",
      ip: getIp(request),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Reset-password error:", error);
    return NextResponse.json({ message: "Could not reset your password. Please try again." }, { status: 500 });
  }
}
