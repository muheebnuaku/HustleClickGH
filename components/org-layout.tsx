"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, LayoutDashboard, Database, Wallet, Menu, X, Home, Building2, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

const navItems = [
  { href: "/org", label: "Dashboard", icon: LayoutDashboard },
  { href: "/org/projects", label: "Projects", icon: Database },
  { href: "/org/wallet", label: "Wallet & Billing", icon: Wallet },
  { href: "/org/settings", label: "Settings", icon: Settings },
];

export function OrgLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/org/me").then((r) => r.ok ? r.json() : null).then((d) => { if (alive && d?.org?.name) setOrgName(d.org.name); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "unset";
    return () => { document.body.style.overflow = "unset"; };
  }, [sidebarOpen]);

  const handleLogout = () => signOut({ callbackUrl: "/" });
  const isActive = (href: string) => href === "/org" ? pathname === "/org" : pathname.startsWith(href);

  // Plain render function (not a component) so nav is defined once, not per-render.
  const navLinks = (onClick?: () => void) =>
    navItems.map((item) => {
      const Icon = item.icon;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onClick}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-xl transition-colors",
            isActive(item.href)
              ? "bg-emerald-600 text-white shadow"
              : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          )}
        >
          <Icon size={20} />
          <span className="font-medium">{item.label}</span>
        </Link>
      );
    });

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Top header */}
      <header className="bg-emerald-600 text-white sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-white/20" aria-label="Open menu">
              <Menu size={24} />
            </button>
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
              <Building2 size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-lg truncate">{orgName || "Organization Portal"}</h1>
              <p className="text-xs text-emerald-100 hidden sm:block">HustleClickGH for Business</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-white hover:bg-white/20 shrink-0">
            <LogOut size={18} />
            <span className="hidden sm:inline ml-2">Logout</span>
          </Button>
        </div>
      </header>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300",
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-72 bg-white dark:bg-zinc-950 z-50 lg:hidden transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="shrink-0 flex items-center justify-between p-6 bg-emerald-600 text-white">
          <span className="font-bold">Organization</span>
          <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-white/20" aria-label="Close menu"><X size={24} /></button>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
          {navLinks(() => setSidebarOpen(false))}
        </nav>
        <div className="shrink-0 p-4 border-t border-zinc-200 dark:border-zinc-800">
          <Link href="/" onClick={() => setSidebarOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 mb-2">
            <Home size={20} /><span className="font-medium">Back to Home</span>
          </Link>
          <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
            <LogOut size={20} /><span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="hidden lg:block w-64 shrink-0">
            <nav className="bg-white dark:bg-black rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-2 sticky top-24">
              {navLinks()}
            </nav>
          </aside>
          {/* min-w-0 stops wide children from blowing out the row on desktop */}
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </div>
    </div>
  );
}
