"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  ArrowLeft, 
  BarChart3, 
  Clock, 
  ClipboardList, 
  Download, 
  Eye, 
  FileText, 
  LayoutGrid, 
  Loader2, 
  PieChart, 
  RefreshCw, 
  Table as TableIcon, 
  TrendingUp, 
  User, 
  Users, 
  Zap 
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Area,
  AreaChart,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";

interface Survey {
  id: string;
  title: string;
  description: string;
  reward: number;
  _count?: { questions: number };
}

interface ResponseData {
  id: string;
  answers: Record<string, string | string[]>;
  completedAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    userId: string;
  };
}

interface QuestionData {
  id: string;
  text: string;
  type: string;
  options: string[];
  order: number;
}

interface AnalyticsData {
  questionId: string;
  questionText: string;
  type: string;
  data: { name: string; value: number; percentage: number; fullName?: string }[];
  totalResponses: number;
}

const CHART_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
  "#14B8A6", "#A855F7", "#22C55E", "#0EA5E9", "#E11D48",
];

function AdminResponsesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [responses, setResponses] = useState<ResponseData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingResponses, setLoadingResponses] = useState(false);
  const [viewMode, setViewMode] = useState<"analytics" | "table" | "card">("analytics");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [chartType, setChartType] = useState<"bar" | "pie" | "radar">("bar");
  const [dateRange, setDateRange] = useState<"all" | "week" | "month">("all");

  const fetchSurveys = async () => {
    try {
      const res = await fetch("/api/admin/surveys");
      const data = await res.json();
      setSurveys(data.surveys || []);
    } catch (error) {
      console.error("Failed to fetch surveys:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadResponses = async (surveyId: string) => {
    setLoadingResponses(true);
    try {
      const res = await fetch(`/api/admin/surveys/${surveyId}/responses`);
      const data = await res.json();
      setResponses(data.responses || []);
      setQuestions(data.questions || []);
      const survey = surveys.find(s => s.id === surveyId);
      if (survey) setSelectedSurvey(survey);
    } catch (error) {
      console.error("Failed to fetch responses:", error);
    } finally {
      setLoadingResponses(false);
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
      fetchSurveys();
    }
  }, [status, router, session]);

  useEffect(() => {
    const surveyId = searchParams.get("surveyId");
    if (surveyId && surveys.length > 0) {
      loadResponses(surveyId);
    }
  }, [searchParams, surveys]);

  // Filter responses by date range
  const filteredByDateResponses = useMemo(() => {
    if (dateRange === "all") return responses;
    
    const now = new Date();
    const cutoff = new Date();
    if (dateRange === "week") cutoff.setDate(now.getDate() - 7);
    if (dateRange === "month") cutoff.setMonth(now.getMonth() - 1);
    
    return responses.filter(r => new Date(r.completedAt) >= cutoff);
  }, [responses, dateRange]);

  const filteredResponses = filteredByDateResponses.filter((r) =>
    r.user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Generate analytics data for each question
  const analyticsData: AnalyticsData[] = useMemo(() => {
    if (!questions.length || !filteredResponses.length) return [];

    return questions.map((q) => {
      const answerCounts: Record<string, number> = {};
      
      filteredResponses.forEach((r) => {
        const answer = r.answers[q.id];
        if (Array.isArray(answer)) {
          answer.forEach((a) => {
            answerCounts[a] = (answerCounts[a] || 0) + 1;
          });
        } else if (answer) {
          answerCounts[answer] = (answerCounts[answer] || 0) + 1;
        }
      });

      const total = Object.values(answerCounts).reduce((a, b) => a + b, 0);
      const data = Object.entries(answerCounts)
        .map(([name, value]) => ({
          name: name.length > 20 ? name.substring(0, 20) + "..." : name,
          fullName: name,
          value,
          percentage: total > 0 ? Math.round((value / total) * 100) : 0,
        }))
        .sort((a, b) => b.value - a.value);

      return {
        questionId: q.id,
        questionText: q.text,
        type: q.type,
        data,
        totalResponses: filteredResponses.length,
      };
    });
  }, [questions, filteredResponses]);

  // Response timeline data
  const timelineData = useMemo(() => {
    if (!filteredResponses.length) return [];

    const dailyCounts: Record<string, number> = {};
    filteredResponses.forEach((r) => {
      const date = new Date(r.completedAt).toLocaleDateString();
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });

    return Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, responses: count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-14);
  }, [filteredResponses]);

  // Completion rate by hour
  const hourlyData = useMemo(() => {
    if (!filteredResponses.length) return [];

    const hourlyCounts: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hourlyCounts[i] = 0;

    filteredResponses.forEach((r) => {
      const hour = new Date(r.completedAt).getHours();
      hourlyCounts[hour]++;
    });

    return Object.entries(hourlyCounts).map(([hour, count]) => ({
      hour: `${hour}:00`,
      responses: count,
    }));
  }, [filteredResponses]);

  const exportCSV = () => {
    if (!selectedSurvey || questions.length === 0) return;
    
    const headers = ["User ID", "Name", "Email", "Submitted At", ...questions.map(q => q.text)];
    const rows = filteredResponses.map(r => {
      const answerCols = questions.map(q => {
        const answer = r.answers[q.id];
        return Array.isArray(answer) ? answer.join("; ") : (answer || "");
      });
      return [r.user.userId, r.user.fullName, r.user.email, formatDate(r.completedAt), ...answerCols];
    });
    
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedSurvey.title.replace(/\s+/g, "_")}_responses.csv`;
    a.click();
  };

  const copyAllEmails = () => {
    const emails = filteredResponses.map(r => r.user.email).join("\n");
    navigator.clipboard.writeText(emails);
    alert(`${filteredResponses.length} emails copied!`);
  };

  // Custom tooltip for charts
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number; payload?: { fullName?: string; percentage?: number } }[]; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-zinc-800 p-3 rounded-lg shadow-lg border border-zinc-200 dark:border-zinc-700">
          <p className="font-medium text-foreground">{payload[0].payload?.fullName || label}</p>
          <p className="text-blue-600">{payload[0].value} responses</p>
          {payload[0].payload?.percentage && (
            <p className="text-zinc-500 text-sm">{payload[0].payload.percentage}% of total</p>
          )}
        </div>
      );
    }
    return null;
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
            <h1 className="text-3xl font-bold text-foreground">Survey Analytics</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1">
              Visual insights and response analytics
            </p>
          </div>
          {selectedSurvey && (
            <Button variant="outline" onClick={() => { setSelectedSurvey(null); setResponses([]); setQuestions([]); setSelectedQuestion(null); }}>
              <ArrowLeft size={18} />
              Back to Surveys
            </Button>
          )}
        </div>

        {!selectedSurvey ? (
          /* Survey Selection */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {surveys.length === 0 ? (
              <Card className="col-span-full">
                <CardContent className="py-12 text-center">
                  <ClipboardList className="mx-auto text-zinc-400 mb-4" size={48} />
                  <p className="text-zinc-500">No surveys found. Create a survey first.</p>
                </CardContent>
              </Card>
            ) : (
              surveys.map((survey) => (
                <Card 
                  key={survey.id} 
                  className="cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all group"
                  onClick={() => loadResponses(survey.id)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg">{survey.title}</CardTitle>
                      <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition-colors">
                        <BarChart3 className="text-blue-600" size={20} />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-500 line-clamp-2 mb-4">{survey.description}</p>
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">{survey._count?.questions || 0} questions</span>
                      <span className="text-green-600 font-medium">GH₵ {survey.reward.toFixed(2)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : loadingResponses ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center justify-center gap-4">
              <Loader2 className="animate-spin text-blue-600" size={48} />
              <p className="text-zinc-500">Loading analytics data...</p>
            </CardContent>
          </Card>
        ) : filteredResponses.length === 0 && !searchTerm ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="mx-auto text-zinc-400 mb-4" size={48} />
              <p className="text-zinc-500">No responses for this survey yet</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stats Overview - Compact horizontal on mobile */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              <div className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full flex items-center gap-2">
                <Users size={16} />
                <span className="text-sm font-medium whitespace-nowrap">{filteredResponses.length} Responses</span>
              </div>
              
              <div className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-full flex items-center gap-2">
                <ClipboardList size={16} />
                <span className="text-sm font-medium whitespace-nowrap">{questions.length} Questions</span>
              </div>
              
              <div className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-full flex items-center gap-2">
                <TrendingUp size={16} />
                <span className="text-sm font-medium whitespace-nowrap">100% Complete</span>
              </div>
              
              <div className="flex-shrink-0 px-4 py-2 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-full flex items-center gap-2">
                <Clock size={16} />
                <span className="text-sm font-medium whitespace-nowrap">~3 min Avg</span>
              </div>
            </div>

            {/* Controls Row */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col lg:flex-row gap-4 justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={viewMode === "analytics" ? "primary" : "outline"}
                      onClick={() => setViewMode("analytics")}
                      size="sm"
                    >
                      <PieChart size={18} />
                      Analytics
                    </Button>
                    <Button
                      variant={viewMode === "table" ? "primary" : "outline"}
                      onClick={() => setViewMode("table")}
                      size="sm"
                    >
                      <TableIcon size={18} />
                      Table
                    </Button>
                    <Button
                      variant={viewMode === "card" ? "primary" : "outline"}
                      onClick={() => setViewMode("card")}
                      size="sm"
                    >
                      <LayoutGrid size={18} />
                      Cards
                    </Button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                      <button
                        onClick={() => setDateRange("all")}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          dateRange === "all" ? "bg-white dark:bg-zinc-700 shadow-sm text-foreground" : "text-zinc-500 hover:text-foreground"
                        }`}
                      >
                        All Time
                      </button>
                      <button
                        onClick={() => setDateRange("month")}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          dateRange === "month" ? "bg-white dark:bg-zinc-700 shadow-sm text-foreground" : "text-zinc-500 hover:text-foreground"
                        }`}
                      >
                        Month
                      </button>
                      <button
                        onClick={() => setDateRange("week")}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          dateRange === "week" ? "bg-white dark:bg-zinc-700 shadow-sm text-foreground" : "text-zinc-500 hover:text-foreground"
                        }`}
                      >
                        Week
                      </button>
                    </div>
                    
                    <Button variant="outline" onClick={copyAllEmails} size="sm">
                      <User size={18} />
                      Copy Emails
                    </Button>
                    <Button variant="outline" onClick={exportCSV} size="sm">
                      <Download size={18} />
                      Export CSV
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {viewMode === "analytics" && (
              <>
                {/* Response Timeline Chart */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <TrendingUp className="text-blue-600" size={20} />
                        Response Timeline
                      </CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => loadResponses(selectedSurvey.id)}>
                        <RefreshCw size={16} />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={timelineData}>
                          <defs>
                            <linearGradient id="colorResponses" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="date" fontSize={12} stroke="#9CA3AF" />
                          <YAxis fontSize={12} stroke="#9CA3AF" />
                          <Tooltip content={<CustomTooltip />} />
                          <Area 
                            type="monotone" 
                            dataKey="responses" 
                            stroke="#3B82F6" 
                            strokeWidth={2}
                            fill="url(#colorResponses)" 
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Response Heatmap by Hour */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="text-purple-600" size={20} />
                      Peak Response Hours
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hourlyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="hour" fontSize={10} stroke="#9CA3AF" interval={1} />
                          <YAxis fontSize={12} stroke="#9CA3AF" />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="responses" radius={[4, 4, 0, 0]}>
                            {hourlyData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.responses > 0 ? "#8B5CF6" : "#E5E7EB"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                {/* Question Analytics */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="text-green-600" size={20} />
                        Question Breakdown
                      </CardTitle>
                      <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                        <button
                          onClick={() => setChartType("bar")}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                            chartType === "bar" ? "bg-white dark:bg-zinc-700 shadow-sm text-foreground" : "text-zinc-500 hover:text-foreground"
                          }`}
                        >
                          <BarChart3 size={16} />
                        </button>
                        <button
                          onClick={() => setChartType("pie")}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                            chartType === "pie" ? "bg-white dark:bg-zinc-700 shadow-sm text-foreground" : "text-zinc-500 hover:text-foreground"
                          }`}
                        >
                          <PieChart size={16} />
                        </button>
                        <button
                          onClick={() => setChartType("radar")}
                          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${
                            chartType === "radar" ? "bg-white dark:bg-zinc-700 shadow-sm text-foreground" : "text-zinc-500 hover:text-foreground"
                          }`}
                        >
                          <Zap size={16} />
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Question Selector */}
                    <div className="flex flex-wrap gap-2 mb-6">
                      {questions.map((q, idx) => (
                        <button
                          key={q.id}
                          onClick={() => setSelectedQuestion(selectedQuestion === q.id ? null : q.id)}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                            selectedQuestion === q.id || selectedQuestion === null
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200"
                          }`}
                        >
                          Q{idx + 1}
                        </button>
                      ))}
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {analyticsData
                        .filter(a => selectedQuestion === null || a.questionId === selectedQuestion)
                        .map((analytics, idx) => (
                        <div key={analytics.questionId} className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4">
                          <h4 className="font-medium text-foreground mb-4 line-clamp-2">
                            Q{questions.findIndex(q => q.id === analytics.questionId) + 1}: {analytics.questionText}
                          </h4>
                          
                          {chartType === "bar" && (
                            <div className="h-[250px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.data.slice(0, 8)} layout="vertical">
                                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                  <XAxis type="number" fontSize={12} stroke="#9CA3AF" />
                                  <YAxis type="category" dataKey="name" fontSize={11} stroke="#9CA3AF" width={100} />
                                  <Tooltip content={<CustomTooltip />} />
                                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {analytics.data.slice(0, 8).map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                  </Bar>
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          )}

                          {chartType === "pie" && (
                            <div className="h-[250px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <RechartsPie>
                                  <Pie
                                    data={analytics.data.slice(0, 6)}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={80}
                                    paddingAngle={2}
                                    dataKey="value"
                                    label={({ value }) => {
                                      const total = analytics.data.slice(0, 6).reduce((sum, entry) => sum + entry.value, 0);
                                      const percent = total > 0 ? Math.round((value / total) * 100) : 0;
                                      return `${percent}%`;
                                    }}
                                    labelLine={false}
                                  >
                                    {analytics.data.slice(0, 6).map((entry, index) => (
                                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                  </Pie>
                                  <Tooltip content={<CustomTooltip />} />
                                  <Legend />
                                </RechartsPie>
                              </ResponsiveContainer>
                            </div>
                          )}

                          {chartType === "radar" && (
                            <div className="h-[250px]">
                              <ResponsiveContainer width="100%" height="100%">
                                <RadarChart data={analytics.data.slice(0, 6)}>
                                  <PolarGrid />
                                  <PolarAngleAxis dataKey="name" fontSize={10} />
                                  <PolarRadiusAxis fontSize={10} />
                                  <Radar
                                    dataKey="value"
                                    stroke="#3B82F6"
                                    fill="#3B82F6"
                                    fillOpacity={0.5}
                                  />
                                  <Tooltip content={<CustomTooltip />} />
                                </RadarChart>
                              </ResponsiveContainer>
                            </div>
                          )}

                          {/* Quick Stats */}
                          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                            {analytics.data.slice(0, 3).map((item, i) => (
                              <div 
                                key={i} 
                                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 rounded-full"
                              >
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: CHART_COLORS[i] }}
                                />
                                <span className="text-xs font-medium text-foreground">{item.name}</span>
                                <span className="text-xs text-zinc-500">{item.percentage}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Word Cloud / Popular Answers */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="text-yellow-600" size={20} />
                      Top Answers Across All Questions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {analyticsData
                        .flatMap(a => a.data.slice(0, 3))
                        .sort((a, b) => b.value - a.value)
                        .slice(0, 20)
                        .map((item, idx) => (
                          <div
                            key={idx}
                            className="px-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 hover:border-blue-500 transition-colors cursor-default"
                            style={{
                              fontSize: `${Math.max(12, Math.min(18, 10 + item.value * 2))}px`,
                              backgroundColor: `${CHART_COLORS[idx % CHART_COLORS.length]}15`,
                            }}
                          >
                            <span className="font-medium text-foreground">{item.name}</span>
                            <span className="ml-2 text-zinc-500">({item.value})</span>
                          </div>
                        ))
                      }
                    </div>
                  </CardContent>
                </Card>

                {/* Detailed Answers Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="text-blue-600" size={20} />
                      All Responses & Answers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {filteredResponses.map((response, rIdx) => (
                      <div 
                        key={response.id} 
                        className="border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden"
                      >
                        {/* Response Header */}
                        <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
                                {response.user.fullName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-semibold">{response.user.fullName}</p>
                                <p className="text-sm text-white/80">{response.user.email}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-white/60">Response #{rIdx + 1}</p>
                              <p className="text-sm">{formatDate(response.completedAt)}</p>
                            </div>
                          </div>
                        </div>
                        
                        {/* Questions & Answers */}
                        <div className="p-4 space-y-4">
                          {questions.map((q, qIdx) => {
                            const answer = response.answers[q.id];
                            const displayAnswer = Array.isArray(answer) 
                              ? answer.join(", ") 
                              : (answer || "No answer");
                            
                            return (
                              <div key={q.id} className="pb-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 last:pb-0">
                                <div className="flex items-start gap-3">
                                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 flex items-center justify-center text-xs font-bold">
                                    {qIdx + 1}
                                  </span>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400 mb-1">
                                      {q.text}
                                    </p>
                                    <p className="text-foreground font-semibold bg-zinc-50 dark:bg-zinc-800 px-3 py-2 rounded-lg">
                                      {displayAnswer}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}

            {viewMode === "table" && (
              <Card>
                <CardHeader>
                  <Input
                    placeholder="Search by name or email..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="max-w-md"
                  />
                </CardHeader>
                <CardContent>
                  {filteredResponses.length === 0 ? (
                    <div className="py-12 text-center">
                      <FileText className="mx-auto text-zinc-400 mb-4" size={48} />
                      <p className="text-zinc-500">No responses match your search</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-zinc-200 dark:border-zinc-800">
                            <th className="text-left py-3 px-4 text-sm font-medium text-zinc-500">User</th>
                            <th className="text-left py-3 px-4 text-sm font-medium text-zinc-500">Submitted</th>
                            {questions.slice(0, 3).map((q) => (
                              <th key={q.id} className="text-left py-3 px-4 text-sm font-medium text-zinc-500 max-w-[200px] truncate">
                                {q.text}
                              </th>
                            ))}
                            {questions.length > 3 && (
                              <th className="text-center py-3 px-4 text-sm font-medium text-zinc-500">
                                +{questions.length - 3} more
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredResponses.map((r) => (
                            <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                                    {r.user.fullName.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-medium text-foreground">{r.user.fullName}</p>
                                    <p className="text-xs text-zinc-500">{r.user.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-sm text-zinc-500">
                                {formatDate(r.completedAt)}
                              </td>
                              {questions.slice(0, 3).map((q) => (
                                <td key={q.id} className="py-3 px-4 text-sm text-foreground max-w-[200px] truncate">
                                  {Array.isArray(r.answers[q.id]) 
                                    ? (r.answers[q.id] as string[]).join(", ") 
                                    : (r.answers[q.id] || "-")}
                                </td>
                              ))}
                              {questions.length > 3 && (
                                <td className="py-3 px-4 text-center">
                                  <Button variant="ghost" size="sm">
                                    <Eye size={14} />
                                  </Button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {viewMode === "card" && (
              <>
                <Input
                  placeholder="Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-md"
                />
                {filteredResponses.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <FileText className="mx-auto text-zinc-400 mb-4" size={48} />
                      <p className="text-zinc-500">No responses match your search</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredResponses.map((r) => (
                      <Card key={r.id} className="overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-lg font-bold">
                                {r.user.fullName.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <CardTitle className="text-lg text-white">{r.user.fullName}</CardTitle>
                                <p className="text-sm text-white/80">{r.user.email}</p>
                              </div>
                            </div>
                            <span className="text-xs text-white/80 bg-white/20 px-2 py-1 rounded">
                              {formatDate(r.completedAt)}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-4 space-y-3">
                          {questions.map((q, idx) => (
                            <div key={q.id} className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                              <p className="text-xs font-medium text-zinc-500 mb-1">Q{idx + 1}: {q.text}</p>
                              <p className="text-foreground font-medium">
                                {Array.isArray(r.answers[q.id]) 
                                  ? (r.answers[q.id] as string[]).join(", ") 
                                  : (r.answers[q.id] || "-")}
                              </p>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

export default function AdminResponsesPage() {
  return (
    <Suspense fallback={
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    }>
      <AdminResponsesPageContent />
    </Suspense>
  );
}
