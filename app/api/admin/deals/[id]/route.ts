export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adminUserId } from "@/lib/admin-guard";
import { KINDS, STAGES, loadDeal } from "@/lib/deals";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  const deal = await loadDeal(id);
  if (!deal) return NextResponse.json({ message: "Deal not found" }, { status: 404 });
  return NextResponse.json({ deal });
}

// Admin: permanently delete a deal and its history (spam, duplicates). A deal that came from the
// inquiry form takes its inquiry with it; a saved Radar post is kept.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  try {
    const deal = await prisma.deal.findUnique({ where: { id }, select: { partnerInquiryId: true } });
    if (!deal) return NextResponse.json({ message: "Deal not found" }, { status: 404 });
    // Close the inquiry too, otherwise the next list load would recreate the deal from it.
    if (deal.partnerInquiryId) await prisma.partnerInquiry.delete({ where: { id: deal.partnerInquiryId } }).catch(() => {});
    await prisma.deal.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Deal delete failed:", error);
    return NextResponse.json({ message: "Failed to delete deal" }, { status: 500 });
  }
}

const TEXT_FIELDS ={ company: 200, contactName: 120, contactTitle: 120, country: 80, nextStep: 300, notes: 4000, summary: 8000 } as const;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

// Admin: edit a deal's stage, kind, follow-up date, value, contact details or notes.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await adminUserId())) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  const { id } = await params;
  try {
    const b = await request.json();
    const data: Record<string, unknown> = {};
    for (const [k, max] of Object.entries(TEXT_FIELDS)) {
      if (!(k in b)) continue;
      const v = String(b[k] ?? "").trim().slice(0, max);
      if (k === "company") {
        if (v.length < 2) return NextResponse.json({ message: "Company is required" }, { status: 400 });
        data.company = v;
      } else data[k] = v || null;
    }
    if ("stage" in b) {
      if (!STAGES.includes(b.stage)) return NextResponse.json({ message: "Invalid stage" }, { status: 400 });
      data.stage = b.stage;
    }
    if ("kind" in b) {
      if (b.kind !== null && !KINDS.includes(b.kind)) return NextResponse.json({ message: "Invalid kind" }, { status: 400 });
      data.kind = b.kind;
    }
    if ("contactEmail" in b) {
      const e = String(b.contactEmail || "").trim();
      if (e && !EMAIL_RE.test(e)) return NextResponse.json({ message: "Invalid e-mail address" }, { status: 400 });
      data.contactEmail = e || null;
    }
    if ("contactUrl" in b) data.contactUrl = /^https?:\/\//.test(b.contactUrl || "") ? String(b.contactUrl).slice(0, 500) : null;
    if ("nextDate" in b) {
      const d = b.nextDate ? new Date(b.nextDate) : null;
      if (d && Number.isNaN(d.getTime())) return NextResponse.json({ message: "Invalid date" }, { status: 400 });
      data.nextDate = d;
    }
    if ("valueUsd" in b) {
      const n = b.valueUsd === "" || b.valueUsd === null ? null : Number(b.valueUsd);
      if (n !== null && (!Number.isFinite(n) || n < 0)) return NextResponse.json({ message: "Invalid value" }, { status: 400 });
      data.valueUsd = n;
    }
    await prisma.deal.update({ where: { id }, data });
    return NextResponse.json({ deal: await loadDeal(id) });
  } catch (error) {
    console.error("Deal update failed:", error);
    return NextResponse.json({ message: "Failed to update deal" }, { status: 500 });
  }
}
