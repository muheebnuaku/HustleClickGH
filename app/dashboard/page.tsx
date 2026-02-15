"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  Wallet,
  ClipboardList,
  Users,
  ChevronRight,
  ArrowDownRight,
  Target,
  Sparkles,
  RefreshCw,
  PlusCircle,
} from "lucide-react";

interface DashboardStats {
  balance: number;
  totalEarned: number;
  surveysCompleted: number;
  referralCount: number;
  referralEarnings: number;
  pendingWithdrawals: number;
  availableSurveys: number;
}

interface RecentActivity {
  id: string;
  type: "survey" | "withdrawal" | "referral";
  title: string;
  amount: number;
  status: "completed" | "pending" | "approved" | "rejected";
  date: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [stats, setStats] = useState<DashboardStats>({
    balance: 0,
    totalEarned: 0,
    surveysCompleted: 0,
    referralCount: 0,
    referralEarnings: 0,
    pendingWithdrawals: 0,
    availableSurveys: 0,
  });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [myActiveSurveys, setMyActiveSurveys] = useState<{ id: string; title: string; description: string }[]>([]);

  const fetchData = async () => {
    try {
      const [statsRes, surveysRes, mySurveysRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/surveys"),
        fetch("/api/my-surveys"),
      ]);

      const statsData = await statsRes.json();
      const surveysData = await surveysRes.json();
      const mySurveysData = await mySurveysRes.json();

      setStats({
        balance: statsData.balance || 0,
        totalEarned: statsData.totalEarned || 0,
        surveysCompleted: statsData.surveysCompleted || 0,
        referralCount: statsData.referralCount || 0,
        referralEarnings: statsData.referralEarnings || 0,
        pendingWithdrawals: statsData.pendingWithdrawals || 0,
        availableSurveys: surveysData.surveys?.length || 0,
      });

      // Only show user's own active surveys (status: "active")
      setMyActiveSurveys(Array.isArray(mySurveysData)
        ? mySurveysData.filter((s) => s.status === "active").slice(0, 3)
        : []);

      setRecentActivity(statsData.recentActivity || []);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
  };

  if (status === "loading" || isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-200 dark:border-blue-900 rounded-full"></div>
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute top-0 left-0"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const quickActions = [
    {
      title: "Create Survey",
      description: "Start earning now",
      icon: PlusCircle,
      href: "/my-surveys/create",
      color: "orange",
    },
    {
      title: "My Surveys",
      description: "View and manage",
      icon: ClipboardList,
      href: "/my-surveys",
      color: "blue",
    },
    {
      title: "Take Surveys",
      description: `0 available`,
      icon: ClipboardList,
      href: "/surveys",
      color: "purple",
    },
    {
      title: "Withdraw",
      description: "Cash out earnings",
      icon: Wallet,
      href: "/income",
      color: "green",
    },
  ];

