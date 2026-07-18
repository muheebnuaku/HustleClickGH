"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Mail, Phone, Search, User, Wallet, TrendingUp, Users, Lock, Unlock, MapPin, BadgeCheck } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { VerifiedBadge } from "@/components/verified-badge";

interface UserData {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  balance: number;
  totalEarned: number;
  surveysCompleted: number;
  referralCount: number;
  createdAt: string;
  role: string;
  status: string;
  verified: boolean;
  locationRequested: boolean;
  country: string | null;
  region: string | null;
  city: string | null;
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  verifiedUsers: number;
  missingLocation: number;
  totalPaidOut: number;
  totalBalance: number;
}

const EMPTY_STATS: UserStats = {
  totalUsers: 0,
  activeUsers: 0,
  suspendedUsers: 0,
  verifiedUsers: 0,
  missingLocation: 0,
  totalPaidOut: 0,
  totalBalance: 0,
};

const UNKNOWN = "Unknown";

export default function AdminUsersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<UserData[]>([]);
  const [stats, setStats] = useState<UserStats>(EMPTY_STATS);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCountry, setFilterCountry] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "suspended">("all");
  const [suspendingId, setSuspendingId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [requestingLocation, setRequestingLocation] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(data.users || []);
      setStats(data.stats || EMPTY_STATS);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuspendUser = async (userId: string, currentStatus: string) => {
    setSuspendingId(userId);
    try {
      const action = currentStatus === "active" ? "suspend" : "unsuspend";
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action }),
      });
      if (res.ok) await fetchUsers();
    } catch (error) {
      console.error("Failed to update user status:", error);
    } finally {
      setSuspendingId(null);
    }
  };

  const handleVerifyUser = async (userId: string, currentlyVerified: boolean) => {
    setVerifyingId(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: currentlyVerified ? "unverify" : "verify" }),
      });
      if (res.ok) await fetchUsers();
    } catch (error) {
      console.error("Failed to update verification:", error);
    } finally {
      setVerifyingId(null);
    }
  };

  const handleRequestLocation = async () => {
    if (!confirm(`Ask all users without a location (${stats.missingLocation}) to provide it? They'll see a location prompt on their dashboard.`)) return;
    setRequestingLocation(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_location_all" }),
      });
      const data = await res.json();
      alert(data.message || "Done.");
      await fetchUsers();
    } catch (error) {
      console.error("Failed to request location:", error);
    } finally {
      setRequestingLocation(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      if (session?.user?.role !== "admin") {
        router.push("/dashboard");
        return;
      }
      fetchUsers();
    }
  }, [status, router, session]);

  // Country groups with counts, sorted by size (largest first)
  const countryGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const u of users) {
      const c = u.country?.trim() || UNKNOWN;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !q ||
        user.fullName.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q) ||
        user.userId.toLowerCase().includes(q) ||
        user.phone.includes(searchTerm) ||
        (user.city?.toLowerCase().includes(q) ?? false) ||
        (user.region?.toLowerCase().includes(q) ?? false);

      const country = user.country?.trim() || UNKNOWN;
      const matchesCountry = filterCountry === "all" || country === filterCountry;
      const matchesStatus = filterStatus === "all" || user.status === filterStatus;
      return matchesSearch && matchesCountry && matchesStatus;
    });
  }, [users, searchTerm, filterCountry, filterStatus]);

  const exportEmails = () => {
    navigator.clipboard.writeText(filteredUsers.map((u) => u.email).join("\n"));
    alert(`${filteredUsers.length} emails copied to clipboard!`);
  };
  const exportPhones = () => {
    navigator.clipboard.writeText(filteredUsers.map((u) => u.phone).join("\n"));
    alert(`${filteredUsers.length} phone numbers copied to clipboard!`);
  };
  const exportCSV = () => {
    const headers = ["User ID", "Name", "Email", "Phone", "Country", "Region", "City", "Balance", "Total Earned", "Surveys", "Referrals", "Joined"];
    const rows = filteredUsers.map((u) => [
      u.userId, u.fullName, u.email, u.phone, u.country ?? "", u.region ?? "", u.city ?? "",
      u.balance, u.totalEarned, u.surveysCompleted, u.referralCount, formatDate(u.createdAt),
    ]);
    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  const locationLabel = (u: UserData) => {
    const parts = [u.city, u.region, u.country].filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  };

  if (status === "loading" || isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-12 h-12 border-t-2 border-b-2 border-green-500 rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  const statCards = [
    { label: "Total Users", value: stats.totalUsers, icon: Users, color: "blue" },
    { label: "Active", value: stats.activeUsers, icon: User, color: "green" },
    { label: "Suspended", value: stats.suspendedUsers, icon: Lock, color: "red" },
    { label: "Verified", value: stats.verifiedUsers, icon: BadgeCheck, color: "sky" },
    { label: "No Location", value: stats.missingLocation, icon: MapPin, color: "slate" },
    { label: "Total Paid Out", value: formatCurrency(stats.totalPaidOut), icon: TrendingUp, color: "purple" },
    { label: "Total Balance", value: formatCurrency(stats.totalBalance), icon: Wallet, color: "orange" },
  ] as const;

  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 dark:bg-blue-900/30 text-blue-600",
    green: "bg-green-100 dark:bg-green-900/30 text-green-600",
    red: "bg-red-100 dark:bg-red-900/30 text-red-600",
    yellow: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600",
    purple: "bg-purple-100 dark:bg-purple-900/30 text-purple-600",
    orange: "bg-orange-100 dark:bg-orange-900/30 text-orange-600",
    sky: "bg-sky-100 dark:bg-sky-900/30 text-sky-600",
    slate: "bg-slate-100 dark:bg-slate-800 text-slate-600",
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">Manage all registered users</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
          {statCards.map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${colorMap[s.color]}`}>
                    <s.icon size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm text-zinc-500 truncate">{s.label}</p>
                    <p className="text-lg sm:text-2xl font-bold text-foreground truncate">{s.value}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Country groups */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-zinc-600 dark:text-zinc-400">
              <MapPin size={16} /> Groups by country
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setFilterCountry("all")}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                  filterCountry === "all"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                All ({users.length})
              </button>
              {countryGroups.map(([country, count]) => (
                <button
                  key={country}
                  onClick={() => setFilterCountry(country)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition ${
                    filterCountry === country
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  {country} ({count})
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Search & filters */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
              <div className="relative flex-1 lg:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                <Input
                  placeholder="Search name, email, ID, phone, city…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={exportEmails}><Mail size={16} /> Emails</Button>
                <Button variant="outline" size="sm" onClick={exportPhones}><Phone size={16} /> Phones</Button>
                <Button variant="outline" size="sm" onClick={exportCSV}><Download size={16} /> CSV</Button>
                <Button
                  size="sm"
                  onClick={handleRequestLocation}
                  disabled={requestingLocation || stats.missingLocation === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  title="Show a location prompt to users who haven't set their location"
                >
                  <MapPin size={16} />
                  {requestingLocation ? "Sending…" : `Request location (${stats.missingLocation})`}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                className="h-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              <select
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="h-9 rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 text-sm"
              >
                <option value="all">All countries</option>
                {countryGroups.map(([country, count]) => (
                  <option key={country} value={country}>{country} ({count})</option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Users */}
        <Card>
          <CardHeader>
            <CardTitle>Users ({filteredUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">No users match your filters</div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-200 dark:border-zinc-800">
                        <th className="text-left py-3 px-4 text-sm font-medium text-zinc-500">User</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-zinc-500">Email</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-zinc-500">Location</th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-zinc-500">Status</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-zinc-500">Balance</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-zinc-500">Earned</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-zinc-500">Joined</th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-zinc-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                          <td className="py-3 px-4">
                            <p className="font-medium text-foreground flex items-center gap-1.5 break-words">
                              {user.fullName}
                              {user.verified && <VerifiedBadge size={15} />}
                            </p>
                            <p className="text-xs text-zinc-500">{user.userId}</p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="text-sm text-foreground break-all">{user.email}</p>
                            <p className="text-xs text-zinc-500">{user.phone}</p>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-zinc-600 dark:text-zinc-400">{locationLabel(user)}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <StatusBadge status={user.status} />
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-green-600">{formatCurrency(user.balance)}</td>
                          <td className="py-3 px-4 text-right text-foreground">{formatCurrency(user.totalEarned)}</td>
                          <td className="py-3 px-4 text-sm text-zinc-500">{formatDate(user.createdAt)}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-2">
                              <VerifyButton user={user} busy={verifyingId === user.id} onClick={() => handleVerifyUser(user.id, user.verified)} />
                              <SuspendButton user={user} busy={suspendingId === user.id} onClick={() => handleSuspendUser(user.id, user.status)} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="lg:hidden space-y-3">
                  {filteredUsers.map((user) => (
                    <div key={user.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate flex items-center gap-1.5">
                            {user.fullName}
                            {user.verified && <VerifiedBadge size={15} />}
                          </p>
                          <p className="text-xs text-zinc-500">{user.userId}</p>
                        </div>
                        <StatusBadge status={user.status} />
                      </div>
                      <div className="mt-2 space-y-1 text-sm">
                        <p className="text-foreground break-all">{user.email}</p>
                        <p className="text-zinc-500">{user.phone}</p>
                        <p className="text-zinc-500 flex items-center gap-1"><MapPin size={13} /> {locationLabel(user)}</p>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 py-2">
                          <p className="text-xs text-zinc-500">Balance</p>
                          <p className="text-sm font-semibold text-green-600">{formatCurrency(user.balance)}</p>
                        </div>
                        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 py-2">
                          <p className="text-xs text-zinc-500">Earned</p>
                          <p className="text-sm font-semibold text-foreground">{formatCurrency(user.totalEarned)}</p>
                        </div>
                        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 py-2">
                          <p className="text-xs text-zinc-500">Referrals</p>
                          <p className="text-sm font-semibold text-foreground">{user.referralCount}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-xs text-zinc-500">Joined {formatDate(user.createdAt)}</span>
                        <div className="flex items-center gap-2">
                          <VerifyButton user={user} busy={verifyingId === user.id} onClick={() => handleVerifyUser(user.id, user.verified)} />
                          <SuspendButton user={user} busy={suspendingId === user.id} onClick={() => handleSuspendUser(user.id, user.status)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block px-3 py-1 text-xs font-medium rounded shrink-0 ${
        status === "active"
          ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400"
          : "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400"
      }`}
    >
      {status === "active" ? "Active" : "Suspended"}
    </span>
  );
}

function VerifyButton({ user, busy, onClick }: { user: { verified: boolean }; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={user.verified ? "Remove verification badge" : "Give this user a verified badge"}
      className={`px-3 py-1 text-sm font-medium rounded border transition ${
        user.verified
          ? "border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          : "border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
      } ${busy ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {busy ? (
        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <span className="flex items-center gap-1">
          <BadgeCheck size={14} />
          {user.verified ? "Unverify" : "Verify"}
        </span>
      )}
    </button>
  );
}

function SuspendButton({ user, busy, onClick }: { user: { status: string }; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`px-3 py-1 text-sm font-medium rounded border transition ${
        user.status === "active"
          ? "border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
          : "border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
      } ${busy ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {busy ? (
        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : user.status === "active" ? (
        <span className="flex items-center gap-1"><Lock size={14} />Suspend</span>
      ) : (
        <span className="flex items-center gap-1"><Unlock size={14} />Unsuspend</span>
      )}
    </button>
  );
}
