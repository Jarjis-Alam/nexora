"use client";

import Link from "next/link";
import { useState } from "react";
import { TrendAndDistribution } from "./trend-and-distribution";
import { QuestionAnalyticsTable } from "./question-analytics-table";
import type { AdminTestDetailData } from "@/server/admin-analytics";

interface TestDetailViewProps {
  data: AdminTestDetailData;
}

export function TestDetailAnalyticsView({ data: initialData }: TestDetailViewProps) {
  const [data, setData] = useState<AdminTestDetailData>(initialData);
  const [dateRange, setDateRange] = useState("all");
  const [loading, setLoading] = useState(false);

  const handleDateChange = async (range: string) => {
    setDateRange(range);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/analytics/tests/${data.test.id}?dateRange=${range}`
      );
      const json = await res.json();
      if (json.success && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error("Failed to refresh test analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  const { test, metrics, negativeMarking, sectionPerformance, poolPerformance, questionPerformance } = data;

  let statusBadgeColor = "bg-surface-high text-text-muted border-border";
  if (test.effectiveStatus === "active") {
    statusBadgeColor = "bg-secondary/10 text-secondary border-secondary/30";
  } else if (test.effectiveStatus === "scheduled") {
    statusBadgeColor = "bg-primary/10 text-primary-text border-primary/30";
  } else if (test.effectiveStatus === "closed") {
    statusBadgeColor = "bg-surface-high text-text-secondary border-border";
  }

  // Extract unique subjects for question filter
  const subjectsMap = new Map<string, string>();
  questionPerformance.forEach((q) => {
    subjectsMap.set(q.subjectId, q.subjectName);
  });
  const subjectsList = Array.from(subjectsMap.entries()).map(([id, name]) => ({ id, name }));

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* Top navigation back link */}
      <div>
        <Link
          href="/admin/analytics"
          className="inline-flex items-center gap-1 text-label-xs font-mono text-text-muted hover:text-text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          Back to Admin Analytics Dashboard
        </Link>
      </div>

      {/* Assessment Header Banner */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-label-xs font-mono uppercase tracking-wider text-primary-text">
                Assessment Telemetry
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
              <span
                className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${statusBadgeColor}`}
              >
                {test.effectiveStatus}
              </span>
              <span className="rounded bg-surface-high px-1.5 py-0.5 text-[10px] font-mono uppercase text-text-muted border border-border">
                Lifecycle: {test.status}
              </span>
            </div>
            <h1 className="mt-1 text-headline-md font-bold text-text-primary">
              {test.title}
            </h1>
            {test.description && (
              <p className="text-body-sm text-text-secondary mt-1 max-w-3xl">
                {test.description}
              </p>
            )}
          </div>

          {/* Quick Date Presets */}
          <div className="flex items-center gap-1">
            {["all", "7d", "30d", "90d"].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => handleDateChange(r)}
                className={`px-2.5 py-1 rounded text-label-xs font-mono transition-colors ${
                  dateRange === r
                    ? "bg-primary text-text-inverse font-semibold"
                    : "bg-surface-high border border-border text-text-secondary hover:text-text-primary"
                }`}
              >
                {r === "all" ? "All Time" : r}
              </button>
            ))}
          </div>
        </div>

        {/* Configuration Tags */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/80 text-[11px] font-mono text-text-muted">
          <span>Type: <strong className="text-text-primary uppercase">{test.type}</strong></span>
          <span>·</span>
          <span>Duration: <strong className="text-text-primary">{test.duration}m</strong></span>
          <span>·</span>
          <span>Total Marks: <strong className="text-text-primary">{test.totalMarks}</strong></span>
          <span>·</span>
          <span>
            Negative Marking:{" "}
            <strong className={negativeMarking.enabled ? "text-error" : "text-text-primary"}>
              {negativeMarking.enabled ? `Enabled (${test.negativeMarkRate}x)` : "Disabled"}
            </strong>
          </span>
          <span>·</span>
          <span>
            Questions Randomization:{" "}
            <strong className="text-text-primary">{test.randomizeQuestions ? "Active" : "Off"}</strong>
          </span>
          <span>·</span>
          <span>
            Attempt Limit:{" "}
            <strong className="text-text-primary">
              {test.attemptLimit ? `${test.attemptLimit} attempt(s)` : "Unlimited"}
            </strong>
          </span>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="rounded-xl border border-border bg-surface p-4">
          <span className="text-[11px] font-mono uppercase text-text-muted block">
            Participation
          </span>
          <div className="text-2xl font-bold font-mono text-text-primary mt-1">
            {metrics.submittedAttempts} <span className="text-sm font-normal text-text-muted">/ {metrics.totalAttempts}</span>
          </div>
          <span className="text-[11px] font-mono text-text-muted">
            {metrics.completionRate}% completion · {metrics.uniqueStudents} students
          </span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <span className="text-[11px] font-mono uppercase text-text-muted block">
            Average Score
          </span>
          <div className="text-2xl font-bold font-mono text-primary-text mt-1">
            {metrics.submittedAttempts > 0 ? `${metrics.avgScore}%` : "—"}
          </div>
          <span className="text-[11px] font-mono text-text-muted">
            Normalized across attempts
          </span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <span className="text-[11px] font-mono uppercase text-text-muted block">
            Average Accuracy
          </span>
          <div className="text-2xl font-bold font-mono text-secondary mt-1">
            {metrics.submittedAttempts > 0 ? `${metrics.avgAccuracy}%` : "—"}
          </div>
          <span className="text-[11px] font-mono text-text-muted">
            Item correctness rate
          </span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4">
          <span className="text-[11px] font-mono uppercase text-text-muted block">
            Average Duration
          </span>
          <div className="text-2xl font-bold font-mono text-text-secondary mt-1">
            {metrics.submittedAttempts > 0
              ? `${Math.round(metrics.avgTimeTakenSec / 60)}m ${metrics.avgTimeTakenSec % 60}s`
              : "—"}
          </div>
          <span className="text-[11px] font-mono text-text-muted">
            Allocated: {test.duration}m
          </span>
        </div>
      </div>

      {/* Negative Marking Policy Details (if enabled) */}
      {negativeMarking.enabled && (
        <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-border/80 pb-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-error text-[18px]">gavel</span>
              <h3 className="text-title-sm font-semibold text-text-primary">
                Negative Marking Deductions
              </h3>
            </div>
            <span className="rounded bg-error/10 border border-error/30 px-2 py-0.5 text-label-xs font-mono text-error font-semibold">
              Penalty Rate: {test.negativeMarkRate}x
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1 font-mono text-label-xs">
            <div>
              <span className="text-text-muted block text-[11px] uppercase">Wrong Answers Penalized</span>
              <span className="text-lg font-bold text-error mt-0.5 block">{negativeMarking.totalPenaltiesCount}</span>
            </div>
            <div>
              <span className="text-text-muted block text-[11px] uppercase">Total Marks Deducted</span>
              <span className="text-lg font-bold text-error mt-0.5 block">-{negativeMarking.totalPenaltyMarks.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-text-muted block text-[11px] uppercase">Avg Penalty / Attempt</span>
              <span className="text-lg font-bold text-text-primary mt-0.5 block">-{negativeMarking.avgPenaltyPerAttempt.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-text-muted block text-[11px] uppercase">Net Awarded Marks</span>
              <span className="text-lg font-bold text-primary-text mt-0.5 block">{negativeMarking.netMarks.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Score & Accuracy Distribution & Trend */}
      <TrendAndDistribution
        scoreDistribution={data.scoreDistribution}
        accuracyDistribution={data.accuracyDistribution}
        performanceTrend={data.performanceTrend}
        isLimitedHistory={data.isLimitedHistory}
        totalSubmitted={metrics.submittedAttempts}
      />

      {/* Section Breakdown (Phase 6C) */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="border-b border-border bg-surface-high px-5 py-3.5">
          <h3 className="text-title-sm font-semibold text-text-primary">
            Sectional Performance
          </h3>
          <p className="text-[11px] font-mono text-text-muted mt-0.5">
            Student mastery and scoring broken down by assessment section
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="border-b border-border bg-surface-high/60 text-label-xs font-mono uppercase text-text-muted">
              <tr>
                <th className="px-5 py-2.5">Section Title</th>
                <th className="px-3 py-2.5 text-center">Order</th>
                <th className="px-3 py-2.5 text-center">Questions</th>
                <th className="px-3 py-2.5 text-center">Served</th>
                <th className="px-3 py-2.5 text-center">Correct</th>
                <th className="px-3 py-2.5 text-center">Incorrect</th>
                <th className="px-3 py-2.5 text-center">Skipped</th>
                <th className="px-3 py-2.5 text-right">Avg Marks</th>
                <th className="px-5 py-2.5 text-right">Accuracy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-label-xs">
              {sectionPerformance.length > 0 ? (
                sectionPerformance.map((sec) => (
                  <tr key={sec.sectionId} className="hover:bg-surface-high/40 transition-colors">
                    <td className="px-5 py-3 font-sans font-medium text-text-primary text-body-sm">
                      {sec.sectionTitle}
                    </td>
                    <td className="px-3 py-3 text-center text-text-muted">
                      #{sec.sectionOrder}
                    </td>
                    <td className="px-3 py-3 text-center text-text-secondary">
                      {sec.questionCount}
                    </td>
                    <td className="px-3 py-3 text-center text-text-secondary">
                      {sec.questionsServed}
                    </td>
                    <td className="px-3 py-3 text-center text-secondary font-semibold">
                      {sec.correct}
                    </td>
                    <td className="px-3 py-3 text-center text-error">
                      {sec.incorrect}
                    </td>
                    <td className="px-3 py-3 text-center text-text-muted">
                      {sec.unanswered}
                    </td>
                    <td className="px-3 py-3 text-right text-text-primary">
                      {sec.avgMarks.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-text-primary">
                      {sec.accuracy}%
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-5 py-6 text-center text-text-muted">
                    No section performance records available for this assessment.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Question Pool Performance (Phase 7F) */}
      {poolPerformance.length > 0 && (
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="border-b border-border bg-surface-high px-5 py-3.5">
            <h3 className="text-title-sm font-semibold text-text-primary">
              Question Pool Performance
            </h3>
            <p className="text-[11px] font-mono text-text-muted mt-0.5">
              Randomization pool efficiency, question exposure, and accuracy metrics
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="border-b border-border bg-surface-high/60 text-label-xs font-mono uppercase text-text-muted">
                <tr>
                  <th className="px-5 py-2.5">Pool Title</th>
                  <th className="px-3 py-2.5">Section</th>
                  <th className="px-3 py-2.5 text-center">Selection Rule</th>
                  <th className="px-3 py-2.5 text-center">Candidate Qs</th>
                  <th className="px-3 py-2.5 text-center">Exposure</th>
                  <th className="px-3 py-2.5 text-center">Correct</th>
                  <th className="px-3 py-2.5 text-right">Avg Marks</th>
                  <th className="px-5 py-2.5 text-right">Accuracy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono text-label-xs">
                {poolPerformance.map((p) => (
                  <tr key={p.poolId} className="hover:bg-surface-high/40 transition-colors">
                    <td className="px-5 py-3 font-sans font-medium text-text-primary text-body-sm">
                      {p.title}
                    </td>
                    <td className="px-3 py-3 text-text-secondary text-[11px]">
                      {p.sectionTitle}
                    </td>
                    <td className="px-3 py-3 text-center text-text-muted">
                      Pick {p.selectionCount}
                    </td>
                    <td className="px-3 py-3 text-center text-text-secondary">
                      {p.candidateQuestionsCount}
                    </td>
                    <td className="px-3 py-3 text-center text-text-primary font-semibold">
                      {p.attemptsExposure} served
                    </td>
                    <td className="px-3 py-3 text-center text-secondary">
                      {p.correct}
                    </td>
                    <td className="px-3 py-3 text-right text-text-primary">
                      {p.avgMarks.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-text-primary">
                      {p.accuracy}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Question Item Analysis Table for this Test */}
      <div>
        <QuestionAnalyticsTable
          questions={questionPerformance}
          subjectsList={subjectsList}
        />
      </div>
    </div>
  );
}
