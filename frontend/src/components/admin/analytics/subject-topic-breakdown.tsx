"use client";

import { useState } from "react";
import type { AdminOverviewData } from "@/server/admin-analytics";

interface SubjectTopicBreakdownProps {
  subjectPerformance: AdminOverviewData["subjectPerformance"];
  topicPerformance: AdminOverviewData["topicPerformance"];
  difficultyPerformance: AdminOverviewData["difficultyPerformance"];
}

export function SubjectTopicBreakdown({
  subjectPerformance,
  topicPerformance,
  difficultyPerformance,
}: SubjectTopicBreakdownProps) {
  const [topicSort, setTopicSort] = useState<"weakest" | "strongest" | "volume">("weakest");

  const sortedTopics = [...topicPerformance].sort((a, b) => {
    if (topicSort === "weakest") {
      return a.accuracy - b.accuracy;
    }
    if (topicSort === "strongest") {
      return b.accuracy - a.accuracy;
    }
    return b.questionsAttempted - a.questionsAttempted;
  });

  return (
    <div className="space-y-6">
      {/* Subject Performance & Difficulty Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Subject Performance Table (Span 8) */}
        <div className="lg:col-span-8 rounded-xl border border-border bg-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-surface-high px-5 py-3.5">
            <div>
              <h3 className="text-title-sm font-semibold text-text-primary">
                Subject Performance
              </h3>
              <p className="text-[11px] font-mono text-text-muted mt-0.5">
                Taxonomy breakdown across all submitted question attempts
              </p>
            </div>
            <span className="text-label-xs font-mono text-text-muted">
              {subjectPerformance.length} Subjects
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="border-b border-border bg-surface-high/60 text-label-xs font-mono uppercase text-text-muted">
                <tr>
                  <th className="px-5 py-2.5">Subject</th>
                  <th className="px-3 py-2.5 text-center">Served</th>
                  <th className="px-3 py-2.5 text-center">Correct</th>
                  <th className="px-3 py-2.5 text-center">Incorrect</th>
                  <th className="px-3 py-2.5 text-center">Unanswered</th>
                  <th className="px-3 py-2.5 text-right">Avg Marks</th>
                  <th className="px-5 py-2.5 text-right">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subjectPerformance.length > 0 ? (
                  subjectPerformance.map((s) => (
                    <tr key={s.subjectId} className="hover:bg-surface-high/40 transition-colors">
                      <td className="px-5 py-3 font-medium text-text-primary">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{s.subjectName}</span>
                          <span className="rounded bg-surface-high px-1.5 py-0.5 text-[10px] font-mono text-text-muted border border-border">
                            {s.subjectCode}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-label-xs text-text-secondary">
                        {s.questionsServed}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-label-xs text-secondary font-semibold">
                        {s.correct}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-label-xs text-error">
                        {s.incorrect}
                      </td>
                      <td className="px-3 py-3 text-center font-mono text-label-xs text-text-muted">
                        {s.unanswered}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-label-xs text-text-primary">
                        {s.avgMarks.toFixed(2)}
                      </td>
                      <td className="px-5 py-3 text-right font-mono">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-surface-high rounded-full overflow-hidden hidden sm:block">
                            <div
                              className="h-full bg-secondary"
                              style={{ width: `${s.accuracy}%` }}
                            />
                          </div>
                          <span className="text-label-xs font-bold text-text-primary">
                            {s.accuracy}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-8 text-center text-label-xs font-mono text-text-muted"
                    >
                      No subject question data available for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Difficulty Breakdown (Span 4) */}
        <div className="lg:col-span-4 rounded-xl border border-border bg-surface p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-title-sm font-semibold text-text-primary">
              Difficulty Performance
            </h3>
            <p className="text-[11px] font-mono text-text-muted mt-0.5 mb-4">
              Cohorts based on question bank difficulty ratings
            </p>

            <div className="space-y-4">
              {difficultyPerformance.map((diff) => (
                <div
                  key={diff.difficulty}
                  className="rounded-lg border border-border bg-surface-high/50 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between text-label-xs font-mono">
                    <span className="capitalize font-bold text-text-primary flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          diff.difficulty === "easy"
                            ? "bg-secondary"
                            : diff.difficulty === "medium"
                            ? "bg-primary"
                            : "bg-tertiary"
                        }`}
                      />
                      {diff.difficulty}
                    </span>
                    <span className="font-bold text-text-primary">
                      {diff.accuracy}% accuracy
                    </span>
                  </div>

                  <div className="h-1.5 w-full bg-base rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        diff.difficulty === "easy"
                          ? "bg-secondary"
                          : diff.difficulty === "medium"
                          ? "bg-primary"
                          : "bg-tertiary"
                      }`}
                      style={{ width: `${diff.accuracy}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-[11px] font-mono text-text-muted pt-1">
                    <span>{diff.questionsServed} served</span>
                    <span>{diff.correct} correct · {diff.incorrect} wrong</span>
                    <span>Avg {diff.avgMarks.toFixed(2)} pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border text-[11px] font-mono text-text-muted">
            Question difficulty levels are stored with each item in the question repository.
          </div>
        </div>
      </div>

      {/* Topic Performance Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border bg-surface-high px-5 py-3.5">
          <div>
            <h3 className="text-title-sm font-semibold text-text-primary">
              Topic Level Performance
            </h3>
            <p className="text-[11px] font-mono text-text-muted mt-0.5">
              Identifies specific syllabus strengths and vulnerabilities
            </p>
          </div>

          {/* Sort Controls */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-text-muted uppercase mr-1">
              Sort:
            </span>
            {(
              [
                { label: "Weakest First", value: "weakest" },
                { label: "Strongest First", value: "strongest" },
                { label: "Most Attempted", value: "volume" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTopicSort(opt.value)}
                className={`px-2.5 py-1 rounded text-label-xs font-mono transition-colors ${
                  topicSort === opt.value
                    ? "bg-primary text-text-inverse font-semibold"
                    : "bg-surface border border-border text-text-secondary hover:text-text-primary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-body-sm">
            <thead className="border-b border-border bg-surface-high/60 text-label-xs font-mono uppercase text-text-muted sticky top-0 z-10 backdrop-blur-xs">
              <tr>
                <th className="px-5 py-2.5">Topic</th>
                <th className="px-3 py-2.5">Subject</th>
                <th className="px-3 py-2.5 text-center">Attempted</th>
                <th className="px-3 py-2.5 text-center">Correct</th>
                <th className="px-3 py-2.5 text-center">Incorrect</th>
                <th className="px-5 py-2.5 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sortedTopics.length > 0 ? (
                sortedTopics.map((t) => (
                  <tr key={t.topicId} className="hover:bg-surface-high/40 transition-colors">
                    <td className="px-5 py-3 font-medium text-text-primary">
                      <div className="flex items-center gap-2">
                        <span>{t.topicName}</span>
                        {t.questionsAttempted < 5 && (
                          <span
                            title="Low sample size: fewer than 5 attempts"
                            className="rounded bg-surface-high px-1.5 py-0.5 text-[9px] font-mono text-text-muted border border-border"
                          >
                            Low N
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-text-secondary text-label-xs font-mono">
                      {t.subjectName}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-label-xs text-text-primary">
                      {t.questionsAttempted}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-label-xs text-secondary font-semibold">
                      {t.correct}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-label-xs text-error">
                      {t.incorrect}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      <span
                        className={`text-label-xs font-bold ${
                          t.accuracy >= 70
                            ? "text-secondary"
                            : t.accuracy >= 40
                            ? "text-primary-text"
                            : "text-error"
                        }`}
                      >
                        {t.accuracy}%
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-8 text-center text-label-xs font-mono text-text-muted"
                  >
                    No topic performance data available for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
