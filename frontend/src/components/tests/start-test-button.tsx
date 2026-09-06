"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAttemptAction } from "@/server/actions";

export function StartTestButton({
  testId,
  hasInProgressAttempt = false,
  attemptLimitReached = false,
  requireAcknowledgement = false,
  effectiveStatus = "active",
}: {
  testId: string;
  hasInProgressAttempt?: boolean;
  attemptLimitReached?: boolean;
  requireAcknowledgement?: boolean;
  effectiveStatus?: "draft" | "scheduled" | "active" | "closed" | "archived";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const isScheduled = effectiveStatus === "scheduled";
  const isClosed = effectiveStatus === "closed";
  const isArchived = effectiveStatus === "archived";

  // Active attempts can resume even if test closed
  const canStartOrResume = hasInProgressAttempt || (!isScheduled && !isClosed && !isArchived && !attemptLimitReached);

  async function handleStart() {
    setLoading(true);
    try {
      const result = await startAttemptAction(testId);
      if (!result?.attemptId) {
        throw new Error("Failed to initialize exam session.");
      }
      router.push(`/tests/${testId}/attempt?attemptId=${result.attemptId}`);
    } catch (err: unknown) {
      console.error("Failed to start attempt:", err);
      const msg = err instanceof Error ? err.message : "";
      if (
        msg.includes("Unauthorized") ||
        msg.includes("log in") ||
        msg.includes("session")
      ) {
        router.push(`/auth/login?callbackUrl=/tests/${testId}`);
        return;
      }
      alert(msg || "Failed to initiate test. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {requireAcknowledgement && canStartOrResume && !hasInProgressAttempt && (
        <label className="flex cursor-pointer items-start gap-2.5 text-body-sm text-text-secondary">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-base accent-primary"
          />
          <span>I have read and understood the instructions.</span>
        </label>
      )}
      <button
        onClick={handleStart}
        disabled={
          loading ||
          !canStartOrResume ||
          (requireAcknowledgement && !acknowledged && !hasInProgressAttempt)
        }
        className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-body-sm font-semibold text-text-inverse shadow-md shadow-primary/10 transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="material-symbols-outlined text-[20px]">
          {isScheduled ? "schedule" : hasInProgressAttempt ? "play_arrow" : isClosed ? "lock" : "play_arrow"}
        </span>
        {loading
          ? "Starting Exam..."
          : hasInProgressAttempt
          ? "Resume Test"
          : isScheduled
          ? "Opens Soon"
          : isClosed
          ? "Assessment Closed"
          : isArchived
          ? "Archived"
          : attemptLimitReached
          ? "Attempt limit reached"
          : "Start Test"}
      </button>
    </div>
  );
}
