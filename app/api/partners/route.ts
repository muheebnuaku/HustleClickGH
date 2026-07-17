export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SITE_CONFIG, PARTNER_PROJECT_TYPES } from "@/lib/constants";
import { logActivity, getIp } from "@/lib/activity-log";
import { sendEmail } from "@/lib/email";

const VALID_PROJECT_TYPES = new Set(PARTNER_PROJECT_TYPES.map((p) => p.value));

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      companyName,
      contactName,
      workEmail,
      phone,
      country,
      projectType,
      datasetSize,
      budgetRange,
      message,
    } = body ?? {};

    // Validate required fields
    if (!companyName || !contactName || !workEmail || !projectType || !message) {
      return NextResponse.json(
        { message: "Company name, contact name, work email, project type, and message are required." },
        { status: 400 }
      );
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(workEmail));
    if (!emailOk) {
      return NextResponse.json({ message: "Please provide a valid work email." }, { status: 400 });
    }

    const type = VALID_PROJECT_TYPES.has(projectType) ? projectType : "other";

    const inquiry = await prisma.partnerInquiry.create({
      data: {
        companyName: String(companyName).slice(0, 200),
        contactName: String(contactName).slice(0, 200),
        workEmail: String(workEmail).slice(0, 200),
        phone: phone ? String(phone).slice(0, 50) : null,
        country: country ? String(country).slice(0, 100) : null,
        projectType: type,
        datasetSize: datasetSize ? String(datasetSize).slice(0, 200) : null,
        budgetRange: budgetRange ? String(budgetRange).slice(0, 200) : null,
        message: String(message).slice(0, 5000),
      },
    });

    logActivity({
      type: "partner_inquiry",
      severity: "info",
      metadata: { company: inquiry.companyName, projectType: inquiry.projectType, email: inquiry.workEmail },
      ip: getIp(request),
    });

    // Notify the team (fire-and-forget — never blocks the response).
    const label = PARTNER_PROJECT_TYPES.find((p) => p.value === type)?.label ?? type;
    sendEmail({
      to: SITE_CONFIG.contact.email,
      replyTo: inquiry.workEmail,
      subject: `New partnership inquiry — ${inquiry.companyName}`,
      html: `
        <h2>New partnership inquiry</h2>
        <p><strong>Company:</strong> ${escapeHtml(inquiry.companyName)}</p>
        <p><strong>Contact:</strong> ${escapeHtml(inquiry.contactName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(inquiry.workEmail)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(inquiry.phone ?? "—")}</p>
        <p><strong>Country:</strong> ${escapeHtml(inquiry.country ?? "—")}</p>
        <p><strong>Project type:</strong> ${escapeHtml(label)}</p>
        <p><strong>Dataset size:</strong> ${escapeHtml(inquiry.datasetSize ?? "—")}</p>
        <p><strong>Budget:</strong> ${escapeHtml(inquiry.budgetRange ?? "—")}</p>
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(inquiry.message).replace(/\n/g, "<br/>")}</p>
      `,
    }).catch(() => {});

    return NextResponse.json({ message: "Inquiry received", id: inquiry.id });
  } catch (error) {
    console.error("Partner inquiry error:", error);
    return NextResponse.json({ message: "An error occurred. Please try again." }, { status: 500 });
  }
}
