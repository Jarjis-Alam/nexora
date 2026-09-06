"use client";

import { useEffect, useState } from "react";
import type { AdminTestComparisonResult } from "@/server/admin-analytics";

interface TestComparisonModalProps {
  testIdA: string;
  testIdB: string;
  onClose: () => void;
}

export function TestComparisonModal({
  testIdA,
  testIdB,
  onClose,
}: TestComparisonModalProps) {
  const [data, setData] = useState<AdminTestComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchComparison() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(
          `/api/admin/analytics?view=compare&testIdA=${testIdA}&testIdB=${testIdB}`
        );
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || "Failed to compare tests");
        }
        setData(json.data);
      } catch (err: any) {
        setError(err.message || "Failed to load test comparison");
      } finally {
        setLoading(false);
      }
    }

    if (testIdA && testIdB) {
      fetchComparison();
    }
  }, [testIdA, testIdB]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-fade-in">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-surface p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h3 className="text-title-md font-bold text-text-primary">
              Assessment Side-by-Side Comparison
            </h3>
            <p className="text-[12px] font-mono text-text-muted mt-0.5">
              Differential analysis of student engagement and scoring outcomes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-muted hover:text-text-primary hover:bg-surface-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mb-3" />
            <span className="text-body-sm font-mono text-text-muted">
              Computing assessment differentials...
            </span>
          </div>
        ) : error || !data ? (
          <div className="rounded-lg border border-error/30 bg-error/10 p-4 text-center">
            <p className="text-body-sm font-mono text-error">
              {error || "Unable to display comparison"}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Title headers */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border bg-surface-high p-4">
                <span className="text-[10px] font-mono uppercase text-primary font-bold block mb-1">
                  Assessment A
                </span>
                <h4 className="text-title-sm font-bold text-text-primary truncate">
                  {data.testA.title}
                </h4>
                <div className="text-[11px] font-mono text-text-muted mt-1 uppercase">
                  Status: {data.testA.effectiveStatus}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-surface-high p-4">
                <span className="text-[10px] font-mono uppercase text-secondary font-bold block mb-1">
                  Assessment B
                </span>
                <h4 className="text-title-sm font-bold text-text-primary truncate">
                  {data.testB.title}
                </h4>
                <div className="text-[11px] font-mono text-text-muted mt-1 uppercase">
                  Status: {data.testB.effectiveStatus}
                </div>
              </div>
            </div>

            {/* Metrics comparison table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-left font-mono text-body-sm">
                <thead className="bg-surface-high text-label-xs uppercase text-text-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-2.5">Metric</th>
                    <th className="px-4 py-2.5 text-center text-primary">Test A</th>
                    <th className="px-4 py-2.5 text-center text-secondary">Test B</th>
                    <th className="px-4 py-2.5 text-right">Differential</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-label-xs">
                  {/* Total Attempts */}
                  <tr className="hover:bg-surface-high/30">
                    <td className="px-4 py-3 font-sans font-medium text-text-primary">
                      Total Attempts
                    </td>
                    <td className="px-4 py-3 text-center text-text-primary">
                      {data.testA.totalAttempts}
                    </td>
                    <td className="px-4 py-3 text-center text-text-primary">
                      {data.testB.totalAttempts}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {data.testA.totalAttempts - data.testB.totalAttempts > 0
                        ? `+${data.testA.totalAttempts - data.testB.totalAttempts}`
                        : `${data.testA.totalAttempts - data.testB.totalAttempts}`}
                    </td>
                  </tr>

                  {/* Submitted Attempts */}
                  <tr className="hover:bg-surface-high/30">
                    <td className="px-4 py-3 font-sans font-medium text-text-primary">
                      Submitted Submissions
                    </td>
                    <td className="px-4 py-3 text-center text-text-primary">
                      {data.testA.submittedAttempts}
                    </td>
                    <td className="px-4 py-3 text-center text-text-primary">
                      {data.testB.submittedAttempts}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {data.testA.submittedAttempts - data.testB.submittedAttempts > 0
                        ? `+${data.testA.submittedAttempts - data.testB.submittedAttempts}`
                        : `${data.testA.submittedAttempts - data.testB.submittedAttempts}`}
                    </td>
                  </tr>

                  {/* Completion Rate */}
                  <tr className="hover:bg-surface-high/30">
                    <td className="px-4 py-3 font-sans font-medium text-text-primary">
                      Completion Rate
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-text-primary">
                      {data.testA.completionRate}%
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-text-primary">
                      {data.testB.completionRate}%
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {data.testA.completionRate - data.testB.completionRate > 0
                        ? `+${data.testA.completionRate - data.testB.completionRate}%`
                        : `${data.testA.completionRate - data.testB.completionRate}%`}
                    </td>
                  </tr>

                  {/* Unique Students */}
                  <tr className="hover:bg-surface-high/30">
                    <td className="px-4 py-3 font-sans font-medium text-text-primary">
                      Unique Students
                    </td>
                    <td className="px-4 py-3 text-center text-text-primary">
                      {data.testA.uniqueStudents}
                    </td>
                    <td className="px-4 py-3 text-center text-text-primary">
                      {data.testB.uniqueStudents}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {data.testA.uniqueStudents - data.testB.uniqueStudents > 0
                        ? `+${data.testA.uniqueStudents - data.testB.uniqueStudents}`
                        : `${data.testA.uniqueStudents - data.testB.uniqueStudents}`}
                    </td>
                  </tr>

                  {/* Average Score */}
                  <tr className="hover:bg-surface-high/30">
                    <td className="px-4 py-3 font-sans font-medium text-text-primary">
                      Average Score
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-primary-text">
                      {data.testA.submittedAttempts > 0 ? `${data.testA.avgScore}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-secondary">
                      {data.testB.submittedAttempts > 0 ? `${data.testB.avgScore}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {data.testA.avgScore - data.testB.avgScore > 0
                        ? `+${data.testA.avgScore - data.testB.avgScore}%`
                        : `${data.testA.avgScore - data.testB.avgScore}%`}
                    </td>
                  </tr>

                  {/* Average Accuracy */}
                  <tr className="hover:bg-surface-high/30">
                    <td className="px-4 py-3 font-sans font-medium text-text-primary">
                      Average Accuracy
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-primary-text">
                      {data.testA.submittedAttempts > 0 ? `${data.testA.avgAccuracy}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-secondary">
                      {data.testB.submittedAttempts > 0 ? `${data.testB.avgAccuracy}%` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {data.testA.avgAccuracy - data.testB.avgAccuracy > 0
                        ? `+${data.testA.avgAccuracy - data.testB.avgAccuracy}%`
                        : `${data.testA.avgAccuracy - data.testB.avgAccuracy}%`}
                    </td>
                  </tr>

                  {/* Average Duration */}
                  <tr className="hover:bg-surface-high/30">
                    <td className="px-4 py-3 font-sans font-medium text-text-primary">
                      Average Duration
                    </td>
                    <td className="px-4 py-3 text-center text-text-secondary">
                      {data.testA.submittedAttempts > 0
                        ? `${Math.round(data.testA.avgTimeTakenSec / 60)}m`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center text-text-secondary">
                      {data.testB.submittedAttempts > 0
                        ? `${Math.round(data.testB.avgTimeTakenSec / 60)}m`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {Math.round((data.testA.avgTimeTakenSec - data.testB.avgTimeTakenSec) / 60)}m
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-surface-high border border-border px-4 py-1.5 text-label-xs font-mono text-text-primary hover:bg-surface-highest transition-colors"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
}
