// Server-side AI quality review of a data submission using the OpenAI vision
// API. Gated on OPENAI_API_KEY (like Paystack/Supabase) — absent it, the
// feature simply isn't offered. This SUGGESTS a score/verdict for the human
// reviewer; it never auto-approves.

export interface AiReviewResult {
  score: number; // 0..100
  verdict: "approve" | "reject" | "borderline";
  reasons: string[];
  summary: string;
  model: string;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const SYSTEM_PROMPT = `You are a quality-assurance reviewer for an AI data-collection platform in Ghana.
You are given: the project's recording instructions, MEASURED facts about each file (resolution — and therefore orientation — plus brightness % and a sharpness score), and a few still frames sampled from the submission.

TRUST THE MEASURED FACTS. Do NOT contradict them:
- Orientation: portrait means height > width. If the measured resolution is portrait, the video IS portrait — never say "not portrait" or "wrong orientation" against the numbers. (The still you see may be rotated by the player; ignore apparent rotation.)
- Brightness: only call lighting "poor/too dark" if the measured brightness is low (roughly < 30%). Numbers in the 45-80% range are acceptable lighting.
- Sharpness/blur: only call it blurry if the measured sharpness is low.

From the FRAMES, judge only what a still can actually show: is the required subject/person present and clearly visible and reasonably framed, and is the background broadly acceptable.
You CANNOT hear audio, and you CANNOT reliably verify time-ordered actions or exact emotions from a few stills — do NOT reject for these; note them as "couldn't verify from stills" instead.

Be CALIBRATED, not harsh. Reserve low scores for CLEAR failures: no person / wrong subject, face badly out of frame or not visible, measured brightness genuinely too dark, or empty/irrelevant content. Minor imperfections should still pass.

Respond ONLY as compact JSON: {"score": <0-100 integer>, "verdict": "approve"|"reject"|"borderline", "reasons": ["short reason", ...], "summary": "one-sentence summary"}.
Use "approve" for score >= 70, "reject" for score < 40, "borderline" otherwise.`;

/** Summarize measured per-file specs (from a submission's files JSON) so the
 *  model trusts them instead of guessing orientation/lighting/focus wrong. */
export function summarizeSpecs(filesJson: string | null | undefined): string {
  if (!filesJson) return "";
  try {
    const arr = JSON.parse(filesJson);
    if (!Array.isArray(arr) || !arr.length) return "";
    const lines = arr.map((f: { name?: string; meta?: { width?: number; height?: number; brightness?: number; sharpness?: number; durationSecs?: number } | null }, i: number) => {
      const m = f.meta || {};
      if (!m.width || !m.height) return `File ${i + 1}: (no measurements)`;
      const orient = m.height > m.width ? "portrait" : "landscape";
      const parts = [`${m.width}x${m.height} (${orient})`];
      if (m.durationSecs) parts.push(`${m.durationSecs}s`);
      if (m.brightness !== undefined) parts.push(`brightness ${m.brightness}%`);
      if (m.sharpness !== undefined) parts.push(`sharpness ${m.sharpness}`);
      return `File ${i + 1}: ${parts.join(", ")}`;
    });
    return lines.join("\n");
  } catch {
    return "";
  }
}

/** Grade sampled frames (base64 data URLs) against the project's instructions. */
export async function scoreFrames(
  instructions: string,
  projectType: string,
  frames: string[],
  specs?: string,
): Promise<AiReviewResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("AI review is not configured");
  if (!frames.length) throw new Error("No frames to review");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text:
        `Project type: ${projectType}\n\nRecording instructions:\n${instructions || "(none provided)"}\n\n` +
        (specs ? `MEASURED facts (trust these over the frames for orientation/lighting/focus):\n${specs}\n\n` : "") +
        `Grade the ${frames.length} sampled frame(s) below against these instructions.`,
    },
    ...frames.map((f) => ({ type: "image_url", image_url: { url: f, detail: "low" } })),
  ];

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "{}";
  let parsed: { score?: unknown; verdict?: unknown; reasons?: unknown; summary?: unknown };
  try { parsed = JSON.parse(raw); } catch { parsed = {}; }

  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  const verdict = ["approve", "reject", "borderline"].includes(parsed.verdict as string)
    ? (parsed.verdict as AiReviewResult["verdict"])
    : score >= 70 ? "approve" : score < 40 ? "reject" : "borderline";

  return {
    score,
    verdict,
    reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String).slice(0, 8) : [],
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    model,
  };
}
