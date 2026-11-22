export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminUserId } from "@/lib/admin-guard";
import { extendedUntil, getPremiumSettings } from "@/lib/premium";
import { logActivity } from "@/lib/activity-log";

// Admin: grant Premium by hand (e.g. paid in cash) or end it.
export async function POST(request: Request) {
  const adminId = await adminUserId();
  if (!adminId) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { userId, action } = await request.json().catch(() => ({}));
  if (!userId || (action !== "grant" && action !== "revoke")) return NextResponse.json({ message: "userId and a valid action are required" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true, premiumUntil: true } });
  if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

  const premiumUntil = action === "grant" ? extendedUntil(user.premiumUntil, (await getPremiumSettings()).durationDays) : null;
  await prisma.user.update({ where: { id: user.id }, data: { premiumUntil } });
  logActivity({
    type: action === "grant" ? "premium_granted" : "premium_revoked",
    userId: user.id,
    userName: user.fullName,
    severity: "info",
    metadata: { by: adminId, premiumUntil: premiumUntil?.toISOString() ?? null },
  });
  return NextResponse.json({ ok: true, premiumUntil });
}
