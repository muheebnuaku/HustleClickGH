export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { runRadar } from "@/lib/radar";

// Daily Radar run (see vercel.json): fetch sources, AI-score new posts, e-mail strong matches.
export async function GET(request: Request) {
  // Fails closed: each run spends OpenAI credit, so it never runs without CRON_SECRET.
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runRadar({ digest: true });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[cron/radar] failed:", error);
    return NextResponse.json({ message: "Radar run failed" }, { status: 500 });
  }
}