  const colorClasses = {
    blue: {
      bg: "bg-blue-100 dark:bg-blue-900/30",
      text: "text-blue-600 dark:text-blue-400",
      border: "border-blue-200 dark:border-blue-800",
    },
    green: {
      bg: "bg-green-100 dark:bg-green-900/30",
      text: "text-green-600 dark:text-green-400",
      border: "border-green-200 dark:border-green-800",
    },
    purple: {
      bg: "bg-purple-100 dark:bg-purple-900/30",
      text: "text-purple-600 dark:text-purple-400",
      border: "border-purple-200 dark:border-purple-800",
    },
    orange: {
      bg: "bg-orange-100 dark:bg-orange-900/30",
      text: "text-orange-600 dark:text-orange-400",
      border: "border-orange-200 dark:border-orange-800",
    },
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Welcome Header */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <h1 className="text-lg md:text-xl font-bold" style={{ marginTop: '-10px' }}>
              Welcome back, {session?.user?.name?.split(" ")[0] || "User"}!
            </h1>
            <Button
              onClick={handleRefresh}
              variant="secondary"
              disabled={isRefreshing}
              size="sm"
              className="bg-white/20 hover:bg-white/30 text-white border-0 h-9 w-9 p-0"
              style={{ marginTop: '-13px' }}
              title="Refresh"
            >
              <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>


        {/* Quick Actions */}
        <div>
          <h2 className="text-xl font-bold text-foreground mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => {
              const colors = colorClasses[action.color as keyof typeof colorClasses];
              return (
                <Link key={action.title} href={action.href}>
                  <Card className={`hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer border-2 ${colors.border} relative overflow-hidden group`}>
                    <CardContent className="p-4">
                      <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                        <action.icon className={colors.text} size={24} />
                      </div>
                      <h3 className="font-semibold text-foreground">{action.title}</h3>
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">{action.description}</p>
                      <ChevronRight className={`absolute bottom-4 right-4 ${colors.text} opacity-0 group-hover:opacity-100 transition-opacity`} size={20} />
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Available Surveys Preview */}
        {stats.availableSurveys > 0 && (
          <Card className="overflow-hidden">
            <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-4 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <Target size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold">Surveys Waiting for You!</h3>
                    <p className="text-sm text-white/80">{stats.availableSurveys} surveys available to complete</p>
                  </div>
                </div>
                <Link href="/surveys">
                  <Button variant="secondary" className="bg-white text-blue-600 hover:bg-white/90">
                    Start Earning
                    <ChevronRight size={18} className="ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-foreground">Recent Activity</h2>
            <Link href="/income" className="text-sm text-blue-600 hover:underline flex items-center gap-1">
              View all <ChevronRight size={16} />
            </Link>
          </div>
          
          {recentActivity.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClipboardList className="text-zinc-400" size={32} />
                </div>
                <h3 className="font-semibold text-foreground mb-2">Active Surveys</h3>
                {/* Show up to 3 active surveys, no buttons or links */}
                {myActiveSurveys.length > 0 ? (
                  <div className="space-y-2">
                    {myActiveSurveys.map((survey) => (
                      <div key={survey.id} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-left">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="text-blue-600" size={18} />
                          <span className="font-medium text-foreground">{survey.title}</span>
                          <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</span>
                        </div>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{survey.description}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No active surveys at the moment.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {recentActivity.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          activity.type === "survey" ? "bg-blue-100 dark:bg-blue-900/30" :
                          activity.type === "withdrawal" ? "bg-orange-100 dark:bg-orange-900/30" :
                          activity.type === "referral" ? "bg-purple-100 dark:bg-purple-900/30" :
                          "bg-green-100 dark:bg-green-900/30"
                        }`}>
                          {activity.type === "survey" && <ClipboardList className="text-blue-600" size={18} />}
                          {activity.type === "withdrawal" && <ArrowDownRight className="text-orange-600" size={18} />}
                          {activity.type === "referral" && <Users className="text-purple-600" size={18} />}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{activity.title}</p>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">{activity.date}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${
                          activity.type === "withdrawal" ? "text-orange-600" : "text-green-600"
                        }`}>
                          {activity.type === "withdrawal" ? "-" : "+"}{formatCurrency(activity.amount)}
                        </p>
                        <p className={`text-xs px-2 py-0.5 rounded-full inline-block ${
                          activity.status === "completed" || activity.status === "approved"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                            : activity.status === "pending"
                            ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
                            : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                        }`}>
                          {activity.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Tips Card */}
        <Card className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-yellow-200 dark:border-yellow-800">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                <Sparkles className="text-yellow-600 dark:text-yellow-400" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-foreground mb-2">Pro Tips to Earn More</h3>
                <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                  <li>• Check for new surveys daily - they go fast!</li>
                  <li>• Refer friends and earn 10% of their earnings</li>
                  <li>• Complete your profile to unlock premium surveys</li>
                  <li>• Withdraw your earnings when you reach GH₵10</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
