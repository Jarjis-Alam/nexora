"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log exception safely to client telemetry / console
    console.error("Application error caught by boundary:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-base tech-grid flex items-center justify-center p-6 text-text-primary">
      <div className="max-w-md w-full bg-surface border border-border rounded-xl p-8 text-center space-y-6 shadow-2xl">
        <div className="w-14 h-14 rounded-full bg-error/10 border border-error/20 flex items-center justify-center text-error mx-auto">
          <span className="material-symbols-outlined text-[28px]">warning</span>
        </div>

        <div className="space-y-2">
          <span className="text-label-xs font-mono text-error uppercase tracking-wider block">
            ERR_500_SYSTEM_FAULT
          </span>
          <h1 className="text-headline-lg font-bold text-text-primary">
            Application Error
          </h1>
          <p className="text-body-sm text-text-secondary leading-relaxed">
            An unexpected error occurred while processing this operation. Raw stack trace suppressed for security.
          </p>
          {error.digest && (
            <p className="text-label-xs font-mono text-text-muted mt-2">
              Digest: {error.digest}
            </p>
          )}
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => reset()}
            className="flex-1 bg-primary text-text-inverse font-semibold text-body-sm py-2.5 px-4 rounded hover:bg-primary-text transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="flex-1 bg-surface-high border border-border text-text-primary font-medium text-body-sm py-2.5 px-4 rounded hover:bg-surface-highest transition-colors inline-flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">dashboard</span>
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
