import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// First-line, zero/low-cost defenses that run BEFORE the similarity-based
// duplicate check (lib/fraud-check.ts) — built after a real mass-registration
// wave got through: ~30 accounts in one day with garbage names ("Hshjs",
// "Jdhjd" — literally zero vowels), single meme-word names ("Bitcoin",
// "Ethereum", "Demon"), and phone numbers scattered across a narrow digit
// range (534 604 9XX) wide enough that pure edit-distance matching against
// individual accounts missed several of them. The similarity check only ever
// fires when something resembles an EXISTING account — a fresh wave of
// first-of-their-kind junk gets zero scrutiny from it until a second one
// shows up, which is too late. These checks don't need a match to act.
// ---------------------------------------------------------------------------

// Names that are essentially never real full names, seen directly in the
// wave this was built to stop. Deliberately excludes anything with genuine
// name-overlap risk (e.g. "Jesus", "Newton", "Nana" are all real names/
// nicknames people actually have — blocking those would be a real false
// positive, so they're left to the velocity/similarity checks instead).
const JUNK_NAME_WORDS = new Set([
  "bitcoin", "ethereum", "crypto", "money", "cash", "demon", "ghost",
  "waste", "trust", "section", "process", "land", "nation", "look",
  "flex", "shake", "twin", "elonmusk", "richmajesty", "queenstar",
  "hustle", "boss", "king", "queen", "test", "testing", "admin",
]);

function hasVowel(word: string): boolean {
  return /[aeiou]/i.test(word);
}

// Very conservative on purpose — real names, including short Ghanaian names,
// almost always contain a vowel. A name where NO word has one at all is
// essentially never genuine.
export function looksLikeGibberishName(fullName: string): boolean {
  const words = fullName.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  if (words.every((w) => w.length >= 3 && !hasVowel(w))) return true;
  if (words.length === 1 && JUNK_NAME_WORDS.has(words[0])) return true;
  return false;
}

const VELOCITY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const VELOCITY_FLAG_THRESHOLD = 4; // flag for review past this many from one IP
const VELOCITY_BLOCK_THRESHOLD = 8; // hard-block past this many — Ghana's carrier-level

// NAT means many genuine users can share an IP, so this stays high enough
// to avoid catching a busy shared network, only a clear scripted burst.
export async function checkRegistrationVelocity(ip: string | null): Promise<{ count: number; block: boolean }> {
  if (!ip) return { count: 0, block: false };
  const since = new Date(Date.now() - VELOCITY_WINDOW_MS);
  const count = await prisma.activityLog.count({ where: { type: "register", ip, createdAt: { gte: since } } });
  return { count, block: count >= VELOCITY_BLOCK_THRESHOLD };
}

export function velocityWorthFlagging(count: number): boolean {
  return count >= VELOCITY_FLAG_THRESHOLD && count < VELOCITY_BLOCK_THRESHOLD;
}
