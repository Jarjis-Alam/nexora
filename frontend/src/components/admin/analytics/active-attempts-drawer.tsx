"use client";

import type { AdminActiveAttemptItem } from "@/server/admin-analytics";

interface ActiveAttemptsDrawerProps {
  attempts: AdminActiveAttemptItem[];
  onRefresh?: () => void;
}

export function ActiveAttemptsDrawer({
  attempts,
  onRefresh,
}: ActiveAttemptsDrawerProps) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-surface-high px-5 py-3.5">
        <div className="flex items-center gap-2">
          <div className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
          </div>
          <div>
            <h3 className="text-title-sm font-semibold text-text-primary">
              Active In-Flight Attempts
            </h3>
            <p className="text-[11px] font-mono text-text-muted">
              Live operational visibility of currently active student test sessions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded bg-primary/10 border border-primary/30 px-2 py-0.5 text-label-xs font-mono text-primary-text font-semibold">
            {attempts.length} Active
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="flex items-center gap-1 rounded border border-border bg-surface px-2 py-1 text-label-xs font-mono text-text-secondary hover:text-text-primary hover:bg-surface-highest transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">sync</span>
              Sync
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-body-sm">
          <thead className="border-b border-border bg-surface-high/60 text-label-xs font-mono uppercase text-text-muted">
            <tr>
              <th className="px-5 py-2.5">Student</th>
              <th className="px-3 py-2.5">Assessment</th>
              <th className="px-3 py-2.5">Started</th>
              <th className="px-3 py-2.5 text-center">Progress</th>
              <th className="px-5 py-2.5 text-right">Remaining</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {attempts.length > 0 ? (
              attempts.map((att) => {
                const startedDate = new Date(att.startedAt);
                const startedLabel = startedDate.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const remMinutes = att.timeRemainingSec !== null
                  ? Math.floor(att.timeRemainingSec / 60)
                  : null;
                const remSeconds = att.timeRemainingSec !== null
                  ? att.timeRemainingSec % 60
                  : null;

                return (
                  <tr key={att.attemptId} className="hover:bg-surface-high/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-text-primary text-body-sm">
                        {att.studentName}
                      </div>
                      <div className="text-[11px] font-mono text-text-muted">
                        {att.studentEmail}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-medium text-text-primary text-body-sm">
                      {att.testTitle}
                    </td>
                    <td className="px-3 py-3 text-label-xs font-mono text-text-secondary">
                      {startedLabel}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="rounded bg-surface-high border border-border px-2 py-0.5 text-label-xs font-mono text-text-primary">
                        Question #{att.currentQuestion}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-label-xs">
                      {att.timeRemainingSec !== null ? (
                        <span
                          className={`font-semibold ${
                            att.timeRemainingSec < 300
                              ? "text-error"
                              : att.timeRemainingSec < 600
                              ? "text-tertiary"
                              : "text-secondary"
                          }`}
                        >
                          {remMinutes}m {remSeconds}s
                        </span>
                      ) : (
                        <span className="text-text-muted">Untimed</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-8 text-center text-label-xs font-mono text-text-muted"
                >
                  No active student attempts currently in-flight.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
