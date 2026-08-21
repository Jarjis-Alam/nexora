import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAnalyticsData } from "@/server/analytics";
import { db } from "@/db";
import { tests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AnalyticsCharts } from "@/components/analytics/analytics-charts";

export default async function AnalyticsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const analytics = await getAnalyticsData(session.user.id);

  // Baseline test id for empty state CTA
  const baselineList = await db
    .select({ id: tests.id })
    .from(tests)
    .where(eq(tests.type, "baseline"))
    .limit(1);
  const baselineId = baselineList[0]?.id;

  // Empty State (Stitch design fidelity)
  if (!analytics.hasData) {
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
            Complete your baseline assessment and take a few mock tests to start building your performance profile and tracking placement readiness.
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

  return (
    <div className="space-y-10 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-headline-xl font-bold text-text-primary">
            Performance Analytics
          </h1>
          <p className="text-body-md text-text-secondary mt-1">
            Understand your strengths, weaknesses, speed, and progress.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select className="bg-surface border border-border text-text-primary text-label-xs font-mono px-3 py-2 rounded focus:border-primary focus:outline-none cursor-pointer">
            <option>All Time</option>
            <option>Last 30 Days</option>
            <option>Last 7 Days</option>
          </select>
        </div>
      </div>

      {/* 5 Overview Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* Avg Score */}
        <div className="bg-surface border border-border p-5 rounded-lg flex flex-col justify-between">
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
        <div className="bg-surface border border-border p-5 rounded-lg flex flex-col justify-between">
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
        <div className="bg-surface border border-border p-5 rounded-lg flex flex-col justify-between">
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
        <div className="bg-surface border border-border p-5 rounded-lg flex flex-col justify-between">
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
        <div className="bg-surface border border-border p-5 rounded-lg flex flex-col justify-between col-span-2 sm:col-span-1">
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

      {/* Render Recharts Visualizations & Topic Tables */}
      <AnalyticsCharts data={analytics} />
    </div>
  );
}
