"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  saveAnswerAction,
  toggleReviewAction,
  setQuestionIndexAction,
  submitTestAttemptAction,
} from "@/server/actions";
import { formatTimerDisplay } from "@/lib/utils";

interface ExamEngineProps {
  initialState: {
    attemptId: string;
    testId: string;
    testTitle: string;
    testType: string;
    status: string;
    totalDurationSeconds: number;
    remainingSeconds: number;
    currentQuestionIndex: number;
    questions: {
      id: string;
      question: string;
      questionType: "single_choice" | "multiple_choice";
      options: string[] | any;
      difficulty: string;
      marks: number;
      expectedTime: number | null;
      subjectName: string;
      subjectCode: string;
      topicName: string;
      questionOrder: number;
    }[];
    answers: Record<
      string,
      {
        selectedAnswer: any;
        markedForReview: boolean;
        timeSpent: number;
      }
    >;
  };
}

export function ExamEngine({ initialState }: ExamEngineProps) {
  const router = useRouter();
  const { attemptId, testId, testTitle, questions } = initialState;

  const [currentIndex, setCurrentIndex] = useState(
    initialState.currentQuestionIndex || 0
  );
  const [answers, setAnswers] = useState(initialState.answers);
  const [remainingSeconds, setRemainingSeconds] = useState(
    initialState.remainingSeconds
  );
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<Date>(new Date());
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentQ = questions[currentIndex];
  const totalQuestions = questions.length;

  // Auto-submit helper
  const handleFinalSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await submitTestAttemptAction(attemptId);
      router.push(`/tests/${testId}/result?attemptId=${attemptId}`);
    } catch (err) {
      console.error("Submission failed:", err);
      alert("Submission encountered an issue. Retrying...");
      setIsSubmitting(false);
    }
  }, [attemptId, testId, router]);

  // Live Timer Countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleFinalSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [handleFinalSubmit]);

  // Sync active question index to server for refresh recovery
  const handleQuestionChange = async (index: number) => {
    if (index < 0 || index >= totalQuestions) return;
    setCurrentIndex(index);
    setQuestionIndexAction(attemptId, index).catch(console.error);
  };

  // Handle selecting an answer
  const handleSelectOption = async (option: string) => {
    if (!currentQ) return;

    let newSelected: any;
    const existing = answers[currentQ.id]?.selectedAnswer;

    if (currentQ.questionType === "single_choice") {
      newSelected = option;
    } else {
      // Multiple choice toggle
      const arr: string[] = Array.isArray(existing) ? [...existing] : [];
      if (arr.includes(option)) {
        newSelected = arr.filter((item) => item !== option);
      } else {
        newSelected = [...arr, option];
      }
    }

    // Optimistic local state update
    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: {
        selectedAnswer: newSelected,
        markedForReview: prev[currentQ.id]?.markedForReview || false,
        timeSpent: (prev[currentQ.id]?.timeSpent || 0) + 1,
      },
    }));

    setIsSaving(true);
    try {
      await saveAnswerAction(attemptId, currentQ.id, newSelected, 1);
      setLastSavedTime(new Date());
    } catch (err) {
      console.error("Failed to save answer:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle mark for review
  const handleToggleReview = async () => {
    if (!currentQ) return;

    const currentReview = answers[currentQ.id]?.markedForReview || false;
    const nextReview = !currentReview;

    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: {
        selectedAnswer: prev[currentQ.id]?.selectedAnswer ?? null,
        markedForReview: nextReview,
        timeSpent: prev[currentQ.id]?.timeSpent || 0,
      },
    }));

    try {
      await toggleReviewAction(attemptId, currentQ.id);
    } catch (err) {
      console.error("Failed to toggle review mark:", err);
    }
  };

  // Calculate question status counts
  let answeredCount = 0;
  let markedReviewCount = 0;

  questions.forEach((q) => {
    const ans = answers[q.id];
    if (ans?.selectedAnswer !== null && ans?.selectedAnswer !== undefined) {
      if (Array.isArray(ans.selectedAnswer) && ans.selectedAnswer.length === 0) {
        // empty array
      } else {
        answeredCount += 1;
      }
    }
    if (ans?.markedForReview) {
      markedReviewCount += 1;
    }
  });

  const unansweredCount = totalQuestions - answeredCount;

  // Render question status indicator for navigator
  const getQuestionStatus = (qId: string, idx: number) => {
    const ans = answers[qId];
    const isCurrent = idx === currentIndex;
    const isAnswered =
      ans?.selectedAnswer !== null &&
      ans?.selectedAnswer !== undefined &&
      (!Array.isArray(ans.selectedAnswer) || ans.selectedAnswer.length > 0);
    const isReview = ans?.markedForReview;

    if (isCurrent) {
      return "border-2 border-primary text-text-primary bg-primary/20 font-bold";
    }
    if (isAnswered && isReview) {
      return "bg-tertiary/20 text-tertiary border border-tertiary font-bold";
    }
    if (isReview) {
      return "border border-tertiary text-tertiary";
    }
    if (isAnswered) {
      return "bg-primary text-text-inverse font-bold border border-primary";
    }
    return "bg-surface-high text-text-muted border border-border hover:border-border-variant";
  };

  return (
    <div className="min-h-screen bg-base flex flex-col text-text-primary">
      {/* Top Header */}
      <header className="h-16 border-b border-border bg-surface px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 rounded-full bg-surface-high flex items-center justify-center border border-border">
            <span className="material-symbols-outlined text-primary-text text-[18px]">
              terminal
            </span>
          </div>
          <div>
            <h1 className="text-body-sm font-bold text-text-primary truncate max-w-xs sm:max-w-md">
              Placement OS • {testTitle}
            </h1>
          </div>
        </div>

        {/* Center: Question Counter */}
        <div className="hidden sm:flex items-center gap-1 font-mono text-body-sm text-text-secondary">
          <span className="text-label-xs text-text-muted uppercase">QUESTION</span>
          <span className="text-text-primary font-bold">{currentIndex + 1}</span>
          <span className="text-text-muted">/ {totalQuestions}</span>
        </div>

        {/* Right: Timer & Finish Exam button */}
        <div className="flex items-center space-x-4">
          <div className="bg-surface-high border border-border px-3 py-1.5 rounded flex items-center gap-2 font-mono text-body-sm text-primary-text font-bold">
            <span className="material-symbols-outlined text-[18px]">timer</span>
            <span>{formatTimerDisplay(remainingSeconds)}</span>
          </div>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="bg-primary text-text-inverse font-semibold text-body-sm px-4 py-2 rounded hover:bg-primary-text transition-colors cursor-pointer"
          >
            Finish Exam
          </button>
        </div>
      </header>

      {/* Main Examination Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left: Question Navigator */}
        <aside className="w-full md:w-72 bg-surface border-r border-border p-5 flex flex-col overflow-y-auto max-h-[220px] md:max-h-none flex-shrink-0">
          <h3 className="text-title-md font-semibold text-text-primary mb-3">
            Question Navigator
          </h3>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-2 text-label-xs text-text-muted font-mono mb-4 pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-primary" />
              <span>Answered ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded bg-surface-high border border-border" />
              <span>Unanswered ({unansweredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded border border-tertiary" />
              <span>Review ({markedReviewCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded border-2 border-primary" />
              <span>Current</span>
            </div>
          </div>

          {/* Grid of Question numbers */}
          <div className="grid grid-cols-5 gap-2 font-mono text-label-xs">
            {questions.map((q, idx) => (
              <button
                key={q.id}
                onClick={() => handleQuestionChange(idx)}
                className={`h-9 rounded flex items-center justify-center transition-all cursor-pointer ${getQuestionStatus(
                  q.id,
                  idx
                )}`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </aside>

        {/* Right: Question & Option Canvas */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col justify-between max-w-4xl mx-auto w-full">
          {currentQ ? (
            <div className="space-y-8">
              {/* Question metadata bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-label-xs text-text-muted uppercase font-mono tracking-wider">
                    {currentQ.questionType === "single_choice"
                      ? "MULTIPLE CHOICE — SINGLE ANSWER"
                      : "MULTIPLE CHOICE — SELECT ALL THAT APPLY"}
                  </span>
                  <span className="text-label-xs px-2 py-0.5 rounded bg-surface-high text-primary-text border border-border font-mono uppercase">
                    {currentQ.subjectCode} • {currentQ.topicName}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-label-xs text-secondary font-mono bg-secondary/10 px-2.5 py-1 rounded border border-secondary/20">
                  <span className="material-symbols-outlined text-[14px]">cloud_done</span>
                  <span>{isSaving ? "Saving..." : "Auto-saved"}</span>
                </div>
              </div>

              {/* Question Headline */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-text-primary leading-snug">
                  Question {currentIndex + 1}
                </h2>
                <div className="mt-4 text-body-md text-text-primary whitespace-pre-wrap leading-relaxed">
                  {currentQ.question}
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3 pt-2">
                {Array.isArray(currentQ.options) &&
                  currentQ.options.map((opt: string, optIdx: number) => {
                    const currentSelected = answers[currentQ.id]?.selectedAnswer;
                    const isSelected =
                      currentQ.questionType === "single_choice"
                        ? currentSelected === opt
                        : Array.isArray(currentSelected) &&
                          currentSelected.includes(opt);

                    const optionLetter = String.fromCharCode(65 + optIdx);

                    return (
                      <button
                        key={optIdx}
                        onClick={() => handleSelectOption(opt)}
                        className={`w-full text-left p-4 rounded-lg border transition-all flex items-start gap-4 cursor-pointer ${
                          isSelected
                            ? "bg-primary/10 border-primary text-text-primary shadow-sm"
                            : "bg-surface border-border text-text-secondary hover:border-border-variant hover:text-text-primary"
                        }`}
                      >
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-label-xs font-bold flex-shrink-0 mt-0.5 ${
                            isSelected
                              ? "bg-primary text-text-inverse"
                              : "bg-surface-high border border-border text-text-muted"
                          }`}
                        >
                          {optionLetter}
                        </div>
                        <span className="text-body-sm leading-relaxed flex-1">
                          {opt}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-text-muted">
              No questions found for this test.
            </div>
          )}

          {/* Bottom Action Controls */}
          <div className="pt-10 mt-10 border-t border-border flex items-center justify-between">
            <button
              onClick={() => handleQuestionChange(currentIndex - 1)}
              disabled={currentIndex === 0}
              className="bg-surface border border-border text-text-primary font-medium text-body-sm px-5 py-2.5 rounded hover:bg-surface-high transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              Previous
            </button>

            <button
              onClick={handleToggleReview}
              className={`font-medium text-body-sm px-4 py-2.5 rounded border transition-colors flex items-center gap-2 cursor-pointer ${
                answers[currentQ?.id]?.markedForReview
                  ? "bg-tertiary/20 text-tertiary border-tertiary"
                  : "bg-surface border-border text-text-secondary hover:text-text-primary hover:bg-surface-high"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">flag</span>
              {answers[currentQ?.id]?.markedForReview
                ? "Marked for Review"
                : "Mark for Review"}
            </button>

            <button
              onClick={() => {
                if (currentIndex === totalQuestions - 1) {
                  setShowSubmitModal(true);
                } else {
                  handleQuestionChange(currentIndex + 1);
                }
              }}
              className="bg-primary text-text-inverse font-semibold text-body-sm px-6 py-2.5 rounded hover:bg-primary-text transition-colors flex items-center gap-2 cursor-pointer"
            >
              {currentIndex === totalQuestions - 1 ? (
                <>
                  <span>Review & Submit</span>
                  <span className="material-symbols-outlined text-[18px]">check</span>
                </>
              ) : (
                <>
                  <span>Next</span>
                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                </>
              )}
            </button>
          </div>
        </main>
      </div>

      {/* Submission Confirmation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-xl p-8 max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h3 className="text-title-md font-bold text-text-primary mb-1">
                Submit Assessment?
              </h3>
              <p className="text-body-sm text-text-secondary">
                Are you sure you want to finish and submit your exam for grading?
              </p>
            </div>

            {/* Assessment Breakdown Summary */}
            <div className="bg-base border border-border rounded-lg p-4 space-y-2.5 font-mono text-body-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Total Questions:</span>
                <span className="font-bold text-text-primary">{totalQuestions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Answered:</span>
                <span className="font-bold text-secondary">{answeredCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Unanswered:</span>
                <span className="font-bold text-error">{unansweredCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Marked for Review:</span>
                <span className="font-bold text-tertiary">{markedReviewCount}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSubmitModal(false)}
                disabled={isSubmitting}
                className="flex-1 bg-surface-high border border-border text-text-primary font-medium text-body-sm py-2.5 rounded hover:bg-surface-highest transition-colors disabled:opacity-50"
              >
                Continue Test
              </button>
              <button
                onClick={handleFinalSubmit}
                disabled={isSubmitting}
                className="flex-1 bg-primary text-text-inverse font-semibold text-body-sm py-2.5 rounded hover:bg-primary-text transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Grading..." : "Submit Exam"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
