"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import {
  ClipboardList,
  Clock,
  Users,
  DollarSign,
  CheckCircle2,
  X,
  ChevronRight,
  Star,
  Search,
  RefreshCw,
  Sparkles,
  Trophy,
  AlertCircle,
  Send,
  ArrowLeft,
} from "lucide-react";

interface Question {
  id: string;
  questionText: string;
  questionType: string;
  options: string | null;
  required: boolean;
  order: number;
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
  questions: Question[];
  completed?: boolean;
}

interface CompletedSurvey {
  id: string;
  title: string;
  description: string;
  reward: number;
  completedAt: string;
  rewarded: boolean;
}

export default function SurveysPage() {
  const router = useRouter();
  const { status } = useSession();
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [completedSurveys, setCompletedSurveys] = useState<CompletedSurvey[]>([]);
  const [completedSurveyIds, setCompletedSurveyIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "available" | "completed">("all");
  
  // Survey taking state
  const [activeSurvey, setActiveSurvey] = useState<Survey | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string; earned?: number } | null>(null);

  const fetchSurveys = async () => {
    try {
      const [availableRes, completedRes] = await Promise.all([
        fetch("/api/surveys"),
        fetch("/api/surveys/completed"),
      ]);
      
      const availableData = await availableRes.json();
      const completedData = await completedRes.json();
      
      const completedList = completedData.completedSurveys || [];
      const completedIds = completedList.map((s: CompletedSurvey) => s.id);
      
      setCompletedSurveys(completedList);
      setCompletedSurveyIds(completedIds);
      setSurveys(availableData.surveys || []);
    } catch (error) {
      console.error("Failed to fetch surveys:", error);
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
      fetchSurveys();
    }
  }, [status, router]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchSurveys();
  };

  const startSurvey = (survey: Survey) => {
    setActiveSurvey(survey);
    setCurrentQuestion(0);
    setAnswers({});
    setSubmitResult(null);
  };

  const closeSurvey = () => {
    setActiveSurvey(null);
    setCurrentQuestion(0);
    setAnswers({});
    setSubmitResult(null);
  };

  const handleAnswer = (questionId: string, answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const nextQuestion = () => {
    if (activeSurvey && currentQuestion < activeSurvey.questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1);
    }
  };

  const prevQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((prev) => prev - 1);
    }
  };

  const submitSurvey = async () => {
    if (!activeSurvey) return;

    // Check all required questions are answered
    const unanswered = activeSurvey.questions.filter(
      (q) => q.required && !answers[q.id]
    );

    if (unanswered.length > 0) {
      setSubmitResult({
        success: false,
        message: `Please answer all required questions. ${unanswered.length} unanswered.`,
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/surveys/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surveyId: activeSurvey.id,
          answers: Object.entries(answers).map(([questionId, answer]) => ({
            questionId,
            answer,
          })),
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setSubmitResult({
          success: true,
          message: data.message,
          earned: data.earned,
        });
        setCompletedSurveyIds((prev) => [...prev, activeSurvey.id]);
        // Add to completed surveys list
        setCompletedSurveys((prev) => [{
          id: activeSurvey.id,
          title: activeSurvey.title,
          description: activeSurvey.description,
          reward: activeSurvey.reward,
          completedAt: new Date().toISOString(),
          rewarded: true,
        }, ...prev]);
        // Remove from available surveys
        setSurveys((prev) => prev.filter((s) => s.id !== activeSurvey.id));
      } else {
        setSubmitResult({
          success: false,
          message: data.message || "Failed to submit survey",
        });
      }
    } catch {
      setSubmitResult({
        success: false,
        message: "An error occurred. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredSurveys = surveys.filter((survey) => {
    const matchesSearch =
      survey.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      survey.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterType === "completed") {
      return false; // Completed surveys shown separately
    }
    if (filterType === "available") {
      return matchesSearch && !completedSurveyIds.includes(survey.id);
    }
    return matchesSearch;
  });

  const filteredCompletedSurveys = completedSurveys.filter((survey) => {
    const matchesSearch =
      survey.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      survey.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const formatCompletedDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diff = expires.getTime() - now.getTime();
    
    if (diff <= 0) return "Expired";
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h left`;
    return "Expiring soon";
  };

  const getSpotsLeft = (survey: Survey) => {
    return survey.maxRespondents - survey.currentRespondents;
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

  // Survey taking modal
  if (activeSurvey) {
    const question = activeSurvey.questions[currentQuestion];
    const progress = ((currentQuestion + 1) / activeSurvey.questions.length) * 100;
    const isLastQuestion = currentQuestion === activeSurvey.questions.length - 1;

    return (
      <DashboardLayout>
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={closeSurvey}
                  className="p-2 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X size={24} />
                </button>
                <div className="flex items-center gap-2 bg-white/20 px-4 py-2 rounded-full">
                  <DollarSign size={18} />
                  <span className="font-semibold">{formatCurrency(activeSurvey.reward)}</span>
                </div>
              </div>
              <h2 className="text-2xl font-bold">{activeSurvey.title}</h2>
              <p className="text-white/80 mt-1 text-sm">{activeSurvey.description}</p>
            </div>

            {/* Progress bar */}
            <div className="h-1 bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto" style={{ maxHeight: "calc(90vh - 280px)" }}>
              {submitResult ? (
                // Result screen
                <div className="text-center py-8">
                  {submitResult.success ? (
                    <>
                      <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                        <Trophy className="text-green-600 dark:text-green-400" size={40} />
                      </div>
                      <h3 className="text-2xl font-bold text-foreground mb-2">Survey Completed!</h3>
                      <p className="text-zinc-600 dark:text-zinc-400 mb-4">{submitResult.message}</p>
                      {submitResult.earned && (
                        <div className="inline-flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-6 py-3 rounded-full text-lg font-semibold">
                          <Sparkles size={24} />
                          +{formatCurrency(submitResult.earned)} Earned!
                        </div>
                      )}
                      <div className="mt-8">
                        <Button onClick={closeSurvey} className="px-8">
                          Continue Earning
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="text-red-600 dark:text-red-400" size={40} />
                      </div>
                      <h3 className="text-2xl font-bold text-foreground mb-2">Oops!</h3>
                      <p className="text-zinc-600 dark:text-zinc-400 mb-6">{submitResult.message}</p>
                      <Button onClick={() => setSubmitResult(null)} variant="outline">
                        Try Again
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                // Question screen
                <div className="space-y-6">
                  <div className="flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
                    <span>Question {currentQuestion + 1} of {activeSurvey.questions.length}</span>
                    {question.required && (
                      <span className="text-red-500 flex items-center gap-1">
                        <Star size={12} fill="currentColor" /> Required
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-semibold text-foreground">
                    {question.questionText}
                  </h3>

                  {/* Answer input based on question type */}
                  <div className="mt-6">
                    {question.questionType === "multiple-choice" && question.options ? (
                      <div className="space-y-3">
                        {JSON.parse(question.options).map((option: string, index: number) => (
                          <button
                            key={index}
                            onClick={() => handleAnswer(question.id, option)}
                            className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                              answers[question.id] === option
                                ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                                : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                  answers[question.id] === option
                                    ? "border-blue-500 bg-blue-500"
                                    : "border-zinc-300 dark:border-zinc-600"
                                }`}
                              >
                                {answers[question.id] === option && (
                                  <CheckCircle2 size={14} className="text-white" />
                                )}
                              </div>
                              <span className="text-foreground">{option}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : question.questionType === "rating" ? (
                      <div className="flex items-center justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <button
                            key={rating}
                            onClick={() => handleAnswer(question.id, rating.toString())}
                            className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-bold transition-all ${
                              answers[question.id] === rating.toString()
                                ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600"
                                : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-500"
                            }`}
                          >
                            {rating}
                          </button>
                        ))}
                      </div>
                    ) : question.questionType === "yes-no" ? (
                      <div className="flex gap-4">
                        {["Yes", "No"].map((option) => (
                          <button
                            key={option}
                            onClick={() => handleAnswer(question.id, option)}
                            className={`flex-1 p-4 rounded-xl border-2 text-center font-semibold transition-all ${
                              answers[question.id] === option
                                ? option === "Yes"
                                  ? "border-green-500 bg-green-50 dark:bg-green-900/30 text-green-600"
                                  : "border-red-500 bg-red-50 dark:bg-red-900/30 text-red-600"
                                : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 text-zinc-600 dark:text-zinc-400"
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    ) : (
                      // Text input (default)
                      <textarea
                        value={answers[question.id] || ""}
                        onChange={(e) => handleAnswer(question.id, e.target.value)}
                        placeholder="Type your answer here..."
                        rows={4}
                        className="w-full p-4 rounded-xl border-2 border-zinc-200 dark:border-zinc-700 bg-transparent focus:border-blue-500 focus:outline-none resize-none text-foreground placeholder:text-zinc-400"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {!submitResult && (
              <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                <Button
                  onClick={prevQuestion}
                  variant="outline"
                  disabled={currentQuestion === 0}
                  className="flex items-center gap-2"
                >
                  <ArrowLeft size={18} />
                  Previous
                </Button>

                {isLastQuestion ? (
                  <Button
                    onClick={submitSurvey}
                    disabled={isSubmitting}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Submit Survey
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={nextQuestion}
                    className="flex items-center gap-2"
                  >
                    Next
                    <ChevronRight size={18} />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <ClipboardList size={32} />
                Available Surveys
              </h1>
              <p className="text-white/80 mt-2">
                Complete surveys and earn money instantly
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full">
                <span className="text-sm">{surveys.length} Surveys Available</span>
              </div>
              <Button
                onClick={handleRefresh}
                variant="secondary"
                disabled={isRefreshing}
                className="bg-white/20 hover:bg-white/30 text-white border-0"
              >
                <RefreshCw size={18} className={isRefreshing ? "animate-spin" : ""} />
              </Button>
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <Input
              type="text"
              placeholder="Search surveys..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            {(["all", "available", "completed"] as const).map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  filterType === type
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-2">
                <ClipboardList className="text-blue-600 dark:text-blue-400" size={20} />
              </div>
              <p className="text-2xl font-bold text-foreground">{surveys.length}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Available</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="text-green-600 dark:text-green-400" size={20} />
              </div>
              <p className="text-2xl font-bold text-foreground">{completedSurveys.length}</p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Completed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-2">
                <DollarSign className="text-yellow-600 dark:text-yellow-400" size={20} />
              </div>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(completedSurveys.reduce((sum, s) => sum + s.reward, 0))}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Total Earned</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-2">
                <Trophy className="text-purple-600 dark:text-purple-400" size={20} />
              </div>
              <p className="text-2xl font-bold text-foreground">
                {formatCurrency(surveys.reduce((sum, s) => sum + s.reward, 0))}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Potential</p>
            </CardContent>
          </Card>
        </div>

        {/* Completed Surveys Section - Show when filter is "completed" or "all" */}
        {(filterType === "completed" || filterType === "all") && completedSurveys.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                <CheckCircle2 className="text-green-500" size={24} />
                Completed Surveys
              </h2>
              <span className="text-sm text-zinc-500 dark:text-zinc-400">
                {filteredCompletedSurveys.length} survey{filteredCompletedSurveys.length !== 1 ? 's' : ''}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCompletedSurveys.map((survey) => (
                <Card
                  key={survey.id}
                  className="group relative overflow-hidden border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20"
                >
                  <div className="absolute top-3 right-3">
                    <div className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Done
                    </div>
                  </div>

                  <CardContent className="p-6">
                    {/* Reward earned badge */}
                    <div className="flex items-center gap-2 mb-4">
                      <div className="flex items-center gap-2 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-full font-semibold">
                        <DollarSign size={16} />
                        +{formatCurrency(survey.reward)}
                      </div>
                      {survey.rewarded && (
                        <span className="text-xs bg-green-600 text-white px-2 py-1 rounded-full">Paid</span>
                      )}
                    </div>

                    <h3 className="text-lg font-bold text-foreground mb-2 line-clamp-2">
                      {survey.title}
                    </h3>
                    <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4 line-clamp-2">
                      {survey.description}
                    </p>

                    {/* Completion info */}
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <Clock size={14} />
                      <span>Completed {formatCompletedDate(survey.completedAt)}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Available Surveys Grid - Show when filter is "available" or "all" */}
        {(filterType === "available" || filterType === "all") && (
          <>
            {filterType === "all" && surveys.length > 0 && (
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <ClipboardList className="text-blue-500" size={24} />
                  Available Surveys
                </h2>
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {filteredSurveys.length} survey{filteredSurveys.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            
            {filteredSurveys.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ClipboardList className="text-zinc-400" size={40} />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {searchQuery ? "No surveys found" : "No surveys available"}
                  </h3>
                  <p className="text-zinc-500 dark:text-zinc-400">
                    {searchQuery
                      ? "Try adjusting your search terms"
                      : "Check back later for new surveys to complete"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSurveys.map((survey) => {
                  const isCompleted = completedSurveyIds.includes(survey.id);
                  const spotsLeft = getSpotsLeft(survey);
                  const isHot = spotsLeft <= 5 && spotsLeft > 0;

                  return (
                    <Card
                      key={survey.id}
                      className={`group relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1 ${
                        isCompleted ? "opacity-60" : ""
                      }`}
                    >
                      {/* Hot badge */}
                      {isHot && !isCompleted && (
                        <div className="absolute top-3 right-3 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1 z-10">
                          <Sparkles size={12} />
                          HOT
                        </div>
                      )}

                      {/* Completed overlay */}
                      {isCompleted && (
                        <div className="absolute inset-0 bg-green-500/10 dark:bg-green-500/20 z-10 flex items-center justify-center">
                          <div className="bg-green-500 text-white px-4 py-2 rounded-full flex items-center gap-2 font-semibold shadow-lg">
                            <CheckCircle2 size={20} />
                            Completed
                          </div>
                        </div>
                      )}

                      <CardContent className="p-6">
                        {/* Reward badge */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-full font-semibold">
                            <DollarSign size={16} />
                            {formatCurrency(survey.reward)}
                          </div>
                          <div className="flex items-center gap-1 text-zinc-500 dark:text-zinc-400 text-sm">
                            <Clock size={14} />
                            {getTimeRemaining(survey.expiresAt)}
                          </div>
                        </div>

                        <h3 className="text-lg font-bold text-foreground mb-2 line-clamp-2">
                          {survey.title}
                        </h3>
                        <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4 line-clamp-2">
                          {survey.description}
                        </p>

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400 mb-4">
                          <div className="flex items-center gap-1">
                            <ClipboardList size={14} />
                            {survey.questions.length} Questions
                          </div>
                          <div className="flex items-center gap-1">
                            <Users size={14} />
                            {spotsLeft} spots left
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mb-4">
                          <div className="h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                isCompleted
                                  ? "bg-green-500"
                                  : spotsLeft <= 5
                                  ? "bg-gradient-to-r from-orange-500 to-red-500"
                                  : "bg-blue-500"
                              }`}
                              style={{
                                width: `${(survey.currentRespondents / survey.maxRespondents) * 100}%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                            {survey.currentRespondents}/{survey.maxRespondents} completed
                          </p>
                        </div>

                        {/* Action button */}
                        <Button
                          onClick={() => !isCompleted && startSurvey(survey)}
                          disabled={isCompleted}
                          className={`w-full group-hover:translate-x-0 transition-all ${
                            isCompleted
                              ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 cursor-not-allowed"
                              : ""
                          }`}
                        >
                          {isCompleted ? (
                            <>
                              <CheckCircle2 size={18} className="mr-2" />
                              Already Completed
                            </>
                          ) : (
                            <>
                              Take Survey
                              <ChevronRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" />
                            </>
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Empty state for completed filter */}
        {filterType === "completed" && completedSurveys.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trophy className="text-zinc-400" size={40} />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No completed surveys yet
              </h3>
              <p className="text-zinc-500 dark:text-zinc-400 mb-4">
                Start completing surveys to track your progress here
              </p>
              <Button onClick={() => setFilterType("available")}>
                <ClipboardList size={18} className="mr-2" />
                Browse Available Surveys
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tips section */}
        <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center flex-shrink-0">
                <Sparkles className="text-blue-600 dark:text-blue-400" size={24} />
              </div>
              <div>
                <h3 className="font-bold text-foreground mb-2">Tips to Maximize Your Earnings</h3>
                <ul className="text-sm text-zinc-600 dark:text-zinc-400 space-y-1">
                  <li>• Complete surveys quickly - spots fill up fast!</li>
                  <li>• Check back daily for new surveys</li>
                  <li>• Answer all questions honestly and thoroughly</li>
                  <li>• Refer friends to earn bonus rewards</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
