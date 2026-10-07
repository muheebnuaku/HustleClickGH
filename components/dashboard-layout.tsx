"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LogOut, LayoutDashboard, User, Users, Menu, X, ClipboardList, Database, Video, MessageCircle,
  Shield, Wallet, ChevronRight, Network, type LucideIcon,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { useEffect, useState } from "react";
import { IncomingCallListener } from "@/components/incoming-call";
import { VerifiedBadge } from "@/components/verified-badge";
import { useMessages } from "@/app/contexts/MessagesContext";
import { isProjectAvailableToMe } from "@/lib/project-config";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    title: "Earn",
    items: [
      { href: "/data-projects", label: "Data Projects", icon: Database },
      { href: "/surveys", label: "Take Surveys", icon: ClipboardList },
      { href: "/referral", label: "Refer & Earn", icon: Users },
    ],
  },
  { title: "Money", items: [{ href: "/income", label: "Withdraw", icon: Wallet }] },
  {
    title: "Connect",
    items: [
      { href: "/messages", label: "Messages", icon: MessageCircle },
      { href: "/recordings", label: "Recordings", icon: Video },
    ],
  },
  { title: "Account", items: [{ href: "/profile", label: "Profile", icon: User }] },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { unreadCount } = useMessages();
  const [balance, setBalance] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [userName, setUserName] = useState("");
  const [verified, setVerified] = useState(false);
  const [availableProjects, setAvailableProjects] = useState(0);
  const [profileLeaderRole, setLeaderRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (session) {
      fetch("/api/dashboard/stats")
        .then((res) => res.json())
        .then((data) => setBalance(data.balance || 0))
        .catch(() => {});

      fetch("/api/profile")
        .then((res) => res.json())
        .then((data) => {
          if (data.user?.image) setProfileImage(data.user.image);
          if (data.user?.fullName) setUserName(data.user.fullName);
          setVerified(Boolean(data.user?.verified));
          setLeaderRole(data.user?.leaderRole ?? null);
        })
        .catch(() => {});

      // How many data projects this contributor can take right now (sidebar badge).
      fetch("/api/data-projects")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setAvailableProjects((data?.projects ?? []).filter(isProjectAvailableToMe).length))
        .catch(() => {});
    }
  }, [session]);

  // Prevent body scroll when the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [sidebarOpen]);

  const handleLogout = () => signOut({ callbackUrl: "/" });

  // Exact match OR a nested route under it (e.g. /data-projects/[id]).
  const isNavItemActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = [...NAV_GROUPS, { title: "Lead", items: [{ href: "/team", label: "My Team", icon: Network }] }].flatMap((g) => g.items).find((i) => isNavItemActive(i.href));
  const isNested = current ? pathname !== current.href : false;

  // Field-team leaders get a "My Team" section. The session carries the position, so
  // it shows on first paint; /api/profile only refreshes it.
  const leaderRole = profileLeaderRole !== undefined ? profileLeaderRole : session?.user?.leaderRole ?? null;
  const groups = leaderRole
    ? [...NAV_GROUPS.slice(0, 1), { title: "Lead", items: [{ href: "/team", label: "My Team", icon: Network }] }, ...NAV_GROUPS.slice(1)]
    : NAV_GROUPS;

  const name = userName || session?.user?.name || "User";
  const firstName = name.split(/\s+/)[0];
  const isAdmin = session?.user?.role === "admin";
  const isManager = session?.user?.role === "manager";

  const avatar = (size: number) => (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="h-full w-full overflow-hidden rounded-full bg-zinc-800 ring-2 ring-white/10">
        {profileImage ? (
          <Image src={profileImage} alt="Profile" width={size} height={size} className="h-full w-full object-cover" unoptimized />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-200">
            {name.split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || <User size={16} />}
          </div>
        )}
      </div>
      {verified && (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-zinc-950 p-[1px] leading-none">
          <VerifiedBadge size={Math.round(size / 2.6)} />
        </span>
      )}
    </div>
  );

  const sidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-300">
      {/* Brand */}
      <Link href="/dashboard" onClick={onNavigate} className="flex h-16 shrink-0 items-center px-5">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight text-white">HustleClickGH</p>
          <p className="text-[11px] text-zinc-500">{leaderRole === "representative" ? "Country Representative" : leaderRole === "supervisor" ? "Supervisor" : isManager ? "Manager" : "Contributor"}</p>
        </div>
      </Link>

      {/* Balance */}
      <div className="shrink-0 px-3 pb-2">
        <Link
          href="/income"
          onClick={onNavigate}
          className="group block rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white shadow-lg shadow-emerald-900/30"
        >
          <p className="text-xs font-medium text-emerald-50/90">Your balance</p>
          <p className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(balance)}</p>
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-50/90 group-hover:text-white">
            Withdraw<ChevronRight size={13} />
          </p>
        </Link>
      </div>

      {/* Navigation — scrolls on short screens, scrollbar hidden */}
      <nav className="scrollbar-none flex-1 min-h-0 space-y-5 overflow-y-auto px-3 py-3">
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
                    {item.href === "/data-projects" && availableProjects > 0 && (
                      <span
                        className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white"
                        title={`${availableProjects} project${availableProjects === 1 ? "" : "s"} available`}
                      >
                        {availableProjects > 99 ? "99+" : availableProjects}
                      </span>
                    )}
                    {item.href === "/messages" && unreadCount > 0 && (
                      <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Profile + actions */}
      <div className="shrink-0 border-t border-white/10 p-3">
        <Link href="/profile" onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5">
          {avatar(36)}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">{name}</p>
            <p className="truncate text-[11px] text-zinc-500">View profile</p>
          </div>
        </Link>
        <div className={cn("mt-1 grid gap-1.5", isAdmin ? "grid-cols-2" : "grid-cols-1")}>
          {isAdmin && (
            <Link
              href="/admin"
              onClick={onNavigate}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/5 px-2 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10 hover:text-white"
              title="Return to the admin dashboard"
            >
              <Shield size={14} />Admin
            </Link>
          )}
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
      <IncomingCallListener />

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
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="relative -ml-2 rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:hidden"
              aria-label="Open menu"
            >
              <Menu size={20} />
              {availableProjects > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-500" />}
            </button>
            <nav className="flex min-w-0 items-center gap-1.5 text-sm" aria-label="Breadcrumb">
              {isNested && current ? (
                <>
                  <Link href={current.href} className="truncate text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">{current.label}</Link>
                  <ChevronRight size={14} className="shrink-0 text-zinc-300" />
                  <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">Details</span>
                </>
              ) : (
                <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">{current?.label ?? `Hi, ${firstName}`}</span>
              )}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/income"
                className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
                title="Your balance — tap to withdraw"
              >
                <Wallet size={14} />
                <span className="tabular-nums">{formatCurrency(balance)}</span>
              </Link>
              {unreadCount > 0 && (
                <Link href="/messages" className="relative rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800" aria-label="Messages">
                  <MessageCircle size={18} />
                  <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
                </Link>
              )}
              <Link href="/profile" className="hidden sm:block" title="Profile">{avatar(32)}</Link>
            </div>
          </div>
        </header>

        {/* Main content — min-w-0 stops wide tables from widening the page */}
        <main className="mx-auto min-w-0 max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
