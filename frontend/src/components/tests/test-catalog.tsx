"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type TestCatalogItem = {
  id: string;
  title: string;
  description: string | null;
  type: "aptitude" | "cs_fundamentals" | "mixed" | "baseline";
  duration: number;
  difficulty: "easy" | "medium" | "hard" | null;
  questionCount: number;
  bestScore: number | null;
  status: string;
  effectiveStatus?: "draft" | "scheduled" | "active" | "closed" | "archived";
  scheduledStartAt?: Date | string | null;
  scheduledEndAt?: Date | string | null;
  scheduleTimezone?: string | null;
};

type Filter = "all" | TestCatalogItem["type"];

const filters: { value: Filter; label: string }[] = [
  { value: "all", label: "All Tests" },
  { value: "aptitude", label: "Aptitude" },
  { value: "cs_fundamentals", label: "CS Fundamentals" },
  { value: "mixed", label: "Mixed Placement" },
];

const typeLabels: Record<TestCatalogItem["type"], string> = {
  baseline: "Baseline",
  aptitude: "Aptitude",
  cs_fundamentals: "CS Fundamentals",
  mixed: "Mixed Placement",
};

const typeIcons: Record<TestCatalogItem["type"], string> = {
  baseline: "assignment",
  aptitude: "calculate",
  cs_fundamentals: "memory",
  mixed: "hub",
};

const statusLabels: Record<TestCatalogItem["status"], string> = {
  not_attempted: "Not Attempted",
  in_progress: "In Progress",
  completed: "Completed",
};

