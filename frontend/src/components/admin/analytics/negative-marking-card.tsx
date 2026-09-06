"use client";

import type { AdminOverviewData } from "@/server/admin-analytics";

interface NegativeMarkingCardProps {
  summary: AdminOverviewData["negativeMarkingSummary"];
}

export function NegativeMarkingCard({ summary }: NegativeMarkingCardProps) {
  if (!summary.hasNegativeMarkingTests) {
    return (
      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-high border border-border text-text-muted">
            <span className="material-symbols-outlined text-[20px]">remove_circle_outline</span>
          </div>
          <div>
            <h4 className="text-body-sm font-semibold text-text-primary">
              Negative Marking Policy
            </h4>
            <p className="text-[12px] font-mono text-text-muted mt-0.5">
              No tests with active negative marking penalty detected in this filtered view.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between border-b border-border/80 pb-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-error/10 text-error border border-error/20">
            <span className="material-symbols-outlined text-[18px]">gavel</span>
          </div>
          <div>
            <h4 className="text-body-sm font-bold text-text-primary">
              Negative Marking Deductions
            </h4>
            <p className="text-[11px] font-mono text-text-muted">
              Aggregate penalty impact across assessments
            </p>
          </div>
        </div>
        <span className="rounded bg-error/10 border border-error/30 px-2 py-0.5 text-label-xs font-mono text-error font-semibold uppercase">
          Active Penalties
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <span className="text-[11px] font-mono text-text-muted uppercase block">
            Total Penalty Deductions
          </span>
          <span className="text-xl font-bold font-mono text-error mt-0.5 block">
            -{summary.totalPenaltyMarks.toFixed(2)}
          </span>
          <span className="text-[11px] font-mono text-text-muted">
            {summary.incorrectPenaltiesCount} wrong answers penalized
          </span>
        </div>

        <div>
          <span className="text-[11px] font-mono text-text-muted uppercase block">
            Avg Penalty / Attempt
          </span>
          <span className="text-xl font-bold font-mono text-text-primary mt-0.5 block">
            -{summary.avgPenaltyPerAttempt.toFixed(2)}
          </span>
          <span className="text-[11px] font-mono text-text-muted">
            Deducted per submission
          </span>
        </div>

        <div>
          <span className="text-[11px] font-mono text-text-muted uppercase block">
            Gross Correct Marks
          </span>
          <span className="text-xl font-bold font-mono text-secondary mt-0.5 block">
            +{summary.totalCorrectMarks.toFixed(2)}
          </span>
          <span className="text-[11px] font-mono text-text-muted">
            Awarded for correct answers
          </span>
        </div>

        <div>
          <span className="text-[11px] font-mono text-text-muted uppercase block">
            Net Awarded Marks
          </span>
          <span className="text-xl font-bold font-mono text-primary-text mt-0.5 block">
            {summary.netMarks.toFixed(2)}
          </span>
          <span className="text-[11px] font-mono text-text-muted">
            Net aggregate score pool
          </span>
        </div>
      </div>
    </div>
  );
}
