import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { profiles, tests, attempts } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getStudentIntelligence } from "@/server/student-intelligence";
import { getStudentPlacementTargets } from "@/server/company-role-intelligence";
import { getGreeting, formatDateTime, getScoreColor, getSkillLevel } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) return null;

  // 1. Fetch user profile
  const profileList = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const profile = profileList[0];
  const userName = profile?.name || session.user.name || "Engineer";

  // 2. Fetch baseline test id
  const baselineList = await db
    .select({ id: tests.id })
    .from(tests)
    .where(eq(tests.type, "baseline"))
    .limit(1);
  const baselineTestId = baselineList[0]?.id;

  // 3. Centralized Student Intelligence & Recommendations
  const intelligence = await getStudentIntelligence(userId);
  const readiness = intelligence.readiness;
  const dataSufficiency = intelligence.dataSufficiency;
  const recommendations = intelligence.recommendations;
  const topAction = intelligence.topAction;
  const otherRecommendations = topAction
    ? recommendations.filter((r) => r.id !== topAction.id)
    : [];

  // 4. Fetch Placement Targets (Phase 11A)
  const placementTargets = await getStudentPlacementTargets(userId);

  // 4. Fetch recent submitted activity
  const recentActivity = await db
    .select({
      id: attempts.id,
      testId: attempts.testId,
      testTitle: tests.title,
      score: attempts.score,
      accuracy: attempts.accuracy,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(tests, eq(attempts.testId, tests.id))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")))
    .orderBy(desc(attempts.submittedAt))
    .limit(4);

  // SVG Ring calculation for readiness (circumference = 2 * PI * 54 = ~339.29)
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const readinessValue = readiness.score ?? 0;
  const strokeDashoffset = dataSufficiency.hasCompletedBaseline
    ? circumference - (readinessValue / 100) * circumference
    : circumference;

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border/60">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="text-[11px] font-mono font-medium text-text-muted uppercase tracking-wider">
              Nexora • Active Session
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            {getGreeting()}, {userName.split(" ")[0]}
          </h1>
          <p className="text-body-sm text-text-secondary mt-1 max-w-2xl leading-relaxed">
            Your personalized placement command center. Actionable intelligence, deterministic readiness drivers, and prioritized next steps.
          </p>
        </div>

        {/* Quick Header Badge */}
        <div className="flex items-center gap-2.5 self-start md:self-auto px-3.5 py-2 rounded-lg bg-surface/90 border border-border">
          <span className="material-symbols-outlined text-[18px] text-primary">verified</span>
          <div className="flex flex-col text-left">
            <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider leading-none">Curriculum</span>
            <span className="text-[12px] font-mono font-semibold text-text-primary mt-1 leading-none">7 Subjects • 160 Questions</span>
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (Span 8) */}
        <div className="lg:col-span-8 space-y-8">
          {/* 1. Placement Readiness Card & Readiness Contributors */}
          <section className="bg-surface/90 border border-border/80 rounded-2xl p-6 sm:p-8 relative overflow-hidden shadow-sm">
            <div className="flex flex-col md:flex-row items-center gap-6 sm:gap-8">
              {/* Circular Progress Ring or Clean Uncalibrated Gauge */}
              <div className="relative w-40 h-40 sm:w-44 sm:h-44 flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                  <circle
                    cx="60"
                    cy="60"
                    fill="none"
                    r={radius}
                    stroke="#1A1A1A"
                    strokeWidth="8"
                  />
                  <circle
                    className="text-primary circle-progress"
                    cx="60"
                    cy="60"
                    fill="none"
                    r={radius}
                    stroke="currentColor"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    strokeLinecap="round"
                    strokeWidth="8"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                  {dataSufficiency.hasCompletedBaseline ? (
                    <>
                      <span className="text-4xl sm:text-5xl font-bold font-mono text-text-primary leading-none tracking-tight">
                        {readiness.score}%
                      </span>
                      <span
                        className={`text-label-xs font-semibold mt-2 uppercase tracking-wider font-mono ${
                          readiness.level?.color || "text-primary-text"
                        }`}
                      >
                        {readiness.level?.label || "COMPETITIVE"}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-3xl sm:text-4xl font-bold font-mono text-text-muted leading-none tracking-wider">
                        --%
                      </span>
                      <span className="text-[10px] font-mono text-text-muted mt-2 uppercase tracking-widest">
                        NOT ASSESSED
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Card Content & CTAs */}
              <div className="flex-1 text-center md:text-left z-10">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-surface-high border border-border/80 text-[11px] font-mono text-text-muted mb-2">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      dataSufficiency.hasCompletedBaseline ? "bg-secondary" : "bg-primary"
                    }`}
                  />
                  <span>
                    {dataSufficiency.hasCompletedBaseline
                      ? "BENCHMARK CALIBRATED"
                      : "READINESS: NOT ASSESSED (UNCALIBRATED)"}
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight mb-2">
                  Placement Readiness Score
                </h2>

                <p className="text-body-sm text-text-secondary mb-5 leading-relaxed max-w-xl">
                  {dataSufficiency.hasCompletedBaseline
                    ? "Calculated dynamically across Core CS fundamentals, algorithm proficiency, and interview speed indexing against standard placement benchmarks."
                    : "Complete your baseline assessment to establish your starting benchmark across all 7 placement domains."}
                </p>

                <div className="flex flex-wrap gap-3 justify-center md:justify-start">
                  {dataSufficiency.hasCompletedBaseline ? (
                    <>
                      <Link
                        href="/tests"
                        className="bg-primary text-text-inverse font-medium text-body-sm px-6 py-2.5 rounded-lg hover:bg-primary-text transition-colors flex items-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                        Take Mock Test
                      </Link>
                      <Link
                        href="/analytics"
                        className="bg-surface-high border border-border text-text-primary font-medium text-body-sm px-6 py-2.5 rounded-lg hover:bg-surface-highest transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-border"
                      >
                        <span className="material-symbols-outlined text-[18px]">insights</span>
                        View Detailed Report
                      </Link>
                    </>
                  ) : (
                    <Link
                      href={baselineTestId ? `/tests/${baselineTestId}` : "/assessment"}
                      className="bg-primary text-text-inverse font-medium text-body-sm px-7 py-3 rounded-lg hover:bg-primary-text transition-all flex items-center gap-2.5 shadow-md shadow-primary/10 hover:shadow-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/50 text-base"
                    >
                      <span className="material-symbols-outlined text-[20px]">play_circle</span>
                      Start Baseline Assessment
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Readiness Drivers (Contributors Analysis) */}
            {dataSufficiency.hasCompletedBaseline && (
              <div className="mt-8 pt-6 border-t border-border/80">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-body-sm font-semibold text-text-primary flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">swap_vert</span>
                    Readiness Contributors
                  </h3>
                  <span className="text-[11px] font-mono text-text-muted">
                    Deterministic Impact Breakdown
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Positive Contributors (Helping) */}
                  <div className="p-3.5 rounded-xl bg-surface-high/60 border border-secondary/20">
                    <div className="flex items-center gap-2 mb-2 text-label-xs font-mono font-semibold text-secondary uppercase">
                      <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                      Helping Your Readiness
                    </div>
                    {readiness.positiveContributors.length > 0 ? (
                      <div className="space-y-2">
                        {readiness.positiveContributors.slice(0, 2).map((c) => (
                          <div
                            key={c.code}
                            className="flex items-center justify-between text-body-sm bg-surface/80 p-2 rounded-lg border border-border/60"
                          >
                            <span className="text-text-primary font-medium">{c.name}</span>
                            <span className="font-mono text-secondary font-semibold">
                              +{c.score}%
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] font-mono text-text-muted">
                        Take more tests to establish strong benchmark areas.
                      </p>
                    )}
                  </div>

                  {/* Negative Contributors (Holding it back) */}
                  <div className="p-3.5 rounded-xl bg-surface-high/60 border border-error/20">
                    <div className="flex items-center gap-2 mb-2 text-label-xs font-mono font-semibold text-error uppercase">
                      <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                      Holding It Back
                    </div>
                    {readiness.negativeContributors.length > 0 ? (
                      <div className="space-y-2">
                        {readiness.negativeContributors.slice(0, 2).map((c) => (
                          <div
                            key={c.code}
                            className="flex items-center justify-between text-body-sm bg-surface/80 p-2 rounded-lg border border-border/60"
                          >
                            <span className="text-text-primary font-medium">{c.name}</span>
                            <span className="font-mono text-error font-semibold">
                              {c.score}%
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[12px] font-mono text-secondary">
                        No critical deficits holding your score back.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 3. Personalized Dashboard: "Your Next Actions" (Recommended for You) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-title-md font-semibold text-text-primary flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-primary">auto_awesome</span>
                  Your Next Actions
                </h2>
                <p className="text-label-xs text-text-muted mt-0.5">
                  High-value, deterministic actions generated from your verified test data
                </p>
              </div>
              {dataSufficiency.status === "limited_data" && (
                <span className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary-text font-mono text-[11px] font-semibold">
                  EARLY SIGNAL
                </span>
              )}
            </div>

            {/* Zero-Data Experience */}
            {!dataSufficiency.hasCompletedBaseline ? (
              <div className="p-6 sm:p-8 rounded-2xl bg-surface/90 border border-border/80 text-center flex flex-col items-center justify-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-1">
                  <span className="material-symbols-outlined text-[28px]">rocket_launch</span>
                </div>
                <div className="max-w-md">
                  <h3 className="text-body-md font-bold text-text-primary mb-1.5">
                    Complete your baseline assessment to unlock personalized recommendations
                  </h3>
                  <p className="text-body-sm text-text-secondary leading-relaxed">
                    Nexora uses verified test activity to generate actionable guidance. No synthetic data, no hallucinations.
                  </p>
                </div>

                {/* 3-Step Pipeline Explanation */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl text-left my-2">
                  <div className="p-3 rounded-lg bg-surface-high border border-border font-mono text-[11px]">
                    <span className="text-primary font-bold block mb-1">1. Assessment</span>
                    Complete the 30-min baseline diagnostic.
                  </div>
                  <div className="p-3 rounded-lg bg-surface-high border border-border font-mono text-[11px]">
                    <span className="text-text-muted font-bold block mb-1">2. Insights</span>
                    Detect true weak topics and speed trends.
                  </div>
                  <div className="p-3 rounded-lg bg-surface-high border border-border font-mono text-[11px]">
                    <span className="text-text-muted font-bold block mb-1">3. Actions</span>
                    Targeted practice routes for immediate score gains.
                  </div>
                </div>

                <Link
                  href={baselineTestId ? `/tests/${baselineTestId}` : "/assessment"}
                  className="bg-primary text-text-inverse font-medium text-body-sm px-7 py-3 rounded-lg hover:bg-primary-text transition-all inline-flex items-center gap-2 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[18px]">play_circle</span>
                  Start Baseline Assessment
                </Link>
              </div>
            ) : topAction ? (
              <div className="space-y-4">
                {/* Primary #1 Next Action Card */}
                <div className="p-5 sm:p-6 rounded-2xl bg-surface border-2 border-primary/40 relative overflow-hidden shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                          topAction.priority === "Critical"
                            ? "bg-error/20 text-error border border-error/30"
                            : topAction.priority === "High"
                            ? "bg-tertiary/20 text-tertiary border border-tertiary/30"
                            : "bg-primary/20 text-primary-text border border-primary/30"
                        }`}
                      >
                        {topAction.priority} Priority • #1 Next Action
                      </span>
                      <span className="text-[11px] font-mono text-text-muted uppercase">
                        {topAction.type.replace("_", " ")}
                      </span>
                    </div>

                    <span className="text-label-xs font-mono text-secondary font-semibold bg-surface-high px-2.5 py-1 rounded-md border border-border self-start sm:self-auto">
                      {topAction.metric}
                    </span>
                  </div>

                  <h3 className="text-lg sm:text-xl font-bold text-text-primary tracking-tight mb-2">
                    {topAction.title}
                  </h3>

                  <p className="text-body-sm text-text-secondary leading-relaxed mb-5 max-w-3xl">
                    {topAction.reason}
                  </p>

                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href={topAction.route}
                      className="bg-primary text-text-inverse font-semibold text-body-sm px-6 py-2.5 rounded-lg hover:bg-primary-text transition-colors inline-flex items-center gap-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <span>{topAction.ctaText}</span>
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </Link>
                    {topAction.recommendedTestTitle && (
                      <span className="text-[12px] font-mono text-text-muted">
                        Target Test: <span className="text-text-primary">{topAction.recommendedTestTitle}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Secondary Recommendations (2-4 cards) */}
                {otherRecommendations.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {otherRecommendations.map((rec) => (
                      <div
                        key={rec.id}
                        className="p-4 rounded-xl bg-surface/90 border border-border/80 flex flex-col justify-between hover:border-border-variant hover:bg-surface-high transition-all"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                                rec.priority === "Critical"
                                  ? "bg-error/20 text-error"
                                  : rec.priority === "High"
                                  ? "bg-tertiary/20 text-tertiary"
                                  : "bg-surface-highest text-text-muted"
                              }`}
                            >
                              {rec.priority}
                            </span>
                            <span className="text-[11px] font-mono text-secondary font-medium">
                              {rec.metric}
                            </span>
                          </div>

                          <h4 className="text-body-sm font-semibold text-text-primary mb-1.5">
                            {rec.title}
                          </h4>
                          <p className="text-[12px] text-text-secondary leading-relaxed line-clamp-2 mb-4">
                            {rec.reason}
                          </p>
                        </div>

                        <Link
                          href={rec.route}
                          className="text-primary-text hover:text-primary font-mono text-[12px] font-medium inline-flex items-center gap-1.5 transition-colors pt-2 border-t border-border/60"
                        >
                          <span>{rec.ctaText}</span>
                          <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>

          {/* 4. Skill Overview Grid (All 7 Placement Domains) */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-title-md font-semibold text-text-primary">
                  Skill Overview
                </h2>
                <p className="text-label-xs text-text-muted mt-0.5">
                  Performance across 7 placement domains
                </p>
              </div>
              <Link
                href="/analytics"
                className="text-primary-text font-mono text-[12px] hover:text-primary transition-colors flex items-center gap-1 font-medium"
              >
                <span>Full Analytics</span>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {readiness.subjectScores.map((subj) => {
                const skillLevel = getSkillLevel(subj.score);
                const isTested = dataSufficiency.hasCompletedBaseline && subj.score > 0;

                const displayName =
                  subj.code === "APT"
                    ? "Aptitude"
                    : subj.code === "DBMS"
                    ? "DBMS"
                    : subj.code === "DSA"
                    ? "DSA"
                    : subj.code === "OS"
                    ? "OS"
                    : subj.code === "CN"
                    ? "Networks"
                    : subj.code === "OOP"
                    ? "OOP"
                    : subj.code === "SQL"
                    ? "SQL"
                    : subj.name;

                return (
                  <div
                    key={subj.subjectId}
                    className="bg-surface/90 border border-border/80 rounded-xl p-4 flex min-w-0 flex-col justify-between gap-3 hover:border-border-variant hover:bg-surface-high transition-all"
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <span className="min-w-0 text-body-sm font-semibold text-text-primary" title={subj.name}>
                        {displayName}
                      </span>
                    </div>

                    <div>
                      <div className="text-2xl font-bold font-mono text-text-primary tracking-tight">
                        {isTested ? (
                          `${subj.score}%`
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </div>
                      <span
                        className={`mt-1 inline-flex text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold tracking-wider ${
                          isTested
                            ? `${skillLevel.bgClass} ${skillLevel.colorClass}`
                            : "bg-surface-highest/60 text-text-muted"
                        }`}
                      >
                        {isTested ? subj.status : "NOT TESTED"}
                      </span>
                    </div>

                    {/* Progress indicator */}
                    <div className="w-full bg-surface-highest h-1 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isTested ? "bg-primary" : "bg-transparent"
                        }`}
                        style={{
                          width: isTested ? `${subj.score}%` : "0%",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 5. Critical Focus Areas (Weak Topics) */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-title-md font-semibold text-text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-error">track_changes</span>
                Critical Focus Areas
              </h2>
              {intelligence.weakAreas.length > 0 && (
                <span className="text-[11px] font-mono text-text-muted">
                  {intelligence.weakAreas.length}{" "}
                  {intelligence.weakAreas.length === 1 ? "TOPIC" : "TOPICS"} DETECTED
                </span>
              )}
            </div>

            {intelligence.weakAreas.length > 0 ? (
              <div className="flex flex-col gap-3">
                {intelligence.weakAreas.slice(0, 4).map((wa) => (
                  <div
                    key={wa.topicId}
                    className="bg-surface/90 border border-border/80 rounded-xl p-4 flex items-center justify-between hover:border-border-variant transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
                          wa.priority === "CRITICAL"
                            ? "bg-error/10 text-error border-error/20"
                            : "bg-tertiary/10 text-tertiary border-tertiary/20"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[20px]">
                          {wa.subjectCode === "OS"
                            ? "memory"
                            : wa.subjectCode === "DSA"
                            ? "account_tree"
                            : wa.subjectCode === "SQL" || wa.subjectCode === "DBMS"
                            ? "database"
                            : "insights"}
                        </span>
                      </div>
                      <div>
                        <h3 className="text-body-sm text-text-primary font-medium">
                          {wa.topicName}
                        </h3>
                        <p className="text-label-xs text-text-muted mt-0.5 font-mono">
                          {wa.subjectCode} • {wa.accuracy}% accuracy ({wa.totalAttempts} questions)
                          {wa.trend === "declining" && " • declining trend"}
                        </p>
                      </div>
                    </div>

                    <Link
                      href="/tests"
                      className="text-primary-text font-mono text-[12px] uppercase hover:bg-primary/10 px-3 py-1.5 rounded-md transition-colors hidden sm:flex items-center gap-1 font-semibold"
                    >
                      <span>Practice Topic</span>
                      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-surface/90 border border-border/80 text-center flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-secondary/10 border border-secondary/20 flex items-center justify-center text-secondary mb-3">
                  <span className="material-symbols-outlined text-[20px]">verified</span>
                </div>
                <h3 className="text-body-sm font-semibold text-text-primary mb-1">
                  {dataSufficiency.hasCompletedBaseline ? "No Critical Weaknesses" : "Awaiting Evaluation"}
                </h3>
                <p className="text-label-xs text-text-muted max-w-md leading-relaxed">
                  {dataSufficiency.hasCompletedBaseline
                    ? "Great performance! No topics are currently below the accuracy threshold. Keep taking mock tests to maintain consistency."
                    : "Focus areas will appear here after your baseline assessment provides real performance data."}
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Right Column (Span 4) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Placement Target Card (Phase 11A) */}
          <section className="bg-surface/90 border border-border/80 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-primary">target</span>
                Placement Target
              </span>
              <Link
                href="/profile"
                className="text-primary-text hover:text-primary text-[11px] font-mono font-medium underline transition-colors"
              >
                {placementTargets.configured ? "Manage Targets" : "Set Your Target"}
              </Link>
            </div>

            {placementTargets.configured ? (
              <div className="space-y-2">
                <div>
                  <span className="text-body-md font-bold text-text-primary block leading-snug">
                    {placementTargets.primaryRole?.name || "Role Not Selected"}
                  </span>
                  {placementTargets.primaryRole?.category && (
                    <span className="text-[11px] font-mono text-text-muted">
                      {placementTargets.primaryRole.category}
                    </span>
                  )}
                </div>

                {placementTargets.targetCompanies.length > 0 && (
                  <div className="pt-2 border-t border-border/60">
                    <span className="text-[10px] font-mono text-text-muted uppercase block mb-1">
                      Target Companies
                    </span>
                    <p className="text-body-sm text-text-secondary font-mono text-[12px] leading-relaxed">
                      {placementTargets.targetCompanies.map((c) => c.name).join(" · ")}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-1">
                <p className="text-body-sm text-text-muted font-mono text-[12px] mb-3">
                  No target role selected.
                </p>
                <Link
                  href="/profile"
                  className="w-full py-2 px-3 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 text-primary-text text-[12px] font-medium transition-colors inline-flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[15px]">add_circle</span>
                  <span>Set Your Target</span>
                </Link>
              </div>
            )}
          </section>

          {/* Quick Actions */}
          <section className="bg-surface/90 border border-border/80 rounded-2xl p-6">
            <h2 className="text-title-md font-semibold text-text-primary mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">bolt</span>
              Quick Actions
            </h2>
            <div className="flex flex-col gap-3">
              {/* PRIMARY ACTION */}
              <Link
                href="/tests"
                className="w-full h-11 bg-primary text-text-inverse font-semibold text-body-sm px-4 rounded-lg hover:bg-primary-text transition-all flex items-center justify-between group shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <span className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px]">quiz</span>
                  Take Mock Test
                </span>
                <span className="material-symbols-outlined text-[18px] opacity-80 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                  arrow_forward
                </span>
              </Link>

              {/* SECONDARY ACTION 1 */}
              <Link
                href="/tests"
                className="w-full h-11 bg-surface-high border border-border text-text-secondary hover:text-text-primary font-medium text-body-sm px-4 rounded-lg hover:border-border-variant hover:bg-surface-highest transition-all flex items-center justify-between group focus:outline-none focus:ring-2 focus:ring-border"
              >
                <span className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px] text-text-muted group-hover:text-text-primary transition-colors">
                    list_alt
                  </span>
                  View All Tests
                </span>
                <span className="material-symbols-outlined text-[18px] opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                  arrow_forward
                </span>
              </Link>

              {/* SECONDARY ACTION 2 */}
              <Link
                href="/analytics"
                className="w-full h-11 bg-surface-high border border-border text-text-secondary hover:text-text-primary font-medium text-body-sm px-4 rounded-lg hover:border-border-variant hover:bg-surface-highest transition-all flex items-center justify-between group focus:outline-none focus:ring-2 focus:ring-border"
              >
                <span className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px] text-text-muted group-hover:text-text-primary transition-colors">
                    insights
                  </span>
                  View Intelligence & Analytics
                </span>
                <span className="material-symbols-outlined text-[18px] opacity-60 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                  arrow_forward
                </span>
              </Link>
            </div>
          </section>

          {/* Test Discipline & Optimization Signals (if issues exist) */}
          {dataSufficiency.hasCompletedBaseline &&
            (intelligence.discipline.hasNegativeMarkingIssue ||
              intelligence.discipline.hasUnansweredIssue) && (
              <section className="bg-surface/90 border border-tertiary/30 rounded-2xl p-5">
                <h3 className="text-body-sm font-semibold text-tertiary mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">warning</span>
                  Exam Strategy Optimization
                </h3>
                <div className="space-y-2.5 text-label-xs font-mono">
                  {intelligence.discipline.hasNegativeMarkingIssue && (
                    <div className="p-2.5 rounded bg-surface-high border border-border text-text-secondary leading-relaxed">
                      <span className="text-text-primary font-bold block mb-0.5">
                        Negative Marking Penalty
                      </span>
                      Losing ~{intelligence.discipline.negativeMarkingLossAvg.toFixed(1)} marks per test to incorrect answers. Reduce guessing.
                    </div>
                  )}
                  {intelligence.discipline.hasUnansweredIssue && (
                    <div className="p-2.5 rounded bg-surface-high border border-border text-text-secondary leading-relaxed">
                      <span className="text-text-primary font-bold block mb-0.5">
                        Unanswered Questions
                      </span>
                      {intelligence.discipline.unansweredRate}% of questions left blank ({intelligence.discipline.unansweredCount} questions). Improve test pacing.
                    </div>
                  )}
                </div>
              </section>
            )}

          {/* Recent Activity Timeline */}
          <section className="bg-surface/90 border border-border/80 rounded-2xl p-6 flex-1">
            <h2 className="text-title-md font-semibold text-text-primary mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-text-muted">schedule</span>
              Recent Activity
            </h2>

            {recentActivity.length > 0 ? (
              <div className="relative border-l border-border/80 ml-3 space-y-5 pb-2">
                {recentActivity.map((act) => {
                  const score = act.score ?? 0;
                  const dotColor =
                    score >= 75
                      ? "bg-secondary"
                      : score >= 50
                      ? "bg-primary-text"
                      : "bg-error";

                  return (
                    <div key={act.id} className="relative pl-5">
                      <div
                        className={`absolute w-2.5 h-2.5 ${dotColor} rounded-full -left-[5.5px] top-1.5 ring-4 ring-surface`}
                      />
                      <div className="flex flex-col">
                        <span className="text-[11px] text-text-muted font-mono mb-0.5">
                          {act.submittedAt ? formatDateTime(act.submittedAt) : "Recently"}
                        </span>
                        <Link
                          href={`/tests/${act.testId}/result?attemptId=${act.id}`}
                          className="text-body-sm text-text-primary hover:text-primary-text font-medium transition-colors"
                        >
                          {act.testTitle}
                        </Link>
                        <span className="text-[12px] font-mono mt-1 text-text-secondary">
                          Score:{" "}
                          <span className={getScoreColor(score)}>
                            {score}/100
                          </span>{" "}
                          • {act.accuracy}% Acc
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-surface-high/40 border border-border/60 text-center flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-surface-highest/60 flex items-center justify-center text-text-muted mb-3">
                  <span className="material-symbols-outlined text-[20px]">history</span>
                </div>
                <h3 className="text-body-sm font-semibold text-text-primary mb-1">
                  No activity yet
                </h3>
                <p className="text-label-xs text-text-muted max-w-xs leading-relaxed">
                  Complete your baseline assessment to start building your placement profile and test history.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
