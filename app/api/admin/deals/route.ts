export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminUserId } from "@/lib/admin-guard";
import { ACTIVE_STAGES, syncInquiries } from "@/lib/deals";

const VIEWS = ["due", "active", "paid", "lost", "all"] as const;
type View = (typeof VIEWS)[number];

function whereFor(view: View) {
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  switch (view) {
    case "due":
      return { stage: { in: ACTIVE_STAGES }, OR: [{ stage: "new" }, { nextDate: { lte: endOfToday } }] };
    case "active":
      return { stage: { in: ACTIVE_STAGES } };
    case "paid":
      return { stage: "paid" };
    case "lost":
      return { stage: "lost" };
    default:
      return {};
  }
}

// Admin: deals for one view, with counts. New partner inquiries become deals first.
export async function GET(request: Request) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    await syncInquiries();
    const { searchParams } = new URL(request.url);
    const v = searchParams.get("view") as View;
    const view: View = VIEWS.includes(v) ? v : "due";
    const search = searchParams.get("search")?.trim();

    const where: Record<string, unknown> = { ...whereFor(view) };
    if (search) {
      where.AND = [
        {
          OR: [
            { company: { contains: search, mode: "insensitive" } },
            { contactName: { contains: search, mode: "insensitive" } },
            { contactEmail: { contains: search, mode: "insensitive" } },
            { summary: { contains: search, mode: "insensitive" } },
          ],
        },
      ];
    }

    const [deals, ...counts] = await Promise.all([
      prisma.deal.findMany({
        where,
        orderBy: [{ nextDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
        take: 200,
        select: {
          id: true, company: true, contactName: true, contactEmail: true, source: true, stage: true, kind: true,
          nextDate: true, nextStep: true, valueUsd: true, createdAt: true, updatedAt: true,
          _count: { select: { messages: true } },
        },
      }),
      ...VIEWS.map((x) => prisma.deal.count({ where: whereFor(x) })),
    ]);
    return NextResponse.json({ deals, counts: Object.fromEntries(VIEWS.map((x, i) => [x, counts[i]])) });
  } catch (error) {
    console.error("Deals list failed:", error);
    return NextResponse.json({ message: "Failed to load deals" }, { status: 500 });
  }
}

// Admin: add a deal by hand (an outbound lead, a referral, a call).
export async function POST(request: Request) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    const b = await request.json();
    const company = String(b.company || "").trim();
    if (company.length < 2) return NextResponse.json({ message: "Company is required" }, { status: 400 });
    const email = String(b.contactEmail || "").trim();
    const deal = await prisma.deal.create({
      data: {
        source: "manual",
        company: company.slice(0, 200),
        contactName: String(b.contactName || "").trim().slice(0, 120) || null,
        contactEmail: /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null,
        contactUrl: /^https?:\/\//.test(b.contactUrl || "") ? String(b.contactUrl).slice(0, 500) : null,
        summary: String(b.summary || "").trim().slice(0, 8000) || null,
      },
    });
    return NextResponse.json({ deal });
  } catch (error) {
    console.error("Deal create failed:", error);
    return NextResponse.json({ message: "Failed to create deal" }, { status: 500 });
  }
}
