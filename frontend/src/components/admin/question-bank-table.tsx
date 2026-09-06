"use client";

import { useState } from "react";

interface QuestionItem {
  id: string;
  question: string;
  questionType: "single_choice" | "multiple_choice";
  difficulty: string;
  marks: number;
  expectedTime: number | null;
  subjectName: string;
  subjectCode: string;
  topicName: string;
}

interface SubjectItem {
  id: string;
  name: string;
}

export function QuestionBankTable({
  questions,
  subjects,
}: {
  questions: QuestionItem[];
  subjects: SubjectItem[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [selectedDifficulty, setSelectedDifficulty] = useState("");
  const hasFilters = Boolean(searchQuery || selectedSubject || selectedDifficulty);

  const filtered = questions.filter((q) => {
    const matchesSearch =
      !searchQuery ||
      q.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.topicName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      q.subjectName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSubject =
      !selectedSubject || q.subjectName === selectedSubject;

    const matchesDifficulty =
      !selectedDifficulty || q.difficulty === selectedDifficulty;

    return matchesSearch && matchesSubject && matchesDifficulty;
  });

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="question-search" className="sr-only">Search question bank</label>
          <input
            id="question-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions by text or keywords..."
            className="h-11 w-full rounded-lg border border-border bg-base px-10 pr-10 text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-3 text-[18px] text-text-muted">
            search
          </span>
        </div>

        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          aria-label="Filter by subject"
          className="h-10 rounded-lg border border-border bg-base px-3 text-label-xs font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All Subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={selectedDifficulty}
          onChange={(e) => setSelectedDifficulty(e.target.value)}
          aria-label="Filter by difficulty"
          className="h-10 rounded-lg border border-border bg-base px-3 text-label-xs font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        >
          <option value="">All Difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => {
              setSearchQuery("");
              setSelectedSubject("");
              setSelectedDifficulty("");
            }}
            type="button"
            className="h-10 rounded-lg border border-border px-3 text-label-xs font-mono text-text-muted transition-colors hover:border-border-variant hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Question Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-high px-5 py-3">
          <span className="text-label-xs font-mono uppercase text-text-muted">Question inventory</span>
          <span className="text-label-xs font-mono text-text-muted">{filtered.length} / {questions.length} shown</span>
        </div>
        <div className="hidden min-w-[980px] grid-cols-12 gap-4 border-b border-border bg-surface-high px-5 py-3 text-label-xs font-mono uppercase text-text-muted md:grid">
          <div className="col-span-1">ID</div>
          <div className="col-span-4">Question Preview</div>
          <div className="col-span-2">Classification</div>
          <div className="col-span-2">Assessment</div>
          <div className="col-span-2">Topic</div>
          <div className="col-span-1 text-right">Diff</div>
        </div>

        <div className="divide-y divide-border md:overflow-x-auto">
          {filtered.length > 0 ? (
            filtered.map((q) => (
              <div
                key={q.id}
                className="block p-4 text-body-sm transition-colors hover:bg-surface-high/40 md:grid md:min-w-[980px] md:grid-cols-12 md:items-center md:gap-4 md:px-5 md:py-3.5"
              >
                <div className="mb-2 flex items-center justify-between gap-3 md:col-span-1 md:mb-0 md:block">
                  <span className="font-mono text-label-xs text-text-muted" title={q.id}>
                    {q.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="rounded border border-border bg-surface-high px-2 py-1 text-label-xs font-mono uppercase text-text-muted md:hidden">
                    {q.difficulty}
                  </span>
                </div>

                <div className="mb-3 font-medium text-text-primary md:col-span-4 md:mb-0 md:truncate" title={q.question}>
                  {q.question}
                </div>

                <div className="mb-3 grid grid-cols-2 gap-3 text-label-xs font-mono md:col-span-2 md:mb-0 md:block">
                  <span className="text-text-muted">Subject</span>
                  <span className="truncate text-right text-primary-text md:mt-1 md:block md:text-left">{q.subjectCode} · {q.subjectName}</span>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-3 text-label-xs font-mono md:col-span-2 md:mb-0 md:block">
                  <span className="text-text-muted">Assessment</span>
                  <span className="text-right text-text-secondary md:mt-1 md:block md:text-left">
                    {q.marks} marks · {q.expectedTime ? `${q.expectedTime}s` : "Time unset"}
                  </span>
                </div>

                <div className="mb-3 grid grid-cols-2 gap-3 text-label-xs font-mono md:col-span-2 md:mb-0 md:block">
                  <span className="text-text-muted">Topic / type</span>
                  <span className="truncate text-right text-text-secondary md:mt-1 md:block md:text-left">
                    {q.topicName} · {q.questionType === "multiple_choice" ? "Multiple" : "Single"}
                  </span>
                </div>

                <div className="hidden text-right md:col-span-1 md:block">
                  <span
                    className={`text-label-xs px-2 py-0.5 rounded font-mono uppercase ${
                      q.difficulty === "easy"
                        ? "bg-secondary/10 text-secondary"
                        : q.difficulty === "medium"
                        ? "bg-primary/10 text-primary-text"
                        : "bg-error/10 text-error"
                    }`}
                  >
                    {q.difficulty}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="p-12 text-center text-text-muted font-mono text-body-sm">
              No questions matched your search criteria.
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-between text-label-xs font-mono text-text-muted">
          <span>
            Showing {filtered.length} of {questions.length} entries
          </span>
        </div>
      </div>
    </div>
  );
}
