"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DuplicateTestButton({
  testId,
  testTitle,
  className = "",
}: {
  testId: string;
  testTitle: string;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDuplicate() {
    if (loading) return;
    setLoading(true);

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

      router.push("/admin/tests");
      router.refresh();
    } catch (err: unknown) {
      console.error("Duplicate test failed:", err);
      alert(
        err instanceof Error
          ? err.message
          : "Unable to duplicate this test. Please try again."
      );
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDuplicate}
      disabled={loading}
      aria-label={`Duplicate test ${testTitle}`}
      className={`inline-flex h-12 items-center gap-2 rounded-lg border border-primary/40 bg-surface px-5 text-body-sm font-semibold text-primary-text shadow-sm transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {loading ? (
        <>
          <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
          <span>Duplicating...</span>
        </>
      ) : (
        <>
          <span className="material-symbols-outlined text-[18px]">content_copy</span>
          <span>Duplicate Test</span>
        </>
      )}
    </button>
  );
}
