// "Join the community" block for the public /blog pages: admin-managed WhatsApp
// group links (AppSetting "community_links") and the official social accounts.

import { ArrowUpRight, Users } from "lucide-react";
import { SITE_CONFIG } from "@/lib/constants";
import { SocialIcon } from "@/components/social-links";
import { isWhatsAppUrl, type CommunityLink } from "@/lib/blog";
import { cn } from "@/lib/utils";

const SOCIAL_CHIP: Record<string, string> = {
  tiktok: "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900",
  youtube: "bg-red-600 text-white",
  whatsapp: "bg-emerald-500 text-white",
  linkedin: "bg-sky-700 text-white",
};

const DEFAULT_GROUP: CommunityLink = { label: "HustleClickGH Community", url: SITE_CONFIG.contact.whatsappGroup, note: "New projects and updates" };

export function BlogCommunity({ links: saved, className }: { links: CommunityLink[]; className?: string }) {
  const links = saved.length ? saved : [DEFAULT_GROUP];
  // On this page WhatsApp means the community group, not a private chat.
  const groupUrl = links.find((l) => isWhatsAppUrl(l.url))?.url ?? SITE_CONFIG.contact.whatsappGroup;
  return (
    <div className={cn("space-y-5", className)}>
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/30">
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <SocialIcon name="whatsapp" size={18} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">Join our WhatsApp groups</h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">New projects and updates, first.</p>
          </div>
        </div>
        <ul className="space-y-2">
            {links.map((l) => (
              <li key={l.url}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-emerald-100 transition hover:ring-emerald-300 dark:bg-zinc-900 dark:ring-emerald-900"
                >
                  {isWhatsAppUrl(l.url) ? (
                    <SocialIcon name="whatsapp" size={18} className="shrink-0 text-emerald-600" />
                  ) : (
                    <Users size={18} className="shrink-0 text-emerald-600" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{l.label}</span>
                    {l.note && <span className="block truncate text-xs text-zinc-500">{l.note}</span>}
                  </span>
                  <span className="shrink-0 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white group-hover:bg-emerald-700">
                    Join
                  </span>
                </a>
              </li>
            ))}
          </ul>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-base font-semibold text-foreground">Follow HustleClickGH</h2>
        <ul className="space-y-2">
          {SITE_CONFIG.social.map((s) => (
            <li key={s.key}>
              <a
                href={s.key === "whatsapp" ? groupUrl : s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", SOCIAL_CHIP[s.key] ?? "bg-zinc-200")}>
                  <SocialIcon name={s.key} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{s.label}</span>
                  <span className="block truncate text-xs text-zinc-500">{s.key === "whatsapp" ? "Join the community group" : s.handle}</span>
                </span>
                <ArrowUpRight size={16} className="shrink-0 text-zinc-400 group-hover:text-zinc-600" />
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
