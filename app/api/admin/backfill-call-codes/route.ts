import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function generateUniqueCode(): Promise<string | null> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 5; i++) code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    const existing = await prisma.user.findUnique({ where: { personalCallCode: code } });
    if (!existing) return code;
  }
  return null; // extremely unlikely
}

export async function GET() {
  return run();
}

export async function POST() {
  return run();
}

async function run() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    where: { personalCallCode: null },
    select: { id: true, fullName: true, email: true },
  });

  if (users.length === 0) {
    return NextResponse.json({ message: "All users already have a call code.", updated: 0 });
  }

  const results: { name: string; email: string; code: string | null }[] = [];

  for (const user of users) {
    const code = await generateUniqueCode();
    if (!code) {
      results.push({ name: user.fullName, email: user.email, code: null });
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { personalCallCode: code } });
    results.push({ name: user.fullName, email: user.email, code });
  }

  const succeeded = results.filter(r => r.code).length;
  const failed    = results.filter(r => !r.code).length;

  return NextResponse.json({
    message: `Backfill complete. ${succeeded} updated, ${failed} failed.`,
    updated: succeeded,
    failed,
    results,
  });
}
