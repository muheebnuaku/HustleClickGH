"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Plus,
  Trash2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ImageIcon,
  X,
} from "lucide-react";

interface Question {
  id: string;
  questionText: string;
  questionType: "text" | "multiple-choice" | "rating" | "yes-no";
  options: string[];
  required: boolean;
}

export default function CreateSurveyPage() {
  const { status } = useSession();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [maxRespondents, setMaxRespondents] = useState(100);
  // Default to 30 days from now
  const getDefaultExpiryDate = () => {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  };
  const [expiresAt, setExpiresAt] = useState(getDefaultExpiryDate());
  const [headerImage, setHeaderImage] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  const addQuestion = () => {
    if (questions.length >= 15) {
      setError("Maximum 15 questions allowed per survey");
      return;
    }
    setQuestions([
      ...questions,
      {
        id: Date.now().toString(),
        questionText: "",
        questionType: "text",
        options: ["", ""],
        required: true,
      },
    ]);
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const addOption = (questionId: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId ? { ...q, options: [...q.options, ""] } : q
      )
    );
  };

  const updateOption = (questionId: string, optionIndex: number, value: string) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map((opt, i) => (i === optionIndex ? value : opt)),
            }
          : q
      )
    );
  };

  const removeOption = (questionId: string, optionIndex: number) => {
    setQuestions((prev) =>
      prev.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.filter((_, i) => i !== optionIndex) }
          : q
      )
    );
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;
    
    const newQuestions = [...questions];
    [newQuestions[index], newQuestions[newIndex]] = [newQuestions[newIndex], newQuestions[index]];
    setQuestions(newQuestions);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'header' | 'background') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (type === 'header') {
        setHeaderImage(base64);
      } else {
        setBackgroundImage(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Please enter a survey title");
      return;
    }

    if (!description.trim()) {
      setError("Please enter a survey description");
      return;
    }

    if (questions.length === 0) {
      setError("Please add at least one question");
      return;
    }

    // Validate questions
    for (const q of questions) {
      if (!q.questionText.trim()) {
        setError("All questions must have text");
        return;
      }
      if (q.questionType === "multiple-choice") {
        const validOptions = q.options.filter((opt) => opt.trim());
        if (validOptions.length < 2) {
          setError("Multiple choice questions must have at least 2 options");
          return;
        }
      }
    }

    setSaving(true);

    try {
      // Use the selected date, set time to end of day
      const expiryDate = new Date(expiresAt);
      expiryDate.setHours(23, 59, 59, 999);

      const res = await fetch("/api/my-surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          headerImage,
          backgroundImage,
          maxRespondents,
          expiresAt: expiryDate.toISOString(),
          questions: questions.map((q) => ({
            questionText: q.questionText,
            questionType: q.questionType,
            options:
              q.questionType === "multiple-choice"
                ? q.options.filter((opt) => opt.trim())
                : q.questionType === "yes-no"
                ? ["Yes", "No"]
                : q.questionType === "rating"
                ? ["1", "2", "3", "4", "5"]
                : null,
            required: q.required,
          })),
        }),
      });

      if (res.ok) {
        router.push("/my-surveys");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create survey");
      }
    } catch {
      setError("Failed to create survey");
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading") {
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
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft size={18} />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Create Survey</h1>
            <p className="text-zinc-600 dark:text-zinc-400">
              Create your own survey and share it with anyone
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p className="text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Survey Details */}
          <Card>
            <CardHeader>
              <CardTitle>Survey Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Title *</label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Customer Feedback Survey"
                  maxLength={100}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Description *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what this survey is about..."
                  className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  rows={3}
                  maxLength={500}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Max Responses
                  </label>
                  <Input
                    type="number"
                    value={maxRespondents}
                    onChange={(e) => setMaxRespondents(Number(e.target.value))}
                    min={1}
                    max={1000}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Expires On
                  </label>
                  <Input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                </div>
              </div>

              {/* Survey Customization Images */}
              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-700">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <ImageIcon size={16} className="text-green-600" />
                  Survey Customization (Optional)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Header Image */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Header Image
                    </label>
                    <p className="text-xs text-zinc-500 mb-2">
                      Displayed at the top of your survey, near the title
                    </p>
                    {headerImage ? (
                      <div className="relative rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
                        <img
                          src={headerImage}
                          alt="Header preview"
                          className="w-full h-32 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setHeaderImage(null)}
                          className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg cursor-pointer hover:border-green-500 transition-colors">
                        <ImageIcon size={24} className="text-zinc-400 mb-2" />
                        <span className="text-sm text-zinc-500">Click to upload</span>
                        <span className="text-xs text-zinc-400">Max 2MB</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageUpload(e, 'header')}
                        />
                      </label>
                    )}
                  </div>

                  {/* Background Image */}
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Background Image
                    </label>
                    <p className="text-xs text-zinc-500 mb-2">
                      Displayed behind the survey form
                    </p>
                    {backgroundImage ? (
                      <div className="relative rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
                        <img
                          src={backgroundImage}
                          alt="Background preview"
                          className="w-full h-32 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setBackgroundImage(null)}
                          className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-lg cursor-pointer hover:border-green-500 transition-colors">
                        <ImageIcon size={24} className="text-zinc-400 mb-2" />
                        <span className="text-sm text-zinc-500">Click to upload</span>
                        <span className="text-xs text-zinc-400">Max 2MB</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleImageUpload(e, 'background')}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Questions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Questions ({questions.length}/15)</CardTitle>
                <Button
                  type="button"
                  onClick={addQuestion}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={questions.length >= 15}
                >
                  <Plus size={16} className="mr-1" />
                  Add Question
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {questions.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <p>No questions yet. Click &quot;Add Question&quot; to get started.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {questions.map((question, index) => (
                    <div
                      key={question.id}
                      className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex flex-col gap-1 pt-2">
                          <button
                            type="button"
                            onClick={() => moveQuestion(index, "up")}
                            disabled={index === 0}
                            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded disabled:opacity-30"
                          >
                            <ChevronUp size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveQuestion(index, "down")}
                            disabled={index === questions.length - 1}
                            className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded disabled:opacity-30"
                          >
                            <ChevronDown size={16} />
                          </button>
                        </div>
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-500">
                              Q{index + 1}
                            </span>
                            <Input
                              value={question.questionText}
                              onChange={(e) =>
                                updateQuestion(question.id, {
                                  questionText: e.target.value,
                                })
                              }
                              placeholder="Enter your question..."
                              className="flex-1"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-3">
                            <select
                              value={question.questionType}
                              onChange={(e) =>
                                updateQuestion(question.id, {
                                  questionType: e.target.value as Question["questionType"],
                                })
                              }
                              className="px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm"
                            >
                              <option value="text">Text Answer</option>
                              <option value="multiple-choice">Multiple Choice</option>
                              <option value="rating">Rating (1-5)</option>
                              <option value="yes-no">Yes / No</option>
                            </select>
                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={question.required}
                                onChange={(e) =>
                                  updateQuestion(question.id, {
                                    required: e.target.checked,
                                  })
                                }
                                className="rounded"
                              />
                              Required
                            </label>
                          </div>

                          {/* Multiple Choice Options */}
                          {question.questionType === "multiple-choice" && (
                            <div className="space-y-2 pl-4 border-l-2 border-green-500">
                              {question.options.map((option, optIndex) => (
                                <div key={optIndex} className="flex items-center gap-2">
                                  <span className="text-xs text-zinc-400">
                                    {String.fromCharCode(65 + optIndex)}.
                                  </span>
                                  <Input
                                    value={option}
                                    onChange={(e) =>
                                      updateOption(
                                        question.id,
                                        optIndex,
                                        e.target.value
                                      )
                                    }
                                    placeholder={`Option ${optIndex + 1}`}
                                    className="flex-1"
                                  />
                                  {question.options.length > 2 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        removeOption(question.id, optIndex)
                                      }
                                      className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {question.options.length < 6 && (
                                <button
                                  type="button"
                                  onClick={() => addOption(question.id)}
                                  className="text-sm text-green-600 hover:underline"
                                >
                                  + Add Option
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQuestion(question.id)}
                          className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving || questions.length === 0}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              {saving ? "Creating..." : "Create Survey"}
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
