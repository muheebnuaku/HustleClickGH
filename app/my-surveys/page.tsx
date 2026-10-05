"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { PageHeader, StatCard } from "@/components/ui/page-kit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Eye,
  Trash2,
  Copy,
  Check,
  BarChart3,
  Clock,
  Users,
  Pause,
  Play,
  ClipboardList, FileEdit } from "lucide-react";
import { format } from "date-fns";

interface Survey {
  id: string;
  title: string;
  description: string;
  shareCode: string;
  status: string;
  maxRespondents: number;
  currentRespondents: number;
  expiresAt: string;
  createdAt: string;
  questions: { id: string }[];
  _count: { responses: number };
}

export default function MySurveysPage() {
  const { status } = useSession();
  const router = useRouter();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    fetchSurveys();
  }, []);

  const fetchSurveys = async () => {
    try {
      const res = await fetch("/api/my-surveys");
      if (res.ok) {
        const data = await res.json();
        setSurveys(data);
      }
    } catch (error) {
      console.error("Error fetching surveys:", error);
    } finally {
      setLoading(false);
    }
  };

  const copyShareLink = async (shareCode: string, surveyId: string) => {
    const link = `${window.location.origin}/s/${shareCode}`;
    await navigator.clipboard.writeText(link);
    setCopiedId(surveyId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleStatus = async (surveyId: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "paused" : "active";
    try {
      const res = await fetch(`/api/my-surveys/${surveyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setSurveys((prev) =>
          prev.map((s) => (s.id === surveyId ? { ...s, status: newStatus } : s))
        );
      }
    } catch (error) {
      console.error("Error updating survey:", error);
    }
  };

  const deleteSurvey = async (surveyId: string) => {
    if (!confirm("Are you sure you want to delete this survey? All responses will be lost.")) {
      return;
    }

    setDeletingId(surveyId);
    try {
      const res = await fetch(`/api/my-surveys/${surveyId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSurveys((prev) => prev.filter((s) => s.id !== surveyId));
      }
    } catch (error) {
      console.error("Error deleting survey:", error);
    } finally {
      setDeletingId(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <PageHeader
          icon={FileEdit}
          title="My Surveys"
          description="Create and manage your own surveys."
          actions={
            <Button onClick={() => router.push("/my-surveys/create")} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              <Plus size={16} />
              Create survey
            </Button>
          }
        />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={ClipboardList} tone="blue" label="Total surveys" value={surveys.length} />
          <StatCard icon={Play} tone="green" label="Active" value={surveys.filter((s) => s.status === "active").length} />
          <StatCard icon={BarChart3} tone="purple" label="Responses" value={surveys.reduce((acc, s) => acc + s._count.responses, 0)} />
          <StatCard icon={Clock} tone="amber" label="Remaining" value={10 - surveys.length} hint="of 10 allowed" />
        </div>

        {/* Surveys List */}
        {surveys.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <ClipboardList className="h-16 w-16 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Surveys Yet</h3>
              <p className="text-zinc-500 mb-6">
                Create your first survey and start collecting responses!
              </p>
              <Button
                onClick={() => router.push("/my-surveys/create")}
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus size={18} className="mr-2" />
                Create Your First Survey
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {surveys.map((survey) => (
              <Card key={survey.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex flex-col lg:flex-row">
                    {/* Main Info */}
                    <div className="flex-1 p-4 lg:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-lg">{survey.title}</h3>
                            <span
                              className={`px-2 py-0.5 text-xs rounded-full ${
                                survey.status === "active"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              }`}
                            >
                              {survey.status}
                            </span>
                          </div>
                          <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-3">
                            {survey.description}
                          </p>
                          <div className="flex flex-wrap gap-4 text-sm text-zinc-500">
                            <span className="flex items-center gap-1">
                              <Users size={14} />
                              {survey._count.responses}/{survey.maxRespondents} responses
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={14} />
                              Expires {format(new Date(survey.expiresAt), "MMM d, yyyy")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex lg:flex-col items-center justify-between lg:justify-center gap-2 p-4 lg:p-6 bg-zinc-50 dark:bg-zinc-900/50 border-t lg:border-t-0 lg:border-l border-zinc-200 dark:border-zinc-800">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyShareLink(survey.shareCode, survey.id)}
                        className="flex-1 lg:flex-none lg:w-full"
                      >
                        {copiedId === survey.id ? (
                          <>
                            <Check size={14} className="mr-1" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={14} className="mr-1" />
                            Copy Link
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/my-surveys/${survey.id}`)}
                        className="flex-1 lg:flex-none lg:w-full"
                      >
                        <Eye size={14} className="mr-1" />
                        View
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleStatus(survey.id, survey.status)}
                        >
                          {survey.status === "active" ? (
                            <Pause size={14} />
                          ) : (
                            <Play size={14} />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteSurvey(survey.id)}
                          disabled={deletingId === survey.id}
                          className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
