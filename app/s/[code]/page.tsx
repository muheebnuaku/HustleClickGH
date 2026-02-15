"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  CheckCircle,
  AlertCircle,
  ClipboardList,
  Star,
  Loader2,
} from "lucide-react";

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  options: string[] | null;
  required: boolean;
  order: number;
}

interface Survey {
  id: string;
  title: string;
  description: string;
  headerImage: string | null;
  backgroundImage: string | null;
  questions: Question[];
}

export default function PublicSurveyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const [respondentName, setRespondentName] = useState("");
  const [respondentEmail, setRespondentEmail] = useState("");
  const [answers, setAnswers] = useState<{ questionId: string; answer: string }[]>([]);

  const fetchSurvey = async () => {
    try {
      const res = await fetch(`/api/s/${code}`);
      if (res.ok) {
        const data = await res.json();
        setSurvey(data);
        // Initialize answers array
        setAnswers(data.questions.map((q: Question) => ({ questionId: q.id, answer: "" })));
      } else {
        const errorData = await res.json();
        setError(errorData.error || "Survey not found");
      }
    } catch {
      setError("Failed to load survey");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSurvey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const updateAnswer = (questionId: string, answer: string) => {
    setAnswers((prev) =>
      prev.map((a) => (a.questionId === questionId ? { ...a, answer } : a))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!survey) return;

    // Validate required questions
    for (const question of survey.questions) {
      if (question.required) {
        const answer = answers.find((a) => a.questionId === question.id);
        if (!answer?.answer.trim()) {
          setError(`Please answer: "${question.questionText}"`);
          return;
        }
      }
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/s/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          respondentName,
          respondentEmail,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const errorData = await res.json();
        setError(errorData.error || "Failed to submit response");
      }
    } catch {
      setError("Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-16 w-16 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">Survey Unavailable</h2>
            <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <CheckCircle className="h-16 w-16 mx-auto text-green-500 mb-4" />
            <h2 className="text-xl font-bold mb-2">Thank You!</h2>
            <p className="text-zinc-600 dark:text-zinc-400 mb-6">
              Your response has been submitted successfully.
            </p>
            <Button
              onClick={() => window.close()}
              variant="outline"
              className="w-full"
            >
              Close Window
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!survey) return null;

  return (
    <div 
      className="min-h-screen py-8 px-4"
      style={{
        backgroundImage: survey.backgroundImage 
          ? `url(${survey.backgroundImage})` 
          : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundColor: survey.backgroundImage ? undefined : 'rgb(250 250 250)',
      }}
    >
      {/* Background overlay for readability when background image is set */}
      {survey.backgroundImage && (
        <div className="fixed inset-0 bg-black/40 -z-10" />
      )}
      
      <div className="max-w-2xl mx-auto space-y-6 relative z-10">
        {/* Header */}
        <Card className={survey.backgroundImage ? 'shadow-xl' : ''}>
          {/* Header Image */}
          {survey.headerImage && (
            <div className="relative w-full h-48 overflow-hidden rounded-t-lg">
              <img
                src={survey.headerImage}
                alt="Survey header"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
          )}
          <CardContent className={survey.headerImage ? 'p-6' : 'p-6'}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <ClipboardList className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold">{survey.title}</h1>
                <p className="text-sm text-zinc-500">
                  {survey.questions.length} questions
                </p>
              </div>
            </div>
            <p className="text-zinc-600 dark:text-zinc-400">{survey.description}</p>
          </CardContent>
        </Card>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700 dark:text-red-400 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Optional: Respondent Info */}
          <Card className={survey.backgroundImage ? 'shadow-lg' : ''}>
            <CardHeader>
              <CardTitle className="text-lg">Your Information (Optional)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <Input
                  value={respondentName}
                  onChange={(e) => setRespondentName(e.target.value)}
                  placeholder="Enter your name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <Input
                  type="email"
                  value={respondentEmail}
                  onChange={(e) => setRespondentEmail(e.target.value)}
                  placeholder="Enter your email"
                />
              </div>
            </CardContent>
          </Card>

          {/* Questions */}
          {survey.questions.map((question, index) => (
            <Card key={question.id} className={survey.backgroundImage ? 'shadow-lg' : ''}>
              <CardContent className="p-6">
                <div className="flex items-start gap-2 mb-4">
                  <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium rounded">
                    Q{index + 1}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">
                      {question.questionText}
                      {question.required && (
                        <span className="text-red-500 ml-1">*</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Text Answer */}
                {question.questionType === "text" && (
                  <textarea
                    value={answers.find((a) => a.questionId === question.id)?.answer || ""}
                    onChange={(e) => updateAnswer(question.id, e.target.value)}
                    placeholder="Type your answer here..."
                    className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                )}

                {/* Multiple Choice */}
                {question.questionType === "multiple-choice" && question.options && (
                  <div className="space-y-2">
                    {question.options.map((option, optIndex) => (
                      <label
                        key={optIndex}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          answers.find((a) => a.questionId === question.id)?.answer === option
                            ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                            : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                        }`}
                      >
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          checked={answers.find((a) => a.questionId === question.id)?.answer === option}
                          onChange={(e) => updateAnswer(question.id, e.target.value)}
                          className="sr-only"
                        />
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            answers.find((a) => a.questionId === question.id)?.answer === option
                              ? "border-green-500 bg-green-500"
                              : "border-zinc-300 dark:border-zinc-600"
                          }`}
                        >
                          {answers.find((a) => a.questionId === question.id)?.answer === option && (
                            <div className="w-2 h-2 bg-white rounded-full" />
                          )}
                        </div>
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Rating */}
                {question.questionType === "rating" && (
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        onClick={() => updateAnswer(question.id, rating.toString())}
                        className={`p-2 rounded-lg transition-colors ${
                          Number(answers.find((a) => a.questionId === question.id)?.answer) >= rating
                            ? "text-yellow-500"
                            : "text-zinc-300 dark:text-zinc-600"
                        }`}
                      >
                        <Star
                          size={32}
                          fill={
                            Number(answers.find((a) => a.questionId === question.id)?.answer) >= rating
                              ? "currentColor"
                              : "none"
                          }
                        />
                      </button>
                    ))}
                    <span className="ml-2 text-sm text-zinc-500">
                      {answers.find((a) => a.questionId === question.id)?.answer || 0} / 5
                    </span>
                  </div>
                )}

                {/* Yes/No */}
                {question.questionType === "yes-no" && (
                  <div className="flex gap-4">
                    {["Yes", "No"].map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => updateAnswer(question.id, option)}
                        className={`flex-1 py-3 px-6 rounded-lg border-2 font-medium transition-colors ${
                          answers.find((a) => a.questionId === question.id)?.answer === option
                            ? option === "Yes"
                              ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                              : "border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
                            : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {/* Submit */}
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-600 hover:bg-green-700 py-6 text-lg"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Response"
            )}
          </Button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-zinc-500">
          Powered by{" "}
          <Link href="/" className="text-green-600 hover:underline">
            HustleClickGH
          </Link>
        </p>
      </div>
    </div>
  );
}
