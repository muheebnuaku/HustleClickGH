export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { getLastRadarRun, runRadar } from "@/lib/radar";
import { dealFromRadarItem } from "@/lib/deals";

const VIEWS = ["leads", "maybe", "new", "saved", "dismissed"] as const;
type View = (typeof VIEWS)[number];
const STATUSES = ["new", "saved", "dismissed"];
const PAGE_SIZE = 25;

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return session?.user && session.user.role === "admin";
}

function whereFor(view: View) {
  switch (view) {
    case "leads":
      return { status: "new", score: { gte: 70 }, verdict: { in: ["lead", "maybe"] } };
    case "maybe":
      return { status: "new", score: { gte: 40, lt: 70 }, verdict: { in: ["lead", "maybe"] } };
    case "new":
      return { status: "new" };
    default:
      return { status: view };
  }
}

// Admin: list Radar items for one view, with per-view counts and the last run.
export async function GET(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    const { searchParams } = new URL(request.url);
    const v = searchParams.get("view") as View;
    const view: View = VIEWS.includes(v) ? v : "leads";
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

    const where: Record<string, unknown> = { ...whereFor(view) };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
        { snippet: { contains: search, mode: "insensitive" } },
      ];
    }

    const [items, total, ...counts] = await Promise.all([
      prisma.radarItem.findMany({
        where,
        orderBy: view === "new" ? [{ createdAt: "desc" }] : [{ score: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.radarItem.count({ where }),
      ...VIEWS.map((x) => prisma.radarItem.count({ where: whereFor(x) })),
    ]);

    return NextResponse.json({
      items,
      counts: Object.fromEntries(VIEWS.map((x, i) => [x, counts[i]])),
      lastRun: await getLastRadarRun(),
      pagination: { page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total },
    });
  } catch (error) {
    console.error("Radar list failed:", error);
    return NextResponse.json({ message: "Failed to load Radar" }, { status: 500 });
  }
}

// Admin: save / dismiss / restore an item.
export async function PATCH(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    const { id, status } = await request.json();
    if (!id || !STATUSES.includes(status)) {
      return NextResponse.json({ message: "Invalid request" }, { status: 400 });
    }
    const item = await prisma.radarItem.update({ where: { id: String(id) }, data: { status } });
    // Saving a post puts it in the Deals pipeline.
    if (status === "saved") await dealFromRadarItem(item.id);
    return NextResponse.json({ item });
  } catch (error) {
    console.error("Radar update failed:", error);
    return NextResponse.json({ message: "Failed to update item" }, { status: 500 });
  }
}

// Admin: run the Radar now (same as the daily cron, without the e-mail digest).
export async function POST() {
  if (!(await requireAdmin())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  try {
    return NextResponse.json(await runRadar({ digest: false }));
  } catch (error) {
    console.error("Radar run failed:", error);
    return NextResponse.json({ message: "Radar run failed" }, { status: 500 });
  }
}
