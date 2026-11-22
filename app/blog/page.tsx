import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Megaphone, Pin } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { BlogCommunity } from "@/components/blog-community";
import { excerpt, getCommunityLinks, publishedPosts } from "@/lib/blog";
import { formatDate } from "@/lib/utils";

// Re-built at most once a minute; publishing from the admin page refreshes it at once.
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Updates | HustleClickGH",
  description: "News, new paid projects and community announcements from HustleClickGH.",
  alternates: { canonical: "/blog" },
  openGraph: { title: "HustleClickGH Updates", description: "News, new paid projects and community announcements.", url: "/blog" },
};

export default async function BlogPage() {
  const [posts, links] = await Promise.all([publishedPosts(), getCommunityLinks()]);

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-zinc-50 pb-16 pt-24 dark:bg-zinc-950">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <header className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Updates</p>
            <h1 className="mt-1 text-3xl font-bold text-foreground sm:text-4xl">What&apos;s new at HustleClickGH</h1>
            <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
              New paid projects, announcements and news. Join a WhatsApp group to hear first.
            </p>
          </header>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              {posts.length === 0 ? (
                <div className="flex flex-col items-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center dark:border-zinc-700 dark:bg-zinc-900">
                  <Megaphone className="mb-3 text-zinc-400" size={28} />
                  <p className="font-medium text-foreground">No updates yet</p>
                  <p className="mt-1 text-sm text-zinc-500">Join a WhatsApp group so you don&apos;t miss the first one.</p>
                </div>
              ) : (
                posts.map((p) => (
                  <article
                    key={p.id}
                    className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <Link href={`/blog/${p.slug}`} className="block">
                      {p.coverImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.coverImage} alt="" loading="lazy" className="aspect-[2/1] w-full object-cover" />
                      )}
                      <div className="p-5 sm:p-6">
                        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          {p.pinned && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              <Pin size={11} /> Pinned
                            </span>
                          )}
                          {p.publishedAt && <time dateTime={p.publishedAt.toISOString()}>{formatDate(p.publishedAt)}</time>}
                        </div>
                        <h2 className="text-xl font-semibold text-foreground group-hover:text-blue-600">{p.title}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{excerpt(p.body)}</p>
                        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600">
                          Read more <ArrowRight size={14} />
                        </span>
                      </div>
                    </Link>
                  </article>
                ))
              )}
            </div>

            <aside className="lg:sticky lg:top-24 lg:self-start">
              <BlogCommunity links={links} />
            </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
