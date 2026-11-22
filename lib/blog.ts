import { prisma } from "@/lib/prisma";

/**
 * Public updates page (/blog). Admins post news, new projects and community
 * announcements; anyone can read them without an account. WhatsApp group links
 * shown beside the posts are an editable list kept in AppSetting.
 */

export class BlogInputError extends Error {}

export const COMMUNITY_KEY = "community_links";
export const MAX_COMMUNITY_LINKS = 12;

export interface CommunityLink {
  label: string;
  url: string;
  note?: string;
}

export interface BlogInput {
  title?: unknown;
  body?: unknown;
  coverImage?: unknown;
  linkUrl?: unknown;
  linkLabel?: unknown;
  pinned?: unknown;
  published?: unknown;
}

const HTTPS_RE = /^https:\/\/[^\s<>"]+$/i;

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70)
      .replace(/-+$/, "") || "update"
  );
}

async function uniqueSlug(title: string, exceptId?: string): Promise<string> {
  const base = slugify(title);
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const hit = await prisma.blogPost.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function optionalUrl(v: unknown, field: string): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (!HTTPS_RE.test(s) || s.length > 1000) throw new BlogInputError(`${field} must be a full https:// link`);
  return s;
}

/** Validates admin input. `partial` allows PATCH with only some fields. */
export function cleanPostInput(b: BlogInput, partial = false) {
  const data: {
    title?: string;
    body?: string;
    coverImage?: string | null;
    linkUrl?: string | null;
    linkLabel?: string | null;
    pinned?: boolean;
    published?: boolean;
  } = {};
  if (!partial || "title" in b) {
    const t = String(b.title ?? "").trim();
    if (t.length < 3) throw new BlogInputError("Give the update a title (at least 3 characters)");
    if (t.length > 160) throw new BlogInputError("Keep the title under 160 characters");
    data.title = t;
  }
  if (!partial || "body" in b) {
    const body = String(b.body ?? "").replace(/\r\n/g, "\n").trim();
    if (body.length < 3) throw new BlogInputError("Write something in the post");
    if (body.length > 20000) throw new BlogInputError("The post is too long (20,000 characters max)");
    data.body = body;
  }
  if ("coverImage" in b) data.coverImage = optionalUrl(b.coverImage, "Cover image");
  if ("linkUrl" in b) data.linkUrl = optionalUrl(b.linkUrl, "Button link");
  if ("linkLabel" in b) data.linkLabel = String(b.linkLabel ?? "").trim().slice(0, 60) || null;
  if ("pinned" in b) data.pinned = b.pinned === true;
  if ("published" in b) data.published = b.published === true;
  return data;
}

export async function createPost(input: BlogInput, authorId: string) {
  const data = cleanPostInput(input);
  return prisma.blogPost.create({
    data: {
      title: data.title!,
      body: data.body!,
      coverImage: data.coverImage ?? null,
      linkUrl: data.linkUrl ?? null,
      linkLabel: data.linkLabel ?? null,
      pinned: data.pinned ?? false,
      published: data.published ?? false,
      publishedAt: data.published ? new Date() : null,
      slug: await uniqueSlug(data.title!),
      authorId,
    },
  });
}

/** Updates a post. The link stays stable once published, so shared links keep working. */
export async function updatePost(id: string, input: BlogInput) {
  const current = await prisma.blogPost.findUnique({ where: { id } });
  if (!current) return null;
  const data = cleanPostInput(input, true);
  const extra: { slug?: string; publishedAt?: Date } = {};
  if (data.title && data.title !== current.title && !current.publishedAt) extra.slug = await uniqueSlug(data.title, id);
  if (data.published && !current.publishedAt) extra.publishedAt = new Date();
  return prisma.blogPost.update({ where: { id }, data: { ...data, ...extra } });
}

/** Published posts, pinned first, newest first. Empty if the table is missing. */
export async function publishedPosts(take = 50) {
  try {
    return await prisma.blogPost.findMany({
      where: { published: true },
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      take,
    });
  } catch (error) {
    console.error("[blog] list failed:", error);
    return [];
  }
}

export async function publishedPost(slug: string) {
  try {
    return await prisma.blogPost.findFirst({ where: { slug, published: true } });
  } catch (error) {
    console.error("[blog] read failed:", error);
    return null;
  }
}

export async function getCommunityLinks(): Promise<CommunityLink[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: COMMUNITY_KEY } });
    const parsed = row ? JSON.parse(row.value) : [];
    return Array.isArray(parsed) ? parsed.filter((l) => l && HTTPS_RE.test(l.url) && l.label) : [];
  } catch {
    return [];
  }
}

export async function saveCommunityLinks(input: unknown): Promise<CommunityLink[]> {
  if (!Array.isArray(input)) throw new BlogInputError("Links must be a list");
  const links: CommunityLink[] = [];
  for (const raw of input) {
    const label = String(raw?.label ?? "").trim().slice(0, 80);
    const url = String(raw?.url ?? "").trim();
    const note = String(raw?.note ?? "").trim().slice(0, 140);
    if (!label && !url) continue;
    if (!label) throw new BlogInputError("Every link needs a name");
    if (!HTTPS_RE.test(url)) throw new BlogInputError(`"${label}" needs a full https:// link`);
    links.push(note ? { label, url, note } : { label, url });
  }
  if (links.length > MAX_COMMUNITY_LINKS) throw new BlogInputError(`At most ${MAX_COMMUNITY_LINKS} links`);
  await prisma.appSetting.upsert({
    where: { key: COMMUNITY_KEY },
    create: { key: COMMUNITY_KEY, value: JSON.stringify(links) },
    update: { value: JSON.stringify(links) },
  });
  return links;
}

/** First ~N characters of the body as plain text, cut at a word boundary. */
export function excerpt(body: string, max = 220): string {
  // Line breaks become " · " so lists (e.g. pay rates) stay readable on one line.
  const flat = body.trim().replace(/\s*\n+\s*/g, " · ").replace(/\s+/g, " ");
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ") > 120 ? cut.lastIndexOf(" ") : max).trimEnd() + "…";
}

export type BodyPart = { text: string; href?: string };

/** Splits one paragraph into text and https links (rendered as React elements, never raw HTML). */
export function linkify(text: string): BodyPart[] {
  const parts: BodyPart[] = [];
  const re = /https:\/\/[^\s<>"]+[^\s<>".,;:!?)]/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: m[0], href: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function isWhatsAppUrl(url: string): boolean {
  return /^https:\/\/(chat\.whatsapp\.com|wa\.me|whatsapp\.com\/channel|www\.whatsapp\.com\/channel)/i.test(url);
}
