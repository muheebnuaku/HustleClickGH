export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminUserId } from "@/lib/admin-guard";
import { getPremiumSettings } from "@/lib/premium";

const USER_FIELDS = {
  id: true, userId: true, fullName: true, email: true, phone: true,
  verified: true, idType: true, idNumberLast4: true, premiumUntil: true,
} as const;

// Admin: payments to review, recent decisions, current members, open early-access projects, settings.
export async function GET() {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    const now = new Date();
    const [pending, recent, members, earlyProjects, settings] = await Promise.all([
      prisma.premiumRequest.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, include: { user: { select: USER_FIELDS } } }),
      prisma.premiumRequest.findMany({ where: { status: { not: "pending" } }, orderBy: { reviewedAt: "desc" }, take: 30, include: { user: { select: USER_FIELDS } } }),
      prisma.user.findMany({ where: { premiumUntil: { gt: now } }, orderBy: { premiumUntil: "asc" }, select: USER_FIELDS }),
      prisma.dataProject.findMany({ where: { status: "active", openToAllAt: { gt: now } }, orderBy: { openToAllAt: "asc" }, select: { id: true, title: true, openToAllAt: true, launchedAt: true } }),
      getPremiumSettings(),
    ]);
    return NextResponse.json({ pending, recent, members, earlyProjects, settings });
  } catch (error) {
    console.error("Admin premium list failed:", error);
    return NextResponse.json({ message: "Could not load Premium data. Has the Premium SQL been run on the database?" }, { status: 500 });
  }
}
