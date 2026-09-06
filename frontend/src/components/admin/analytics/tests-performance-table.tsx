"use client";

import Link from "next/link";
import { useState } from "react";
import type { AdminTestPerformanceItem } from "@/server/admin-analytics";

interface TestsPerformanceTableProps {
  tests: AdminTestPerformanceItem[];
  onSelectForCompare?: (testId: string) => void;
  selectedForCompare?: string[];
}

export function TestsPerformanceTable({
  tests,
  onSelectForCompare,
  selectedForCompare = [],
}: TestsPerformanceTableProps) {
  const [sortKey, setSortKey] = useState<keyof AdminTestPerformanceItem>("submittedAttempts");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const handleSort = (key: keyof AdminTestPerformanceItem) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  };

  const sortedTests = [...tests].sort((a, b) => {
    const valA = a[sortKey] ?? 0;
    const valB = b[sortKey] ?? 0;
    const order = sortOrder === "asc" ? 1 : -1;
    if (typeof valA === "string" && typeof valB === "string") {
      return valA.localeCompare(valB) * order;
    }
    return ((valA as number) - (valB as number)) * order;
  });

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border bg-surface-high px-5 py-3.5">
        <div>
          <h3 className="text-title-sm font-semibold text-text-primary">
            Assessment Performance Directory
          </h3>
          <p className="text-[11px] font-mono text-text-muted mt-0.5">
            Comparative performance across all assessments
          </p>
        </div>

        <div className="text-label-xs font-mono text-text-muted">
          {tests.length} Total Assessments
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <thead className="border-b border-border bg-surface-high/60 text-label-xs font-mono uppercase text-text-muted">
            <tr>
              <th className="px-5 py-2.5">Assessment</th>
              <th className="px-3 py-2.5 text-center">Status</th>
              <th
                onClick={() => handleSort("totalAttempts")}
                className="px-3 py-2.5 text-center cursor-pointer hover:text-text-primary transition-colors"
              >
                Attempts {sortKey === "totalAttempts" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
              </th>
              <th
                onClick={() => handleSort("completionRate")}
                className="px-3 py-2.5 text-center cursor-pointer hover:text-text-primary transition-colors"
              >
                Completion {sortKey === "completionRate" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
              </th>
              <th
                onClick={() => handleSort("avgScore")}
                className="px-3 py-2.5 text-right cursor-pointer hover:text-text-primary transition-colors"
              >
                Avg Score {sortKey === "avgScore" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
              </th>
              <th
                onClick={() => handleSort("avgAccuracy")}
                className="px-3 py-2.5 text-right cursor-pointer hover:text-text-primary transition-colors"
              >
                Avg Accuracy {sortKey === "avgAccuracy" ? (sortOrder === "asc" ? "↑" : "↓") : ""}
              </th>
              <th className="px-3 py-2.5 text-center">Avg Time</th>
              <th className="px-5 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedTests.length > 0 ? (
              sortedTests.map((t) => {
                const isSelected = selectedForCompare.includes(t.id);
                const avgMin = Math.round(t.avgTimeTakenSec / 60);

                let statusBadgeColor = "bg-surface-high text-text-muted border-border";
                if (t.effectiveStatus === "active") {
                  statusBadgeColor = "bg-secondary/10 text-secondary border-secondary/30";
                } else if (t.effectiveStatus === "scheduled") {
                  statusBadgeColor = "bg-primary/10 text-primary-text border-primary/30";
                } else if (t.effectiveStatus === "closed") {
                  statusBadgeColor = "bg-surface-high text-text-secondary border-border";
                }

                return (
                  <tr key={t.id} className="hover:bg-surface-high/40 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/admin/analytics/tests/${t.id}`}
                        className="font-medium text-text-primary hover:text-primary transition-colors"
                      >
                        {t.title}
                      </Link>
                      <div className="text-[11px] font-mono text-text-muted mt-0.5">
                        {t.type} · {t.duration}m · {t.uniqueStudents} unique students
                      </div>
                    </td>

                    <td className="px-3 py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${statusBadgeColor}`}
                      >
                        {t.effectiveStatus}
                      </span>
                    </td>

                    <td className="px-3 py-3 text-center font-mono text-label-xs">
                      <span className="text-text-primary font-bold">{t.submittedAttempts}</span>
                      <span className="text-text-muted"> / {t.totalAttempts}</span>
                    </td>

                    <td className="px-3 py-3 text-center font-mono text-label-xs">
                      <span
                        className={`font-semibold ${
                          t.completionRate >= 70
                            ? "text-secondary"
                            : t.completionRate >= 40
                            ? "text-primary-text"
                            : "text-text-muted"
                        }`}
                      >
                        {t.completionRate}%
                      </span>
                    </td>

                    <td className="px-3 py-3 text-right font-mono text-label-xs text-text-primary font-bold">
                      {t.submittedAttempts > 0 ? `${t.avgScore}%` : "—"}
                    </td>

                    <td className="px-3 py-3 text-right font-mono text-label-xs text-secondary font-bold">
                      {t.submittedAttempts > 0 ? `${t.avgAccuracy}%` : "—"}
                    </td>

                    <td className="px-3 py-3 text-center font-mono text-label-xs text-text-secondary">
                      {t.submittedAttempts > 0 ? `${avgMin}m` : "—"}
                    </td>

                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {onSelectForCompare && (
                          <button
                            type="button"
                            onClick={() => onSelectForCompare(t.id)}
                            className={`rounded px-2 py-1 text-label-xs font-mono transition-colors border ${
                              isSelected
                                ? "bg-primary text-text-inverse border-primary font-semibold"
                                : "bg-surface-high text-text-secondary border-border hover:text-text-primary hover:bg-surface-highest"
                            }`}
                          >
                            {isSelected ? "Selected" : "Compare"}
                          </button>
                        )}

                        <Link
                          href={`/admin/analytics/tests/${t.id}`}
                          className="flex items-center gap-1 rounded border border-border bg-surface-high px-2.5 py-1 text-label-xs font-mono text-primary-text hover:bg-surface-highest transition-colors"
                        >
                          Deep Dive
                          <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                        </Link>
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
                  No assessment performance records match the active criteria.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
