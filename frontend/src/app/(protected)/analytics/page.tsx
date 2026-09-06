import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAnalyticsData } from "@/server/analytics";
import { getStudentIntelligence } from "@/server/student-intelligence";
import { db } from "@/db";
import { tests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const userId = session.user.id;
  const [analytics, intelligence] = await Promise.all([
    getAnalyticsData(userId),
    getStudentIntelligence(userId),
  ]);

  // Baseline test id for empty state CTA
  const baselineList = await db
    .select({ id: tests.id })
    .from(tests)
    .where(eq(tests.type, "baseline"))
    .limit(1);
  const baselineId = baselineList[0]?.id;

  // Empty State
  if (!analytics.hasData || !intelligence.dataSufficiency.hasCompletedBaseline) {
    return (
      <div className="py-16 text-center max-w-xl mx-auto space-y-6">
        <div className="w-16 h-16 rounded-full bg-surface-high border border-border flex items-center justify-center text-primary-text mx-auto">
          <span className="material-symbols-outlined text-[32px]">insights</span>
        </div>

        <div>
          <h2 className="text-headline-lg font-bold text-text-primary">
            Your intelligence analytics will appear here.
          </h2>
          <p className="text-body-md text-text-secondary mt-2 leading-relaxed">
            Complete your baseline assessment to unlock personalized recommendations, readiness driver attribution, and trend detection.
          </p>
        </div>

        <div className="pt-4">
          <Link
            href={baselineId ? `/tests/${baselineId}` : "/tests"}
            className="bg-primary text-text-inverse font-semibold text-body-sm px-8 py-3 rounded hover:bg-primary-text transition-colors inline-flex items-center gap-2 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            Start Baseline Assessment
          </Link>
        </div>
      </div>
    );
  }

  const { trend, readiness, recommendations, discipline } = intelligence;

  return (
    <div className="space-y-8 pb-28 pr-28 lg:pr-0">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono font-medium text-text-muted uppercase tracking-wider">
              Student Intelligence & Performance
            </span>
            {intelligence.dataSufficiency.status === "limited_data" && (
              <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary-text font-mono text-[10px] font-semibold">
                EARLY SIGNAL
              </span>
            )}
          </div>
          <h1 className="text-headline-xl font-bold text-text-primary">
            Performance & Placement Intelligence
          </h1>
          <p className="text-body-md text-text-secondary mt-1">
            Deterministic drivers, personalized next actions, and domain benchmarks.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="analytics-range" className="sr-only">Analytics time range</label>
          <select
            id="analytics-range"
            className="h-10 rounded-lg border border-border bg-surface px-3 text-label-xs font-mono text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/30"
          >
            <option>All Time</option>
            <option>Last 30 Days</option>
            <option>Last 7 Days</option>
          </select>
        </div>
      </div>

      {/* 5 Overview Metric Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
        {/* Avg Score */}
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div className="flex justify-between items-start mb-2">
            <span className="text-label-xs text-text-muted font-mono uppercase">
              Avg Score
            </span>
            <span className="material-symbols-outlined text-primary-text text-[18px]">
              analytics
            </span>
          </div>
          <span className="text-3xl font-bold font-mono text-text-primary">
            {analytics.overview.avgScore}%
          </span>
        </div>

        {/* Avg Accuracy */}
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div className="flex justify-between items-start mb-2">
            <span className="text-label-xs text-text-muted font-mono uppercase">
              Avg Accuracy
            </span>
            <span className="material-symbols-outlined text-secondary text-[18px]">
              track_changes
            </span>
          </div>
          <span className="text-3xl font-bold font-mono text-text-primary">
            {analytics.overview.avgAccuracy}%
          </span>
        </div>

        {/* Tests Completed */}
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div className="flex justify-between items-start mb-2">
            <span className="text-label-xs text-text-muted font-mono uppercase">
              Tests Completed
            </span>
            <span className="material-symbols-outlined text-text-muted text-[18px]">
              task
            </span>
          </div>
          <span className="text-3xl font-bold font-mono text-text-primary">
            {analytics.overview.testsCompleted}
          </span>
        </div>

        {/* Questions Attempted */}
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <div className="flex justify-between items-start mb-2">
            <span className="text-label-xs text-text-muted font-mono uppercase">
              Attempted
            </span>
            <span className="material-symbols-outlined text-text-muted text-[18px]">
              format_list_numbered
            </span>
          </div>
          <span className="text-3xl font-bold font-mono text-text-primary">
            {analytics.overview.questionsAttempted}
          </span>
        </div>

        {/* Questions Correct */}
        <div className="col-span-2 rounded-lg border border-border bg-surface p-4 sm:col-span-1 sm:p-5">
          <div className="flex justify-between items-start mb-2">
            <span className="text-label-xs text-text-muted font-mono uppercase">
              Correct
            </span>
            <span className="material-symbols-outlined text-secondary text-[18px]">
              check_circle
            </span>
          </div>
          <span className="text-3xl font-bold font-mono text-secondary">
            {analytics.overview.questionsCorrect}
          </span>
        </div>
      </div>

      {/* PHASE 10 INTELLIGENCE SECTION: Drivers, Trajectory & Recommended Actions */}
      <section className="space-y-6">
        {/* Trajectory & Drivers Header Card */}
        <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/70 mb-5">
            <div>
              <h2 className="text-title-md font-semibold text-text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">psychology</span>
                Readiness Driver & Trend Analysis
              </h2>
              <p className="text-label-xs text-text-muted mt-0.5">
                Deterministic attribution of what is boosting vs holding back your placement readiness
              </p>
            </div>

            {/* Trend Trajectory Badge */}
            <div className="flex items-center gap-2 bg-surface-high px-3 py-1.5 rounded-lg border border-border self-start sm:self-auto font-mono text-label-xs">
              <span className="text-text-muted uppercase">Overall Trend:</span>
              <span
                className={`font-bold flex items-center gap-1 ${
                  trend.overall === "improving"
                    ? "text-secondary"
                    : trend.overall === "declining"
                    ? "text-error"
                    : "text-text-primary"
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {trend.overall === "improving"
                    ? "trending_up"
                    : trend.overall === "declining"
                    ? "trending_down"
                    : "trending_flat"}
                </span>
                {trend.overall === "improving"
                  ? "IMPROVING"
                  : trend.overall === "declining"
                  ? "DECLINING"
                  : trend.overall === "stable"
                  ? "STABLE"
                  : "CALIBRATING"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Positive Contributors */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-label-xs font-mono font-semibold text-secondary uppercase">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  Helping Your Readiness
                </span>
                <span className="text-[10px] text-text-muted">High Benchmark Impact</span>
              </div>

              {readiness.positiveContributors.length > 0 ? (
                <div className="space-y-2">
                  {readiness.positiveContributors.slice(0, 3).map((c) => (
                    <div
                      key={c.code}
                      className="p-3 rounded-lg bg-surface-high border border-border/80 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-body-sm font-medium text-text-primary">
                          {c.name}
                        </div>
                        <div className="text-[11px] font-mono text-text-muted mt-0.5">
                          {c.status} • Weight: {(c.weight * 100).toFixed(0)}%
                        </div>
                      </div>
                      <span className="text-lg font-bold font-mono text-secondary">
                        +{c.score}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-label-xs font-mono text-text-muted py-2">
                  Complete more tests to elevate domain scores into strong positive contributors.
                </p>
              )}
            </div>

            {/* Top Negative Contributors */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-label-xs font-mono font-semibold text-error uppercase">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">remove_circle</span>
                  Holding Your Readiness Back
                </span>
                <span className="text-[10px] text-text-muted">Targeted Deficits</span>
              </div>

              {readiness.negativeContributors.length > 0 ? (
                <div className="space-y-2">
                  {readiness.negativeContributors.slice(0, 3).map((c) => (
                    <div
                      key={c.code}
                      className="p-3 rounded-lg bg-surface-high border border-border/80 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-body-sm font-medium text-text-primary">
                          {c.name}
                        </div>
                        <div className="text-[11px] font-mono text-text-muted mt-0.5">
                          {c.status} • Weight: {(c.weight * 100).toFixed(0)}%
                        </div>
                      </div>
                      <span className="text-lg font-bold font-mono text-error">
                        {c.score}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-label-xs font-mono text-secondary py-2">
                  No significant domain deficits detected. All domains meet benchmark baseline.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actionable Recommendations Panel */}
        {recommendations.length > 0 && (
          <div className="rounded-xl border border-primary/20 bg-surface p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-title-md font-semibold text-text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">recommend</span>
                Recommended Next Actions
              </h3>
              <span className="text-label-xs font-mono text-text-muted">
                {recommendations.length} PRIORITIZED ACTIONS
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {recommendations.slice(0, 3).map((rec) => (
                <div
                  key={rec.id}
                  className="p-4 rounded-xl bg-surface-high border border-border/80 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                          rec.priority === "Critical"
                            ? "bg-error/20 text-error"
                            : rec.priority === "High"
                            ? "bg-tertiary/20 text-tertiary"
                            : "bg-surface-highest text-text-muted"
                        }`}
                      >
                        {rec.priority}
                      </span>
                      <span className="text-[11px] font-mono text-secondary font-medium">
                        {rec.metric}
                      </span>
                    </div>
                    <h4 className="text-body-sm font-semibold text-text-primary mb-1">
                      {rec.title}
                    </h4>
                    <p className="text-[12px] text-text-secondary leading-relaxed mb-4">
                      {rec.reason}
                    </p>
                  </div>

                  <Link
                    href={rec.route}
                    className="text-primary-text hover:text-primary font-mono text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors pt-2 border-t border-border/60"
                  >
                    <span>{rec.ctaText}</span>
                    <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Render Recharts Visualizations & Topic Tables */}
      <AnalyticsCharts data={analytics} />

      {/* Exam Strategy & Discipline Bar */}
      {(discipline.hasNegativeMarkingIssue || discipline.hasUnansweredIssue) && (
        <div className="p-4 rounded-xl bg-surface border border-tertiary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-body-sm">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-tertiary text-[24px]">flag</span>
            <div>
              <span className="font-semibold text-text-primary block">
                Exam Strategy Advisory
              </span>
              <span className="text-text-secondary text-label-xs font-mono">
                {discipline.hasNegativeMarkingIssue && `Penalty loss: ~${discipline.negativeMarkingLossAvg.toFixed(1)} marks/test. `}
                {discipline.hasUnansweredIssue && `Blank rate: ${discipline.unansweredRate}%. Calibrate test speed.`}
              </span>
            </div>
          </div>
          <Link
            href="/tests"
            className="text-primary-text font-mono text-[12px] font-semibold hover:text-primary transition-colors flex items-center gap-1 self-end sm:self-auto"
          >
            <span>Practice Timed Tests</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        </div>
      )}

      <div className="flex justify-end">
        <Link
          href="/tests"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-body-sm font-semibold text-text-primary transition-colors hover:border-primary hover:bg-surface-high focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          Practice More
          <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
