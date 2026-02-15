"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, Mail, Phone, Search, User, Wallet, TrendingUp, Users } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

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
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  totalPaidOut: number;
  totalBalance: number;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [users, setUsers] = useState<UserData[]>([]);
  const [stats, setStats] = useState<UserStats>({ totalUsers: 0, activeUsers: 0, totalPaidOut: 0, totalBalance: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(data.users || []);
      setStats(data.stats || { totalUsers: 0, activeUsers: 0, totalPaidOut: 0, totalBalance: 0 });
    } catch (error) {
      console.error("Failed to fetch users:", error);
    } finally {
      setIsLoading(false);
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

  const filteredUsers = users.filter((user) =>
    user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.userId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.phone.includes(searchTerm)
  );

  const exportEmails = () => {
    const emails = filteredUsers.map(u => u.email).join("\n");
    navigator.clipboard.writeText(emails);
    alert(`${filteredUsers.length} emails copied to clipboard!`);
  };

  const exportPhones = () => {
    const phones = filteredUsers.map(u => u.phone).join("\n");
    navigator.clipboard.writeText(phones);
    alert(`${filteredUsers.length} phone numbers copied to clipboard!`);
  };

  const exportCSV = () => {
    const headers = ["User ID", "Name", "Email", "Phone", "Balance", "Total Earned", "Surveys", "Referrals", "Joined"];
    const rows = filteredUsers.map(u => [
      u.userId, u.fullName, u.email, u.phone, u.balance, u.totalEarned, u.surveysCompleted, u.referralCount, formatDate(u.createdAt)
    ]);
    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  if (status === "loading" || isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">User Management</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1">
              Manage all registered users
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                  <Users className="text-blue-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Total Users</p>
                  <p className="text-2xl font-bold text-foreground">{stats.totalUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                  <User className="text-green-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Active Users</p>
                  <p className="text-2xl font-bold text-foreground">{stats.activeUsers}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                  <TrendingUp className="text-purple-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Total Paid Out</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.totalPaidOut)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
                  <Wallet className="text-orange-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-zinc-500">Total Balance</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(stats.totalBalance)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search & Export */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
                <Input
                  placeholder="Search by name, email, user ID, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={exportEmails}>
                  <Mail size={18} />
                  Emails
                </Button>
                <Button variant="outline" onClick={exportPhones}>
                  <Phone size={18} />
                  Phones
                </Button>
                <Button variant="outline" onClick={exportCSV}>
                  <Download size={18} />
                  CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Users ({filteredUsers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                {searchTerm ? "No users match your search" : "No users registered yet"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800">
                      <th className="text-left py-3 px-4 text-sm font-medium text-zinc-500">User</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-zinc-500">Contact</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-zinc-500">Balance</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-zinc-500">Earned</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-zinc-500">Surveys</th>
                      <th className="text-center py-3 px-4 text-sm font-medium text-zinc-500">Referrals</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-zinc-500">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium text-foreground">{user.fullName}</p>
                            <p className="text-xs text-zinc-500">{user.userId}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div>
                            <p className="text-sm text-foreground">{user.email}</p>
                            <p className="text-xs text-zinc-500">{user.phone}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-medium text-green-600">{formatCurrency(user.balance)}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-foreground">{formatCurrency(user.totalEarned)}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-foreground">{user.surveysCompleted}</span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="text-foreground">{user.referralCount}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-zinc-500">{formatDate(user.createdAt)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
