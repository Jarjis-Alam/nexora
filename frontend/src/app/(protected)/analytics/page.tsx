import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAnalyticsData } from "@/server/analytics";
import { getStudentIntelligence } from "@/server/student-intelligence";
import { db } from "@/db";
import { tests } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  ReadinessGaugeCard,
  PerformanceTrendsChart,
  DifficultyPerformanceCard,
  TopicStrengthMatrixCard,
} from "@/components/analytics/analytics-charts";

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
            Your analytics will appear here.
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
    <div className="space-y-10 pb-28 pr-28 lg:pr-0 max-w-7xl mx-auto">
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

      {/* 01. READINESS */}
      <section aria-labelledby="readiness-section-heading" className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary-text border border-primary/20">
              01
            </span>
            <h2 id="readiness-section-heading" className="text-title-sm font-bold font-mono tracking-wider uppercase text-text-primary">
              READINESS
            </h2>
          </div>
          <span className="text-label-xs font-mono text-text-muted">Dynamic Calibration</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5">
            <ReadinessGaugeCard readiness={analytics.readiness} />
          </div>
          <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-4">
            <div>
              <span className="text-label-xs font-mono uppercase text-text-muted block mb-1">
                Readiness Model Overview
              </span>
              <h3 className="text-title-md font-semibold text-text-primary">
                Comprehensive Multi-Domain Calibration
              </h3>
              <p className="mt-2 text-body-sm text-text-secondary leading-relaxed">
                Placement readiness is deterministically calculated across Aptitude, DSA, Core CS, and SQL benchmarks. Rather than a simple average, Nexora weights critical domain competencies against technical placement requirements.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-border/60 text-center font-mono">
              <div className="p-3 rounded-lg bg-surface-high border border-border/70">
                <span className="text-label-xs text-text-muted block">DSA</span>
                <span className="text-body-md font-bold text-primary-text">
                  {analytics.readiness.breakdown?.dsa ?? 0}%
                </span>
              </div>
              <div className="p-3 rounded-lg bg-surface-high border border-border/70">
                <span className="text-label-xs text-text-muted block">Core CS</span>
                <span className="text-body-md font-bold text-primary-text">
                  {analytics.readiness.breakdown?.coreCs ?? 0}%
                </span>
              </div>
              <div className="p-3 rounded-lg bg-surface-high border border-border/70">
                <span className="text-label-xs text-text-muted block">SQL</span>
                <span className="text-body-md font-bold text-primary-text">
                  {analytics.readiness.breakdown?.sql ?? 0}%
                </span>
              </div>
              <div className="p-3 rounded-lg bg-surface-high border border-border/70">
                <span className="text-label-xs text-text-muted block">Aptitude</span>
                <span className="text-body-md font-bold text-primary-text">
                  {analytics.readiness.breakdown?.aptitude ?? 0}%
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 02. PERFORMANCE */}
      <section aria-labelledby="performance-section-heading" className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary-text border border-primary/20">
              02
            </span>
            <h2 id="performance-section-heading" className="text-title-sm font-bold font-mono tracking-wider uppercase text-text-primary">
              PERFORMANCE
            </h2>
          </div>
          <span className="text-label-xs font-mono text-text-muted">Aggregate Metrics</span>
        </div>

        {/* 5 Overview Metric Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 sm:gap-4">
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

        {/* Difficulty Breakdown */}
        <DifficultyPerformanceCard difficultyPerformance={analytics.difficultyPerformance} />
      </section>

      {/* 03. SUBJECTS */}
      <section aria-labelledby="subjects-section-heading" className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary-text border border-primary/20">
              03
            </span>
            <h2 id="subjects-section-heading" className="text-title-sm font-bold font-mono tracking-wider uppercase text-text-primary">
              SUBJECTS
            </h2>
          </div>
          <span className="text-label-xs font-mono text-text-muted">Domain Attribution Drivers</span>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Positive Contributors */}
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

            {/* Negative Contributors */}
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
      </section>

      {/* 04. TOPICS */}
      <section aria-labelledby="topics-section-heading" className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary-text border border-primary/20">
              04
            </span>
            <h2 id="topics-section-heading" className="text-title-sm font-bold font-mono tracking-wider uppercase text-text-primary">
              TOPICS
            </h2>
          </div>
          <span className="text-label-xs font-mono text-text-muted">Granular Topic Matrix</span>
        </div>

        <TopicStrengthMatrixCard
          strongestTopics={analytics.strongestTopics}
          weakestTopics={analytics.weakestTopics}
        />
      </section>

      {/* 05. TRENDS */}
      <section aria-labelledby="trends-section-heading" className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary-text border border-primary/20">
              05
            </span>
            <h2 id="trends-section-heading" className="text-title-sm font-bold font-mono tracking-wider uppercase text-text-primary">
              TRENDS
            </h2>
          </div>
          <span className="text-label-xs font-mono text-text-muted">Historical Trajectory</span>
        </div>

        <PerformanceTrendsChart
          performanceOverTime={analytics.performanceOverTime}
          overallTrend={trend.overall}
        />
      </section>

      {/* 06. INTELLIGENCE */}
      <section aria-labelledby="intelligence-section-heading" className="space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-primary/10 text-primary-text border border-primary/20">
              06
            </span>
            <h2 id="intelligence-section-heading" className="text-title-sm font-bold font-mono tracking-wider uppercase text-text-primary">
              INTELLIGENCE
            </h2>
          </div>
          <span className="text-label-xs font-mono text-text-muted">Prescriptive Recommendations</span>
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
      </section>

      {/* Navigation Footer */}
      <div className="flex flex-wrap justify-end gap-3 pt-2">
        <Link
          href="/roadmap"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-5 text-body-sm font-semibold text-text-primary transition-colors hover:border-primary hover:bg-surface-high focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <span className="material-symbols-outlined text-[18px]">map</span>
          View Roadmap
        </Link>
        <Link
          href="/tests"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-body-sm font-semibold text-text-inverse transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          Practice Tests
          <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
