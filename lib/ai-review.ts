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

const SYSTEM_PROMPT = `You are a strict quality-assurance reviewer for an AI data-collection platform in Ghana.
You are given a project's recording instructions and one or more still frames sampled from a contributor's submission.
Judge ONLY what is visible in the frames: whether the required subject/person is present and clearly visible, lighting and exposure, focus/sharpness (blur), framing/orientation, background suitability, and any obvious violations of the instructions.
You CANNOT hear audio or verify time-ordered actions from stills — if the instructions depend on those, say so as a limitation and don't over-penalise.
Be fair but strict; low-resolution, dark, blurry, wrong-subject, or off-instruction frames should score low.
Respond ONLY as compact JSON: {"score": <0-100 integer>, "verdict": "approve"|"reject"|"borderline", "reasons": ["short reason", ...], "summary": "one-sentence summary"}.
Use "approve" for score >= 70, "reject" for score < 40, "borderline" otherwise.`;

/** Grade sampled frames (base64 data URLs) against the project's instructions. */
export async function scoreFrames(
  instructions: string,
  projectType: string,
  frames: string[],
): Promise<AiReviewResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("AI review is not configured");
  if (!frames.length) throw new Error("No frames to review");

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `Project type: ${projectType}\n\nRecording instructions:\n${instructions || "(none provided)"}\n\nGrade the ${frames.length} sampled frame(s) below against these instructions.`,
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
