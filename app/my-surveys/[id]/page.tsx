"use client";

// ...existing code...
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from "docx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";

import "jspdf-autotable";
declare module "jspdf" {
  interface jsPDF {
    autoTable: (...args: unknown[]) => jsPDF;
  }
}

import React, { useState, useEffect, Suspense } from "react";

// Helper to export responses to Word
async function exportResponsesToWord(survey: Survey) {
  if (!survey || !survey.responses.length) return;
  const headers = [
    'Respondent Name',
    'Respondent Email',
    'Submitted At',
    ...survey.questions.map(q => q.questionText.replace(/\n/g, ' ')),
  ];
  const rows = survey.responses.map(r => [
    r.user.fullName,
    r.user.email,
    r.submittedAt,
    ...survey.questions.map(q => (r.answers[q.id] || '')),
  ]);
  const tableRows = [
    new TableRow({
      children: headers.map(h => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] }))
    }),
    ...rows.map(row => new TableRow({
      children: row.map(cell => new TableCell({ children: [new Paragraph(String(cell))] }))
    }))
  ];
  const doc = new Document({
    sections: [{ children: [new Table({ rows: tableRows })] }],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${survey.title.replace(/[^a-z0-9]/gi, '_')}_responses.docx`);
}
// Helper to export responses to PDF
function exportResponsesToPDF(survey: Survey) {
  if (!survey || !survey.responses.length) return;
  const doc = new jsPDF();
  const headers = [
    'Respondent Name',
    'Respondent Email',
    'Submitted At',
    ...survey.questions.map(q => q.questionText.replace(/\n/g, ' ')),
  ];
  const rows = survey.responses.map(r => [
    r.user.fullName,
    r.user.email,
    r.submittedAt,
    ...survey.questions.map(q => (r.answers[q.id] || '')),
  ]);
  
  doc.autoTable({ head: [headers], body: rows });
  doc.save(`${survey.title.replace(/[^a-z0-9]/gi, '_')}_responses.pdf`);
}
// Helper to convert responses to CSV
function responsesToCSV(survey: Survey) {
  if (!survey || !survey.responses.length) return '';
  const headers = [
    'Respondent Name',
    'Respondent Email',
    'Submitted At',
    ...survey.questions.map(q => q.questionText.replace(/\n/g, ' ')),
  ];
  const rows = survey.responses.map(r => [
    r.user.fullName,
    r.user.email,
    r.submittedAt,
    ...survey.questions.map(q => (r.answers[q.id] || '')),
  ]);
  return [headers, ...rows].map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Copy,
  Check,
  Users,
  BarChart3,
  Share2,
  ExternalLink,
  MessageSquare,
  PieChart,
  TrendingUp,
  List,
} from "lucide-react";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  Legend,
} from "recharts";

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  options: string | null;
  required: boolean;
  order: number;
}

interface Response {
  id: string;
  answers: Record<string, string>;
  submittedAt: string;
  user: {
    fullName: string;
    email: string;
  };
}

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
  questions: Question[];
  responses: Response[];
}

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

export default function SurveyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = React.use(params);
  const { status } = useSession();
  const router = useRouter();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<Response | null>(null);
  const [activeTab, setActiveTab] = useState<"analytics" | "responses">("analytics");
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Only fetch needed fields for performance
  const fetchSurvey = async () => {
    try {
      const res = await fetch(`/api/my-surveys/${id}?fields=id,title,description,shareCode,status,questions,responses`);
      if (res.ok) {
        const data = await res.json();
        setSurvey(data);
        if (data.questions.length > 0) {
          setSelectedQuestion(data.questions[0].id);
        }
      } else {
        router.push("/my-surveys");
      }
    } catch (error) {
      console.error("Error fetching survey:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSurvey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // TODO: For large surveys, implement server-side pagination for responses
  // TODO: Use Redis or similar caching for frequently accessed survey data
  // TODO: Use background jobs for heavy analytics or notification tasks

  const copyShareLink = async () => {
    if (!survey) return;
    const link = `${window.location.origin}/s/${survey.shareCode}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate timeline data
  const getTimelineData = () => {
    if (!survey) return [];
    const grouped: Record<string, number> = {};
    survey.responses.forEach((r: Response) => {
      const date = format(new Date(r.submittedAt), "MMM d");
      grouped[date] = (grouped[date] || 0) + 1;
    });
    return Object.entries(grouped).map(([date, count]) => ({ date, responses: count }));
  };

  // Generate question breakdown data
  const getQuestionBreakdown = (questionId: string) => {
    if (!survey) return [];
    const question = survey.questions.find((q: Question) => q.id === questionId);
    if (!question) return [];

    const answerCounts: Record<string, number> = {};
    survey.responses.forEach((r: Response) => {
      const answer = r.answers[questionId] || "No answer";
      answerCounts[answer] = (answerCounts[answer] || 0) + 1;
    });

    return Object.entries(answerCounts).map(([answer, count]) => ({
      answer: answer.length > 20 ? answer.substring(0, 20) + "..." : answer,
      fullAnswer: answer,
      count,
      percentage: Math.round((count / survey.responses.length) * 100),
    }));
  };

  // Get average rating for rating questions
  const getAverageRating = (questionId: string) => {
    if (!survey) return 0;
    const ratings = survey.responses
      .map((r: Response) => parseInt(r.answers[questionId] || "0"))
      .filter((r: number) => !isNaN(r) && r > 0);
    if (ratings.length === 0) return 0;
    return (ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length).toFixed(1);
  };

  if (status === "loading" || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
        </div>
      </DashboardLayout>
    );
  }

  if (!survey) {
    return (
      <DashboardLayout>
        <div className="text-center py-12">
          <p>Survey not found</p>
        </div>
      </DashboardLayout>
    );
  }

  const timelineData = getTimelineData();
  const currentQuestion = survey.questions.find((q: Question) => q.id === selectedQuestion);
  const questionData = selectedQuestion ? getQuestionBreakdown(selectedQuestion) : [];

  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-green-500"></div>
        </div>
      </DashboardLayout>
    }>
      <DashboardLayout>
        <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4 w-full">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft size={18} />
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-bold">{survey.title}</h1>
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
              <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-1">
                {survey.description}
              </p>
            </div>
            <Button
              onClick={copyShareLink}
              className="bg-green-600 hover:bg-green-700 shrink-0 rounded-full w-12 h-12 flex items-center justify-center"
              style={{ minWidth: 0, padding: 0 }}
              title="Copy Share Link"
            >
              {copied ? <Check size={22} /> : <Share2 size={22} />}
            </Button>
          </div>
        </div>

        {/* Share Link */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1 w-full sm:w-auto">
                <p className="text-sm font-medium mb-1">Share Link</p>
                <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg px-3 py-2">
                  <code className="text-sm flex-1 truncate">
                    {typeof window !== "undefined"
                      ? `${window.location.origin}/s/${survey.shareCode}`
                      : `/s/${survey.shareCode}`}
                  </code>
                  <button
                    onClick={copyShareLink}
                    className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/s/${survey.shareCode}`, "_blank")}
              >
                <ExternalLink size={16} className="mr-2" />
                Preview
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tab Switcher (Responses first) */}
        <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab("responses")}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
              activeTab === "responses"
                ? "border-green-500 text-green-600"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <List size={18} />
            Responses ({survey.responses.length})
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
              activeTab === "analytics"
                ? "border-green-500 text-green-600"
                : "border-transparent text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <PieChart size={18} />
            Analytics
          </button>
        </div>

        {/* Analytics Tab */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            {survey.responses.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <TrendingUp className="h-16 w-16 mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Data Yet</h3>
                  <p className="text-zinc-500 mb-4">Share your survey to start collecting responses</p>
                  <Button onClick={copyShareLink} className="bg-green-600 hover:bg-green-700">
                    <Share2 size={16} className="mr-2" />
                    Copy Share Link
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Response Timeline */}
                {timelineData.length > 1 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp size={18} className="text-green-500" />
                        Response Timeline
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={timelineData}>
                            <defs>
                              <linearGradient id="colorResponses" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="date" fontSize={12} />
                            <YAxis fontSize={12} />
                            <Tooltip />
                            <Area
                              type="monotone"
                              dataKey="responses"
                              stroke="#10b981"
                              strokeWidth={2}
                              fill="url(#colorResponses)"
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Question Breakdown */}
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <BarChart3 size={18} className="text-blue-500" />
                        Question Breakdown
                      </CardTitle>
                      <select
                        value={selectedQuestion || ""}
                        onChange={(e) => setSelectedQuestion(e.target.value)}
                        className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm max-w-xs"
                      >
                        {survey.questions.map((q: Question, i: number) => (
                          <option key={q.id} value={q.id}>
                            Q{i + 1}: {q.questionText.substring(0, 40)}...
                          </option>
                        ))}
                      </select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {currentQuestion && (
                      <div>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
                          {currentQuestion.questionText}
                        </p>

                        {/* Rating Average */}
                        {currentQuestion.questionType === "rating" && (
                          <div className="mb-4 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-lg">
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">Average Rating</p>
                            <div className="flex items-center gap-2">
                              <span className="text-3xl font-bold text-yellow-600">
                                {getAverageRating(currentQuestion.id)}
                              </span>
                              <span className="text-zinc-400">/ 5</span>
                              <div className="flex ml-2">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <span
                                    key={star}
                                    className={`text-lg ${
                                      star <= Math.round(Number(getAverageRating(currentQuestion.id)))
                                        ? "text-yellow-400"
                                        : "text-zinc-300"
                                    }`}
                                  >
                                    ★
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Charts */}
                        <div className="grid md:grid-cols-2 gap-6">
                          {/* Bar Chart */}
                          <div className="h-[250px]">
                            <p className="text-sm font-medium mb-2 text-zinc-500">Distribution</p>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={questionData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                                <XAxis type="number" fontSize={12} />
                                <YAxis dataKey="answer" type="category" fontSize={11} width={80} />
                                <Tooltip
                                  formatter={(value, name, props) => [
                                    `${value} responses (${props.payload.percentage}%)`,
                                    props.payload.fullAnswer,
                                  ]}
                                />
                                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                                  {questionData.map((entry, index) => (
                                    <Cell key={`bar-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>

                          {/* Pie Chart */}
                          <div className="h-[250px]">
                            <p className="text-sm font-medium mb-2 text-zinc-500">Percentage</p>
                            <ResponsiveContainer width="100%" height="100%">
                              <RechartsPieChart>
                                <Pie
                                  data={questionData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={50}
                                  outerRadius={80}
                                  paddingAngle={2}
                                  dataKey="count"
                                  label={(props) => `${(props as unknown as { percentage: number }).percentage}%`}
                                  labelLine={false}
                                >
                                  {questionData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                  ))}
                                </Pie>
                                <Tooltip
                                  formatter={(value, name, props) => [
                                    `${value} (${props.payload.percentage}%)`,
                                    props.payload.fullAnswer,
                                  ]}
                                />
                                <Legend
                                  formatter={(value, entry) => (
                                    <span className="text-xs">{(entry.payload as { answer?: string })?.answer}</span>
                                  )}
                                />
                              </RechartsPieChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Answer List */}
                        <div className="mt-4 space-y-2">
                          {questionData.map((item, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800 rounded-lg"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                />
                                <span className="text-sm">{item.fullAnswer}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold">{item.count}</span>
                                <span className="text-xs text-zinc-500">({item.percentage}%)</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {/* Responses Tab */}
        {activeTab === "responses" && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Export Buttons */}
            <div className="lg:col-span-3 flex gap-2 justify-end mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!survey) return;
                  const csv = responsesToCSV(survey);
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  saveAs(blob, `${survey.title.replace(/[^a-z0-9]/gi, '_')}_responses.csv`);
                }}
              >
                Export CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!survey) return;
                  exportResponsesToPDF(survey);
                }}
              >
                Export PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!survey) return;
                  await exportResponsesToWord(survey);
                }}
              >
                Export Word
              </Button>
            </div>
            {/* Response List */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">All Responses</CardTitle>
                </CardHeader>
                <CardContent>
                  {survey.responses.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500">
                      <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>No responses yet</p>
                      <p className="text-sm">Share your survey to get responses</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {survey.responses.map((response: Response, index: number) => (
                        <button
                          key={response.id}
                          onClick={() => setSelectedResponse(response)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${
                            selectedResponse?.id === response.id
                              ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                              : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xs font-bold">
                              {index + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">
                                {response.user.fullName}
                              </p>
                              <p className="text-xs text-zinc-500">
                                {format(new Date(response.submittedAt), "MMM d, h:mm a")}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Response Detail */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Response Details</CardTitle>
                </CardHeader>
                <CardContent>
                  {!selectedResponse ? (
                    <div className="text-center py-12 text-zinc-500">
                      <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>Select a response to view details</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4">
                        <p className="font-medium">{selectedResponse.user.fullName}</p>
                        <p className="text-sm text-zinc-500">{selectedResponse.user.email}</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Submitted {format(new Date(selectedResponse.submittedAt), "MMMM d, yyyy 'at' h:mm a")}
                        </p>
                      </div>
                      <div className="space-y-4">
                        {survey.questions.map((question: Question, index: number) => {
                          const answer = selectedResponse.answers[question.id];
                          return (
                            <div
                              key={question.id}
                              className="border-b border-zinc-200 dark:border-zinc-700 pb-4 last:border-0"
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded">
                                  Q{index + 1}
                                </span>
                                <span className="text-xs text-zinc-400 capitalize">
                                  {question.questionType.replace("-", " ")}
                                </span>
                              </div>
                              <p className="font-medium mb-2">{question.questionText}</p>
                              <div className="bg-zinc-50 dark:bg-zinc-800 rounded-lg px-4 py-3">
                                {question.questionType === "rating" ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xl font-bold text-yellow-600">{answer || "0"}</span>
                                    <span className="text-zinc-400">/ 5</span>
                                    <div className="flex ml-2">
                                      {[1, 2, 3, 4, 5].map((star) => (
                                        <span
                                          key={star}
                                          className={`text-lg ${
                                            star <= parseInt(answer || "0")
                                              ? "text-yellow-400"
                                              : "text-zinc-300"
                                          }`}
                                        >
                                          ★
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-zinc-700 dark:text-zinc-300">
                                    {answer || <span className="text-zinc-400 italic">No answer</span>}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  </Suspense>
);
}
