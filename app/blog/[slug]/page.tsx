import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { BlogCommunity } from "@/components/blog-community";
import { SocialIcon } from "@/components/social-links";
import { excerpt, getCommunityLinks, isWhatsAppUrl, linkify, publishedPost } from "@/lib/blog";
import { SITE_CONFIG } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await publishedPost(slug);
  if (!post) return { title: "Update not found | HustleClickGH" };
  const description = excerpt(post.body, 160);
  return {
    title: `${post.title} | HustleClickGH`,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: `/blog/${post.slug}`,
      publishedTime: post.publishedAt?.toISOString(),
      ...(post.coverImage ? { images: [{ url: post.coverImage }] } : {}),
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const [post, links] = await Promise.all([publishedPost(slug), getCommunityLinks()]);
  if (!post) notFound();

  const shareText = `${post.title}\n${SITE_CONFIG.url}/blog/${post.slug}`;
  const paragraphs = post.body.split(/\n{2,}/);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-zinc-50 pb-16 pt-24 dark:bg-zinc-950">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-8">
          <article className="min-w-0">
            <Link href="/blog" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-foreground">
              <ArrowLeft size={14} /> All updates
            </Link>
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {post.coverImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.coverImage} alt="" className="aspect-[2/1] w-full object-cover" />
              )}
              <div className="p-5 sm:p-8">
                {post.publishedAt && (
                  <time dateTime={post.publishedAt.toISOString()} className="text-xs text-zinc-500">
                    {formatDate(post.publishedAt)}
                  </time>
                )}
                <h1 className="mt-1 text-2xl font-bold text-foreground sm:text-3xl">{post.title}</h1>

                <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {paragraphs.map((para, i) => (
                    <p key={i} className="whitespace-pre-line break-words">
                      {linkify(para).map((part, j) =>
                        part.href ? (
                          <a key={j} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-600 underline underline-offset-2">
                            {part.text}
                          </a>
                        ) : (
                          <span key={j}>{part.text}</span>
                        ),
                      )}
                    </p>
                  ))}
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  {post.linkUrl && (
                    <a
                      href={post.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={
                        isWhatsAppUrl(post.linkUrl)
                          ? "inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                          : "inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                      }
                    >
                      {isWhatsAppUrl(post.linkUrl) ? <SocialIcon name="whatsapp" size={16} /> : <ArrowUpRight size={16} />}
                      {post.linkLabel || (isWhatsAppUrl(post.linkUrl) ? "Join the WhatsApp group" : "Open link")}
                    </a>
                  )}
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  >
                    <SocialIcon name="whatsapp" size={16} className="text-emerald-600" /> Share on WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </article>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <BlogCommunity links={links} />
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
