export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentOrg } from "@/lib/org-auth";
import { hash } from "bcryptjs";

// POST /api/org/password { newPassword } — the org sets its own password.
// Clears the first-login mustSetPassword flag.
export async function POST(request: Request) {
  const { session, org } = await currentOrg();
  if (!org || !session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const { newPassword } = await request.json().catch(() => ({}));
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ message: "Password must be at least 8 characters" }, { status: 400 });
  }

  const hashed = await hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: session.user.id }, data: { password: hashed } }),
    prisma.organization.update({ where: { id: org.id }, data: { mustSetPassword: false } }),
  ]);

  return NextResponse.json({ ok: true });
}
