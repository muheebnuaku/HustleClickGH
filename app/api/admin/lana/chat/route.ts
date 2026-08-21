export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { chatWithLana } from "@/lib/lana";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "admin") return null;
  return session;
}

// GET: recent chat history (so the panel has context on open/reload).
export async function GET() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const messages = await prisma.lanaMessage.findMany({ orderBy: { createdAt: "asc" }, take: 50 });
  return NextResponse.json({ messages });
}

// POST: send a message, get Lana's reply.
export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ message: "message is required" }, { status: 400 });

  try {
    const reply = await chatWithLana(message, session.user.id);
    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Lana chat error:", error);
    return NextResponse.json({ message: "An error occurred" }, { status: 500 });
  }
}
