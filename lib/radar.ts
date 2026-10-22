// Radar: finds public posts that may be projects for us — vendor job boards
// (Greenhouse / Lever / Ashby public APIs), arXiv papers, Hacker News stories
// and any RSS/Atom feed (e.g. Google Alerts set to "Deliver to: RSS feed").
//
// Only official, public, unauthenticated endpoints are used — no scraping of
// sites whose terms forbid it (LinkedIn, Upwork, Datarade, AIxBlock).
//
// Flow per run: fetch every source in parallel → keep job-board posts that
// match a keyword (cheap pre-filter, most postings are engineering/sales
// roles) → insert unseen URLs as "unscored" → AI-score the oldest unscored
// items (capped per run, so a big first run drains over a few days) → e-mail
// a digest of new strong matches.

import { prisma } from "@/lib/prisma";
import { sendEmail, emailLayout } from "@/lib/email";
import { SITE_CONFIG } from "@/lib/constants";

export interface RadarSources {
  greenhouse: string[]; // board tokens, e.g. "toloka"
  lever: string[]; // site names, e.g. "appen"
  ashby: string[]; // job-board names, e.g. "mercor"
  arxiv: string[]; // arXiv search_query strings
  hn: string[]; // Hacker News search phrases
  rss: { label: string; url: string }[];
  keywords: string[]; // job-board pre-filter (any match on title/location/team)
}

// Every default below was checked to respond with real postings (22 Oct 2026).
export const DEFAULT_SOURCES: RadarSources = {
  greenhouse: ["toloka", "scaleai", "labelbox", "snorkelai", "invisibletech", "prolific", "turing"],
  lever: ["appen"],
  ashby: ["mercor", "handshake"],
  arxiv: [
    "abs:african AND abs:speech AND abs:dataset",
    "abs:african AND (abs:face OR abs:liveness) AND abs:dataset",
    "(abs:ghana OR abs:akan OR abs:twi OR abs:ewe) AND abs:corpus",
  ],
  hn: ["african dataset", "african languages speech data", "data collection africa"],
  rss: [],
  keywords: [
    "data collection", "recording", "voice", "speech", "audio", "video", "face", "facial", "liveness",
    "biometric", "annotation", "annotator", "transcription", "transcriber", "crowd", "contributor",
    "dataset", "vendor", "africa", "ghana", "nigeria", "kenya", "malawi", "akan", "twi", "ewe", "hausa",
    "yoruba", "igbo", "swahili", "chichewa",
  ],
};

const SOURCES_KEY = "radar_sources";
const LAST_RUN_KEY = "radar_last_run";
// The whole run must finish inside the route's 60 s maxDuration on Vercel.
const RUN_BUDGET_MS = 50_000;
const FETCH_TIMEOUT_MS = 20_000; // Appen's board (full descriptions) is slow; sources run in parallel
const MAX_AGE_DAYS = 90;
const SCORE_BATCH = 15; // batches are scored in parallel; smaller ones return faster
const MAX_SCORED_PER_RUN = 60;
const DIGEST_MIN_SCORE = 70;
const DISMISSED_KEEP_DAYS = 90;

export async function getRadarSources(): Promise<RadarSources> {
  const row = await prisma.appSetting.findUnique({ where: { key: SOURCES_KEY } });
  if (!row) return DEFAULT_SOURCES;
  try {
    return normalizeSources(JSON.parse(row.value));
  } catch {
    return DEFAULT_SOURCES;
  }
}

export async function saveRadarSources(input: unknown): Promise<RadarSources> {
  const sources = normalizeSources(input);
  await prisma.appSetting.upsert({
    where: { key: SOURCES_KEY },
    update: { value: JSON.stringify(sources) },
    create: { key: SOURCES_KEY, value: JSON.stringify(sources) },
  });
  return sources;
}

const SLUG = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

