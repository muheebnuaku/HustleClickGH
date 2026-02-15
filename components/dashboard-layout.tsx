"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { LogOut, LayoutDashboard, User, Wallet, Users, Menu, X, Home, ClipboardList, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useEffect, useState } from "react";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [balance, setBalance] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    if (session) {
      fetch("/api/dashboard/stats")
        .then((res) => res.json())
        .then((data) => setBalance(data.balance || 0))
        .catch(() => {});
      
      // Fetch profile for image
      fetch("/api/profile")
        .then((res) => res.json())
        .then((data) => {
          if (data.user?.image) setProfileImage(data.user.image);
          if (data.user?.fullName) setUserName(data.user.fullName);
        })
        .catch(() => {});
    }
  }, [session]);

  // Prevent body scroll when sidebar is open
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [sidebarOpen]);

  const handleLogout = () => {
    signOut({ callbackUrl: "/" });
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/my-surveys", label: "My Surveys", icon: FileEdit },
    { href: "/surveys", label: "Take Surveys", icon: ClipboardList },
    { href: "/profile", label: "Profile", icon: User },
    { href: "/income", label: "Withdrawals", icon: Wallet },
    { href: "/referral", label: "Refer & Earn", icon: Users },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Top Header */}
      <header className="bg-white dark:bg-black border-b border-zinc-200 dark:border-zinc-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Open menu"
            >
              <Menu size={24} />
            </button>
            <Link href="/dashboard" className="text-xl font-bold text-foreground">
              HustleClickGH
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm text-zinc-500">Balance</p>
              <p className="text-lg font-bold text-green-600">{formatCurrency(balance)}</p>
            </div>
            {/* Profile Image */}
            <Link href="/profile" className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700">
                {profileImage ? (
                  <img 
                    src={profileImage} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <User size={18} className="text-zinc-400" />
                  </div>
                )}
              </div>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut size={18} />
              <span className="hidden sm:inline ml-2">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Mobile Sidebar Overlay */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300",
          sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-72 bg-white dark:bg-zinc-950 z-50 lg:hidden transform transition-transform duration-300 ease-in-out shadow-2xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Sidebar Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
          <Link href="/dashboard" className="text-xl font-bold text-foreground" onClick={() => setSidebarOpen(false)}>
            HustleClickGH
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close menu"
          >
            <X size={24} />
          </button>
        </div>

        {/* Balance Card */}
        <div className="p-4">
          {/* User Profile in Sidebar */}
          <Link 
            href="/profile" 
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-3 p-3 mb-3 rounded-xl bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-700 border-2 border-zinc-300 dark:border-zinc-600">
              {profileImage ? (
                <img 
                  src={profileImage} 
                  alt="Profile" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User size={24} className="text-zinc-400" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground truncate">{userName || "User"}</p>
              <p className="text-sm text-zinc-500">View Profile</p>
            </div>
          </Link>
        </div>

        {/* Sidebar Navigation */}
        <nav className="p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-4 px-4 py-3 rounded-xl transition-all",
                  isActive
                    ? "bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                )}
              >
                <Icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-zinc-200 dark:border-zinc-800">
          <Link
            href="/"
            onClick={() => setSidebarOpen(false)}
            className="flex items-center gap-4 px-4 py-3 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all mb-2"
          >
            <Home size={20} />
            <span className="font-medium">Back to Home</span>
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-4 w-full px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
          >
            <LogOut size={20} />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Desktop Sidebar Navigation */}
          <aside className="hidden lg:block w-64 shrink-0">
            <nav className="bg-white dark:bg-black rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-2 sticky top-24">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                      isActive
                        ? "bg-blue-600 text-white"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    )}
                  >
                    <Icon size={20} />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </div>
  );
}
