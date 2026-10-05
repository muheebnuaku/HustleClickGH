"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { BiometricReminder } from "@/components/biometric-reminder";
import { LocationPrompt } from "@/components/location-prompt";
import { PushManager } from "@/components/push-manager";
import { PageHeader, Panel } from "@/components/ui/page-kit";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import {
  ClipboardList,
  Users,
  ChevronRight,
  Target,
  RefreshCw,
  Database,
  Wallet,
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
          <div className="flex items-center justify-between">
            <div className="h-7 w-56 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
            <div className="h-9 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
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

  const firstName = session?.user?.name?.split(" ")[0] || "there";

  const quickActions = [
    { title: "Data Projects", description: "Earn by recording", icon: Database, href: "/data-projects", tone: "green" },
    { title: "Take Surveys", description: `${stats.availableSurveys} available`, icon: ClipboardList, href: "/surveys", tone: "purple" },
    { title: "Refer & Earn", description: `${stats.referralCount} referred`, icon: Users, href: "/referral", tone: "blue" },
    { title: "Withdraw", description: "Cash out earnings", icon: Wallet, href: "/income", tone: "amber" },
  ];

  const toneIcon: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    purple: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Admin-triggered location request (hidden unless requested & missing) */}
        <LocationPrompt />
        {/* Browser notification opt-in (hidden once granted or dismissed) */}
        <PushManager />
        {/* Biometric setup reminder (hidden once enrolled or dismissed) */}
        <BiometricReminder />

        <PageHeader
          title={`Welcome back, ${firstName}`}
          description="Your earnings at a glance."
          actions={
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw size={15} className={isRefreshing ? "animate-spin" : ""} />Refresh
            </Button>
          }
        />

        {/* Quick actions */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((a) => (
            <Link key={a.title} href={a.href} className="group">
              <Panel className="flex h-full flex-col items-start gap-2 p-4 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md sm:flex-row sm:items-center sm:gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneIcon[a.tone]}`}>
                  <a.icon size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground sm:truncate">{a.title}</span>
                  <span className="block text-xs text-zinc-500 sm:truncate">{a.description}</span>
                </span>
                <ChevronRight size={16} className="hidden shrink-0 text-zinc-300 group-hover:text-zinc-500 sm:block" />
              </Panel>
            </Link>
          ))}
        </div>

        <div>
          {/* Ways to earn now */}
          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-foreground">Ways to earn now</h2>
              <Link href="/data-projects" className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">All projects <ChevronRight size={14} /></Link>
            </div>
            {activeDataProjects.length === 0 && stats.availableSurveys === 0 && myActiveSurveys.length === 0 ? (
              <div className="py-10 text-center text-sm text-zinc-500">
                <Database size={28} className="mx-auto mb-2 opacity-30" />
                No open projects right now — check back soon.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {activeDataProjects.map((project) => (
                  <Link key={project.id} href={`/data-projects/${project.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10"><Mic className="text-emerald-600" size={17} /></span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{project.title}</p>
                        <p className="text-xs text-zinc-500">{project.slotsRemaining} slots left</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold text-emerald-600">+{formatCurrency(project.reward)}</p>
                      <p className="text-[11px] text-zinc-400">per approval</p>
                    </div>
                  </Link>
                ))}
                {stats.availableSurveys > 0 && (
                  <Link href="/surveys" className="flex items-center justify-between gap-3 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-50 dark:bg-violet-500/10"><Target className="text-violet-600" size={17} /></span>
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{stats.availableSurveys} survey{stats.availableSurveys === 1 ? "" : "s"} waiting</p>
                        <p className="text-xs text-zinc-500">Quick to complete, paid instantly</p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-zinc-400" />
                  </Link>
                )}
                {myActiveSurveys.map((survey) => (
                  <div key={survey.id} className="flex items-center gap-3 p-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-500/10"><ClipboardList className="text-blue-600" size={17} /></span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{survey.title}</p>
                      <p className="text-xs text-zinc-500">Your survey · collecting responses</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </DashboardLayout>
  );
}