export function TestCatalog({ tests }: { tests: TestCatalogItem[] }) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("all");

  const visibleTests = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return [...tests]
      .sort((first, second) => Number(second.type === "baseline") - Number(first.type === "baseline"))
      .filter((test) => {
        const matchesFilter = activeFilter === "all" || test.type === activeFilter;
        const searchableText = `${test.title} ${test.description} ${typeLabels[test.type]}`.toLowerCase();
        return matchesFilter && (!normalizedQuery || searchableText.includes(normalizedQuery));
      });
  }, [activeFilter, query, tests]);

  return (
    <section aria-labelledby="test-library-heading" className="space-y-5">
      <div className="flex flex-col gap-4 rounded-xl border border-border/70 bg-surface/50 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <label htmlFor="test-search" className="sr-only">
            Search tests, topics, or skills
          </label>
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[19px] text-text-muted">
            search
          </span>
          <input
            id="test-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tests, topics, or skills..."
            className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-4 text-body-sm text-text-primary outline-none transition-colors placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="-mx-1 overflow-x-auto px-1 pb-1" aria-label="Test categories">
          <div className="flex min-w-max items-center gap-2">
            {filters.map((filter) => {
              const isActive = activeFilter === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveFilter(filter.value)}
                  className={`h-9 whitespace-nowrap rounded-lg border px-3.5 text-label-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                    isActive
                      ? "border-primary/50 bg-primary/10 text-primary-text"
                      : "border-border bg-surface text-text-muted hover:border-border-variant hover:bg-surface-high hover:text-text-primary"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 id="test-library-heading" className="text-title-md font-semibold text-text-primary">
          Test Library
        </h2>
        <span className="text-label-xs text-text-muted">
          {visibleTests.length} {visibleTests.length === 1 ? "TEST" : "TESTS"}
        </span>
      </div>

      {visibleTests.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleTests.map((test) => {
            const isBaseline = test.type === "baseline";
            const isCompleted = test.status === "completed";
            const statusLabel =
              statusLabels[test.status as TestCatalogItem["status"]] || "Not Attempted";

            return (
              <article
                key={test.id}
                className={`group flex min-w-0 flex-col rounded-xl border bg-surface p-5 transition-colors ${
                  isBaseline
                    ? "border-primary/50 shadow-[inset_3px_0_0_theme(colors.primary)]"
                    : "border-border hover:border-border-variant hover:bg-surface-high/40"
                }`}
              >
                <div className="flex flex-1 flex-col">
                  <div className="mb-5 flex items-start justify-between gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${isBaseline ? "border-primary/30 bg-primary/10 text-primary-text" : "border-border bg-surface-high text-text-secondary"}`}>
                      <span className="material-symbols-outlined text-[21px]">{typeIcons[test.type]}</span>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span className="text-label-xs rounded border border-border bg-surface-high px-2 py-1 font-mono uppercase text-text-muted">
                        {test.difficulty || "Unrated"}
                      </span>
                      {test.effectiveStatus === "scheduled" && (
                        <span className="text-label-xs rounded border border-primary/30 bg-primary/20 px-2 py-1 font-mono uppercase text-primary-text font-semibold">
                          Upcoming
                        </span>
                      )}
                      {test.effectiveStatus === "closed" && (
                        <span className="text-label-xs rounded border border-border bg-surface-high px-2 py-1 font-mono uppercase text-text-muted">
                          Closed
                        </span>
                      )}
                      {isBaseline && (
                        <span className="text-label-xs rounded border border-primary/30 bg-primary/10 px-2 py-1 font-mono uppercase text-primary-text">
                          Baseline
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-label-xs mb-2 font-mono uppercase text-text-muted">{typeLabels[test.type]}</span>
                  <h3 className="min-h-[3.5rem] text-title-md font-semibold leading-snug text-text-primary">
                    {test.title}
                  </h3>
                  {isBaseline && (
                    <p className="mt-2 text-body-sm font-medium text-primary-text">Establish your current placement readiness.</p>
                  )}
                  <p className={`text-body-sm line-clamp-3 leading-relaxed text-text-secondary ${isBaseline ? "mt-1" : "mt-2"}`}>
                    {test.description}
                  </p>

                  <div className="mt-6 grid grid-cols-2 gap-4 border-y border-border/80 py-4 font-mono text-label-xs">
                    <div>
                      <span className="block uppercase text-text-muted">Duration</span>
                      <span className="mt-1 flex items-center gap-1.5 font-semibold text-text-primary">
                        <span className="material-symbols-outlined text-[15px] text-text-secondary">schedule</span>
                        {test.duration} min
                      </span>
                    </div>
                    <div>
                      <span className="block uppercase text-text-muted">Questions</span>
                      <span className="mt-1 flex items-center gap-1.5 font-semibold text-text-primary">
                        <span className="material-symbols-outlined text-[15px] text-text-secondary">format_list_numbered</span>
                        {test.questionCount}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="mb-3 flex items-center justify-between gap-3 font-mono text-label-xs">
                    <span className="uppercase text-text-muted">Status</span>
                    <span className={isCompleted ? "font-semibold text-secondary" : test.status === "in_progress" ? "font-semibold text-tertiary" : test.effectiveStatus === "scheduled" ? "font-semibold text-primary-text" : "text-text-secondary"}>
                      {test.status === "in_progress"
                        ? "In Progress"
                        : test.effectiveStatus === "scheduled"
                        ? "Upcoming"
                        : test.effectiveStatus === "closed"
                        ? (isCompleted ? "Completed" : "Closed")
                        : isCompleted && test.bestScore !== null
                        ? `${statusLabel} · ${test.bestScore}/100`
                        : statusLabel}
                    </span>
                  </div>
                  <Link
                    href={`/tests/${test.id}`}
                    className={`flex h-11 w-full items-center justify-center gap-2 rounded-lg border px-4 text-body-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                      isBaseline
                        ? "border-primary bg-primary text-text-inverse hover:bg-primary-text"
                        : "border-border bg-surface-high text-text-primary hover:border-primary hover:bg-primary hover:text-text-inverse"
                    }`}
                  >
                    <span>
                      {test.status === "in_progress"
                        ? "Resume Test"
                        : test.effectiveStatus === "scheduled"
                        ? "View Schedule"
                        : test.effectiveStatus === "closed"
                        ? (isCompleted ? "View Results" : "Assessment Closed")
                        : isCompleted
                        ? "Retake Test"
                        : "Start Test"}
                    </span>
                    <span className="material-symbols-outlined text-[17px]">
                      {test.status === "in_progress" ? "play_arrow" : test.effectiveStatus === "scheduled" ? "schedule" : isCompleted ? "refresh" : "arrow_forward"}
                    </span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 px-6 text-center">
          <span className="material-symbols-outlined mb-3 text-[28px] text-text-muted">search_off</span>
          <h3 className="text-body-md font-semibold text-text-primary">No tests found</h3>
          <p className="mt-1 text-body-sm text-text-muted">Try a different search or category.</p>
        </div>
      )}
    </section>
  );
}