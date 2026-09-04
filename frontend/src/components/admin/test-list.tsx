"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface AdminTestItem {
  id: string;
  title: string;
  description: string | null;
  type: string;
  duration: number;
  difficulty: string | null;
  totalMarks: number;
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

  const filteredTests = tests.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(search.toLowerCase()));
    const matchesType = filterType === "all" || t.type === filterType;
    return matchesSearch && matchesType;
  });

  const handleTogglePublish = async (testId: string, currentStatus: boolean) => {
    setTogglingId(testId);
    try {
      const res = await fetch("/api/admin/tests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: testId,
          isPublished: !currentStatus,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to toggle status");
      }

      setTests((prev) =>
        prev.map((t) => (t.id === testId ? { ...t, isPublished: !currentStatus } : t))
      );
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to update test publication status.");
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[260px]">
          <input
            type="text"
            placeholder="Search assessments by title or keywords..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-base border border-border rounded px-4 py-2 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
          />
          <span className="material-symbols-outlined absolute right-3 top-2.5 text-text-muted text-[18px]">
            search
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-base border border-border text-text-primary text-label-xs font-mono px-3 py-2 rounded focus:border-primary focus:outline-none cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="baseline">Baseline</option>
            <option value="aptitude">Aptitude</option>
            <option value="cs_fundamentals">CS Fundamentals</option>
            <option value="mixed">Mixed</option>
          </select>

          <Link
            href="/admin/tests/new"
            className="bg-primary text-text-inverse font-semibold text-body-sm px-4 py-2 rounded hover:bg-primary-text transition-colors inline-flex items-center gap-1.5 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Create Test
          </Link>
        </div>
      </div>

      {/* Tests Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-surface-high border-b border-border text-label-xs font-mono text-text-muted uppercase">
          <div className="col-span-4">Assessment Title</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-2 text-center">Questions</div>
          <div className="col-span-1 text-center">Duration</div>
          <div className="col-span-1 text-center">Status</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        <div className="divide-y divide-border">
          {filteredTests.length > 0 ? (
            filteredTests.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-12 gap-4 px-5 py-4 items-center hover:bg-surface-high/50 transition-colors text-body-sm"
              >
                {/* Title & Desc */}
                <div className="col-span-4 min-w-0 pr-2">
                  <h4 className="text-text-primary font-medium truncate">{t.title}</h4>
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
                <div className="col-span-2 text-center font-mono text-label-xs text-text-primary">
                  {t.questionCount} Qs
                  <span className="text-text-muted ml-1">({t.totalMarks} pts)</span>
                </div>

                {/* Duration */}
                <div className="col-span-1 text-center font-mono text-label-xs text-text-muted">
                  {t.duration}m
                </div>

                {/* Status */}
                <div className="col-span-1 text-center">
                  <span
                    className={`text-label-xs px-2 py-0.5 rounded font-mono uppercase ${
                      t.isPublished
                        ? "bg-secondary/10 text-secondary border border-secondary/20"
                        : "bg-surface-high text-text-muted border border-border"
                    }`}
                  >
                    {t.isPublished ? "Live" : "Draft"}
                  </span>
                </div>

                {/* Actions */}
                <div className="col-span-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleTogglePublish(t.id, t.isPublished)}
                    disabled={togglingId === t.id}
                    className="text-label-xs font-mono px-2.5 py-1 rounded border border-border hover:bg-surface-high transition-colors disabled:opacity-50 text-text-secondary hover:text-text-primary cursor-pointer"
                  >
                    {togglingId === t.id
                      ? "..."
                      : t.isPublished
                      ? "Unpublish"
                      : "Publish"}
                  </button>

                  <Link
                    href={`/tests/${t.id}`}
                    className="text-label-xs font-mono px-2.5 py-1 rounded bg-surface-high hover:bg-surface-highest text-primary-text border border-border transition-colors flex items-center gap-1"
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
  );
}
