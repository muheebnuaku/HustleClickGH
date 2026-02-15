"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Eye, Trash2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface Question {
  id?: string;
  text: string;
  type: "text" | "single_choice" | "multiple_choice" | "rating";
  options?: string[];
  required: boolean;
}

interface Survey {
  id: string;
  title: string;
  description: string;
  reward: number;
  maxRespondents: number;
  currentRespondents: number;
  status: string;
  expiresAt: string;
  questionsCount?: number;
  responsesCount?: number;
}

interface AdminStats {
  totalSurveys: number;
  activeSurveys: number;
  totalResponses: number;
}

export default function AdminPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [stats, setStats] = useState<AdminStats>({ totalSurveys: 0, activeSurveys: 0, totalResponses: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  // Form state
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    reward: "",
    maxRespondents: "",
    expiresAt: "",
  });
  const [questions, setQuestions] = useState<Question[]>([
    { text: "", type: "text", required: true }
  ]);

  const fetchData = async () => {
    try {
      const [surveysRes, statsRes] = await Promise.all([
        fetch("/api/admin/surveys"),
        fetch("/api/admin/stats"),
      ]);
      const [surveysData, statsData] = await Promise.all([
        surveysRes.json(),
        statsRes.json(),
      ]);
      setSurveys(surveysData.surveys || []);
      setStats(statsData);
    } catch (error) {
      console.error("Failed to fetch data:", error);
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
      fetchData();
    }
  }, [status, router, session]);

  const handleCreateSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const res = await fetch("/api/admin/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          reward: parseFloat(formData.reward),
          maxRespondents: parseInt(formData.maxRespondents),
          questions: questions.filter(q => q.text.trim()),
        }),
      });

      if (res.ok) {
        setMessage("✅ Survey created successfully!");
        setFormData({ title: "", description: "", reward: "", maxRespondents: "", expiresAt: "" });
        setQuestions([{ text: "", type: "text", required: true }]);
        setShowCreateForm(false);
        fetchData();
      } else {
        const data = await res.json();
        setMessage(`❌ ${data.message || "Failed to create survey"}`);
      }
    } catch {
      setMessage("❌ Failed to create survey");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSurvey = async (id: string) => {
    if (!confirm("Are you sure you want to delete this survey?")) return;

    try {
      const res = await fetch(`/api/admin/surveys/${id}`, { method: "DELETE" });
      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error("Failed to delete survey:", error);
    }
  };

  const addQuestion = () => {
    setQuestions([...questions, { text: "", type: "text", required: true }]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: keyof Question, value: string | boolean | string[]) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Survey Management</h1>
            <p className="text-zinc-600 dark:text-zinc-400 mt-1">
              Create and manage surveys for users
            </p>
          </div>
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            <Plus size={20} />
            {showCreateForm ? "Cancel" : "Create Survey"}
          </Button>
        </div>

        {message && (
          <div className={`p-4 rounded-lg ${message.includes("✅") ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {message}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-zinc-500">Total Surveys</p>
                <p className="text-3xl font-bold text-blue-600">{stats.totalSurveys}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-zinc-500">Active Surveys</p>
                <p className="text-3xl font-bold text-green-600">{stats.activeSurveys}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-zinc-500">Total Responses</p>
                <p className="text-3xl font-bold text-purple-600">{stats.totalResponses}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <Card>
            <CardHeader>
              <CardTitle>Create New Survey</CardTitle>
              <CardDescription>Fill in the details to create a new survey</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateSurvey} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Survey Title *</label>
                    <Input
                      placeholder="Enter survey title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Reward Amount (GHS) *</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="2.50"
                      value={formData.reward}
                      onChange={(e) => setFormData({ ...formData, reward: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Description *</label>
                    <textarea
                      className="flex min-h-20 w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      placeholder="Enter survey description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Maximum Respondents *</label>
                    <Input
                      type="number"
                      placeholder="100"
                      value={formData.maxRespondents}
                      onChange={(e) => setFormData({ ...formData, maxRespondents: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Expiration Date *</label>
                    <Input
                      type="date"
                      value={formData.expiresAt}
                      onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Questions Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Survey Questions</label>
                    <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
                      <Plus size={16} /> Add Question
                    </Button>
                  </div>
                  
                  {questions.map((question, index) => (
                    <div key={index} className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Question {index + 1}</span>
                        {questions.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeQuestion(index)}>
                            <Trash2 size={16} className="text-red-500" />
                          </Button>
                        )}
                      </div>
                      <Input
                        placeholder="Enter question text"
                        value={question.text}
                        onChange={(e) => updateQuestion(index, "text", e.target.value)}
                      />
                      <div className="flex gap-4">
                        <select
                          className="flex h-10 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                          value={question.type}
                          onChange={(e) => updateQuestion(index, "type", e.target.value)}
                        >
                          <option value="text">Text Answer</option>
                          <option value="single_choice">Single Choice</option>
                          <option value="multiple_choice">Multiple Choice</option>
                          <option value="rating">Rating (1-5)</option>
                        </select>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={question.required}
                            onChange={(e) => updateQuestion(index, "required", e.target.checked)}
                          />
                          <span className="text-sm">Required</span>
                        </label>
                      </div>
                      {(question.type === "single_choice" || question.type === "multiple_choice") && (
                        <Input
                          placeholder="Options (comma separated): Option 1, Option 2, Option 3"
                          onChange={(e) => updateQuestion(index, "options", e.target.value.split(",").map(o => o.trim()))}
                        />
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating..." : "Publish Survey"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Surveys List */}
        <Card>
          <CardHeader>
            <CardTitle>All Surveys ({surveys.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {surveys.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                No surveys yet. Create your first survey!
              </div>
            ) : (
              <div className="space-y-4">
                {surveys.map((survey) => (
                  <div
                    key={survey.id}
                    className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg text-foreground">{survey.title}</h3>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{survey.description}</p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-xl font-bold text-green-600">{formatCurrency(survey.reward)}</p>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          survey.status === "active" 
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : survey.status === "completed"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                        }`}>
                          {survey.status}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div>
                        <p className="text-xs text-zinc-500">Responses</p>
                        <p className="font-medium text-foreground">
                          {survey.currentRespondents}/{survey.maxRespondents}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Expires</p>
                        <p className="font-medium text-foreground">{formatDate(survey.expiresAt)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Questions</p>
                        <p className="font-medium text-foreground">{survey.questionsCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Total Paid</p>
                        <p className="font-medium text-foreground">
                          {formatCurrency(survey.reward * survey.currentRespondents)}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => router.push(`/admin/responses?surveyId=${survey.id}`)}>
                        <Eye size={16} />
                        View Responses
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleDeleteSurvey(survey.id)}>
                        <Trash2 size={16} />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
