import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStudentPlacementRoadmap } from "@/server/roadmap";
import { getDailyExecutionPlan } from "@/server/placement-execution";
import { getScoreColor } from "@/lib/utils";

export default async function RoadmapPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=/roadmap");
  }

  const [roadmap, dailyPlan] = await Promise.all([
    getStudentPlacementRoadmap(session.user.id),
    getDailyExecutionPlan(session.user.id),
  ]);
  const baselineHref = roadmap.baselineTestId
    ? `/tests/${roadmap.baselineTestId}`
    : "/assessment";
  const todayActiveAction = dailyPlan.actions.find((a) => a.status !== "COMPLETED") || dailyPlan.actions[0];

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* 1. Page Header */}
      <header className="flex flex-col gap-2 border-b border-border/80 pb-6">
        <div className="flex items-center gap-2 text-label-xs font-mono uppercase tracking-widest text-primary">
          <span className="w-2 h-2 rounded-full bg-primary" />
          <span>NEXORA</span>
          <span className="text-text-muted">/</span>
          <span className="text-text-secondary">PLACEMENT ROADMAP</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <h1 className="text-headline-lg font-bold text-text-primary tracking-tight">
              Placement Roadmap
            </h1>
            <p className="text-body-sm text-text-secondary mt-1">
              Your personalized preparation plan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-medium border ${
                roadmap.hasBaseline
                  ? "bg-secondary/10 border-secondary/30 text-secondary"
                  : "bg-surface-high border-border text-text-muted"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  roadmap.hasBaseline ? "bg-secondary" : "bg-text-muted"
                }`}
              />
              {roadmap.hasBaseline ? "CALIBRATED" : "ZERO DATA"}
            </span>
          </div>
        </div>
      </header>

      {/* Progression Loop Indicator */}
      <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4 rounded-xl border border-border/80 bg-surface/60 font-mono text-label-xs">
        <span className="text-text-muted uppercase tracking-wider text-[10px] mr-1">Progression:</span>
        {[
          { step: "01", label: "Current State", active: roadmap.hasBaseline },
          { step: "02", label: "Weakness", active: roadmap.preparationFocus.items.length > 0 },
          { step: "03", label: "Action", active: roadmap.nextActions.length > 0 },
          { step: "04", label: "Practice", active: roadmap.nextActions.length > 0 },
          { step: "05", label: "Improvement", active: roadmap.hasBaseline },
        ].map((item, idx, arr) => (
          <div key={item.step} className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] ${
                item.active
                  ? "border-primary/30 bg-primary/10 text-primary-text font-semibold"
                  : "border-border/60 bg-surface text-text-muted"
              }`}
            >
              <span className="text-[10px] opacity-70">{item.step}</span>
              <span>{item.label}</span>
            </span>
            {idx < arr.length - 1 && (
              <span className="text-text-muted text-[11px]">→</span>
            )}
          </div>
        ))}
      </div>

      {/* 2. Zero-Data Experience Banner (if baseline uncompleted) */}
      {!roadmap.hasBaseline && (
        <section
          aria-labelledby="zero-data-heading"
          className="p-6 sm:p-8 rounded-2xl bg-surface border border-primary/30 relative overflow-hidden"
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-start gap-4 max-w-2xl">
              <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary flex-shrink-0">
                <span className="material-symbols-outlined text-[26px]">
                  flag
                </span>
              </div>
              <div>
                <h2
                  id="zero-data-heading"
                  className="text-title-md font-bold text-text-primary"
                >
                  Your roadmap will appear after your baseline assessment.
                </h2>
                <p className="text-body-sm text-text-secondary mt-1.5 leading-relaxed">
                  Complete your baseline assessment so Nexora can understand your
                  current readiness and identify where to focus.
                </p>
              </div>
            </div>
            <Link
              href={baselineHref}
              id="start-baseline-assessment-btn"
              className="bg-primary text-text-inverse font-semibold text-body-sm px-6 py-3 rounded-lg hover:bg-primary-text transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <span className="material-symbols-outlined text-[18px]">
                play_arrow
              </span>
              Take Baseline Assessment
            </Link>
          </div>
        </section>
      )}

      {/* 3. Main Two-Column Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ================================================================= */}
        {/* LEFT COLUMN: Readiness, Target, Preparation Focus                 */}
        {/* ================================================================= */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: READINESS */}
          <section
            aria-labelledby="readiness-section-heading"
            className="rounded-xl border border-border bg-surface p-5 sm:p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <span
                id="readiness-section-heading"
                className="text-[11px] font-mono tracking-wider uppercase text-text-muted font-medium"
              >
                Readiness
              </span>
              <span
                className={`text-label-xs font-mono font-semibold px-2 py-0.5 rounded border ${
                  roadmap.hasBaseline
                    ? `${getScoreColor(
                        roadmap.readiness.score || 0
                      )} bg-surface-high border-border`
                    : "text-text-muted bg-surface-high border-border"
                }`}
              >
                {roadmap.hasBaseline
                  ? roadmap.readiness.level?.label || "COMPETITIVE"
                  : "NOT ASSESSED"}
              </span>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-4xl sm:text-5xl font-bold font-mono text-text-primary tracking-tight leading-none">
                {roadmap.hasBaseline && roadmap.readiness.score !== null
                  ? `${roadmap.readiness.score}`
                  : "--"}
              </span>
              <span className="text-body-md font-mono text-text-muted">/ 100</span>
            </div>

            {/* Visual Bar */}
            <div className="w-full bg-surface-highest h-2 rounded-full mt-4 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-500 rounded-full"
                style={{
                  width: `${roadmap.hasBaseline ? roadmap.readiness.score || 0 : 0}%`,
                }}
              />
            </div>

            <p className="text-[12px] font-mono text-text-secondary mt-3 leading-relaxed">
              {roadmap.hasBaseline
                ? "Calculated dynamically across 7 placement domains and interview speed indexing."
                : "Calibrate readiness by completing your baseline diagnostic assessment."}
            </p>

            {roadmap.hasBaseline && roadmap.readiness.breakdown && (
              <div className="mt-4 pt-4 border-t border-border/80 grid grid-cols-2 gap-2 text-label-xs font-mono">
                <div className="flex justify-between p-2 rounded bg-surface-high/60">
                  <span className="text-text-muted">DSA</span>
                  <span className="text-text-primary font-semibold">
                    {roadmap.readiness.breakdown.dsa}%
                  </span>
                </div>
                <div className="flex justify-between p-2 rounded bg-surface-high/60">
                  <span className="text-text-muted">Core CS</span>
                  <span className="text-text-primary font-semibold">
                    {roadmap.readiness.breakdown.coreCs}%
                  </span>
                </div>
                <div className="flex justify-between p-2 rounded bg-surface-high/60">
                  <span className="text-text-muted">SQL</span>
                  <span className="text-text-primary font-semibold">
                    {roadmap.readiness.breakdown.sql}%
                  </span>
                </div>
                <div className="flex justify-between p-2 rounded bg-surface-high/60">
                  <span className="text-text-muted">Aptitude</span>
                  <span className="text-text-primary font-semibold">
                    {roadmap.readiness.breakdown.aptitude}%
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Card 2: PLACEMENT TARGET */}
          <section
            aria-labelledby="placement-target-heading"
            className="rounded-xl border border-border bg-surface p-5 sm:p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <span
                id="placement-target-heading"
                className="text-[11px] font-mono tracking-wider uppercase text-text-muted font-medium"
              >
                Placement Target
              </span>
              <Link
                href="/profile"
                className="text-primary-text font-mono text-[12px] hover:text-primary transition-colors inline-flex items-center gap-1 font-medium"
              >
                <span>{roadmap.targets.configured ? "Manage Targets" : "Set Targets"}</span>
                <span className="material-symbols-outlined text-[15px]">
                  arrow_forward
                </span>
              </Link>
            </div>

            {roadmap.targets.configured ? (
              <div className="space-y-3">
                {roadmap.targets.primaryRole && (
                  <div>
                    <span className="text-[10px] font-mono uppercase text-text-muted block mb-0.5">
                      Target Role
                    </span>
                    <h3 className="text-title-md font-bold text-text-primary">
                      {roadmap.targets.primaryRole.name}
                    </h3>
                    {roadmap.targets.primaryRole.category && (
                      <span className="text-[11px] font-mono text-text-muted">
                        {roadmap.targets.primaryRole.category}
                      </span>
                    )}
                  </div>
                )}

                {roadmap.targets.primaryCompany && (
                  <div className="pt-2 border-t border-border/60">
                    <span className="text-[10px] font-mono uppercase text-text-muted block mb-0.5">
                      Target Company
                    </span>
                    <p className="text-body-md font-semibold text-text-primary">
                      {roadmap.targets.primaryCompany.name}
                    </p>
                    {roadmap.targets.primaryCompany.industry && (
                      <span className="text-[11px] font-mono text-text-muted">
                        {roadmap.targets.primaryCompany.industry}
                      </span>
                    )}
                  </div>
                )}

                <div className="pt-2 flex items-center gap-2 text-[11px] font-mono text-text-muted">
                  <span>
                    {roadmap.targets.companyCount}{" "}
                    {roadmap.targets.companyCount === 1 ? "company" : "companies"}
                  </span>
                  <span>·</span>
                  <span>
                    {roadmap.targets.roleCount}{" "}
                    {roadmap.targets.roleCount === 1 ? "role" : "roles"}
                  </span>
                </div>

                <div className="pt-3 border-t border-border/60">
                  <p className="text-[11px] font-mono text-text-secondary leading-relaxed">
                    Contextualized for your target roles and companies. Preparation
                    focus emphasizes verifiable engineering fundamentals.
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-2 space-y-3">
                <h3 className="text-body-md font-semibold text-text-primary">
                  No placement targets yet
                </h3>
                <p className="text-body-sm text-text-secondary text-[13px] leading-relaxed">
                  Targets give context to your roadmap and focus your preparation.
                  Recommendations will still calibrate against your performance gaps.
                </p>
                <Link
                  href="/profile"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-high border border-primary/30 text-primary-text text-[12px] font-mono font-medium hover:bg-surface-highest transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]">
                    add_circle
                  </span>
                  <span>Set Placement Targets</span>
                </Link>
              </div>
            )}
          </section>

          {/* Card 3: PREPARATION FOCUS */}
          <section
            aria-labelledby="prep-focus-heading"
            className="rounded-xl border border-border bg-surface p-5 sm:p-6"
          >
            <div className="flex items-center justify-between mb-3">
              <span
                id="prep-focus-heading"
                className="text-[11px] font-mono tracking-wider uppercase text-text-muted font-medium"
              >
                Preparation Focus
              </span>
              {roadmap.hasBaseline && (
                <span className="text-[10px] font-mono text-primary-text">
                  REAL SIGNALS
                </span>
              )}
            </div>

            <p className="text-body-sm text-text-secondary mb-4 leading-relaxed">
              {roadmap.preparationFocus.summary}
            </p>

            {roadmap.preparationFocus.items.length > 0 ? (
              <div className="space-y-3">
                {roadmap.preparationFocus.items.map((item) => {
                  const displayScore =
                    item.type === "subject" ? item.score : item.accuracy;
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-lg bg-surface-high border border-border/80 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-body-sm font-bold text-text-primary">
                          {item.name}
                        </span>
                        <span className="font-mono text-body-sm font-bold text-primary-text">
                          {displayScore !== undefined ? `${displayScore}%` : "—"}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-surface-highest h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            (displayScore || 0) < 50
                              ? "bg-error"
                              : (displayScore || 0) < 70
                              ? "bg-tertiary"
                              : "bg-primary"
                          }`}
                          style={{ width: `${displayScore || 0}%` }}
                        />
                      </div>

                      <p className="text-[11px] font-mono text-text-secondary leading-normal">
                        {item.detail}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : !roadmap.hasBaseline ? (
              <div className="p-4 rounded-lg bg-surface-high/60 border border-border text-center space-y-2 font-mono text-[12px] text-text-muted">
                <p>No assessment data available yet.</p>
                <Link
                  href={baselineHref}
                  className="text-primary-text hover:underline inline-block font-medium"
                >
                  Start baseline assessment →
                </Link>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-secondary/10 border border-secondary/20 text-secondary text-[12px] font-mono">
                No critical gaps detected — maintain readiness with periodic mock tests.
              </div>
            )}
          </section>
        </div>

        {/* ================================================================= */}
        {/* RIGHT COLUMN: Next Actions, Preparation Progress                  */}
        {/* ================================================================= */}
        <div className="lg:col-span-7 space-y-6">
          {/* Execution OS: TODAY'S OPERATIONAL FOCUS */}
          {dailyPlan.hasEnoughData && todayActiveAction && (
            <section
              aria-labelledby="today-focus-heading"
              className="rounded-xl border border-primary/40 bg-surface p-5 sm:p-6 relative overflow-hidden shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span
                      id="today-focus-heading"
                      className="text-[11px] font-mono tracking-wider uppercase text-primary font-bold"
                    >
                      TODAY&apos;S FOCUS
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-surface-high border border-border text-text-muted">
                      {dailyPlan.completedCount} / {dailyPlan.totalCount} COMPLETE
                    </span>
                  </div>
                  <h3 className="text-title-md font-bold text-text-primary">
                    {todayActiveAction.domain} → {todayActiveAction.topic}
                  </h3>
                  <p className="text-body-sm text-text-secondary mt-1">
                    {todayActiveAction.targetCount} targeted questions • Current accuracy: {todayActiveAction.accuracy}%
                  </p>
                </div>

                <Link
                  href={todayActiveAction.ctaHref}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-body-sm font-semibold text-text-inverse transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/60 shrink-0 shadow-sm"
                >
                  <span>
                    {todayActiveAction.status === "COMPLETED"
                      ? "PRACTICE AGAIN"
                      : todayActiveAction.status === "IN_PROGRESS"
                      ? "CONTINUE PRACTICE"
                      : todayActiveAction.type === "REVIEW"
                      ? "START REVIEW"
                      : `START ${todayActiveAction.domain.toUpperCase()} PRACTICE`}
                  </span>
                  <span className="material-symbols-outlined text-[17px]">play_arrow</span>
                </Link>
              </div>
            </section>
          )}

          {/* Card 4: YOUR NEXT ACTIONS */}
          <section
            aria-labelledby="next-actions-heading"
            className="rounded-xl border border-border bg-surface p-5 sm:p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <span
                  id="next-actions-heading"
                  className="text-[11px] font-mono tracking-wider uppercase text-text-muted font-medium"
                >
                  Your Next Actions
                </span>
                <h2 className="text-title-md font-bold text-text-primary mt-0.5">
                  Prioritized Preparation Sequence
                </h2>
              </div>
              <span className="text-[11px] font-mono text-text-muted">
                {roadmap.nextActions.length}{" "}
                {roadmap.nextActions.length === 1 ? "STEP" : "STEPS"}
              </span>
            </div>

            <div className="space-y-4">
              {roadmap.nextActions.map((action) => (
                <article
                  key={action.id}
                  className="p-4 sm:p-5 rounded-xl bg-surface-high/90 border border-border/90 hover:border-primary/40 transition-colors relative"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold font-mono text-primary-text">
                        {action.stepNumber}
                      </span>
                      {action.category && (
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                            action.category === "FIX"
                              ? "bg-error/20 text-error border border-error/30"
                              : action.category === "REINFORCE"
                              ? "bg-tertiary/20 text-tertiary border border-tertiary/30"
                              : "bg-secondary/20 text-secondary border border-secondary/30"
                          }`}
                        >
                          {action.category}
                        </span>
                      )}
                      <h3 className="text-body-md font-bold text-text-primary tracking-tight">
                        {action.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {action.isTargetPriority && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-primary/20 text-primary-text border border-primary/30 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">crosshair</span>
                          TARGET PRIORITY
                        </span>
                      )}
                      {action.accuracy !== undefined && (
                        <span className="text-label-xs font-mono font-semibold px-2 py-0.5 rounded bg-surface border border-border text-text-primary">
                          {action.accuracy}% ACCURACY
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold uppercase tracking-wider ${
                          action.priority === "Critical"
                            ? "bg-error/20 text-error border border-error/30"
                            : action.priority === "High"
                            ? "bg-tertiary/20 text-tertiary border border-tertiary/30"
                            : "bg-surface-highest text-text-muted border border-border"
                        }`}
                      >
                        {action.priority}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2.5 mb-4 pl-0 sm:pl-9">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-text-muted block mb-0.5">
                        Why:
                      </span>
                      <p className="text-body-sm text-text-secondary leading-relaxed text-[13px]">
                        {action.why}
                      </p>
                    </div>

                    {action.evidence && (
                      <div>
                        <span className="text-[10px] font-mono uppercase text-text-muted block mb-0.5">
                          Evidence:
                        </span>
                        <p className="text-[12px] font-mono text-text-muted leading-relaxed">
                          {action.evidence}
                        </p>
                      </div>
                    )}

                    {action.recommendedAction && (
                      <div>
                        <span className="text-[10px] font-mono uppercase text-text-muted block mb-0.5">
                          Action:
                        </span>
                        <p className="text-body-sm text-text-primary font-medium leading-relaxed text-[13px]">
                          {action.recommendedAction}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/60 pl-0 sm:pl-9">
                    {action.recommendedTestTitle ? (
                      <span className="text-[11px] font-mono text-text-muted truncate max-w-[200px] sm:max-w-xs">
                        Target: {action.recommendedTestTitle}
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-text-muted">
                        Nexora Target Practice Flow
                      </span>
                    )}

                    <Link
                      href={action.ctaHref}
                      className="bg-primary text-text-inverse font-semibold text-body-sm px-4 py-2 rounded-lg hover:bg-primary-text transition-colors inline-flex items-center gap-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <span>{action.ctaLabel}</span>
                      <span className="material-symbols-outlined text-[16px]">
                        arrow_forward
                      </span>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>

          {/* Card 5: PREPARATION PROGRESS */}
          <section
            aria-labelledby="prep-progress-heading"
            className="rounded-xl border border-border bg-surface p-5 sm:p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <span
                  id="prep-progress-heading"
                  className="text-[11px] font-mono tracking-wider uppercase text-text-muted font-medium"
                >
                  Preparation Progress
                </span>
                <h2 className="text-title-md font-bold text-text-primary mt-0.5">
                  Verified Skill Progression
                </h2>
              </div>
              <span className="text-[11px] font-mono text-text-muted">
                {roadmap.progress.overall !== null
                  ? `Overall: ${roadmap.progress.overall}%`
                  : "Uncalibrated"}
              </span>
            </div>

            <p className="text-[12px] font-mono text-text-secondary mb-5 leading-relaxed">
              {roadmap.progress.statusMessage}
            </p>

            {roadmap.progress.overall !== null && (
              <div className="mb-6 p-4 rounded-xl bg-surface-high border border-border/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-body-sm font-bold text-text-primary">
                    Overall Benchmark Readiness
                  </span>
                  <span className="font-mono text-title-md font-bold text-primary-text">
                    {roadmap.progress.overall}%
                  </span>
                </div>
                <div className="w-full bg-surface-highest h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${roadmap.progress.overall}%` }}
                  />
                </div>
              </div>
            )}

            {roadmap.progress.subjects.length > 0 ? (
              <div className="space-y-3">
                <span className="text-[10px] font-mono uppercase text-text-muted block">
                  Subject Performance Relative to Benchmark
                </span>
                {roadmap.progress.subjects.map((subj) => (
                  <div
                    key={subj.code}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg bg-surface-high/60 border border-border/60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-label-xs text-text-muted w-12 flex-shrink-0">
                        {subj.code}
                      </span>
                      <span className="text-body-sm font-medium text-text-primary truncate">
                        {subj.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 sm:w-48">
                      <div className="flex-1 bg-surface-highest h-1.5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full"
                          style={{ width: `${subj.score}%` }}
                        />
                      </div>
                      <span className="font-mono text-body-sm font-semibold text-text-primary w-12 text-right">
                        {subj.score}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-surface-high/60 border border-border text-center font-mono text-[12px] text-text-muted">
                Progress bars will populate with verified scores once tests are completed.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
