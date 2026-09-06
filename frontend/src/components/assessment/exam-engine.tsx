"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
    markingPolicy?: {
      negativeMarkingEnabled: boolean;
      negativeMarkRate: number;
    };
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
      sectionId?: string;
      sectionTitle?: string;
      sectionOrder?: number;
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
  const [, setLastSavedTime] = useState<Date>(new Date());
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Authoritative wall-clock target end time to eliminate setInterval throttling drift
  const targetEndTimeRef = useRef<number>(
    Date.now() + Math.max(0, initialState.remainingSeconds) * 1000
  );
  const isSubmittingRef = useRef(false);

  const currentQ = questions[currentIndex];
  const totalQuestions = questions.length;

  const sectionGroups = useMemo(() => {
    const groups: {
      sectionId: string;
      sectionTitle: string;
      sectionOrder: number;
      items: { q: (typeof questions)[0]; index: number }[];
    }[] = [];

    questions.forEach((q, index) => {
      const sId = q.sectionId || "default-sec";
      const sTitle = q.sectionTitle || "General";
      const sOrder = q.sectionOrder ?? 1;

      let group = groups.find((g) => g.sectionId === sId);
      if (!group) {
        group = {
          sectionId: sId,
          sectionTitle: sTitle,
          sectionOrder: sOrder,
          items: [],
        };
        groups.push(group);
      }
      group.items.push({ q, index });
    });

    return groups.sort((a, b) => a.sectionOrder - b.sectionOrder);
  }, [questions]);

  // Auto-submit / Final submit helper with double-submission guard
  const handleFinalSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await submitTestAttemptAction(attemptId);
      router.push(`/tests/${testId}/result?attemptId=${attemptId}`);
    } catch (err) {
      console.error("Submission failed:", err);
      alert("Submission encountered an issue. Retrying...");
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [attemptId, testId, router]);

  // Wall-clock synced live timer countdown with visibility change recovery
  useEffect(() => {
    const updateRemaining = () => {
      const remaining = Math.max(
        0,
        Math.ceil((targetEndTimeRef.current - Date.now()) / 1000)
      );
      setRemainingSeconds(remaining);
      if (remaining <= 0 && !isSubmittingRef.current) {
        handleFinalSubmit();
      }
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        updateRemaining();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handleFinalSubmit]);

  // Sync active question index to server for refresh recovery
  const handleQuestionChange = useCallback(
    async (index: number) => {
      if (index < 0 || index >= totalQuestions) return;
      setCurrentIndex(index);
      setQuestionIndexAction(attemptId, index).catch(console.error);
    },
    [attemptId, totalQuestions]
  );

  // Handle selecting an answer
  const handleSelectOption = useCallback(
    async (option: string) => {
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
    },
    [currentQ, answers, attemptId]
  );

  // Toggle mark for review
  const handleToggleReview = useCallback(async () => {
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
  }, [currentQ, answers, attemptId]);

  // Global Keyboard Navigation (A-D / 1-4 for options, arrows/P/N for navigation, M for review, Escape for modal)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If modal is open, Escape closes modal
      if (showSubmitModal) {
        if (e.key === "Escape") {
          e.preventDefault();
          setShowSubmitModal(false);
        }
        return;
      }

      // Ignore if typing in an input/textarea
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (targetTag === "input" || targetTag === "textarea" || targetTag === "select") {
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "p" || e.key === "P") {
        if (currentIndex > 0) {
          e.preventDefault();
          handleQuestionChange(currentIndex - 1);
        }
      } else if (e.key === "ArrowRight" || e.key === "n" || e.key === "N") {
        if (currentIndex < totalQuestions - 1) {
          e.preventDefault();
          handleQuestionChange(currentIndex + 1);
        }
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        handleToggleReview();
      } else if (currentQ && Array.isArray(currentQ.options)) {
        let optIndex = -1;
        const lowerKey = e.key.toLowerCase();
        if (lowerKey === "a" || e.key === "1") optIndex = 0;
        else if (lowerKey === "b" || e.key === "2") optIndex = 1;
        else if (lowerKey === "c" || e.key === "3") optIndex = 2;
        else if (lowerKey === "d" || e.key === "4") optIndex = 3;

        if (optIndex >= 0 && optIndex < currentQ.options.length) {
          e.preventDefault();
          const target = currentQ.options[optIndex];
          const targetId =
            typeof target === "object" && target !== null && "id" in target
              ? (target as any).id
              : String(target);
          handleSelectOption(targetId);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showSubmitModal,
    currentIndex,
    totalQuestions,
    currentQ,
    handleQuestionChange,
    handleToggleReview,
    handleSelectOption,
  ]);

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
  const timerState =
    remainingSeconds <= 300
      ? "critical"
      : remainingSeconds <= 900
      ? "warning"
      : "normal";

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
    <div className="fixed inset-0 z-50 flex h-dvh min-h-0 flex-col overflow-hidden bg-base text-text-primary">
      {/* Top Header */}
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-high">
            <span className="material-symbols-outlined text-primary-text text-[18px]">
              terminal
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-label-xs font-mono uppercase tracking-wider text-text-muted">Nexora • Active Exam</p>
            <h1 className="max-w-[11rem] truncate text-body-sm font-bold text-text-primary sm:max-w-md">
              Nexora • {testTitle}
            </h1>
          </div>
        </div>

        {/* Center: Question Counter */}
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border bg-surface-high px-2.5 py-1.5 font-mono text-body-sm text-text-secondary sm:px-3">
          <span className="text-label-xs uppercase text-text-muted">Q</span>
          <span className="font-bold text-text-primary">{currentIndex + 1}</span>
          <span className="text-text-muted">/ {totalQuestions}</span>
        </div>

        {/* Right: Timer & Finish Exam button */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-body-sm font-bold transition-colors sm:gap-2 sm:px-3 ${
              timerState === "critical"
                ? "border-error/50 bg-error/10 text-error"
                : timerState === "warning"
                ? "border-tertiary/50 bg-tertiary/10 text-tertiary"
                : "border-primary/30 bg-primary/10 text-primary-text"
            }`}
            aria-label={`Time remaining ${formatTimerDisplay(remainingSeconds)}`}
            aria-live="polite"
          >
            <span className="material-symbols-outlined text-[17px]">timer</span>
            <span>{formatTimerDisplay(remainingSeconds)}</span>
          </div>

          <button
            onClick={() => setShowSubmitModal(true)}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-text-inverse transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/60 sm:px-3 sm:text-body-sm"
          >
            <span className="sm:hidden">Finish</span>
            <span className="hidden sm:inline">Finish Exam</span>
          </button>
        </div>
      </header>

      {/* Main Examination Layout */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* Left: Question Navigator */}
        <aside className="max-h-[180px] w-full shrink-0 overflow-y-auto border-b border-border bg-surface p-4 md:max-h-none md:w-64 md:border-b-0 md:border-r md:p-5 lg:w-72">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-title-md font-semibold text-text-primary">Question Navigator</h3>
            <span className="text-label-xs font-mono uppercase text-text-muted">{totalQuestions} total</span>
          </div>

          {/* Legend */}
          <div className="mb-4 grid grid-cols-2 gap-2 border-b border-border pb-4 font-mono text-label-xs text-text-muted">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded bg-primary" />
              <span>Answered ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded border border-border bg-surface-high" />
              <span>Unanswered ({unansweredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded border border-tertiary" />
              <span>Review ({markedReviewCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded border-2 border-primary" />
              <span>Current</span>
            </div>
          </div>

          {/* Grouped Question numbers by section */}
          <div className="space-y-4" role="navigation" aria-label="Question list">
            {sectionGroups.map((group) => (
              <div key={group.sectionId} className="space-y-1.5">
                <div className="flex items-center justify-between text-label-xs font-mono uppercase text-primary-text font-bold">
                  <span className="truncate">{group.sectionTitle}</span>
                  <span className="text-text-muted font-normal text-[11px]">
                    {group.items.length} Qs
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-2 font-mono text-label-xs sm:grid-cols-8 md:grid-cols-5">
                  {group.items.map(({ q, index }) => (
                    <button
                      key={q.id}
                      onClick={() => handleQuestionChange(index)}
                      aria-label={`Go to question ${index + 1}`}
                      aria-current={index === currentIndex ? "true" : undefined}
                      className={`h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/70 ${getQuestionStatus(
                        q.id,
                        index
                      )}`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Right: Question & Option Canvas */}
        <main className="flex min-h-0 w-full max-w-5xl flex-1 flex-col justify-between overflow-y-auto px-4 py-6 sm:px-6 md:mx-auto md:p-10">
          {currentQ ? (
            <div className="mx-auto w-full max-w-3xl space-y-7 md:space-y-8">
              {/* Question metadata bar */}
              <div className="flex flex-col items-start justify-between gap-3 border-b border-border/70 pb-5 sm:flex-row sm:items-center">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-label-xs text-text-muted uppercase font-mono tracking-wider">
                    {currentQ.questionType === "single_choice"
                      ? "MULTIPLE CHOICE — SINGLE ANSWER"
                      : "MULTIPLE CHOICE — SELECT ALL THAT APPLY"}
                  </span>
                  {currentQ.sectionTitle && (
                    <span className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-label-xs font-mono uppercase text-primary-text font-semibold">
                      {currentQ.sectionTitle}
                    </span>
                  )}
                  <span className="rounded border border-border bg-surface-high px-2 py-1 text-label-xs font-mono uppercase text-primary-text">
                    {currentQ.subjectCode} • {currentQ.topicName}
                  </span>
                  {initialState.markingPolicy?.negativeMarkingEnabled && (
                    <span className="rounded border border-error/30 bg-error/10 px-2 py-1 text-label-xs font-mono text-error">
                      +{currentQ.marks} / -{(currentQ.marks * (initialState.markingPolicy.negativeMarkRate || 0)).toFixed(2)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 rounded border border-secondary/20 bg-secondary/10 px-2.5 py-1 text-label-xs font-mono text-secondary">
                  <span className="material-symbols-outlined text-[14px]">cloud_done</span>
                  <span>{isSaving ? "Saving..." : "Auto-saved"}</span>
                </div>
              </div>

              {/* Question Headline */}
              <div>
                <h2 className="text-2xl sm:text-3xl font-semibold text-text-primary leading-snug">
                  Question {currentIndex + 1}
                </h2>
                <div className="mt-5 max-w-3xl whitespace-pre-wrap text-body-md leading-relaxed text-text-primary">
                  {currentQ.question}
                </div>
              </div>

              {/* Options */}
              <div
                className="space-y-3 pt-1"
                role={currentQ.questionType === "single_choice" ? "radiogroup" : "group"}
                aria-label={`Options for Question ${currentIndex + 1}`}
              >
                {Array.isArray(currentQ.options) &&
                  currentQ.options.map((opt: any, optIdx: number) => {
                    const optId =
                      typeof opt === "object" && opt !== null && "id" in opt
                        ? opt.id
                        : String(opt);
                    const optText =
                      typeof opt === "object" && opt !== null && "text" in opt
                        ? opt.text
                        : String(opt);

                    const currentSelected = answers[currentQ.id]?.selectedAnswer;
                    const isSelected =
                      currentQ.questionType === "single_choice"
                        ? currentSelected === optId
                        : Array.isArray(currentSelected) &&
                          currentSelected.includes(optId);

                    const optionLetter = String.fromCharCode(65 + optIdx);

                    return (
                      <button
                        key={optIdx}
                        onClick={() => handleSelectOption(optId)}
                        role={currentQ.questionType === "single_choice" ? "radio" : "checkbox"}
                        aria-checked={isSelected}
                        aria-label={`Option ${optionLetter}: ${optText}`}
                        className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/70 ${
                          isSelected
                            ? "bg-primary/10 border-primary text-text-primary shadow-sm"
                            : "bg-surface border-border text-text-secondary hover:border-border-variant hover:text-text-primary"
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono text-label-xs font-bold flex-shrink-0 mt-0.5 ${
                            isSelected
                              ? "bg-primary text-text-inverse"
                              : "bg-surface-high border border-border text-text-muted"
                          }`}
                        >
                          {optionLetter}
                        </div>
                        <span className="text-body-sm leading-relaxed flex-1">
                          {optText}
                        </span>
                        <span className="text-[10px] font-mono text-text-muted/60 uppercase hidden sm:inline-block">
                          [{optionLetter}]
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
          <div className="sticky bottom-0 z-10 mt-8 flex items-center justify-between gap-2 border-t border-border bg-base/95 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:gap-3 md:mt-10 md:pt-5">
            <button
              onClick={() => handleQuestionChange(currentIndex - 1)}
              disabled={currentIndex === 0}
              aria-label="Previous question"
              className="flex h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-body-sm font-medium text-text-primary transition-colors hover:bg-surface-high focus:outline-none focus:ring-2 focus:ring-primary/70 disabled:cursor-not-allowed disabled:opacity-30 sm:gap-2 sm:px-5"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              Previous
            </button>

            <button
              onClick={handleToggleReview}
              aria-label={answers[currentQ?.id]?.markedForReview ? "Unmark review" : "Mark for review"}
              className={`flex h-11 items-center gap-1.5 rounded-lg border px-3 text-body-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary/70 sm:gap-2 sm:px-4 ${
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
              aria-label={currentIndex === totalQuestions - 1 ? "Review and submit assessment" : "Next question"}
              className="flex h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-body-sm font-semibold text-text-inverse transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/70 sm:gap-2 sm:px-6"
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
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-modal-title"
          className="fixed inset-0 z-50 bg-base/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="bg-surface border border-border rounded-xl p-8 max-w-md w-full shadow-2xl space-y-6">
            <div>
              <h3 id="submit-modal-title" className="text-title-md font-bold text-text-primary mb-1">
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
