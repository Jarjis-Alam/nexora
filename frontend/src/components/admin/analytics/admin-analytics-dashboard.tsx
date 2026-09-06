"use client";

import { useState } from "react";
import { GlobalFiltersToolbar, type FilterState } from "./global-filters-toolbar";
import { OverviewMetrics } from "./overview-metrics";
import { TrendAndDistribution } from "./trend-and-distribution";
import { SubjectTopicBreakdown } from "./subject-topic-breakdown";
import { NegativeMarkingCard } from "./negative-marking-card";
import { ActiveAttemptsDrawer } from "./active-attempts-drawer";
import { TestsPerformanceTable } from "./tests-performance-table";
import { QuestionAnalyticsTable } from "./question-analytics-table";
import { TestComparisonModal } from "./test-comparison-modal";
import type {
  AdminOverviewData,
  AdminTestPerformanceItem,
  AdminQuestionPerformanceItem,
  AdminActiveAttemptItem,
} from "@/server/admin-analytics";

interface DashboardProps {
  initialOverview: AdminOverviewData;
  initialTests: AdminTestPerformanceItem[];
  initialQuestions: AdminQuestionPerformanceItem[];
  initialActiveAttempts: AdminActiveAttemptItem[];
  testsList: { id: string; title: string }[];
  subjectsList: { id: string; name: string; code: string }[];
}

