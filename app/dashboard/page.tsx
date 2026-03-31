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
  ClipboardList,
  Users,
  ChevronRight,
  ArrowDownRight,
  Target,
  RefreshCw,
  Database,
  Wallet,
  Bell,
  Mic,
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
  type: "survey" | "withdrawal" | "referral" | "data_project";
  title: string;
  amount: number;
  status: "completed" | "pending" | "approved" | "rejected";
  date: string;
}

interface ActiveDataProject {
  id: string;
  title: string;
  description: string;
  reward: number;
  slotsRemaining: number;
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
  const [activeDataProjects, setActiveDataProjects] = useState<ActiveDataProject[]>([]);

  const fetchData = async () => {
    try {
      const [statsRes, surveysRes, mySurveysRes, dataProjectsRes] = await Promise.all([
        fetch("/api/dashboard/stats"),
        fetch("/api/surveys"),
        fetch("/api/my-surveys"),
        fetch("/api/data-projects"),
      ]);

      const statsData = await statsRes.json();
      const surveysData = await surveysRes.json();
      const mySurveysData = await mySurveysRes.json();
      const dataProjectsData = await dataProjectsRes.json();

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

      // Active data projects with slots remaining
      const projects: ActiveDataProject[] = (dataProjectsData.projects || [])
        .filter((p: { status: string; slotsRemaining: number }) => p.status === "active" && p.slotsRemaining > 0)
        .slice(0, 3)
        .map((p: { id: string; title: string; description: string; reward: number; slotsRemaining: number }) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          reward: p.reward,
          slotsRemaining: p.slotsRemaining,
        }));
      setActiveDataProjects(projects);

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
        <div className="space-y-6 animate-pulse">
          {/* Welcome header skeleton */}
          <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 rounded-2xl p-6">
            <div className="flex items-center justify-between">
              <div className="h-6 w-40 bg-white/30 rounded-lg" />
              <div className="h-9 w-9 bg-white/30 rounded-md" />
            </div>
          </div>

          {/* Quick Actions skeleton */}
          <div>
            <div className="h-6 w-32 bg-zinc-200 dark:bg-zinc-700 rounded mb-4" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="rounded-xl border-2 border-zinc-200 dark:border-zinc-700 p-4 space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-zinc-200 dark:bg-zinc-700" />
                  <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-700 rounded" />
                  <div className="h-3 w-20 bg-zinc-100 dark:bg-zinc-800 rounded" />
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activity skeleton */}
          <div>
            <div className="h-6 w-36 bg-zinc-200 dark:bg-zinc-700 rounded mb-4" />
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-700">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-700 flex-shrink-0" />
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-700 rounded" />
                      <div className="h-3 w-20 bg-zinc-100 dark:bg-zinc-800 rounded" />
                    </div>
                  </div>
                  <div className="space-y-2 text-right">
                    <div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-700 rounded ml-auto" />
                    <div className="h-3 w-12 bg-zinc-100 dark:bg-zinc-800 rounded ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const quickActions = [
    {
      title: "Data Projects",
      description: "Earn by recording",
      icon: Database,
      href: "/data-projects",
      color: "green",
    },
    {
      title: "Take Surveys",
      description: `${stats.availableSurveys} available`,
      icon: ClipboardList,
      href: "/surveys",
      color: "purple",
    },
    {
      title: "My Surveys",
      description: "View and manage",
      icon: ClipboardList,
      href: "/my-surveys",
      color: "blue",
    },
    {
      title: "Withdraw",
      description: "Cash out earnings",
      icon: Wallet,
      href: "/income",
      color: "orange",
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

          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">

                {/* Notifications: Active Data Projects */}
                {activeDataProjects.map((project) => (
                  <Link key={project.id} href={`/data-projects/${project.id}`}>
                    <div className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-100 dark:bg-green-900/30">
                          <Mic className="text-green-600" size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">{project.title}</p>
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-medium">NEW</span>
                          </div>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">{project.slotsRemaining} slots left · Tap to earn</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">+{formatCurrency(project.reward)}</p>
                        <p className="text-xs text-zinc-400">per approval</p>
                      </div>
                    </div>
                  </Link>
                ))}

                {/* Notifications: Available Surveys */}
                {stats.availableSurveys > 0 && (
                  <Link href="/surveys">
                    <div className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30">
                          <Bell className="text-blue-600" size={18} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground">Surveys Available</p>
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium">NEW</span>
                          </div>
                          <p className="text-sm text-zinc-500 dark:text-zinc-400">{stats.availableSurveys} surveys waiting · Tap to earn</p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-zinc-400" />
                    </div>
                  </Link>
                )}

                {/* My Active Surveys */}
                {myActiveSurveys.map((survey) => (
                  <div key={survey.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center bg-purple-100 dark:bg-purple-900/30">
                        <ClipboardList className="text-purple-600" size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{survey.title}</p>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</span>
                        </div>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">Your survey · collecting responses</p>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Transaction History */}
                {recentActivity.slice(0, 5).map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        activity.type === "survey" ? "bg-blue-100 dark:bg-blue-900/30" :
                        activity.type === "withdrawal" ? "bg-orange-100 dark:bg-orange-900/30" :
                        activity.type === "data_project" ? "bg-green-100 dark:bg-green-900/30" :
                        "bg-purple-100 dark:bg-purple-900/30"
                      }`}>
                        {activity.type === "survey" && <ClipboardList className="text-blue-600" size={18} />}
                        {activity.type === "withdrawal" && <ArrowDownRight className="text-orange-600" size={18} />}
                        {activity.type === "data_project" && <Mic className="text-green-600" size={18} />}
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

                {/* Empty state */}
                {activeDataProjects.length === 0 && stats.availableSurveys === 0 && myActiveSurveys.length === 0 && recentActivity.length === 0 && (
                  <div className="py-10 text-center text-zinc-500 dark:text-zinc-400">
                    <Bell size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No activity yet</p>
                    <p className="text-sm mt-1">Complete a survey or data project to get started</p>
                  </div>
                )}

              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
