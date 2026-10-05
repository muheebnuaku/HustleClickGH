"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LogOut, LayoutDashboard, Users, Wallet, MessageSquare, QrCode, Menu, X, Database, Activity, Video, Phone,
  Building2, Bell, ArrowLeftRight, Handshake, ChevronRight, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { LanaPanel } from "@/components/lana-panel";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "People",
    items: [
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/organizations", label: "Organizations", icon: Building2 },
      { href: "/admin/partners", label: "Partner Inquiries", icon: Handshake },
    ],
  },
  {
    title: "Data & work",
    items: [
      { href: "/admin/data-projects", label: "Data Projects", icon: Database },
      { href: "/admin/surveys", label: "Surveys", icon: LayoutDashboard },
    ],
  },
  {
    title: "Money",
    items: [{ href: "/admin/payments", label: "Payments", icon: Wallet }],
  },
  {
    title: "Calls",
    items: [
      { href: "/admin/active-calls", label: "Active Calls", icon: Phone },
      { href: "/admin/call-recordings", label: "Call Recordings", icon: Video },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
      { href: "/admin/blog", label: "Blog", icon: MessageSquare },
      { href: "/admin/qr-code", label: "QR Code", icon: QrCode },
    ],
  },
  {
    title: "System",
    items: [{ href: "/admin/activity-log", label: "Activity Log", icon: Activity }],
  },
];

// Pages reached from another section (no nav item of their own).
const EXTRA_CRUMBS: Record<string, string> = { "/admin/responses": "Surveys" };

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Prevent body scroll when the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [sidebarOpen]);

  const handleLogout = () => signOut({ callbackUrl: "/" });

  // Managers can only see call recordings.
  const isManager = session?.user?.role === "manager";
  const groups = NAV_GROUPS
    .map((g) => ({ ...g, items: isManager ? g.items.filter((i) => i.href.includes("call-recordings")) : g.items }))
    .filter((g) => g.items.length);

  // Exact match OR a nested route under it (e.g. /admin/data-projects/[id]).
  const isNavItemActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = NAV_GROUPS.flatMap((g) => g.items).find((i) => isNavItemActive(i.href));
  const sectionLabel = current?.label ?? Object.entries(EXTRA_CRUMBS).find(([p]) => pathname.startsWith(p))?.[1] ?? "Admin";
  const isNested = current ? pathname !== current.href : false;

  const name = session?.user?.name || "Admin";
  const initials = name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-300">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center gap-3 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 font-bold text-white shadow-lg shadow-blue-600/30">
          H
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">HustleClickGH</p>
          <p className="text-[11px] text-zinc-500">{isManager ? "Manager console" : "Admin console"}</p>
        </div>
      </div>

      {/* Navigation — scrolls on short screens so items are never clipped */}
      <nav className="flex-1 min-h-0 space-y-5 overflow-y-auto px-3 py-3">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{g.title}</p>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const Icon = item.icon;
                const active = isNavItemActive(item.href);
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
                    {active && <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-blue-500" />}
                    <Icon size={17} className={active ? "text-blue-400" : "text-zinc-500 group-hover:text-zinc-300"} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Profile + actions */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-200">
            {initials || "A"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">{name}</p>
            <p className="truncate text-[11px] text-zinc-500">{session?.user?.email}</p>
          </div>
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1.5">
          <Link
            href="/dashboard"
            onClick={onNavigate}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 px-2 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
            title="Use the platform as a normal user"
          >
            <ArrowLeftRight size={14} />User view
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 px-2 py-2 text-xs font-medium text-zinc-300 hover:bg-red-500/15 hover:text-red-300"
          >
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
        className={cn(
          "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-full w-72 shadow-2xl transition-transform duration-300 ease-in-out lg:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <button
          onClick={() => setSidebarOpen(false)}
          className="absolute right-3 top-4 z-10 rounded-lg p-2 text-zinc-400 hover:bg-white/10 hover:text-white"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
        {sidebar(() => setSidebarOpen(false))}
      </aside>

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="-ml-2 rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Breadcrumb">
              <span className="hidden text-zinc-400 sm:inline">Admin</span>
              <ChevronRight size={14} className="hidden shrink-0 text-zinc-300 sm:inline" />
              {isNested && current ? (
                <>
                  <Link href={current.href} className="truncate text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">{sectionLabel}</Link>
                  <ChevronRight size={14} className="shrink-0 text-zinc-300" />
                  <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">Details</span>
                </>
              ) : (
                <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{sectionLabel}</span>
              )}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/dashboard"
                className="hidden items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:flex"
              >
                <ArrowLeftRight size={13} />User view
              </Link>
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-semibold text-white"
                title={name}
              >
                {initials || "A"}
              </div>
            </div>
          </div>
        </header>

        {/* Main content — min-w-0 stops wide tables from widening the page */}
        <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      {session?.user?.role === "admin" && <LanaPanel />}
    </div>
  );
}
