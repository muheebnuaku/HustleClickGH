export const dynamic = "force-dynamic";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { processEmailQueue } from "@/lib/email-queue";

// Bulk e-mail heartbeat, called every 10 min by .github/workflows/email-queue.yml
// (Vercel Hobby crons run only once a day). Sends the next slice if the
// 45-per-45-minute window allows; otherwise returns at once.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await processEmailQueue());
  } catch (error) {
    console.error("[cron/email-queue] failed:", error);
    return NextResponse.json({ message: "Email queue run failed" }, { status: 500 });
  }
}
