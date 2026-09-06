"use client";

import { useState } from "react";
import type { AdminQuestionPerformanceItem } from "@/server/admin-analytics";

interface QuestionAnalyticsTableProps {
  questions: AdminQuestionPerformanceItem[];
  subjectsList: { id: string; name: string }[];
  onFilterChange?: (filters: any) => void;
}

export function QuestionAnalyticsTable({
  questions,
  subjectsList,
}: QuestionAnalyticsTableProps) {
  const [search, setSearch] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState("all");
  const [selectedSignal, setSelectedSignal] = useState("all");
  const [sortBy, setSortBy] = useState<"hardest" | "easiest" | "attempted" | "skipped">("hardest");

  const filtered = questions.filter((q) => {
    if (search && !q.questionText.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (selectedSubject !== "all" && q.subjectId !== selectedSubject) {
      return false;
    }
    if (selectedDifficulty !== "all" && q.difficulty !== selectedDifficulty) {
      return false;
    }
    if (selectedSignal !== "all") {
      if (selectedSignal === "high_failure" && !q.qualitySignals.includes("High failure rate")) return false;
      if (selectedSignal === "high_skip" && !q.qualitySignals.includes("High skip rate")) return false;
      if (selectedSignal === "high_success" && !q.qualitySignals.includes("High success rate")) return false;
      if (selectedSignal === "low_sample" && !q.qualitySignals.includes("Low sample size")) return false;
      if (selectedSignal === "too_difficult" && !q.qualitySignals.includes("Potentially too difficult")) return false;
      if (selectedSignal === "too_easy" && !q.qualitySignals.includes("Potentially too easy")) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "hardest") return a.accuracy - b.accuracy;
    if (sortBy === "easiest") return b.accuracy - a.accuracy;
    if (sortBy === "attempted") return b.attemptsServed - a.attemptsServed;
    if (sortBy === "skipped") return b.unansweredCount - a.unansweredCount;
    return 0;
  });

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Header and Controls */}
      <div className="p-5 border-b border-border space-y-4 bg-surface-high">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-title-sm font-semibold text-text-primary">
              Question Item Analysis & Quality Signals
            </h3>
            <p className="text-[11px] font-mono text-text-muted mt-0.5">
              Identifies discriminating power, extreme difficulty outliers, and anomaly signals
            </p>
          </div>
          <span className="text-label-xs font-mono text-text-muted">
            Showing {sorted.length} of {questions.length} Questions
          </span>
        </div>

        {/* Filters and Search toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
          {/* Search input */}
          <div className="md:col-span-2 relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-text-muted">
              search
            </span>
            <input
              type="text"
              placeholder="Search question text..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-base pl-8 pr-3 py-1.5 text-label-xs font-mono text-text-primary placeholder:text-text-muted outline-none focus:border-primary"
            />
          </div>

          {/* Subject selector */}
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="rounded-lg border border-border bg-base px-2.5 py-1.5 text-label-xs font-mono text-text-primary outline-none focus:border-primary"
          >
            <option value="all">All Subjects</option>
            {subjectsList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Quality Signal selector */}
          <select
            value={selectedSignal}
            onChange={(e) => setSelectedSignal(e.target.value)}
            className="rounded-lg border border-border bg-base px-2.5 py-1.5 text-label-xs font-mono text-text-primary outline-none focus:border-primary"
          >
            <option value="all">All Quality Signals</option>
            <option value="high_failure">High Failure Rate (&lt;30%)</option>
            <option value="too_difficult">Potentially Too Difficult (&lt;20%)</option>
            <option value="high_skip">High Skip Rate (≥40%)</option>
            <option value="high_success">High Success Rate (≥90%)</option>
            <option value="too_easy">Potentially Too Easy (&gt;95%)</option>
            <option value="low_sample">Low Sample Size (&lt;5)</option>
          </select>

          {/* Sort selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="rounded-lg border border-border bg-base px-2.5 py-1.5 text-label-xs font-mono text-text-primary outline-none focus:border-primary"
          >
            <option value="hardest">Sort: Hardest First</option>
            <option value="easiest">Sort: Easiest First</option>
            <option value="attempted">Sort: Most Attempted</option>
            <option value="skipped">Sort: Most Skipped</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <thead className="border-b border-border bg-surface-high/60 text-label-xs font-mono uppercase text-text-muted">
            <tr>
              <th className="px-5 py-2.5 w-2/5">Question Text & Taxonomy</th>
              <th className="px-3 py-2.5 text-center">Marks</th>
              <th className="px-3 py-2.5 text-center">Served</th>
              <th className="px-3 py-2.5 text-center">Answered</th>
              <th className="px-3 py-2.5 text-center">Skipped</th>
              <th className="px-3 py-2.5 text-right">Avg Score</th>
              <th className="px-3 py-2.5 text-right">Accuracy</th>
              <th className="px-5 py-2.5 text-left">Quality Signals</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.length > 0 ? (
              sorted.map((q) => {
                let diffBadgeColor = "bg-surface-high text-text-muted border-border";
                if (q.difficultyLabel === "Very Difficult") {
                  diffBadgeColor = "bg-error/15 text-error border-error/30";
                } else if (q.difficultyLabel === "Difficult") {
                  diffBadgeColor = "bg-tertiary/15 text-tertiary border-tertiary/30";
                } else if (q.difficultyLabel === "Normal") {
                  diffBadgeColor = "bg-primary/10 text-primary-text border-primary/30";
                } else if (q.difficultyLabel === "Easy" || q.difficultyLabel === "Very Easy") {
                  diffBadgeColor = "bg-secondary/15 text-secondary border-secondary/30";
                }

                return (
                  <tr key={q.questionId} className="hover:bg-surface-high/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-text-primary text-body-sm line-clamp-2">
                        {q.questionText}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="rounded bg-surface-high px-1.5 py-0.5 text-[10px] font-mono text-text-secondary border border-border">
                          {q.subjectName}
                        </span>
                        <span className="rounded bg-surface-high px-1.5 py-0.5 text-[10px] font-mono text-text-muted border border-border">
                          {q.topicName}
                        </span>
                        <span className="rounded bg-surface-high px-1.5 py-0.5 text-[10px] font-mono uppercase text-text-muted border border-border">
                          Diff: {q.difficulty}
                        </span>
                      </div>
                    </td>

                    <td className="px-3 py-3 text-center font-mono text-label-xs text-text-primary">
                      {q.marks}
                    </td>

                    <td className="px-3 py-3 text-center font-mono text-label-xs text-text-secondary">
                      {q.attemptsServed}
                    </td>

                    <td className="px-3 py-3 text-center font-mono text-label-xs">
                      <span className="text-secondary font-semibold">{q.correctCount}</span>
                      <span className="text-text-muted"> / {q.answeredCount}</span>
                    </td>

                    <td className="px-3 py-3 text-center font-mono text-label-xs text-text-muted">
                      {q.unansweredCount}
                    </td>

                    <td className="px-3 py-3 text-right font-mono text-label-xs text-text-primary">
                      {q.avgMarksEarned.toFixed(2)}
                    </td>

                    <td className="px-3 py-3 text-right font-mono">
                      <div className="flex items-center justify-end gap-1.5">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border ${diffBadgeColor}`}
                        >
                          {q.difficultyLabel}
                        </span>
                        <span className="text-label-xs font-bold text-text-primary w-10 text-right">
                          {q.accuracy}%
                        </span>
                      </div>
                    </td>

                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {q.qualitySignals.length > 0 ? (
                          q.qualitySignals.map((sig, sIdx) => {
                            let sigColor = "bg-surface-high text-text-muted border-border";
                            if (sig.includes("failure") || sig.includes("difficult")) {
                              sigColor = "bg-error/10 text-error border-error/30";
                            } else if (sig.includes("skip")) {
                              sigColor = "bg-tertiary/10 text-tertiary border-tertiary/30";
                            } else if (sig.includes("success") || sig.includes("easy")) {
                              sigColor = "bg-secondary/10 text-secondary border-secondary/30";
                            } else if (sig.includes("sample")) {
                              sigColor = "bg-surface-high text-text-muted border-border";
                            }

                            return (
                              <span
                                key={sIdx}
                                className={`rounded px-1.5 py-0.5 text-[9px] font-mono border ${sigColor}`}
                              >
                                {sig}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-[10px] font-mono text-text-muted">
                            Nominal
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={8}
                  className="px-5 py-8 text-center text-label-xs font-mono text-text-muted"
                >
                  No questions match your current search and quality signal filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
