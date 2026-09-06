"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

export interface PreviewSection {
  id: string;
  title: string;
  description?: string;
  sectionOrder: number;
}

export interface PreviewQuestion {
  id: string;
  question: string;
  questionType: "single_choice" | "multiple_choice";
  difficulty: string;
  marks: number;
  expectedTime: number | null;
  subjectName: string;
  subjectCode: string;
  topicName: string;
  options: string[];
  sectionId?: string;
  sectionTitle?: string;
  sectionOrder?: number;
}

export interface PreviewDraft {
  title: string;
  description: string;
  duration: number;
  testType: string;
  negativeMarkingEnabled?: boolean;
  negativeMarkRate?: number;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  instructions?: string | null;
  sections?: PreviewSection[];
  questions: PreviewQuestion[];
}

const STORAGE_KEY = "nexora-admin-test-preview";

type LocalAnswer = string | string[];

function shuffleClientSection<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const randomBuffer = new Uint32Array(1);
    window.crypto.getRandomValues(randomBuffer);
    const j = randomBuffer[0] % (i + 1);
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}

function randomizePreviewQuestions(questions: PreviewQuestion[]): PreviewQuestion[] {
  const sectionsMap = new Map<string, PreviewQuestion[]>();
  for (const q of questions) {
    const sId = q.sectionId || "default";
    if (!sectionsMap.has(sId)) {
      sectionsMap.set(sId, []);
    }
    sectionsMap.get(sId)!.push(q);
  }

  const randomized: PreviewQuestion[] = [];
  for (const [, sectionQuestions] of sectionsMap) {
    randomized.push(...shuffleClientSection(sectionQuestions));
  }
  return randomized;
}

