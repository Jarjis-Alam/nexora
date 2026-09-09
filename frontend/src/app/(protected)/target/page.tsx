import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getPlacementTargetStrategy } from "@/server/placement-target-strategy";

export default async function TargetStrategyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const strategy = await getPlacementTargetStrategy(session.user.id);
  const { target, readiness, matrix, gaps, advantages, preparationStrategy, emptyState, partialDataBanner } = strategy;

  return (
    <div className="space-y-8 pb-28 pr-28 lg:pr-0">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1 text-[11px] font-mono uppercase tracking-wider text-primary font-bold">
            <span className="material-symbols-outlined text-[16px]">crosshair</span>
            Placement Target Strategy
          </div>
          <h1 className="text-headline-lg font-bold text-text-primary tracking-tight">
            Target Strategy Engine
          </h1>
          <p className="mt-1 text-label-xs font-mono uppercase text-text-muted">
            NEXORA / STRATEGIC PREPARATION CONSOLE
          </p>
        </div>

        {target.configured && (
          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              className="px-3.5 py-1.5 rounded-lg border border-border bg-surface-high hover:bg-surface-highest text-[12px] font-mono text-text-secondary hover:text-text-primary transition-colors inline-flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[15px]">edit</span>
              <span>Manage Targets</span>
            </Link>
            <Link
              href="/roadmap"
              className="px-3.5 py-1.5 rounded-lg border border-primary/40 bg-primary/10 hover:bg-primary/20 text-[12px] font-mono text-primary-text transition-colors inline-flex items-center gap-1.5 font-medium"
            >
              <span>View Roadmap</span>
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>
          </div>
        )}
      </div>

      {/* EMPTY STATES */}
      {emptyState && (
        <div className="rounded-2xl border border-primary/30 bg-surface/90 p-8 text-center max-w-2xl mx-auto my-12 space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/25 text-primary flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-[32px]">
              {emptyState.type === "no_target" ? "ads_click" : "verified"}
            </span>
          </div>
          <div>
            <span className="text-[11px] font-mono text-primary font-bold uppercase tracking-wider block mb-1">
              Strategy Activation Required
            </span>
            <h2 className="text-2xl font-bold text-text-primary tracking-tight">
              {emptyState.title}
            </h2>
            <p className="mt-2 text-body-sm text-text-secondary leading-relaxed max-w-lg mx-auto">
              {emptyState.message}
            </p>
          </div>
          <div className="pt-2">
            <Link
              href={emptyState.ctaHref}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-text-inverse font-semibold text-body-sm hover:bg-primary-text transition-all shadow-md shadow-primary/20"
            >
              <span>{emptyState.ctaLabel}</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>
        </div>
      )}

      {/* ACTIVE TARGET STRATEGY CONSOLE */}
      {!emptyState && (
        <div className="space-y-8">
          {/* Partial Data Banner */}
          {partialDataBanner && (
            <div className="rounded-xl border border-tertiary/30 bg-tertiary/10 p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-tertiary text-[20px] mt-0.5">info</span>
              <div>
                <span className="text-[11px] font-mono font-bold uppercase text-tertiary block">
                  {partialDataBanner.title}
                </span>
                <p className="text-body-sm text-text-secondary mt-0.5 leading-relaxed">
                  {partialDataBanner.message}
                </p>
              </div>
            </div>
          )}

          {/* Active Target Banner */}
          <div className="rounded-2xl border border-primary/30 bg-surface/90 p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-primary font-bold mb-1">
                  <span className="material-symbols-outlined text-[15px]">flag</span>
                  Active Placement Target
                </div>
                <div className="flex flex-wrap items-baseline gap-3">
                  <h2 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
                    {target.primaryRole?.name || "Software Engineer"}
                  </h2>
                  {target.primaryCompany && (
                    <span className="text-xl font-semibold text-primary-text">
                      @ {target.primaryCompany.name}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-text-muted mt-2">
                  <span className="px-2 py-0.5 rounded bg-surface-high border border-border text-text-secondary">
                    {target.primaryRole?.category || "Engineering"}
                  </span>
                  {target.primaryCompany?.industry && (
                    <span className="px-2 py-0.5 rounded bg-surface-high border border-border text-text-secondary">
                      {target.primaryCompany.industry}
                    </span>
                  )}
                  <span>•</span>
                  <span>{target.targetCompaniesCount} configured companies</span>
                  <span>•</span>
                  <span>{target.targetRolesCount} configured roles</span>
                </div>
              </div>

              <div className="bg-surface-high/80 border border-border rounded-xl p-4 text-center sm:text-right min-w-[200px]">
                <span className="text-[10px] font-mono uppercase text-text-muted block">
                  Target Readiness Index
                </span>
                <div className="text-3xl sm:text-4xl font-bold font-mono text-primary-text mt-0.5">
                  {readiness.targetScore !== null ? `${readiness.targetScore} / 100` : "--"}
                </div>
                <span className="text-[11px] font-mono font-bold uppercase text-secondary block mt-1">
                  {readiness.targetLevel || "Calculating"}
                </span>
              </div>
            </div>
          </div>

          {/* Section 01: Target Readiness vs Overall Readiness */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
                  <span className="text-primary-text font-mono">01</span>
                  TARGET READINESS
                </h2>
                <p className="text-[12px] font-mono text-text-muted mt-0.5">
                  Comparative performance calibrated against {target.primaryRole?.name} requirements
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-secondary/15 text-secondary border border-secondary/30 font-bold uppercase">
                {readiness.targetLevel || "EVALUATED"}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-surface p-5 space-y-2">
                <span className="text-[10px] font-mono uppercase text-text-muted font-bold block">
                  Target Readiness Index
                </span>
                <div className="text-3xl font-bold font-mono text-primary-text">
                  {readiness.targetScore !== null ? `${readiness.targetScore}%` : "--"}
                </div>
                <p className="text-[12px] font-mono text-text-secondary leading-relaxed">
                  Weighted accuracy across required domains for {target.primaryRole?.name}.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface p-5 space-y-2">
                <span className="text-[10px] font-mono uppercase text-text-muted font-bold block">
                  Overall Readiness Score
                </span>
                <div className="text-3xl font-bold font-mono text-text-primary">
                  {readiness.overallScore !== null ? `${readiness.overallScore}%` : "--"}
                </div>
                <p className="text-[12px] font-mono text-text-secondary leading-relaxed">
                  General technical assessment baseline across all curriculum subjects.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-surface p-5 space-y-2">
                <span className="text-[10px] font-mono uppercase text-text-muted font-bold block">
                  Domain Distribution
                </span>
                <div className="flex items-baseline gap-3 text-lg font-mono font-bold mt-1">
                  <span className="text-secondary">{readiness.strongCount} Strong</span>
                  <span className="text-text-muted">•</span>
                  <span className="text-tertiary">{readiness.developingCount} Dev</span>
                  <span className="text-text-muted">•</span>
                  <span className="text-error">{readiness.weakCount} Weak</span>
                </div>
                <p className="text-[12px] font-mono text-text-secondary leading-relaxed">
                  Measured balance across target-relevant domain benchmarks.
                </p>
              </div>
            </div>
          </section>

          {/* Section 02: Target Requirements & Fit Matrix */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
                  <span className="text-primary-text font-mono">02</span>
                  TARGET REQUIREMENTS & PERFORMANCE MATRIX
                </h2>
                <p className="text-[12px] font-mono text-text-muted mt-0.5">
                  Authoritative domain requirements mapped against your measured scores
                </p>
              </div>
              <span className="text-[11px] font-mono text-text-muted">
                {strategy.requirements.hasAuthoritativeData ? "Authoritative Syllabus" : "Curriculum Standard"}
              </span>
            </div>

            <div className="rounded-xl border border-border bg-surface overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-surface-high/60 text-[11px] font-mono uppercase text-text-muted">
                      <th className="py-3 px-4">Domain</th>
                      <th className="py-3 px-4">Target Need</th>
                      <th className="py-3 px-4">Target Benchmark</th>
                      <th className="py-3 px-4">Your Accuracy</th>
                      <th className="py-3 px-4">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 text-body-sm">
                    {matrix.map((row) => (
                      <tr key={row.domain} className="hover:bg-surface-high/40 transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-text-primary">
                            {row.domain} — {row.domainName}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                              row.targetNeed === "HIGH"
                                ? "bg-primary/20 text-primary-text border border-primary/30"
                                : row.targetNeed === "MEDIUM"
                                ? "bg-surface-high text-text-primary border border-border"
                                : "bg-surface-high/40 text-text-muted border border-border/50"
                            }`}
                          >
                            {row.targetNeed}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-text-secondary text-[12px]">
                          {row.benchmark}%
                        </td>
                        <td className="py-3.5 px-4 font-mono font-semibold text-text-primary text-[13px]">
                          {row.accuracy !== null ? `${row.accuracy}%` : "--"}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                              row.studentState === "STRONG"
                                ? "bg-secondary/15 text-secondary border border-secondary/30"
                                : row.studentState === "DEVELOPING"
                                ? "bg-tertiary/15 text-tertiary border border-tertiary/30"
                                : row.studentState === "WEAK"
                                ? "bg-error/15 text-error border border-error/30"
                                : "bg-surface-high text-text-muted border border-border"
                            }`}
                          >
                            {row.studentState}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Section 03: Your Target Gaps */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
                  <span className="text-primary-text font-mono">03</span>
                  TARGET GAPS & PRIORITY DEFICITS
                </h2>
                <p className="text-[12px] font-mono text-text-muted mt-0.5">
                  Areas below the target benchmark requiring targeted intervention
                </p>
              </div>
              <span className="text-[11px] font-mono text-text-muted">
                {gaps.length} {gaps.length === 1 ? "priority gap" : "priority gaps"}
              </span>
            </div>

            {gaps.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {gaps.map((gap) => (
                  <div
                    key={gap.id}
                    className="rounded-xl border border-error/25 bg-surface p-5 hover:border-error/40 transition-colors space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-bold font-mono text-primary-text">
                          {gap.orderNumber}
                        </span>
                        <h3 className="text-lg font-bold text-text-primary tracking-tight">
                          {gap.domain} → {gap.topic}
                        </h3>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                            gap.priority === "CRITICAL"
                              ? "bg-error/20 text-error border border-error/30"
                              : "bg-tertiary/20 text-tertiary border border-tertiary/30"
                          }`}
                        >
                          {gap.priority}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/15 text-primary-text border border-primary/25 font-bold uppercase">
                          TARGET {gap.targetRelevance}
                        </span>
                        <span className="text-label-xs font-mono text-error font-semibold bg-surface-high px-2.5 py-1 rounded-md border border-border">
                          {gap.currentAccuracy}% ACCURACY
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-body-sm">
                      <div>
                        <span className="text-[10px] font-mono uppercase text-text-muted block">
                          Why:
                        </span>
                        <p className="text-text-secondary leading-relaxed">
                          {gap.why}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase text-text-muted block">
                          Evidence:
                        </span>
                        <p className="text-[12px] font-mono text-text-muted leading-relaxed">
                          {gap.evidence}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-mono uppercase text-text-muted block">
                          Action:
                        </span>
                        <p className="text-text-primary font-medium leading-relaxed">
                          {gap.action}
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-border/60 flex items-center justify-between">
                      <span className="text-[11px] font-mono text-text-muted">
                        Target Benchmark: {gap.targetBenchmark}%
                      </span>
                      <Link
                        href={gap.ctaHref}
                        className="px-4 py-2 rounded-lg bg-primary text-text-inverse hover:bg-primary-text text-[12px] font-semibold font-mono transition-colors inline-flex items-center gap-1.5 shadow-sm"
                      >
                        <span>{gap.ctaLabel}</span>
                        <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-secondary/30 bg-surface p-6 text-center">
                <span className="material-symbols-outlined text-secondary text-[28px] mb-2 block">
                  verified
                </span>
                <h3 className="text-lg font-bold text-text-primary">No Critical Target Gaps</h3>
                <p className="text-body-sm text-text-secondary mt-1 max-w-md mx-auto">
                  Your current measured accuracy in all target-required domains meets the placement benchmark.
                </p>
              </div>
            )}
          </section>

          {/* Section 04: Your Advantages */}
          <section className="space-y-4">
            <div>
              <h2 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
                <span className="text-primary-text font-mono">04</span>
                YOUR ADVANTAGES
              </h2>
              <p className="text-[12px] font-mono text-text-muted mt-0.5">
                Areas where your measured performance exceeds target benchmarks
              </p>
            </div>

            {advantages.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {advantages.map((adv) => (
                  <div
                    key={adv.id}
                    className="rounded-xl border border-secondary/30 bg-surface p-5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase text-secondary font-bold px-2 py-0.5 rounded bg-secondary/10 border border-secondary/25">
                        ADVANTAGE
                      </span>
                      <span className="text-lg font-bold font-mono text-secondary">
                        {adv.accuracy}%
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-text-primary tracking-tight">
                      {adv.domain} → {adv.topic}
                    </h3>
                    <p className="text-body-sm text-text-secondary leading-relaxed">
                      {adv.why}
                    </p>
                    <div className="text-[11px] font-mono text-text-muted pt-2 border-t border-border/60">
                      {adv.evidence}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface p-5 text-center text-[12px] font-mono text-text-muted">
                Complete more practice to establish validated target advantages.
              </div>
            )}
          </section>

          {/* Section 05: Preparation Strategy & Directives */}
          <section className="rounded-2xl border border-primary/30 bg-surface/90 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-text-primary tracking-tight flex items-center gap-2">
                <span className="text-primary-text font-mono">05</span>
                PREPARATION STRATEGY DIRECTIVE
              </h2>
              <span className="text-[10px] font-mono text-primary font-bold uppercase tracking-wider">
                Action Plan
              </span>
            </div>

            <p className="text-body-md text-text-secondary leading-relaxed max-w-3xl">
              {preparationStrategy.summary}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border/60">
              {preparationStrategy.practiceHref && (
                <Link
                  href={preparationStrategy.practiceHref}
                  className="px-5 py-2.5 rounded-lg bg-primary text-text-inverse hover:bg-primary-text font-semibold text-body-sm transition-colors inline-flex items-center gap-2 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                  <span>Start Priority Practice</span>
                </Link>
              )}
              <Link
                href={preparationStrategy.roadmapHref}
                className="px-5 py-2.5 rounded-lg bg-surface-high border border-border text-text-primary hover:bg-surface-highest font-medium text-body-sm transition-colors inline-flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">alt_route</span>
                <span>View Strategic Roadmap</span>
              </Link>
              <Link
                href="/dashboard"
                className="px-5 py-2.5 rounded-lg bg-surface-high border border-border text-text-secondary hover:text-text-primary font-mono text-[12px] transition-colors inline-flex items-center gap-1.5"
              >
                <span>Today&apos;s Execution Plan</span>
                <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
