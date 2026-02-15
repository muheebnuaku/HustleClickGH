"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Download, CheckCircle, Clock, XCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { formatCurrency, formatDate } from "@/lib/utils";
import { SITE_CONFIG } from "@/lib/constants";

const withdrawalSchema = z.object({
  amount: z.preprocess(
    (val) => (typeof val === 'string' ? parseFloat(val) : val),
    z.number().min(SITE_CONFIG.survey.minWithdrawal, `Minimum withdrawal is ${SITE_CONFIG.survey.minWithdrawal} GHS`)
  ),
  paymentMethod: z.string().min(1, "Payment method is required"),
  mobileNumber: z.string().min(10, "Mobile number is required"),
  accountName: z.string().min(2, "Account name is required"),
});

type WithdrawalFormData = z.infer<typeof withdrawalSchema>;

interface Withdrawal {
  id: string;
  amount: number;
  paymentMethod: string;
  mobileNumber: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  processedAt?: string;
}

export default function IncomePage() {
  const router = useRouter();
  const { status } = useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [message, setMessage] = useState("");
  const [userBalance, setUserBalance] = useState(0);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm({
    resolver: zodResolver(withdrawalSchema),
  });

  const fetchData = async () => {
    try {
      const [statsRes, withdrawalsRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/withdrawals"),
      ]);
      const statsData = await statsRes.json();
      const withdrawalsData = await withdrawalsRes.json();
      
      setUserBalance(statsData.balance || 0);
      setWithdrawals(withdrawalsData.withdrawals || []);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      fetchData();
    }
  }, [status, router]);

  const onSubmit = async (data: WithdrawalFormData) => {
    setIsLoading(true);
    setMessage("");

    if (data.amount > userBalance) {
      setMessage("❌ Insufficient balance");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Withdrawal request failed");
      }

      setMessage("✓ Withdrawal request submitted! You will be notified once processed.");
      reset();
      await fetchData();
      setTimeout(() => setMessage(""), 5000);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Failed to submit withdrawal request");
    } finally {
      setIsLoading(false);
    }
  };

  if (status === "loading" || isFetching) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Withdraw Earnings</h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-1">
            Request withdrawals via Mobile Money
          </p>
        </div>

        {/* Balance Card */}
        <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-green-700 dark:text-green-400">Available Balance</p>
              <p className="text-5xl font-bold text-green-600 my-2">{formatCurrency(userBalance)}</p>
              <p className="text-sm text-green-700 dark:text-green-400">
                Minimum withdrawal: {formatCurrency(SITE_CONFIG.survey.minWithdrawal)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Withdrawal Form */}
        <Card>
          <CardHeader>
            <CardTitle>Request Withdrawal</CardTitle>
            <CardDescription>
              Enter the amount, select your payment method, and provide your mobile money number
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {message && (
                <div
                  className={`p-4 rounded-lg text-sm ${
                    message.includes("success")
                      ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                      : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                  }`}
                >
                  {message}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="amount" className="text-sm font-medium text-foreground">
                    Amount to Withdraw (GHS)
                  </label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    placeholder="10.00"
                    {...register("amount")}
                    disabled={isLoading}
                  />
                  {errors.amount && (
                    <p className="text-sm text-red-600 dark:text-red-400">{String(errors.amount.message)}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="paymentMethod" className="text-sm font-medium text-foreground">
                    Payment Method
                  </label>
                  <select
                    id="paymentMethod"
                    {...register("paymentMethod")}
                    disabled={isLoading}
                    className="flex h-12 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 dark:focus-visible:ring-zinc-300"
                  >
                    <option value="">Select payment method</option>
                    <option value="MTN Mobile Money">MTN Mobile Money</option>
                    <option value="Vodafone Cash">Vodafone Cash</option>
                    <option value="AirtelTigo Money">AirtelTigo Money</option>
                  </select>
                  {errors.paymentMethod && (
                    <p className="text-sm text-red-600 dark:text-red-400">{String(errors.paymentMethod.message)}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="mobileNumber" className="text-sm font-medium text-foreground">
                    Mobile Money Number
                  </label>
                  <Input
                    id="mobileNumber"
                    placeholder="+233 XX XXX XXXX"
                    {...register("mobileNumber")}
                    disabled={isLoading}
                  />
                  {errors.mobileNumber && (
                    <p className="text-sm text-red-600 dark:text-red-400">{String(errors.mobileNumber.message)}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label htmlFor="accountName" className="text-sm font-medium text-foreground">
                    Account Name
                  </label>
                  <Input
                    id="accountName"
                    placeholder="Your registered name"
                    {...register("accountName")}
                    disabled={isLoading}
                  />
                  {errors.accountName && (
                    <p className="text-sm text-red-600 dark:text-red-400">{String(errors.accountName.message)}</p>
                  )}
                </div>
              </div>

              <Button type="submit" size="lg" disabled={isLoading || userBalance < SITE_CONFIG.survey.minWithdrawal}>
                <Download size={20} />
                {isLoading ? "Processing..." : "Request Withdrawal"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Withdrawal History */}
        <Card>
          <CardHeader>
            <CardTitle>Withdrawal History</CardTitle>
            <CardDescription>Track your withdrawal requests and their status</CardDescription>
          </CardHeader>
          <CardContent>
            {withdrawals.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                No withdrawal history
              </div>
            ) : (
              <div className="space-y-4">
                {withdrawals.map((withdrawal) => (
                  <div
                    key={withdrawal.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border border-zinc-200 dark:border-zinc-800"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-foreground">{formatCurrency(withdrawal.amount)}</p>
                        {withdrawal.status === "approved" && (
                          <CheckCircle size={18} className="text-green-600" />
                        )}
                        {withdrawal.status === "pending" && (
                          <Clock size={18} className="text-yellow-600" />
                        )}
                        {withdrawal.status === "rejected" && (
                          <XCircle size={18} className="text-red-600" />
                        )}
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {withdrawal.paymentMethod} • {withdrawal.mobileNumber}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">{formatDate(withdrawal.createdAt)}</p>
                    </div>
                    <div className="mt-3 sm:mt-0">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          withdrawal.status === "approved"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : withdrawal.status === "pending"
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {withdrawal.status.charAt(0).toUpperCase() + withdrawal.status.slice(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