export function AdminTestPreview() {
  const [draft, setDraft] = useState<PreviewDraft | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      try {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as PreviewDraft;
          if (parsed.randomizeQuestions && parsed.questions?.length > 1) {
            parsed.questions = randomizePreviewQuestions(parsed.questions);
          }
          if (parsed.randomizeOptions && parsed.questions?.length > 0) {
            parsed.questions = parsed.questions.map((q) => {
              if (Array.isArray(q.options) && q.options.length > 1) {
                return {
                  ...q,
                  options: shuffleClientSection(q.options),
                };
              }
              return q;
            });
          }
          setDraft(parsed);
          setRemainingSeconds(Math.max(0, parsed.duration || 0) * 60);
        }
      } catch {
        setDraft(null);
      }
    }, 0);
    return () => window.clearTimeout(hydration);
  }, []);

  useEffect(() => {
    if (!draft || ended || remainingSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((seconds) => {
        if (seconds <= 1) {
          setEnded(true);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [draft, ended, remainingSeconds]);

  const currentQuestion = draft?.questions[currentIndex];
  const answeredCount = useMemo(
    () => Object.values(answers).filter((answer) => Array.isArray(answer) ? answer.length > 0 : Boolean(answer)).length,
    [answers]
  );

  const sectionGroups = useMemo(() => {
    if (!draft) return [];
    const groups: { sectionId: string; title: string; questions: { q: PreviewQuestion; index: number }[] }[] = [];
    draft.questions.forEach((question, index) => {
      const sId = question.sectionId || "default";
      const title = question.sectionTitle || "General";
      let g = groups.find((item) => item.sectionId === sId);
      if (!g) {
        g = { sectionId: sId, title, questions: [] };
        groups.push(g);
      }
      g.questions.push({ q: question, index });
    });
    return groups;
  }, [draft]);

  const selectAnswer = (option: string) => {
    if (!currentQuestion || ended) return;
    setAnswers((previous) => {
      if (currentQuestion.questionType === "single_choice") {
        return { ...previous, [currentQuestion.id]: option };
      }
      const existing = Array.isArray(previous[currentQuestion.id]) ? previous[currentQuestion.id] as string[] : [];
      return {
        ...previous,
        [currentQuestion.id]: existing.includes(option)
          ? existing.filter((value) => value !== option)
          : [...existing, option],
      };
    });
  };

  if (!draft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base p-6 text-center text-text-primary">
        <div className="max-w-md space-y-4">
          <span className="material-symbols-outlined text-[32px] text-text-muted">preview</span>
          <h1 className="text-title-md font-semibold">Preview is unavailable</h1>
          <p className="text-body-sm text-text-muted">Return to the Test Builder and preview the current configured version.</p>
          <Link href="/admin/tests/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-body-sm font-semibold text-text-inverse focus:outline-none focus:ring-2 focus:ring-primary/60">Back to Test Builder</Link>
        </div>
      </div>
    );
  }

  if (draft.questions.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base p-6 text-center text-text-primary">
        <div className="max-w-md space-y-4">
          <span className="material-symbols-outlined text-[32px] text-text-muted">playlist_add</span>
          <p className="text-label-xs font-mono uppercase tracking-wider text-primary-text">Preview Mode</p>
          <h1 className="text-title-md font-semibold">No questions configured</h1>
          <p className="text-body-sm text-text-muted">Add questions to this test in the Repository before previewing it.</p>
          <Link href="/admin/tests/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-body-sm font-semibold text-text-inverse focus:outline-none focus:ring-2 focus:ring-primary/60">Back to Test Builder</Link>
        </div>
      </div>
    );
  }

  const selectedAnswer = answers[currentQuestion?.id || ""];
  if (!currentQuestion) {
    return null;
  }
  const timer = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex h-dvh min-h-0 flex-col overflow-hidden bg-base text-text-primary">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="min-w-0 flex items-center gap-3">
          <div>
            <p className="text-label-xs font-mono uppercase tracking-wider text-primary-text">Nexora · Preview Mode</p>
            <h1 className="truncate text-body-sm font-bold">{draft.title || "Untitled test"}</h1>
          </div>
          {draft.negativeMarkingEnabled && (
            <span className="hidden sm:inline-flex rounded border border-error/20 bg-error/10 px-2 py-0.5 text-label-xs font-mono font-bold uppercase text-error">
              -{(Number(draft.negativeMarkRate || 0) * 100).toFixed(0)}% Negative Marking
            </span>
          )}
          {draft.randomizeQuestions && (
            <span className="hidden sm:inline-flex rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-label-xs font-mono font-bold uppercase text-primary-text">
              Randomized Order
            </span>
          )}
          {draft.randomizeOptions && (
            <span className="hidden sm:inline-flex rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-label-xs font-mono font-bold uppercase text-primary-text">
              Randomized Options
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <span className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-body-sm font-mono font-bold text-primary-text" aria-label={`Preview time remaining ${timer}`}>{timer}</span>
          <Link href="/admin/tests/new" className="inline-flex h-10 items-center rounded-lg border border-border bg-surface-high px-3 text-body-sm font-semibold text-text-primary hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/60">Exit Preview</Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="max-h-[220px] shrink-0 overflow-y-auto border-b border-border bg-surface p-4 md:max-h-none md:w-64 md:border-b-0 md:border-r lg:w-72">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-title-md font-semibold">Question Navigator</h2>
            <span className="text-label-xs font-mono text-text-muted">{answeredCount} answered</span>
          </div>
          <div className="space-y-4" role="navigation" aria-label="Preview question list">
            {sectionGroups.map((group) => (
              <div key={group.sectionId} className="space-y-1.5">
                <div className="flex items-center justify-between text-label-xs font-mono uppercase text-primary-text font-bold">
                  <span className="truncate">{group.title}</span>
                  <span className="text-text-muted font-normal">{group.questions.length} Qs</span>
                </div>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-5">
                  {group.questions.map(({ q: question, index }) => (
                    <button
                      key={question.id}
                      type="button"
                      onClick={() => setCurrentIndex(index)}
                      aria-label={`Preview question ${index + 1}`}
                      aria-current={index === currentIndex ? "true" : undefined}
                      className={`h-9 rounded-lg border font-mono text-label-xs focus:outline-none focus:ring-2 focus:ring-primary/70 ${
                        index === currentIndex
                          ? "border-2 border-primary bg-primary/20 font-bold"
                          : reviewed[question.id]
                          ? "border-tertiary text-tertiary"
                          : answers[question.id]
                          ? "border-primary bg-primary text-text-inverse"
                          : "border-border bg-surface-high text-text-muted"
                      }`}
                    >
                      {index + 1}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 md:mx-auto md:max-w-5xl md:p-10">
          <div className="mx-auto w-full max-w-3xl space-y-7">
            {draft.instructions && (
              <section className="rounded-xl border border-primary/20 bg-primary/5 p-5">
                <h3 className="text-title-md font-semibold text-text-primary mb-2">
                  Test Instructions
                </h3>
                <p className="text-body-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {draft.instructions}
                </p>
              </section>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-label-xs font-mono uppercase tracking-wider text-text-muted">{currentQuestion?.questionType === "multiple_choice" ? "MULTIPLE CHOICE · SELECT ALL" : "MULTIPLE CHOICE · SINGLE ANSWER"}</span>
                {currentQuestion?.sectionTitle && (
                  <span className="rounded border border-primary/20 bg-primary/10 px-2 py-1 text-label-xs font-mono uppercase text-primary-text">
                    {currentQuestion.sectionTitle}
                  </span>
                )}
                <span className="rounded border border-border bg-surface-high px-2 py-1 text-label-xs font-mono text-primary-text">{currentQuestion?.subjectCode} · {currentQuestion?.topicName}</span>
                {draft.negativeMarkingEnabled && (
                  <span className="rounded border border-error/20 bg-error/10 px-2 py-1 text-label-xs font-mono text-error">
                    Marks: +{currentQuestion?.marks} / -{(Number(currentQuestion?.marks || 0) * Number(draft.negativeMarkRate || 0)).toFixed(2)}
                  </span>
                )}
              </div>
              <span className="text-label-xs font-mono text-secondary">Preview answers are local only</span>
            </div>
            <div>
              <p className="text-label-xs font-mono uppercase tracking-wider text-primary-text">Question {currentIndex + 1} / {draft.questions.length}</p>
              <h2 className="mt-3 text-2xl font-semibold leading-snug sm:text-3xl">{currentQuestion?.question}</h2>
            </div>
            <div className="space-y-3" role={currentQuestion?.questionType === "single_choice" ? "radiogroup" : "group"} aria-label={`Preview options for question ${currentIndex + 1}`}>
              {currentQuestion?.options.map((option, index) => {
                const letter = String.fromCharCode(65 + index);
                const isSelected = Array.isArray(selectedAnswer) ? selectedAnswer.includes(option) : selectedAnswer === option;
                return <button key={`${currentQuestion.id}-${index}`} type="button" onClick={() => selectAnswer(option)} role={currentQuestion.questionType === "single_choice" ? "radio" : "checkbox"} aria-checked={isSelected} aria-label={`Preview option ${letter}: ${option}`} className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left focus:outline-none focus:ring-2 focus:ring-primary/70 ${isSelected ? "border-primary bg-primary/10" : "border-border bg-surface hover:border-border-variant"}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-label-xs font-mono font-bold ${isSelected ? "bg-primary text-text-inverse" : "border border-border bg-surface-high text-text-muted"}`}>{letter}</span><span className="text-body-sm leading-relaxed">{option}</span></button>;
              })}
            </div>
            {ended && <div className="rounded-lg border border-tertiary/30 bg-tertiary/10 p-3 text-body-sm text-tertiary">Preview time ended. No submission was created.</div>}
            <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-base/95 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
              <button type="button" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0} className="h-11 rounded-lg border border-border bg-surface px-4 text-body-sm font-medium disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-primary/70">Previous</button>
              <button type="button" onClick={() => setReviewed((state) => ({ ...state, [currentQuestion.id]: !state[currentQuestion.id] }))} className={`h-11 rounded-lg border px-4 text-body-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/70 ${reviewed[currentQuestion.id] ? "border-tertiary bg-tertiary/10 text-tertiary" : "border-border bg-surface text-text-secondary"}`}>Mark for Review</button>
              <button type="button" onClick={() => setCurrentIndex((index) => Math.min(draft.questions.length - 1, index + 1))} disabled={currentIndex === draft.questions.length - 1} className="h-11 rounded-lg bg-primary px-5 text-body-sm font-semibold text-text-inverse disabled:opacity-30 focus:outline-none focus:ring-2 focus:ring-primary/70">Next</button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
