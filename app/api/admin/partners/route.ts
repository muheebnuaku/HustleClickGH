export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

const VALID_STATUSES = ["new", "contacted", "in_progress", "closed"];

// Admin: list partner inquiries (paginated, filterable, searchable)
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = 20;

    const where: Record<string, unknown> = {};
    if (status && VALID_STATUSES.includes(status)) where.status = status;
    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: "insensitive" } },
        { contactName: { contains: search, mode: "insensitive" } },
        { workEmail: { contains: search, mode: "insensitive" } },
      ];
    }

    const [inquiries, total, newCount] = await Promise.all([
      prisma.partnerInquiry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.partnerInquiry.count({ where }),
      prisma.partnerInquiry.count({ where: { status: "new" } }),
    ]);

    return NextResponse.json({
      inquiries,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      stats: { newCount },
    });
  } catch (error) {
    console.error("Partner inquiries fetch error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}

// Admin: update inquiry status
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== "admin") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    const { id, status } = await request.json();
    if (!id || !VALID_STATUSES.includes(status)) {
      return NextResponse.json({ message: "Valid id and status are required" }, { status: 400 });
    }

    const updated = await prisma.partnerInquiry.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ message: "Updated", inquiry: updated });
  } catch (error) {
    console.error("Partner inquiry update error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
