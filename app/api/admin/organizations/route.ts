export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { sendEmail, orgInviteEmail } from "@/lib/email";
import { logActivity, getIp } from "@/lib/activity-log";

async function generateOrgLoginId(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const id = `ORG${Math.floor(1000 + Math.random() * 9000)}`;
    if (!(await prisma.user.findUnique({ where: { userId: id } }))) return id;
  }
  return `ORG${Math.floor(100000 + Math.random() * 900000)}`;
}
const randomCode = (n: number) => Math.random().toString(36).slice(2, 2 + n).toUpperCase();

// GET — list organizations (with owner + project/spend summary).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }
  const orgs = await prisma.organization.findMany({ orderBy: { createdAt: "desc" } });
  const ownerIds = orgs.map((o) => o.ownerUserId);
  const owners = await prisma.user.findMany({
    where: { id: { in: ownerIds } },
    select: { id: true, userId: true, email: true, status: true },
  });
  const ownerById = new Map(owners.map((u) => [u.id, u]));
  // project counts per org
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects = await (prisma.dataProject.findMany as any)({
    where: { orgId: { in: orgs.map((o) => o.id) } },
    select: { orgId: true, budget: true, spent: true },
  });
  const agg = new Map<string, { count: number; budget: number; spent: number }>();
  for (const p of projects as Array<{ orgId: string; budget: number; spent: number }>) {
    const a = agg.get(p.orgId) || { count: 0, budget: 0, spent: 0 };
    a.count++; a.budget += p.budget; a.spent += p.spent;
    agg.set(p.orgId, a);
  }

  return NextResponse.json({
    organizations: orgs.map((o) => ({
      ...o,
      owner: ownerById.get(o.ownerUserId) || null,
      projects: agg.get(o.id)?.count || 0,
      totalBudget: agg.get(o.id)?.budget || 0,
      totalSpent: agg.get(o.id)?.spent || 0,
    })),
  });
}

// POST — provision an organization: creates the login User + Organization, emails an invite.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }
  const { name, workEmail, phone, country } = await request.json().catch(() => ({}));
  if (!name || !workEmail) {
    return NextResponse.json({ message: "Organization name and work email are required" }, { status: 400 });
  }
  const email = String(workEmail).trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) {
    return NextResponse.json({ message: "A user with that email already exists" }, { status: 409 });
  }

  const loginId = await generateOrgLoginId();
  const tempPassword = randomCode(4) + "-" + randomCode(4);
  const hashed = await hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      userId: loginId,
      fullName: name,
      email,
      phone: phone || "",
      password: hashed,
      role: "organization",
      profileCompleted: true, // orgs skip the contributor onboarding gate
      referralCode: "ORG" + randomCode(7),
      country: country || null,
    },
  });

  const org = await prisma.organization.create({
    data: { ownerUserId: user.id, name, workEmail: email, phone: phone || null, country: country || null },
  });

  const mail = orgInviteEmail(name, loginId, tempPassword);
  sendEmail({ to: email, subject: mail.subject, html: mail.html }).catch(() => {});

  logActivity({
    type: "admin_message",
    userId: session.user.id,
    userName: session.user.name ?? null,
    severity: "info",
    metadata: { action: "provision_org", orgId: org.id, orgName: name },
    ip: getIp(request),
  });

  return NextResponse.json({ ok: true, organization: org, loginId });
}

// PATCH — suspend/reactivate an organization (also flips the owner's login status).
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }
  const { orgId, action } = await request.json().catch(() => ({}));
  if (!orgId || !["suspend", "activate"].includes(action)) {
    return NextResponse.json({ message: "orgId and a valid action are required" }, { status: 400 });
  }
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) return NextResponse.json({ message: "Organization not found" }, { status: 404 });

  const status = action === "suspend" ? "suspended" : "active";
  await prisma.$transaction([
    prisma.organization.update({ where: { id: orgId }, data: { status } }),
    prisma.user.update({ where: { id: org.ownerUserId }, data: { status } }),
  ]);
  return NextResponse.json({ ok: true, status });
}
