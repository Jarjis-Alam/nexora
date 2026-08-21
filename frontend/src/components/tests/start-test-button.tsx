"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAttemptAction } from "@/server/actions";

export function StartTestButton({ testId }: { testId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      const result = await startAttemptAction(testId);
      router.push(`/tests/${testId}/attempt?attemptId=${result.attemptId}`);
    } catch (err) {
      console.error("Failed to start attempt:", err);
      alert("Failed to initiate test. Please try again.");
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleStart}
      disabled={loading}
      className="bg-primary text-text-inverse font-semibold text-body-sm px-6 py-3 rounded hover:bg-primary-text transition-colors flex items-center gap-2 shadow-md shadow-primary/10 disabled:opacity-50 cursor-pointer"
    >
      <span className="material-symbols-outlined text-[20px]">play_arrow</span>
      {loading ? "Starting Exam..." : "Start Test"}
    </button>
  );
}
