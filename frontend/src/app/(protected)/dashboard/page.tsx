import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { profiles, tests, attempts } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { calculateReadiness, detectWeakAreas } from "@/server/readiness";
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

  // 3. Calculate readiness & weak areas from real submitted attempts
  const readiness = await calculateReadiness(userId);
  const weakAreas = await detectWeakAreas(userId);

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
  const readinessValue = readiness.readinessScore ?? 0;
  const strokeDashoffset = readiness.hasCompletedBaseline
    ? circumference - (readinessValue / 100) * circumference
    : circumference;

  return (
    <div className="space-y-10 pb-16">
      {/* Header */}
      <header>
        <h2 className="text-headline-lg font-bold text-text-primary">
          {getGreeting()}, {userName.split(" ")[0]}.
        </h2>
        <p className="text-body-md text-text-secondary mt-1">
          Let&apos;s get you placement ready.
        </p>
      </header>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (Span 8) */}
        <div className="lg:col-span-8 space-y-8">
          {/* Placement Readiness Card */}
          <section className="bg-surface border border-border rounded-xl p-8 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden shadow-sm">
            {/* Ambient background glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />

            {/* Circular Progress Ring */}
            <div className="relative w-48 h-48 flex-shrink-0">
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
                {readiness.hasCompletedBaseline ? (
                  <>
                    <span className="text-headline-xl font-bold font-mono text-text-primary leading-none">
                      {readiness.readinessScore}%
                    </span>
                    <span
                      className={`text-label-xs font-semibold mt-1 uppercase ${
                        readiness.level?.color || "text-primary-text"
                      }`}
                    >
                      {readiness.level?.label || "COMPETITIVE"}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-xl font-bold font-mono text-text-muted leading-none">
                      --%
                    </span>
                    <span className="text-label-xs text-text-muted mt-1 uppercase">
                      UNCALIBRATED
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Card Content & CTAs */}
            <div className="flex-1 text-center md:text-left z-10">
              <h3 className="text-title-md font-semibold text-text-primary mb-2">
                Placement Readiness Score
              </h3>
              <p className="text-body-sm text-text-secondary mb-6 leading-relaxed">
                {readiness.hasCompletedBaseline
                  ? "Based on your recent assessment and test performance. You are currently indexing against standard peer cohorts."
                  : "Complete your baseline assessment to calculate your placement readiness across all 7 technical subject domains."}
              </p>

              <div className="flex flex-wrap gap-4 justify-center md:justify-start">
                {readiness.hasCompletedBaseline ? (
                  <Link
                    href="/tests"
                    className="bg-primary text-text-inverse font-medium text-body-sm px-6 py-2.5 rounded hover:bg-primary-text transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">play_arrow</span>
                    Resume Prep
                  </Link>
                ) : (
                  <Link
                    href={baselineTestId ? `/tests/${baselineTestId}` : "/assessment"}
                    className="bg-primary text-text-inverse font-medium text-body-sm px-6 py-2.5 rounded hover:bg-primary-text transition-colors flex items-center gap-2 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[18px]">assignment</span>
                    Start Baseline Assessment
                  </Link>
                )}

                <Link
                  href="/analytics"
                  className="bg-surface-high border border-border text-text-primary font-medium text-body-sm px-6 py-2.5 rounded hover:bg-surface-highest transition-colors"
                >
                  View Detailed Report
                </Link>
              </div>
            </div>
          </section>

          {/* Skill Overview Bento Grid */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-title-md font-semibold text-text-primary">
                Skill Overview
              </h3>
              <Link
                href="/analytics"
                className="text-primary-text font-body-sm hover:text-primary transition-colors flex items-center gap-1"
              >
                View All Skills
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {readiness.subjectScores.slice(0, 5).map((subj) => {
                const subRadius = 16;
                const subCirc = 2 * Math.PI * subRadius;
                const subOffset = readiness.hasCompletedBaseline
                  ? subCirc - (subj.score / 100) * subCirc
                  : subCirc;

                const skillLevel = getSkillLevel(subj.score);

                return (
                  <div
                    key={subj.subjectId}
                    className="bg-surface border border-border rounded-lg p-5 flex flex-col items-center text-center hover:bg-surface-high hover:border-border-variant transition-all cursor-default"
                  >
                    <div className="relative w-16 h-16 mb-4">
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <circle
                          cx="18"
                          cy="18"
                          fill="none"
                          r={subRadius}
                          stroke="#1A1A1A"
                          strokeWidth="3"
                        />
                        <circle
                          className="text-primary circle-progress"
                          cx="18"
                          cy="18"
                          fill="none"
                          r={subRadius}
                          stroke="currentColor"
                          strokeDasharray={subCirc}
                          strokeDashoffset={subOffset}
                          strokeWidth="3"
                        />
                      </svg>
                      <span className="absolute inset-0 flex items-center justify-center text-label-xs font-mono font-bold text-text-primary">
                        {readiness.hasCompletedBaseline ? subj.score : "--"}
                      </span>
                    </div>

                    <span className="text-body-sm text-text-primary font-medium mb-1.5 truncate max-w-full">
                      {subj.code === "APT" ? "Quant Aptitude" : subj.code}
                    </span>

                    <span
                      className={`text-label-xs px-2 py-0.5 rounded font-mono ${
                        readiness.hasCompletedBaseline
                          ? `${skillLevel.bgClass} ${skillLevel.colorClass}`
                          : "bg-surface-high text-text-muted"
                      }`}
                    >
                      {readiness.hasCompletedBaseline ? subj.status : "UNTESTED"}
                    </span>
                  </div>
                );
              })}

              {/* Add Skill / Explore Tests Tile */}
              <Link
                href="/tests"
                className="bg-surface border border-border border-dashed rounded-lg p-5 flex flex-col items-center justify-center text-center hover:bg-surface-high hover:border-primary-text transition-colors group"
              >
                <span className="material-symbols-outlined text-text-muted mb-2 group-hover:text-primary-text transition-colors text-[32px]">
                  quiz
                </span>
                <span className="text-body-sm text-text-secondary group-hover:text-text-primary transition-colors font-medium">
                  Take Practice Tests
                </span>
              </Link>
            </div>
          </section>

          {/* Critical Focus Areas (Weak Areas) */}
          <section>
            <h3 className="text-title-md font-semibold text-text-primary mb-4">
              Critical Focus Areas
            </h3>

            {weakAreas.length > 0 ? (
              <div className="flex flex-col gap-3">
                {weakAreas.map((wa) => (
                  <div
                    key={wa.topicId}
                    className="bg-surface border border-border rounded-lg p-4 flex items-center justify-between hover:border-border-variant transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded flex items-center justify-center border ${
                          wa.priority === "HIGH"
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
                        <h4 className="text-body-sm text-text-primary font-medium">
                          {wa.topicName}
                        </h4>
                        <p className="text-label-xs text-text-muted mt-1 font-mono">
                          {wa.subjectCode} • {wa.accuracy}% accuracy ({wa.totalAttempts} attempts)
                        </p>
                      </div>
                    </div>

                    <Link
                      href="/tests"
                      className="text-primary-text font-label-xs uppercase hover:bg-primary/10 px-3 py-1.5 rounded transition-colors hidden sm:block font-semibold"
                    >
                      Practice Topic
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-lg p-6 text-center">
                <span className="material-symbols-outlined text-text-muted text-[32px] mb-2">
                  verified
                </span>
                <p className="text-body-sm text-text-secondary">
                  {readiness.hasCompletedBaseline
                    ? "No critical weak areas detected! Keep taking practice tests to maintain consistency."
                    : "Complete your baseline assessment and mock tests to isolate specific weak topics."}
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Right Column (Span 4) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Actions */}
          <section className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-title-md font-semibold text-text-primary mb-4">
              Quick Actions
            </h3>
            <div className="flex flex-col gap-3">
              <Link
                href="/tests"
                className="w-full bg-primary text-text-inverse font-medium text-body-sm py-2.5 px-4 rounded hover:bg-primary-text transition-colors flex items-center justify-between group"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">quiz</span>
                  Take Mock Test
                </span>
                <span className="material-symbols-outlined text-[18px] opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                  arrow_forward
                </span>
              </Link>

              <Link
                href="/tests"
                className="w-full bg-surface-high border border-border text-text-primary font-medium text-body-sm py-2.5 px-4 rounded hover:bg-surface-highest transition-colors flex items-center justify-between group"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">list_alt</span>
                  View All Tests
                </span>
                <span className="material-symbols-outlined text-[18px] opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                  arrow_forward
                </span>
              </Link>

              <Link
                href="/analytics"
                className="w-full bg-surface-high border border-border text-text-primary font-medium text-body-sm py-2.5 px-4 rounded hover:bg-surface-highest transition-colors flex items-center justify-between group"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">insights</span>
                  View Analytics
                </span>
                <span className="material-symbols-outlined text-[18px] opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all">
                  arrow_forward
                </span>
              </Link>
            </div>
          </section>

          {/* Recent Activity Timeline */}
          <section className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-title-md font-semibold text-text-primary mb-6">
              Recent Activity
            </h3>

            {recentActivity.length > 0 ? (
              <div className="relative border-l border-border ml-3 space-y-6 pb-2">
                {recentActivity.map((act) => {
                  const score = act.score ?? 0;
                  const dotColor =
                    score >= 75
                      ? "bg-secondary"
                      : score >= 50
                      ? "bg-primary-text"
                      : "bg-error";

                  return (
                    <div key={act.id} className="relative pl-6">
                      <div
                        className={`absolute w-3 h-3 ${dotColor} rounded-full -left-[6.5px] top-1.5 ring-4 ring-surface`}
                      />
                      <div className="flex flex-col">
                        <span className="text-label-xs text-text-muted mb-0.5 font-mono">
                          {act.submittedAt ? formatDateTime(act.submittedAt) : "Recently"}
                        </span>
                        <Link
                          href={`/tests/${act.testId}/result?attemptId=${act.id}`}
                          className="text-body-sm text-text-primary hover:text-primary-text font-medium transition-colors"
                        >
                          {act.testTitle}
                        </Link>
                        <span className="text-code-sm font-mono mt-1 text-text-secondary">
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
              <div className="text-center py-6">
                <span className="material-symbols-outlined text-text-muted text-[28px] mb-2">
                  history
                </span>
                <p className="text-body-sm text-text-secondary">
                  No tests completed yet. Start your baseline assessment to begin tracking activity.
                </p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
