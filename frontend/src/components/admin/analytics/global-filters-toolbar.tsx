"use client";

import { useState } from "react";

export interface FilterState {
  dateRange: string;
  startDate?: string;
  endDate?: string;
  testId?: string;
  subjectId?: string;
  status?: string;
}

interface FilterProps {
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  testsList: { id: string; title: string }[];
  subjectsList: { id: string; name: string; code: string }[];
}

export function GlobalFiltersToolbar({
  filters,
  onFilterChange,
  testsList,
  subjectsList,
}: FilterProps) {
  const [customDatesOpen, setCustomDatesOpen] = useState(
    Boolean(filters.startDate && filters.endDate)
  );

  const handleDatePreset = (preset: string) => {
    if (preset === "custom") {
      setCustomDatesOpen(true);
    } else {
      setCustomDatesOpen(false);
      onFilterChange({
        ...filters,
        dateRange: preset,
        startDate: undefined,
        endDate: undefined,
      });
    }
  };

  const handleApplyCustomDates = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const start = (form.elements.namedItem("startDate") as HTMLInputElement)?.value;
    const end = (form.elements.namedItem("endDate") as HTMLInputElement)?.value;
    if (start && end) {
      onFilterChange({
        ...filters,
        dateRange: "custom",
        startDate: start,
        endDate: end,
      });
    }
  };

  const handleReset = () => {
    setCustomDatesOpen(false);
    onFilterChange({
      dateRange: "all",
      testId: undefined,
      subjectId: undefined,
      status: undefined,
      startDate: undefined,
      endDate: undefined,
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        {/* Date presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-label-xs font-mono uppercase text-text-muted">
            Time Range:
          </span>
          {[
            { label: "All Time", value: "all" },
            { label: "Last 7 Days", value: "7d" },
            { label: "Last 30 Days", value: "30d" },
            { label: "Last 90 Days", value: "90d" },
            { label: "Custom", value: "custom" },
          ].map((preset) => {
            const active =
              preset.value === "custom"
                ? customDatesOpen || filters.dateRange === "custom"
                : !customDatesOpen && filters.dateRange === preset.value;

            return (
              <button
                key={preset.value}
                type="button"
                onClick={() => handleDatePreset(preset.value)}
                className={`rounded px-2.5 py-1 text-label-xs font-mono transition-colors ${
                  active
                    ? "bg-primary text-text-inverse font-semibold shadow-xs"
                    : "bg-surface-high border border-border text-text-secondary hover:text-text-primary hover:bg-surface-highest"
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        {/* Reset button */}
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-label-xs font-mono text-text-muted hover:text-text-primary transition-colors focus:outline-none"
        >
          <span className="material-symbols-outlined text-[14px]">refresh</span>
          Reset Filters
        </button>
      </div>

      {/* Custom date range picker if opened */}
      {customDatesOpen && (
        <form
          onSubmit={handleApplyCustomDates}
          className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in"
        >
          <span className="text-label-xs font-mono text-text-muted">From:</span>
          <input
            type="date"
            name="startDate"
            defaultValue={filters.startDate || ""}
            required
            className="rounded border border-border bg-base px-2.5 py-1 text-label-xs font-mono text-text-primary outline-none focus:border-primary"
          />
          <span className="text-label-xs font-mono text-text-muted">To:</span>
          <input
            type="date"
            name="endDate"
            defaultValue={filters.endDate || ""}
            required
            className="rounded border border-border bg-base px-2.5 py-1 text-label-xs font-mono text-text-primary outline-none focus:border-primary"
          />
          <button
            type="submit"
            className="rounded bg-primary/20 border border-primary/40 px-3 py-1 text-label-xs font-mono text-primary-text hover:bg-primary/30 transition-colors"
          >
            Apply Range
          </button>
        </form>
      )}

      {/* Selectors: Test, Subject, Lifecycle Status */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
        {/* Test Filter */}
        <div>
          <label htmlFor="filter-test-select" className="block text-[11px] font-mono text-text-muted mb-1 uppercase">
            Filter Assessment
          </label>
          <select
            id="filter-test-select"
            value={filters.testId || "all"}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                testId: e.target.value === "all" ? undefined : e.target.value,
              })
            }
            className="w-full rounded-lg border border-border bg-base px-3 py-2 text-label-xs font-mono text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Assessments</option>
            {testsList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </div>

        {/* Subject Filter */}
        <div>
          <label htmlFor="filter-subject-select" className="block text-[11px] font-mono text-text-muted mb-1 uppercase">
            Filter Subject
          </label>
          <select
            id="filter-subject-select"
            value={filters.subjectId || "all"}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                subjectId: e.target.value === "all" ? undefined : e.target.value,
              })
            }
            className="w-full rounded-lg border border-border bg-base px-3 py-2 text-label-xs font-mono text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Subjects</option>
            {subjectsList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>

        {/* Lifecycle Status Filter */}
        <div>
          <label htmlFor="filter-status-select" className="block text-[11px] font-mono text-text-muted mb-1 uppercase">
            Lifecycle Status
          </label>
          <select
            id="filter-status-select"
            value={filters.status || "all"}
            onChange={(e) =>
              onFilterChange({
                ...filters,
                status: e.target.value === "all" ? undefined : e.target.value,
              })
            }
            className="w-full rounded-lg border border-border bg-base px-3 py-2 text-label-xs font-mono text-text-primary outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            <option value="all">All Lifecycle States</option>
            <option value="published">Published</option>
            <option value="closed">Closed</option>
            <option value="archived">Archived</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>
    </div>
  );
}
