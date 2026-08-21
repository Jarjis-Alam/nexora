import Link from "next/link";
import { auth } from "@/lib/auth";
import { getPublishedTests } from "@/server/tests";

export default async function TestCatalogPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const allTests = await getPublishedTests(session.user.id);

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div>
        <h2 className="text-headline-lg font-bold text-text-primary">
          Placement Tests
        </h2>
        <p className="text-body-md text-text-secondary mt-1">
          Practice under realistic placement conditions.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="Search tests, topics, or skills..."
            className="w-full bg-surface border border-border rounded px-4 py-2 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
          />
          <span className="material-symbols-outlined absolute right-3 top-2.5 text-text-muted text-[18px]">
            search
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button className="px-3 py-1.5 rounded bg-surface-high border border-border text-label-xs text-text-primary font-medium">
            All Tests
          </button>
          <button className="px-3 py-1.5 rounded hover:bg-surface-high text-label-xs text-text-muted transition-colors">
            Aptitude
          </button>
          <button className="px-3 py-1.5 rounded hover:bg-surface-high text-label-xs text-text-muted transition-colors">
            CS Fundamentals
          </button>
          <button className="px-3 py-1.5 rounded hover:bg-surface-high text-label-xs text-text-muted transition-colors">
            Mixed Placement
          </button>
        </div>
      </div>

      {/* Test Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allTests.map((t) => {
          const isAttempted = t.bestScore !== null;
          const isBaseline = t.type === "baseline";

          return (
            <div
              key={t.id}
              className="bg-surface border border-border rounded-lg p-6 flex flex-col justify-between hover:border-border-variant hover:bg-surface-high/40 transition-all group relative"
            >
              <div>
                {/* Header tags */}
                <div className="flex items-center justify-between mb-4">
                  <div className="w-9 h-9 rounded bg-surface-high border border-border flex items-center justify-center text-primary-text">
                    <span className="material-symbols-outlined text-[20px]">
                      {t.type === "aptitude"
                        ? "calculate"
                        : t.type === "cs_fundamentals"
                        ? "memory"
                        : isBaseline
                        ? "assignment"
                        : "hub"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isBaseline && (
                      <span className="text-label-xs px-2 py-0.5 rounded bg-primary/10 text-primary-text border border-primary/20 uppercase font-mono">
                        Baseline
                      </span>
                    )}
                    {t.difficulty && (
                      <span className="text-label-xs px-2 py-0.5 rounded bg-surface-high text-text-muted border border-border uppercase font-mono">
                        {t.difficulty}
                      </span>
                    )}
                    {isAttempted && (
                      <span className="text-label-xs px-2 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20 uppercase font-mono">
                        Attempted
                      </span>
                    )}
                  </div>
                </div>

                {/* Title & Description */}
                <h3 className="text-title-md font-semibold text-text-primary mb-2">
                  {t.title}
                </h3>
                <p className="text-body-sm text-text-secondary line-clamp-3 mb-6 leading-relaxed">
                  {t.description}
                </p>

                {/* Meta details */}
                <div className="grid grid-cols-2 gap-4 py-4 border-t border-border/80 text-label-xs font-mono">
                  <div>
                    <span className="text-text-muted uppercase block">Duration</span>
                    <span className="text-text-primary font-semibold flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-[14px]">schedule</span>
                      {t.duration} Min
                    </span>
                  </div>
                  <div>
                    <span className="text-text-muted uppercase block">Questions</span>
                    <span className="text-text-primary font-semibold flex items-center gap-1 mt-0.5">
                      <span className="material-symbols-outlined text-[14px]">format_list_numbered</span>
                      {t.questionCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer / Status & CTA */}
              <div className="pt-4 border-t border-border mt-2">
                <div className="flex items-center justify-between mb-4 text-label-xs font-mono">
                  <span className="text-text-muted uppercase">
                    {isAttempted ? "Best Score" : "Status"}
                  </span>
                  <span
                    className={`font-semibold ${
                      isAttempted ? "text-secondary" : "text-text-muted"
                    }`}
                  >
                    {isAttempted ? `${t.bestScore}/100` : "Not Attempted"}
                  </span>
                </div>

                <Link
                  href={`/tests/${t.id}`}
                  className="w-full bg-surface-high border border-border text-text-primary font-medium text-body-sm py-2.5 px-4 rounded hover:bg-primary hover:text-text-inverse hover:border-primary transition-all flex items-center justify-center gap-2 group-hover:border-primary-text"
                >
                  {isAttempted ? (
                    <>
                      <span>Retake Test</span>
                      <span className="material-symbols-outlined text-[16px]">refresh</span>
                    </>
                  ) : (
                    <>
                      <span>Start Test</span>
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </>
                  )}
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
