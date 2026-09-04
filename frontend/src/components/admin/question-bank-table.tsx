"use client";

import { useState } from "react";
import Link from "next/link";

interface QuestionItem {
  id: string;
  question: string;
  difficulty: string;
  marks: number;
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
    <div className="space-y-6">
      {/* Filter Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search questions by text or keywords..."
            className="w-full bg-base border border-border rounded px-4 py-2 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
          />
          <span className="material-symbols-outlined absolute right-3 top-2.5 text-text-muted text-[18px]">
            search
          </span>
        </div>

        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          aria-label="Filter by subject"
          className="bg-base border border-border text-text-primary text-label-xs font-mono px-3 py-2 rounded focus:border-primary focus:outline-none cursor-pointer"
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
          className="bg-base border border-border text-text-primary text-label-xs font-mono px-3 py-2 rounded focus:border-primary focus:outline-none cursor-pointer"
        >
          <option value="">All Difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>

        {(searchQuery || selectedSubject || selectedDifficulty) && (
          <button
            onClick={() => {
              setSearchQuery("");
              setSelectedSubject("");
              setSelectedDifficulty("");
            }}
            className="text-label-xs font-mono text-text-muted hover:text-text-primary underline px-2 cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      {/* Question Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-surface-high border-b border-border text-label-xs font-mono text-text-muted uppercase">
          <div className="col-span-1">ID</div>
          <div className="col-span-6">Question Preview</div>
          <div className="col-span-2">Subject</div>
          <div className="col-span-2">Topic</div>
          <div className="col-span-1 text-right">Diff</div>
        </div>

        <div className="divide-y divide-border">
          {filtered.length > 0 ? (
            filtered.map((q, idx) => (
              <div
                key={q.id}
                className="grid grid-cols-12 gap-4 px-5 py-4 items-center text-body-sm hover:bg-surface-high/40 transition-colors"
              >
                <div className="col-span-1 font-mono text-label-xs text-text-muted">
                  Q-{String(idx + 1).padStart(3, "0")}
                </div>

                <div className="col-span-6 truncate font-medium text-text-primary">
                  {q.question}
                </div>

                <div className="col-span-2 text-label-xs font-mono text-primary-text truncate">
                  {q.subjectName}
                </div>

                <div className="col-span-2 text-label-xs font-mono text-text-secondary truncate">
                  {q.topicName}
                </div>

                <div className="col-span-1 text-right">
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
