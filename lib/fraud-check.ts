import OpenAI from "openai";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// AI-assisted duplicate-account detection.
//
// Exact phone-number reuse is already hard-blocked in the register route.
// This module catches the *fuzzy* case — the same person signing up again
// with a slightly different phone/email/name to farm referral bonuses and
// survey/data-submission rewards (e.g. "isaactrigger34@gmail.com" /
// "isaactrigge34@gmail.com" on near-identical phone numbers in the same
// city). It never blocks registration on its own — it flags the new account
// for admin review, since fuzzy signals can have false positives (e.g. a
// family genuinely sharing a network/city).
// ---------------------------------------------------------------------------

export interface DuplicateRiskResult {
  flagged: boolean;
  riskScore: number; // 0-100
  reason: string | null;
  suspectedDuplicateOfUserId: string | null;
}

const NO_RISK: DuplicateRiskResult = {
  flagged: false,
  riskScore: 0,
  reason: null,
  suspectedDuplicateOfUserId: null,
};

// Exported so lib/lana.ts's backfill scan (pairwise across the whole user
// base, rather than one new signup against a candidate pool) can reuse the
// exact same matching primitives instead of drifting out of sync.
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-9); // last 9 digits, ignores country-code formatting
}

export function emailLocalPart(email: string): string {
  return (email.split("@")[0] || "").toLowerCase();
}

// Classic edit distance — small strings only (phone digits / email local parts).
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export interface Candidate {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  city: string | null;
  region: string | null;
  score: number; // higher = more suspicious
  matchReasons: string[];
}

async function findCandidates(input: {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  region: string;
}): Promise<Candidate[]> {
  const newPhoneKey = normalizePhone(input.phone);
  const newEmailLocal = emailLocalPart(input.email);

  // Small platform (a few hundred users) — pulling the recent pool and
  // scoring in-memory is simpler and cheaper than trying to index fuzzy
  // matches in SQL, and easily fast enough at this scale.
  const pool = await prisma.user.findMany({
    where: { role: "user" },
    select: { id: true, fullName: true, email: true, phone: true, city: true, region: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const candidates: Candidate[] = [];
  for (const u of pool) {
    let score = 0;
    const reasons: string[] = [];

    const phoneKey = normalizePhone(u.phone);
    if (phoneKey && newPhoneKey) {
      const dist = levenshtein(phoneKey, newPhoneKey);
      if (dist === 0) continue; // exact match — already hard-blocked elsewhere
      if (dist <= 2) {
        score += (3 - dist) * 25; // dist 1 -> 50, dist 2 -> 25
        reasons.push(`phone number differs by ${dist} digit${dist > 1 ? "s" : ""}`);
      }
    }

    const emailLocal = emailLocalPart(u.email);
    if (emailLocal && newEmailLocal && emailLocal !== newEmailLocal) {
      const dist = levenshtein(emailLocal, newEmailLocal);
      const longer = Math.max(emailLocal.length, newEmailLocal.length);
      if (longer >= 5 && dist <= 3) {
        score += (4 - dist) * 15;
        reasons.push(`email address is very similar ("${u.email}")`);
      }
    }

    if (
      score > 0 &&
      u.city && input.city &&
      u.city.trim().toLowerCase() === input.city.trim().toLowerCase() &&
      u.region && input.region &&
      u.region.trim().toLowerCase() === input.region.trim().toLowerCase()
    ) {
      score += 15;
      reasons.push("same city/region");
    }

    if (score > 0) candidates.push({ ...u, score, matchReasons: reasons });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
}

async function assessWithAI(
  input: { fullName: string; email: string; phone: string; city: string; region: string },
  candidates: Candidate[]
): Promise<DuplicateRiskResult | null> {
  if (!process.env.OPENAI_API_KEY) return null;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `A new user is registering on HustleClickGH, a Ghanaian survey/micro-earning platform that pays referral bonuses and task rewards. Multiple accounts by the same person (to farm rewards) are against the rules; genuinely different people who happen to share a city or network are fine.

New signup:
- Name: ${input.fullName}
- Email: ${input.email}
- Phone: ${input.phone}
- Location: ${input.city}, ${input.region}

Existing accounts that share some similarity (phone/email edit-distance or location):
${candidates.map((c, i) => `${i + 1}. id=${c.id} name="${c.fullName}" email="${c.email}" phone="${c.phone}" location="${c.city}, ${c.region}" — matched on: ${c.matchReasons.join("; ")}`).join("\n")}

Decide whether the new signup is likely the SAME PERSON as one of the existing accounts (multi-accounting), not just a coincidental similarity. Respond with ONLY a JSON object, no other text:
{"isLikelyDuplicate": boolean, "riskScore": number (0-100), "matchedAccountId": string or null, "reason": string (one short sentence)}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Lana's judgment model — see lib/lana.ts
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 200,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    const riskScore = Math.max(0, Math.min(100, Number(parsed.riskScore) || 0));
    const matchedId = typeof parsed.matchedAccountId === "string" ? parsed.matchedAccountId : null;

    return {
      flagged: Boolean(parsed.isLikelyDuplicate) && riskScore >= 50,
      riskScore,
      reason: typeof parsed.reason === "string" ? parsed.reason : null,
      suspectedDuplicateOfUserId: matchedId && candidates.some((c) => c.id === matchedId) ? matchedId : null,
    };
  } catch (err) {
    console.error("[fraud-check] OpenAI assessment failed, falling back to heuristic:", err);
    return null;
  }
}

// Deterministic fallback used when OPENAI_API_KEY is unset or the API call
// fails — never let an AI outage silently disable the whole check.
function assessHeuristically(candidates: Candidate[]): DuplicateRiskResult {
  const top = candidates[0];
  if (!top || top.score < 60) return NO_RISK;
  return {
    flagged: true,
    riskScore: Math.min(100, top.score),
    reason: `Automated heuristic match: ${top.matchReasons.join("; ")} with existing account "${top.fullName}".`,
    suspectedDuplicateOfUserId: top.id,
  };
}

// Exported so the backfill scan (lib/lana.ts) can reuse the same
// AI-assessment + heuristic-fallback logic against its own candidate list.
export async function assessDuplicateRisk(
  input: { fullName: string; email: string; phone: string; city: string; region: string },
  candidates: Candidate[]
): Promise<DuplicateRiskResult> {
  if (candidates.length === 0) return NO_RISK;
  const aiResult = await assessWithAI(input, candidates);
  return aiResult ?? assessHeuristically(candidates);
}

export async function checkDuplicateRisk(input: {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  region: string;
}): Promise<DuplicateRiskResult> {
  try {
    const candidates = await findCandidates(input);
    return await assessDuplicateRisk(input, candidates);
  } catch (err) {
    // Fraud-checking must never block or crash registration.
    console.error("[fraud-check] duplicate risk check failed:", err);
    return NO_RISK;
  }
}
