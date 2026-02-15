"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, Clock, RefreshCw } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Withdrawal {
  id: string;
  userId: string;
  user: {
    userId: string;
    fullName?: string;
  };
  amount: number;
  paymentMethod: string;
  mobileNumber: string;
  accountName?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  processedAt?: string;
}

export default function AdminPaymentsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [payments, setPayments] = useState<Withdrawal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPayments = async () => {
    try {
      const res = await fetch("/api/admin/withdrawals");
      const data = await res.json();
      setPayments(data.withdrawals || []);
    } catch (error) {
      console.error("Failed to fetch payments:", error);
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
      fetchPayments();
    }
  }, [status, router, session]);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/withdrawals/${id}/approve`, { method: "POST" });
      if (res.ok) {
        await fetchPayments();
      }
    } catch (error) {
      console.error("Failed to approve:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setProcessingId(id);
    try {
      const res = await fetch(`/api/withdrawals/${id}/reject`, { method: "POST" });
      if (res.ok) {
        await fetchPayments();
      }
    } catch (error) {
      console.error("Failed to reject:", error);
    } finally {
      setProcessingId(null);
    }
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

  const filteredPayments = filter === "all" ? payments : payments.filter(p => p.status === filter);
  const totalPending = payments.filter(p => p.status === "pending").reduce((sum, p) => sum + p.amount, 0);
  const totalApproved = payments.filter(p => p.status === "approved").reduce((sum, p) => sum + p.amount, 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Payment Management</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            Review and process withdrawal requests
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-zinc-500">Pending</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {formatCurrency(totalPending)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-zinc-500">Approved</p>
                <p className="text-3xl font-bold text-green-600">
                  {formatCurrency(totalApproved)}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-zinc-500">Total Requests</p>
                <p className="text-3xl font-bold text-blue-600">{payments.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              {["all", "pending", "approved", "rejected"].map((status) => (
                <Button
                  key={status}
                  variant={filter === status ? "primary" : "outline"}
                  onClick={() => setFilter(status as "all" | "pending" | "approved" | "rejected")}
                  size="sm"
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Payments List */}
        <Card>
          <CardHeader>
            <CardTitle>Withdrawal Requests ({filteredPayments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredPayments.map((payment) => (
                <div
                  key={payment.id}
                  className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-2xl font-bold text-green-600">{formatCurrency(payment.amount)}</p>
                        {payment.status === "pending" && (
                          <Clock size={20} className="text-yellow-600" />
                        )}
                        {payment.status === "approved" && (
                          <Check size={20} className="text-green-600" />
                        )}
                        {payment.status === "rejected" && (
                          <X size={20} className="text-red-600" />
                        )}
                      </div>
                      <p className="font-medium text-foreground mb-1">{payment.user.fullName || payment.user.userId} ({payment.userId})</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {payment.paymentMethod} • {payment.mobileNumber}
                      </p>
                      {payment.accountName && (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          Account: {payment.accountName}
                        </p>
                      )}
                      <p className="text-xs text-zinc-500 mt-2">
                        Requested: {formatDate(payment.createdAt)}
                        {payment.processedAt && ` • Processed: ${formatDate(payment.processedAt)}`}
                      </p>
                    </div>

                    {payment.status === "pending" && (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleApprove(payment.id)}
                          className="bg-green-600 hover:bg-green-700"
                          disabled={processingId === payment.id}
                        >
                          <Check size={18} />
                          {processingId === payment.id ? "Processing..." : "Approve"}
                        </Button>
                        <Button
                          onClick={() => handleReject(payment.id)}
                          variant="outline"
                          className="text-red-600 border-red-600"
                          disabled={processingId === payment.id}
                        >
                          <X size={18} />
                          Reject
                        </Button>
                      </div>
                    )}

                    {payment.status !== "pending" && (
                      <div>
                        <span
                          className={`px-4 py-2 rounded-full text-sm font-medium ${
                            payment.status === "approved"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                        >
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