export function AdminAnalyticsDashboard({
  initialOverview,
  initialTests,
  initialQuestions,
  initialActiveAttempts,
  testsList,
  subjectsList,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "tests" | "questions" | "active">("overview");
  const [filters, setFilters] = useState<FilterState>({ dateRange: "all" });
  const [overview, setOverview] = useState<AdminOverviewData>(initialOverview);
  const [testsData, setTestsData] = useState<AdminTestPerformanceItem[]>(initialTests);
  const [questionsData, setQuestionsData] = useState<AdminQuestionPerformanceItem[]>(initialQuestions);
  const [activeAttempts, setActiveAttempts] = useState<AdminActiveAttemptItem[]>(initialActiveAttempts);
  const [loading, setLoading] = useState(false);

  // Test comparison modal state
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const fetchFilteredData = async (newFilters: FilterState) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (newFilters.dateRange) params.set("dateRange", newFilters.dateRange);
      if (newFilters.startDate) params.set("startDate", newFilters.startDate);
      if (newFilters.endDate) params.set("endDate", newFilters.endDate);
      if (newFilters.testId) params.set("testId", newFilters.testId);
      if (newFilters.subjectId) params.set("subjectId", newFilters.subjectId);
      if (newFilters.status) params.set("status", newFilters.status);

      // Fetch overview
      const ovRes = await fetch(`/api/admin/analytics?view=overview&${params.toString()}`);
      const ovJson = await ovRes.json();
      if (ovJson.success) setOverview(ovJson.data);

      // Fetch tests
      const testsRes = await fetch(`/api/admin/analytics?view=tests&${params.toString()}`);
      const testsJson = await testsRes.json();
      if (testsJson.success) setTestsData(testsJson.data.tests);

      // Fetch questions
      const qRes = await fetch(`/api/admin/analytics?view=questions&${params.toString()}`);
      const qJson = await qRes.json();
      if (qJson.success) setQuestionsData(qJson.data.questions);

      // Fetch active attempts
      const actRes = await fetch(`/api/admin/analytics?view=active_attempts`);
      const actJson = await actRes.json();
      if (actJson.success) setActiveAttempts(actJson.data);
    } catch (err) {
      console.error("Failed to fetch filtered admin analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    fetchFilteredData(newFilters);
  };

  const handleRefresh = () => {
    fetchFilteredData(filters);
  };

  const handleSelectForCompare = (testId: string) => {
    if (compareSelection.includes(testId)) {
      setCompareSelection(compareSelection.filter((id) => id !== testId));
    } else {
      if (compareSelection.length >= 2) {
        setCompareSelection([compareSelection[1], testId]);
      } else {
        const next = [...compareSelection, testId];
        setCompareSelection(next);
        if (next.length === 2) {
          setShowCompareModal(true);
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-label-xs font-mono uppercase tracking-wider text-primary-text">
              Institutional Intelligence
            </span>
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            <span className="text-[11px] font-mono text-text-muted">Live Precision Mode</span>
          </div>
          <h1 className="mt-1 text-headline-lg font-bold text-text-primary">
            Admin Analytics & Telemetry
          </h1>
          <p className="text-body-md text-text-secondary mt-0.5">
            Operational visibility into student engagement, assessment difficulty, and question discrimination.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {compareSelection.length === 2 && (
            <button
              type="button"
              onClick={() => setShowCompareModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/20 px-3 py-1.5 text-label-xs font-mono text-primary-text hover:bg-primary/30 transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">compare_arrows</span>
              Compare (2)
            </button>
          )}

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-label-xs font-mono text-text-secondary hover:text-text-primary hover:bg-surface-high transition-colors disabled:opacity-50"
          >
            <span
              className={`material-symbols-outlined text-[16px] ${
                loading ? "animate-spin" : ""
              }`}
            >
              sync
            </span>
            Sync Telemetry
          </button>
        </div>
      </div>

      {/* Global Filters Toolbar */}
      <GlobalFiltersToolbar
        filters={filters}
        onFilterChange={handleFilterChange}
        testsList={testsList}
        subjectsList={subjectsList}
      />

      {/* View Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-1">
        {[
          { id: "overview", label: "Overview & Distributions", icon: "dashboard" },
          { id: "tests", label: "Assessments Directory", icon: "quiz", count: testsData.length },
          { id: "questions", label: "Question Item Analysis", icon: "fact_check", count: questionsData.length },
          {
            id: "active",
            label: "In-Flight Sessions",
            icon: "pending",
            badge: activeAttempts.length > 0 ? activeAttempts.length : undefined,
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg text-label-xs font-mono transition-colors ${
                isActive
                  ? "border-b-2 border-primary text-text-primary font-bold bg-surface-high"
                  : "text-text-muted hover:text-text-primary hover:bg-surface"
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className="rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] text-primary-text font-bold">
                  {tab.badge}
                </span>
              )}
              {tab.count !== undefined && (
                <span className="text-[10px] text-text-muted">({tab.count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-fade-in">
          {/* Key Metric Cards */}
          <OverviewMetrics metrics={overview.metrics} />

          {/* Active Attempts In-Flight (highlighted if any) */}
          {activeAttempts.length > 0 && (
            <ActiveAttemptsDrawer
              attempts={activeAttempts}
              onRefresh={handleRefresh}
            />
          )}

          {/* Trend & Histograms */}
          <TrendAndDistribution
            scoreDistribution={overview.scoreDistribution}
            accuracyDistribution={overview.accuracyDistribution}
            performanceTrend={overview.performanceTrend}
            isLimitedHistory={overview.isLimitedHistory}
            totalSubmitted={overview.metrics.submittedAttempts}
          />

          {/* Negative Marking Impact */}
          <NegativeMarkingCard summary={overview.negativeMarkingSummary} />

          {/* Subject, Topic, and Difficulty breakdown */}
          <SubjectTopicBreakdown
            subjectPerformance={overview.subjectPerformance}
            topicPerformance={overview.topicPerformance}
            difficultyPerformance={overview.difficultyPerformance}
          />
        </div>
      )}

      {/* Tab 2: Assessments Directory */}
      {activeTab === "tests" && (
        <div className="space-y-4 animate-fade-in">
          {compareSelection.length > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-label-xs font-mono text-primary-text">
              <span>
                {compareSelection.length === 1
                  ? "1 assessment selected. Click 'Compare' on a second assessment to launch side-by-side comparison."
                  : "2 assessments selected for side-by-side comparison."}
              </span>
              <div className="flex items-center gap-2">
                {compareSelection.length === 2 && (
                  <button
                    type="button"
                    onClick={() => setShowCompareModal(true)}
                    className="font-bold underline hover:text-text-primary"
                  >
                    View Comparison
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCompareSelection([])}
                  className="text-text-muted hover:text-text-primary"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          <TestsPerformanceTable
            tests={testsData}
            onSelectForCompare={handleSelectForCompare}
            selectedForCompare={compareSelection}
          />
        </div>
      )}

      {/* Tab 3: Question Item Analysis */}
      {activeTab === "questions" && (
        <div className="space-y-4 animate-fade-in">
          <QuestionAnalyticsTable
            questions={questionsData}
            subjectsList={subjectsList}
          />
        </div>
      )}

      {/* Tab 4: Active In-Flight Sessions */}
      {activeTab === "active" && (
        <div className="space-y-4 animate-fade-in">
          <ActiveAttemptsDrawer
            attempts={activeAttempts}
            onRefresh={handleRefresh}
          />
        </div>
      )}

      {/* Side-by-side Test Comparison Modal */}
      {showCompareModal && compareSelection.length === 2 && (
        <TestComparisonModal
          testIdA={compareSelection[0]}
          testIdB={compareSelection[1]}
          onClose={() => setShowCompareModal(false)}
        />
      )}
    </div>
  );
}
