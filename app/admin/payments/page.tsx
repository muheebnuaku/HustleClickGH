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
  requestedAt: string;
  processedAt?: string;
  notes?: string;
}

export default function AdminPaymentsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [payments, setPayments] = useState<Withdrawal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [processingId, setProcessingId] = useState<string | null>(null);
  // Which request is having its rejection reason written, and the text so far
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

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
    const reason = rejectReason.trim();
    if (!reason) return; // the reason is what the user receives — don't send an empty one

    setProcessingId(id);
    try {
      const res = await fetch(`/api/withdrawals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: reason }),
      });
      if (res.ok) {
        setRejectingId(null);
        setRejectReason("");
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
          <div className="w-12 h-12 border-t-2 border-b-2 border-green-500 rounded-full animate-spin"></div>
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
            <div className="flex flex-wrap gap-2">
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
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
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
                      <p className="font-medium text-foreground mb-1 break-words">{payment.user.fullName || payment.user.userId} ({payment.userId})</p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 break-words">
                        {payment.paymentMethod} • {payment.mobileNumber}
                      </p>
                      {payment.accountName && (
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 break-words">
                          Account: {payment.accountName}
                        </p>
                      )}
                      <p className="text-xs text-zinc-500 mt-2">
                        Requested: {formatDate(payment.requestedAt)}
                        {payment.processedAt && ` • Processed: ${formatDate(payment.processedAt)}`}
                      </p>
                    </div>

                    {payment.status === "pending" && (
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <Button
                          onClick={() => handleApprove(payment.id)}
                          className="bg-green-600 hover:bg-green-700"
                          disabled={processingId === payment.id}
                        >
                          <Check size={18} />
                          {processingId === payment.id ? "Processing..." : "Approve"}
                        </Button>
                        <Button
                          onClick={() => { setRejectingId(payment.id); setRejectReason(""); }}
                          variant="outline"
                          className="text-red-600 border-red-600"
                          disabled={processingId === payment.id || rejectingId === payment.id}
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

                  {/* Rejection reason — this text is emailed to the user verbatim */}
                  {rejectingId === payment.id && (
                    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                      <label
                        htmlFor={`reject-reason-${payment.id}`}
                        className="block text-sm font-medium text-foreground mb-1"
                      >
                        Why is this being rejected?
                      </label>
                      <p className="text-xs text-zinc-500 mb-2">
                        {payment.user.fullName || payment.user.userId} will receive this word for word by email.
                      </p>
                      <textarea
                        id={`reject-reason-${payment.id}`}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={3}
                        autoFocus
                        maxLength={500}
                        placeholder="e.g. The Mobile Money number you entered doesn't match the name on your account. Please update it and request again."
                        className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-red-500"
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          onClick={() => handleReject(payment.id)}
                          className="bg-red-600 hover:bg-red-700"
                          disabled={!rejectReason.trim() || processingId === payment.id}
                        >
                          <X size={18} />
                          {processingId === payment.id ? "Rejecting..." : "Confirm rejection"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => { setRejectingId(null); setRejectReason(""); }}
                          disabled={processingId === payment.id}
                        >
                          Cancel
                        </Button>
                        <span className="text-xs text-zinc-400">{rejectReason.length}/500</span>
                      </div>
                    </div>
                  )}

                  {/* Reason given when this was rejected earlier */}
                  {payment.status === "rejected" && payment.notes && (
                    <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
                      <p className="text-xs font-medium text-zinc-500 mb-1">Rejection reason</p>
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 break-words whitespace-pre-wrap">
                        {payment.notes}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
