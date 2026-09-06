"use client";

import type { AdminOverviewData } from "@/server/admin-analytics";

interface OverviewMetricsProps {
  metrics: AdminOverviewData["metrics"];
}

export function OverviewMetrics({ metrics }: OverviewMetricsProps) {
  const cards = [
    {
      label: "Total Tests",
      value: metrics.totalTests,
      icon: "quiz",
      color: "text-text-primary",
      subtext: "Managed assessments",
    },
    {
      label: "Total Attempts",
      value: metrics.totalAttempts,
      icon: "assignment",
      color: "text-text-primary",
      subtext: `${metrics.uniqueStudents} unique students`,
    },
    {
      label: "Submitted Attempts",
      value: metrics.submittedAttempts,
      icon: "check_circle",
      color: "text-secondary",
      subtext: `${metrics.completionRate}% completion rate`,
    },
    {
      label: "Active In-Flight",
      value: metrics.activeAttempts,
      icon: "pending",
      color: metrics.activeAttempts > 0 ? "text-primary" : "text-text-muted",
      subtext: `${metrics.expiredAttempts} expired`,
    },
    {
      label: "Average Score",
      value: metrics.submittedAttempts > 0 ? `${metrics.avgScore}%` : "—",
      icon: "analytics",
      color: "text-primary-text",
      subtext: "Normalized score",
    },
    {
      label: "Average Accuracy",
      value: metrics.submittedAttempts > 0 ? `${metrics.avgAccuracy}%` : "—",
      icon: "target",
      color: "text-secondary",
      subtext: "Answer correctness",
    },
    {
      label: "Questions Answered",
      value: metrics.questionsAnswered,
      icon: "fact_check",
      color: "text-text-primary",
      subtext: "Student submissions",
    },
    {
      label: "Avg Time Used",
      value:
        metrics.submittedAttempts > 0
          ? `${Math.round(metrics.avgTimeUsedSec / 60)}m ${metrics.avgTimeUsedSec % 60}s`
          : "—",
      icon: "timer",
      color: "text-text-secondary",
      subtext: "Per submitted attempt",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-border bg-surface p-4 flex flex-col justify-between hover:border-border/80 transition-colors shadow-xs"
        >
          <div className="flex items-center justify-between text-text-muted mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">
              {card.label}
            </span>
            <span className="material-symbols-outlined text-[18px]">
              {card.icon}
            </span>
          </div>
          <div>
            <div className={`text-2xl font-bold font-mono tracking-tight ${card.color}`}>
              {card.value}
            </div>
            <div className="text-[11px] text-text-muted font-mono mt-1">
              {card.subtext}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
