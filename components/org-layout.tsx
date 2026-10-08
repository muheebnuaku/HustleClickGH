"use client";

// Client portal shell — "HustleClickGH for Business". Same structure as the admin
// console (dark sidebar, grouped nav, breadcrumb top bar) with the business
// accent, so clients get a modern, familiar workspace.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, FolderKanban, ClipboardCheck, Wallet, Settings, LogOut, Menu, X, Plus,
  ChevronRight, MessageCircle, type LucideIcon,
} from "lucide-react";
import { cn, formatUsd } from "@/lib/utils";
import { SITE_CONFIG } from "@/lib/constants";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: "review" };
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Workspace", items: [{ href: "/org", label: "Overview", icon: LayoutDashboard }] },
  {
    title: "Data",
    items: [
      { href: "/org/projects", label: "Projects", icon: FolderKanban },
      { href: "/org/review", label: "Review queue", icon: ClipboardCheck, badge: "review" },
    ],
  },
  { title: "Billing", items: [{ href: "/org/wallet", label: "Wallet & billing", icon: Wallet }] },
  { title: "Account", items: [{ href: "/org/settings", label: "Settings", icon: Settings }] },
];

const WHATSAPP = SITE_CONFIG.social.find((s) => s.key === "whatsapp")?.url;

export function OrgLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [org, setOrg] = useState<{ name: string; walletBalance: number } | null>(null);
  const [toReview, setToReview] = useState(0);

  useEffect(() => {
    let alive = true;
    fetch("/api/org/me").then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d?.org) setOrg({ name: d.org.name, walletBalance: d.org.walletBalance ?? 0 }); }).catch(() => {});
    fetch("/api/org/projects").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (alive && d?.projects) setToReview(d.projects.reduce((n: number, p: { toReview?: number }) => n + (p.toReview ?? 0), 0));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "unset";
    return () => { document.body.style.overflow = "unset"; };
  }, [open]);

  const isActive = (href: string) => (href === "/org" ? pathname === "/org" : pathname === href || pathname.startsWith(`${href}/`));
  // /org/projects/[id]/review belongs to "Review queue"; other project pages to "Projects".
  const current = /^\/org\/projects\/[^/]+\/review/.test(pathname)
    ? NAV_GROUPS[1].items[1]
    : NAV_GROUPS.flatMap((g) => g.items).filter((i) => isActive(i.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const isNested = !!current && pathname !== current.href;
  const name = org?.name || "Your organization";
  const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "HC";

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-300">
      {/* Brand */}
      <Link href="/org" onClick={onNavigate} className="flex h-16 shrink-0 items-center gap-2 px-5">
        <span className="truncate text-[15px] font-semibold tracking-tight text-white">HustleClickGH</span>
        <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">Business</span>
      </Link>

      {/* Primary action */}
      <div className="shrink-0 px-3 pb-2">
        <Link
          href="/org/projects?new=1"
          onClick={onNavigate}
          className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 transition-colors hover:bg-emerald-400"
        >
          <Plus size={16} />New project
        </Link>
      </div>

      <nav className="scrollbar-none flex-1 min-h-0 space-y-5 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{g.title}</p>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = current?.href === item.href;
                const badge = item.badge === "review" ? toReview : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-white/10 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-zinc-100",
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-emerald-400" />}
                    <Icon size={17} className={active ? "text-emerald-300" : "text-zinc-500 group-hover:text-zinc-300"} />
                    <span className="truncate">{item.label}</span>
                    {badge > 0 && (
                      <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold text-white">{badge > 99 ? "99+" : badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Organization + actions */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <Link href="/org/settings" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-semibold text-white">{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-zinc-100">{name}</span>
            <span className="block truncate text-[11px] text-zinc-500">{org ? `${formatUsd(org.walletBalance)} in wallet` : "Client account"}</span>
          </span>
        </Link>
        <div className={cn("mt-1 grid gap-1.5", WHATSAPP ? "grid-cols-2" : "grid-cols-1")}>
          {WHATSAPP && (
            <a href={WHATSAPP} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 px-2 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white">
              <MessageCircle size={14} />Help
            </a>
          )}
          <button onClick={() => signOut({ callbackUrl: "/" })} className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 px-2 py-2 text-xs font-medium text-zinc-300 hover:bg-red-500/15 hover:text-red-300">
            <LogOut size={14} />Log out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-zinc-800 lg:block">{sidebar()}</aside>

      {/* Mobile drawer */}
      <div
        className={cn("fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden", open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")}
        onClick={() => setOpen(false)}
      />
      <aside className={cn("fixed left-0 top-0 z-50 h-full w-72 shadow-2xl transition-transform duration-300 ease-in-out lg:hidden", open ? "translate-x-0" : "-translate-x-full")}>
        <button onClick={() => setOpen(false)} className="absolute right-3 top-4 z-10 rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white" aria-label="Close menu">
          <X size={20} />
        </button>
        {sidebar(() => setOpen(false))}
      </aside>

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button onClick={() => setOpen(true)} className="relative -ml-2 rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:hidden" aria-label="Open menu">
              <Menu size={20} />
              {toReview > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" />}
            </button>
            <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Breadcrumb">
              <span className="hidden text-zinc-400 sm:inline">Business</span>
              <ChevronRight size={14} className="hidden shrink-0 text-zinc-300 sm:inline" />
              {isNested && current ? (
                <>
                  <Link href={current.href} className="truncate text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">{current.label}</Link>
                  <ChevronRight size={14} className="shrink-0 text-zinc-300" />
                  <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">Details</span>
                </>
              ) : (
                <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{current?.label ?? "Overview"}</span>
              )}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/org/wallet"
                className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
                title="Wallet balance — add funds"
              >
                <Wallet size={14} />
                <span className="tabular-nums">{org ? formatUsd(org.walletBalance) : "—"}</span>
              </Link>
              <Link href="/org/settings" className="hidden h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[11px] font-semibold text-white sm:flex" title={name}>
                {initials}
              </Link>
            </div>
          </div>
        </header>

        {/* min-w-0 stops wide content from widening the page */}
        <main className="mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
