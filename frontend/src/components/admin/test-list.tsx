"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { TestStatus, EffectiveStatus } from "@/lib/lifecycle";

interface AdminTestItem {
  id: string;
  title: string;
  description: string | null;
  type: string;
  duration: number;
  difficulty: string | null;
  totalMarks: number;
  status: TestStatus;
  effectiveStatus: EffectiveStatus;
  scheduledStartAt: Date | string | null;
  scheduledEndAt: Date | string | null;
  scheduleTimezone: string | null;
  isPublished: boolean;
  questionCount: number;
  createdAt: Date;
}

export function AdminTestList({ initialTests }: { initialTests: AdminTestItem[] }) {
  const router = useRouter();
  const [tests, setTests] = useState<AdminTestItem[]>(initialTests);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [highlightedTestId, setHighlightedTestId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const filteredTests = tests.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase()));
    const matchesType = filterType === "all" || t.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleUpdateStatus = async (testId: string, newStatus: TestStatus) => {
    setTogglingId(testId);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await fetch("/api/admin/tests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: testId,
          status: newStatus,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Failed to transition test to ${newStatus}`);
      }

      setTests((prev) =>
        prev.map((t) =>
          t.id === testId
            ? {
                ...t,
                status: newStatus,
                effectiveStatus:
                  newStatus === "published"
                    ? (t.scheduledStartAt && new Date().getTime() < new Date(t.scheduledStartAt).getTime() ? "scheduled" : "active")
                    : newStatus,
                isPublished: newStatus === "published",
              }
            : t
        )
      );
      setSuccessMessage(`Assessment transitioned to ${newStatus.toUpperCase()}`);
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Failed to update test lifecycle status.");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDuplicate = async (testId: string) => {
    if (duplicatingId) return;
    setDuplicatingId(testId);
    setSuccessMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/admin/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", id: testId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Unable to duplicate this test. Please try again.");
      }

      const source = tests.find((t) => t.id === testId);
      const newTestItem: AdminTestItem = {
        id: data.test.id,
        title: data.test.title,
        description: data.test.description ?? (source?.description || null),
        type: data.test.type,
        duration: data.test.duration,
        difficulty: data.test.difficulty ?? (source?.difficulty || null),
        totalMarks: data.test.totalMarks,
        status: "draft",
        effectiveStatus: "draft",
        scheduledStartAt: null,
        scheduledEndAt: null,
        scheduleTimezone: null,
        isPublished: false,
        questionCount: data.questionCount,
        createdAt: new Date(data.test.createdAt),
      };

      setTests((previous) => [newTestItem, ...previous]);
      setHighlightedTestId(data.test.id);
      setSuccessMessage(`Test duplicated successfully: ${data.test.title}`);
      router.refresh();
    } catch (error) {
      console.error("Duplicate test failed:", error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to duplicate this test. Please try again."
      );
    } finally {
      setDuplicatingId(null);
    }
  };

  return (
    <div className="space-y-5 pb-4">
      {successMessage && (
        <div
          role="status"
          className="flex items-center justify-between rounded-lg border border-secondary/20 bg-secondary/10 px-4 py-3 text-body-sm text-secondary animate-fade-in"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-label-xs font-mono text-secondary/70 hover:text-secondary focus:outline-none"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="flex items-center justify-between rounded-lg border border-critical/20 bg-critical/10 px-4 py-3 text-body-sm text-critical animate-fade-in"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-label-xs font-mono text-critical/70 hover:text-critical focus:outline-none"
          >
            Dismiss
          </button>
        </div>
      )}
      {/* Search & Filter Toolbar */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="test-management-search" className="sr-only">Search managed tests</label>
          <input
            id="test-management-search"
            type="text"
            placeholder="Search assessments by title or keywords..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 w-full rounded-lg border border-border bg-base px-10 text-body-sm text-text-primary outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/30"
          />
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-3 text-[18px] text-text-muted">
            search
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label="Filter managed tests by type"
            className="h-10 rounded-lg border border-border bg-base px-3 text-label-xs font-mono text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">All Types</option>
            <option value="baseline">Baseline</option>
            <option value="aptitude">Aptitude</option>
            <option value="cs_fundamentals">CS Fundamentals</option>
            <option value="mixed">Mixed</option>
          </select>

          <Link
            href="/admin/tests/new"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-body-sm font-semibold text-text-inverse shadow-sm transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/60"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Create Test
          </Link>
        </div>
      </div>

      {/* Tests Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border bg-surface-high px-5 py-3 text-label-xs font-mono uppercase text-text-muted">
          <span>Managed assessments</span>
          <span>{filteredTests.length} / {tests.length}</span>
        </div>
        <div className="min-w-[900px] overflow-x-auto">
        <div className="grid grid-cols-12 gap-4 border-b border-border bg-surface-high px-5 py-3 text-label-xs font-mono uppercase text-text-muted">
          <div className="col-span-4">Assessment Title</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-1 text-center">Questions</div>
          <div className="col-span-1 text-center">Duration</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-3 text-right">Actions</div>
        </div>

        <div className="divide-y divide-border">
          {filteredTests.length > 0 ? (
            filteredTests.map((t) => (
              <div
                key={t.id}
                className={`grid grid-cols-12 gap-4 px-5 py-4 items-center transition-colors text-body-sm ${
                  t.id === highlightedTestId
                    ? "bg-primary/10 border-l-4 border-l-primary"
                    : "hover:bg-surface-high/50"
                }`}
              >
                {/* Title & Desc */}
                <div className="col-span-4 min-w-0 pr-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-text-primary font-medium truncate">{t.title}</h4>
                    {t.id === highlightedTestId && (
                      <span className="shrink-0 rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-mono uppercase text-primary-text font-semibold">
                        New Draft
                      </span>
                    )}
                  </div>
                  <p className="text-text-secondary text-label-xs line-clamp-1 mt-0.5">
                    {t.description || "No description provided."}
                  </p>
                </div>

                {/* Type */}
                <div className="col-span-2">
                  <span className="text-label-xs px-2.5 py-0.5 rounded font-mono uppercase bg-surface-high border border-border text-text-primary">
                    {t.type.replace("_", " ")}
                  </span>
                </div>

                {/* Questions */}
                <div className="col-span-1 text-center font-mono text-label-xs text-text-primary">
                  {t.questionCount} Qs
                </div>

                {/* Duration */}
                <div className="col-span-1 text-center font-mono text-label-xs text-text-muted">
                  {t.duration}m
                </div>

                {/* Status */}
                <div className="col-span-1 text-center">
                  <span
                    className={`text-label-xs px-2 py-0.5 rounded font-mono uppercase ${
                      t.effectiveStatus === "active"
                        ? "bg-secondary/10 text-secondary border border-secondary/20 font-semibold"
                        : t.effectiveStatus === "scheduled"
                        ? "bg-primary/10 text-primary-text border border-primary/20 font-semibold"
                        : t.effectiveStatus === "closed"
                        ? "bg-tertiary/10 text-tertiary border border-tertiary/20"
                        : t.effectiveStatus === "archived"
                        ? "bg-surface-high text-text-muted/60 border border-border/50"
                        : "bg-surface-high text-text-muted border border-border"
                    }`}
                  >
                    {t.effectiveStatus === "active"
                      ? "Active"
                      : t.effectiveStatus === "scheduled"
                      ? "Scheduled"
                      : t.effectiveStatus === "closed"
                      ? "Closed"
                      : t.effectiveStatus === "archived"
                      ? "Archived"
                      : "Draft"}
                  </span>
                </div>

                {/* Actions */}
                <div className="col-span-3 flex items-center justify-end gap-1.5 flex-wrap">
                  {t.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(t.id, "published")}
                      disabled={togglingId === t.id}
                      className="rounded border border-primary/30 bg-primary/10 px-2 py-1 text-label-xs font-mono text-primary-text hover:bg-primary/20 disabled:opacity-50"
                    >
                      {togglingId === t.id ? "..." : "Publish"}
                    </button>
                  )}

                  {t.status === "published" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(t.id, "closed")}
                      disabled={togglingId === t.id}
                      className="rounded border border-border px-2 py-1 text-label-xs font-mono text-text-secondary hover:bg-surface-high hover:text-text-primary disabled:opacity-50"
                    >
                      {togglingId === t.id ? "..." : "Close"}
                    </button>
                  )}

                  {t.status === "closed" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(t.id, "published")}
                      disabled={togglingId === t.id}
                      className="rounded border border-secondary/30 bg-secondary/10 px-2 py-1 text-label-xs font-mono text-secondary hover:bg-secondary/20 disabled:opacity-50"
                    >
                      {togglingId === t.id ? "..." : "Reopen"}
                    </button>
                  )}

                  {t.status !== "archived" && (
                    <button
                      type="button"
                      onClick={() => handleUpdateStatus(t.id, "archived")}
                      disabled={togglingId === t.id}
                      className="rounded border border-border px-2 py-1 text-label-xs font-mono text-text-muted hover:bg-surface-high hover:text-text-primary disabled:opacity-50"
                    >
                      Archive
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDuplicate(t.id)}
                    disabled={duplicatingId !== null}
                    aria-label={`Duplicate test ${t.title}`}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-label-xs font-mono text-text-secondary transition-colors hover:bg-surface-high hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {duplicatingId === t.id ? (
                      <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    )}
                  </button>

                  <Link
                    href={`/admin/analytics/tests/${t.id}`}
                    title="View detailed test analytics"
                    className="flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2 py-1 text-label-xs font-mono text-primary-text transition-colors hover:bg-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/60"
                  >
                    <span className="material-symbols-outlined text-[13px]">monitoring</span>
                    Analytics
                  </Link>

                  <Link
                    href={`/tests/${t.id}`}
                    className="flex items-center gap-1 rounded border border-border bg-surface-high px-2 py-1 text-label-xs font-mono text-text-secondary transition-colors hover:bg-surface-highest hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/60"
                  >
                    View
                    <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-text-muted text-body-sm font-mono">
              No assessments matching the current filter.
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