function normalizeSources(input: unknown): RadarSources {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const strs = (v: unknown, max = 40) =>
    Array.from(new Set((Array.isArray(v) ? v : []).map((s) => String(s).trim()).filter(Boolean))).slice(0, max);
  const rss = (Array.isArray(o.rss) ? o.rss : [])
    .map((r) => ({ label: String((r as { label?: unknown })?.label ?? "").trim().slice(0, 60), url: String((r as { url?: unknown })?.url ?? "").trim() }))
    .filter((r) => /^https:\/\//i.test(r.url))
    .map((r) => ({ label: r.label || new URL(r.url).hostname, url: r.url }))
    .slice(0, 40);
  return {
    greenhouse: strs(o.greenhouse).filter((s) => SLUG.test(s)),
    lever: strs(o.lever).filter((s) => SLUG.test(s)),
    ashby: strs(o.ashby).filter((s) => SLUG.test(s)),
    arxiv: strs(o.arxiv, 10).map((s) => s.slice(0, 200)),
    hn: strs(o.hn, 10).map((s) => s.slice(0, 100)),
    rss,
    keywords: strs(o.keywords, 100).map((s) => s.toLowerCase().slice(0, 40)),
  };
}

// ── Fetching ────────────────────────────────────────────────────────────────

interface RawItem {
  url: string;
  source: string;
  title: string;
  company?: string;
  location?: string;
  snippet?: string;
  postedAt?: Date;
  jobBoard: boolean; // subject to the keyword pre-filter
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "HustleClickGH-Radar/1.0 (+https://hustleclickgh.com)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function plain(html: string | undefined | null, max = 800): string {
  if (!html) return "";
  // Greenhouse escapes its HTML once, so decode → strip tags → decode again.
  const text = decodeEntities(decodeEntities(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Minimal shapes of the public APIs (only the fields we read).
interface GreenhouseJob { absolute_url: string; title?: string; location?: { name?: string }; content?: string; first_published?: string; updated_at?: string }
interface LeverJob { hostedUrl: string; text?: string; categories?: { location?: string; team?: string }; descriptionPlain?: string; description?: string; createdAt?: number }
interface AshbyJob { jobUrl: string; title?: string; location?: string; descriptionPlain?: string; descriptionHtml?: string; publishedAt?: string; isListed?: boolean }
interface HnHit { objectID: string; url?: string | null; title?: string; story_text?: string | null; created_at?: string }

function toDate(v: unknown): Date | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const d = new Date(typeof v === "number" ? v : String(v));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function fetchGreenhouse(board: string): Promise<RawItem[]> {
  const data = JSON.parse(await getText(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`));
  return ((data.jobs || []) as GreenhouseJob[]).map((j) => ({
    url: j.absolute_url,
    source: `greenhouse:${board}`,
    title: String(j.title || ""),
    company: board,
    location: j.location?.name,
    snippet: plain(j.content),
    postedAt: toDate(j.first_published || j.updated_at),
    jobBoard: true,
  }));
}

async function fetchLever(site: string): Promise<RawItem[]> {
  const data = JSON.parse(await getText(`https://api.lever.co/v0/postings/${site}?mode=json`));
  return ((Array.isArray(data) ? data : []) as LeverJob[]).map((j) => ({
    url: j.hostedUrl,
    source: `lever:${site}`,
    title: String(j.text || ""),
    company: site,
    location: [j.categories?.location, j.categories?.team].filter(Boolean).join(" · ") || undefined,
    snippet: plain(j.descriptionPlain || j.description),
    postedAt: toDate(j.createdAt),
    jobBoard: true,
  }));
}

async function fetchAshby(board: string): Promise<RawItem[]> {
  const data = JSON.parse(await getText(`https://api.ashbyhq.com/posting-api/job-board/${board}`));
  return ((data.jobs || []) as AshbyJob[])
    .filter((j) => j.isListed !== false)
    .map((j) => ({
      url: j.jobUrl,
      source: `ashby:${board}`,
      title: String(j.title || ""),
      company: board,
      location: j.location,
      snippet: plain(j.descriptionPlain || j.descriptionHtml),
      postedAt: toDate(j.publishedAt),
      jobBoard: true,
    }));
}

function tag(block: string, name: string): string | undefined {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return undefined;
  return m[1].replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, "$1").trim();
}

async function fetchArxiv(query: string): Promise<RawItem[]> {
  const url =
    "https://export.arxiv.org/api/query?search_query=" +
    encodeURIComponent(query) +
    "&sortBy=submittedDate&sortOrder=descending&max_results=15";
  const xml = await getText(url);
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).map((e) => ({
    url: (tag(e, "id") || "").replace(/v\d+$/, ""),
    source: "arxiv",
    title: plain(tag(e, "title"), 300),
    company: plain((e.match(/<name>([^<]*)<\/name>/) || [])[1], 120) || undefined,
    snippet: plain(tag(e, "summary")),
    postedAt: toDate(tag(e, "published")),
    jobBoard: false,
  }));
}

async function fetchHn(query: string): Promise<RawItem[]> {
  const data = JSON.parse(
    await getText(`https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=20&query=${encodeURIComponent(query)}`),
  );
  return ((data.hits || []) as HnHit[]).map((h) => ({
    url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    source: "hn",
    title: String(h.title || ""),
    snippet: plain(h.story_text),
    postedAt: toDate(h.created_at),
    jobBoard: false,
  }));
}

// Google Alerts links go through google.com/url?...&url=<real link>.
function unwrapLink(link: string): string {
  try {
    const u = new URL(link);
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === "/url") return u.searchParams.get("url") || link;
  } catch {}
  return link;
}

async function fetchRss(feed: { label: string; url: string }): Promise<RawItem[]> {
  const xml = await getText(feed.url);
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/g) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) || [];
  return blocks.map((b) => {
    const href = (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1];
    const link = decodeEntities(href || tag(b, "link") || "");
    return {
      url: unwrapLink(link),
      source: `rss:${feed.label}`,
      title: plain(tag(b, "title"), 300),
      snippet: plain(tag(b, "description") || tag(b, "summary") || tag(b, "content")),
      postedAt: toDate(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated")),
      jobBoard: false,
    };
  });
}

function matchesKeywords(item: RawItem, keywords: string[]): boolean {
  if (!keywords.length) return true;
  // Title/location only: descriptions mention "dataset" or "video" in almost every AI-company role.
  const hay = `${item.title} ${item.location ?? ""}`.toLowerCase();
  return keywords.some((k) => hay.includes(k));
}

// ── Scoring ─────────────────────────────────────────────────────────────────

const SCORER_PROMPT = `You screen public posts for HustleClickGH, a Ghana-based company that collects consented AI training data (face/liveness video, images, voice and speech in African languages) from verified adult contributors in Ghana, Malawi and other African countries, and supplies it to AI companies per accepted item.

For each post decide whether it is a sales opportunity for us:
- lead: a company or programme that needs African (or any-country) contributors, face/video/voice/speech data collection, or a data vendor/partner — something we could pitch this month.
- maybe: related (e.g. a new African speech/face dataset paper whose authors may need more data, a vendor hiring for collection in other countries) but not a direct ask.
- noise: unrelated (engineering/sales/finance roles, generic AI news).
- no_go: the work fails our rules — ID card + selfie pairs, data from minors, covert/non-consented capture, surveillance or law-enforcement use, or a vague use with no real company.

Score 0-100 for how worth contacting it is (lead ≥ 70, maybe 40-69, noise < 40; no_go any score but verdict no_go).
leadType: vendor (data-collection company), kyc (identity/liveness firm), speech (speech/voice AI company), programme (research or funded language project), partner (recruitment/marketplace), or null.
reason: ≤ 25 words, concrete. angle: ≤ 20 words, how we would pitch it (null for noise/no_go).

Reply as JSON: {"items":[{"id":"…","score":0,"verdict":"lead|maybe|noise|no_go","leadType":null,"reason":"…","angle":null}]}`;

interface Scored {
  id: string;
  score: number;
  verdict: string;
  leadType: string | null;
  reason: string | null;
  angle: string | null;
}

const VERDICTS = ["lead", "maybe", "noise", "no_go"];
const LEAD_TYPES = ["vendor", "kyc", "speech", "programme", "partner"];

async function scoreBatch(
  items: { id: string; title: string; source: string; company: string | null; location: string | null; snippet: string | null }[],
  timeoutMs: number,
): Promise<Scored[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: process.env.RADAR_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: SCORER_PROMPT },
        {
          role: "user",
          content: JSON.stringify(
            items.map((i) => ({ id: i.id, source: i.source, company: i.company, title: i.title, location: i.location, text: (i.snippet || "").slice(0, 500) })),
          ),
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 2500,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  let parsed: { items?: unknown };
  try {
    parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  } catch {
    parsed = {};
  }
  const ids = new Set(items.map((i) => i.id));
  return (Array.isArray(parsed.items) ? parsed.items : [])
    .map((r: Record<string, unknown>) => {
      const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
      const verdict = VERDICTS.includes(r.verdict as string) ? (r.verdict as string) : score >= 70 ? "lead" : score >= 40 ? "maybe" : "noise";
      return {
        id: String(r.id),
        score,
        verdict,
        leadType: LEAD_TYPES.includes(r.leadType as string) ? (r.leadType as string) : null,
        reason: r.reason ? String(r.reason).slice(0, 300) : null,
        angle: r.angle && verdict !== "noise" && verdict !== "no_go" ? String(r.angle).slice(0, 200) : null,
      };
    })
    .filter((r: Scored) => ids.has(r.id));
}

// ── Run ─────────────────────────────────────────────────────────────────────

export interface RadarRunResult {
  at: string;
  fetched: number;
  kept: number;
  added: number;
  scored: number;
  backlog: number;
  digestSent: boolean;
  errors: string[];
}

export async function runRadar(opts: { digest?: boolean } = {}): Promise<RadarRunResult> {
  const startedAt = Date.now();
  const sources = await getRadarSources();
  const jobs: { name: string; run: () => Promise<RawItem[]> }[] = [
    ...sources.greenhouse.map((b) => ({ name: `greenhouse:${b}`, run: () => fetchGreenhouse(b) })),
    ...sources.lever.map((s) => ({ name: `lever:${s}`, run: () => fetchLever(s) })),
    ...sources.ashby.map((b) => ({ name: `ashby:${b}`, run: () => fetchAshby(b) })),
    ...sources.arxiv.map((q) => ({ name: `arxiv:${q}`, run: () => fetchArxiv(q) })),
    ...sources.hn.map((q) => ({ name: `hn:${q}`, run: () => fetchHn(q) })),
    ...sources.rss.map((f) => ({ name: `rss:${f.label}`, run: () => fetchRss(f) })),
  ];

  const errors: string[] = [];
  const settled = await Promise.allSettled(jobs.map((j) => j.run()));
  const raw: RawItem[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") raw.push(...s.value);
    else errors.push(`${jobs[i].name}: ${(s.reason as Error)?.message?.slice(0, 120) || "failed"}`);
  });

  const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;
  const byUrl = new Map<string, RawItem>();
  for (const it of raw) {
    if (!/^https?:\/\//i.test(it.url || "") || !it.title) continue;
    if (it.postedAt && it.postedAt.getTime() < cutoff) continue;
    if (it.jobBoard && !matchesKeywords(it, sources.keywords)) continue;
    if (!byUrl.has(it.url)) byUrl.set(it.url, it);
  }
  const kept = [...byUrl.values()];

  let added = 0;
  if (kept.length) {
    const existing = await prisma.radarItem.findMany({ where: { url: { in: kept.map((k) => k.url) } }, select: { url: true } });
    const seen = new Set(existing.map((e) => e.url));
    const fresh = kept.filter((k) => !seen.has(k.url));
    if (fresh.length) {
      const res = await prisma.radarItem.createMany({
        data: fresh.map((k) => ({
          url: k.url.slice(0, 2000),
          source: k.source.slice(0, 120),
          title: k.title.slice(0, 300),
          company: k.company?.slice(0, 120) || null,
          location: k.location?.slice(0, 200) || null,
          snippet: k.snippet || null,
          postedAt: k.postedAt ?? null,
        })),
        skipDuplicates: true,
      });
      added = res.count;
    }
  }

  // Score the oldest unscored items, all batches in parallel, within what is
  // left of the time budget; anything unscored is picked up by the next run.
  const scoredIds: string[] = [];
  const pending = await prisma.radarItem.findMany({
    where: { verdict: "unscored", status: "new" },
    orderBy: { createdAt: "asc" },
    take: MAX_SCORED_PER_RUN,
    select: { id: true, title: true, source: true, company: true, location: true, snippet: true },
  });
  const scoringTimeout = RUN_BUDGET_MS - (Date.now() - startedAt) - 5_000; // keep 5 s for writes and the digest
  if (process.env.OPENAI_API_KEY && pending.length && scoringTimeout < 5_000) {
    errors.push("scoring postponed: fetching used the time budget; the next run will score these");
  } else if (process.env.OPENAI_API_KEY) {
    const batches: (typeof pending)[] = [];
    for (let i = 0; i < pending.length; i += SCORE_BATCH) batches.push(pending.slice(i, i + SCORE_BATCH));
    const settledScores = await Promise.allSettled(batches.map((b) => scoreBatch(b, scoringTimeout)));
    const results = settledScores.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    const failed = settledScores.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) errors.push(`scoring: ${(failed.reason as Error)?.message?.slice(0, 160) || "failed"}`);
    await prisma.$transaction(
      results.map((r) =>
        prisma.radarItem.update({
          where: { id: r.id },
          data: { score: r.score, verdict: r.verdict, leadType: r.leadType, reason: r.reason, angle: r.angle },
        }),
      ),
    );
    scoredIds.push(...results.map((r) => r.id));
  } else if (pending.length) {
    errors.push("scoring skipped: OPENAI_API_KEY not set");
  }

  let digestSent = false;
  if (opts.digest && scoredIds.length) {
    const strong = await prisma.radarItem.findMany({
      where: { id: { in: scoredIds }, score: { gte: DIGEST_MIN_SCORE }, verdict: { in: ["lead", "maybe"] } },
      orderBy: { score: "desc" },
    });
    if (strong.length) {
      const rows = strong
        .map(
          (s) =>
            `<li style="margin-bottom:12px"><a href="${escapeHtml(s.url)}">${escapeHtml(s.title)}</a> <b>${s.score}</b><br/>` +
            `<span style="color:#666">${escapeHtml([s.company, s.location, s.source].filter(Boolean).join(" · "))}</span><br/>` +
            `${escapeHtml(s.reason || "")}${s.angle ? `<br/><i>Pitch: ${escapeHtml(s.angle)}</i>` : ""}</li>`,
        )
        .join("");
      const sent = await sendEmail({
        to: process.env.RADAR_DIGEST_TO || SITE_CONFIG.contact.email,
        subject: `Radar: ${strong.length} new possible project${strong.length === 1 ? "" : "s"}`,
        html: emailLayout(
          "New possible projects",
          `<ul style="padding-left:18px">${rows}</ul><p><a href="${SITE_CONFIG.url}/admin/radar">Open the Radar</a></p>`,
        ),
      });
      digestSent = sent.ok;
      if (!sent.ok) errors.push(`digest: ${sent.error}`);
    }
  }

  // Keep the table lean: dismissed noise goes after 90 days.
  await prisma.radarItem.deleteMany({
    where: { status: "dismissed", updatedAt: { lt: new Date(Date.now() - DISMISSED_KEEP_DAYS * 86_400_000) } },
  });

  const backlog = await prisma.radarItem.count({ where: { verdict: "unscored", status: "new" } });
  const result: RadarRunResult = {
    at: new Date().toISOString(),
    fetched: raw.length,
    kept: kept.length,
    added,
    scored: scoredIds.length,
    backlog,
    digestSent,
    errors,
  };
  await prisma.appSetting.upsert({
    where: { key: LAST_RUN_KEY },
    update: { value: JSON.stringify(result) },
    create: { key: LAST_RUN_KEY, value: JSON.stringify(result) },
  });
  return result;
}

export async function getLastRadarRun(): Promise<RadarRunResult | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: LAST_RUN_KEY } });
  try {
    return row ? (JSON.parse(row.value) as RadarRunResult) : null;
  } catch {
    return null;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
