import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { profiles, users, attempts, tests } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { calculateReadiness, detectWeakAreas } from "@/server/readiness";
import { formatDate } from "@/lib/utils";
import { ProfileEditor } from "@/components/profile/profile-editor";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  // Fetch profile
  const userProfile = await db
    .select({
      id: profiles.id,
      userId: profiles.userId,
      name: profiles.name,
      avatarUrl: profiles.avatarUrl,
      college: profiles.college,
      branch: profiles.branch,
      graduationYear: profiles.graduationYear,
      preferredLanguage: profiles.preferredLanguage,
      email: users.email,
    })
    .from(profiles)
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(eq(profiles.userId, session.user.id))
    .limit(1);

  if (userProfile.length === 0) {
    notFound();
  }

  const profile = userProfile[0];

  // Fetch readiness & focus areas
  const readiness = await calculateReadiness(session.user.id);
  const weakAreas = await detectWeakAreas(session.user.id);

  // Strongest subject
  const sortedSubjects = [...readiness.subjectScores].sort(
    (a, b) => b.score - a.score
  );
  const strongestSkill = sortedSubjects[0]?.code || "N/A";
  const focusArea = weakAreas[0]?.subjectCode || "N/A";

  // Recent assessments
  const recentAttempts = await db
    .select({
      id: attempts.id,
      testId: attempts.testId,
      testTitle: tests.title,
      score: attempts.score,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(tests, eq(attempts.testId, tests.id))
    .where(
      and(
        eq(attempts.userId, session.user.id),
        eq(attempts.status, "submitted")
      )
    )
    .orderBy(desc(attempts.submittedAt))
    .limit(5);

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <h1 className="text-headline-lg font-bold text-text-primary">
            Developer Profile
          </h1>
          <p className="text-label-xs text-text-muted font-mono uppercase mt-1">
            /USERS/{profile.name.replace(/\s+/g, "_").toUpperCase()}/CONFIG
          </p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Col: Personal & Academic Profile (Span 4) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Identity Card */}
          <div className="bg-surface border border-border rounded-xl p-6 text-center space-y-4">
            <div className="w-24 h-24 rounded-full bg-surface-high border-2 border-primary/30 mx-auto flex items-center justify-center text-3xl font-bold font-mono text-primary-text">
              {profile.name.charAt(0)}
            </div>

            <div>
              <h2 className="text-title-md font-bold text-text-primary">
                {profile.name}
              </h2>
              <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-secondary/10 text-secondary text-label-xs font-mono font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                Available for Hire
              </div>
            </div>

            <div className="pt-4 border-t border-border space-y-2 text-left font-mono text-label-xs">
              <div className="flex justify-between">
                <span className="text-text-muted uppercase">Institution:</span>
                <span className="text-text-primary font-semibold truncate max-w-[160px]">
                  {profile.college || "NIT Silchar"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted uppercase">Branch:</span>
                <span className="text-text-primary font-semibold truncate max-w-[160px]">
                  {profile.branch || "Computer Science"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted uppercase">Grad Year:</span>
                <span className="text-text-primary font-semibold">
                  {profile.graduationYear || 2025}
                </span>
              </div>
            </div>
          </div>

          {/* Editable Personal Info Card */}
          <ProfileEditor initialProfile={profile} />
        </div>

        {/* Right Col: Placement Metrics & Preferences (Span 8) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Placement Profile Metrics Banner */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6 text-label-xs text-secondary font-mono uppercase font-bold">
              <span className="material-symbols-outlined text-[18px]">trending_up</span>
              Placement Profile
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div>
                <span className="text-label-xs text-text-muted uppercase font-mono block mb-1">
                  Overall Readiness
                </span>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold font-mono text-text-primary">
                    {readiness.readinessScore !== null
                      ? `${readiness.readinessScore}%`
                      : "--"}
                  </span>
                </div>
                <div className="w-full bg-surface-high h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-primary h-full"
                    style={{ width: `${readiness.readinessScore || 0}%` }}
                  />
                </div>
              </div>

              <div>
                <span className="text-label-xs text-text-muted uppercase font-mono block mb-1">
                  Strongest Skill
                </span>
                <div className="text-3xl font-bold font-mono text-primary-text flex items-center gap-2 mt-1">
                  <span className="material-symbols-outlined text-primary-text text-[24px]">
                    code
                  </span>
                  {strongestSkill}
                </div>
              </div>

              <div>
                <span className="text-label-xs text-text-muted uppercase font-mono block mb-1">
                  Current Focus Area
                </span>
                <div className="text-3xl font-bold font-mono text-tertiary flex items-center gap-2 mt-1">
                  <span className="material-symbols-outlined text-tertiary text-[24px]">
                    memory
                  </span>
                  {focusArea}
                </div>
              </div>
            </div>
          </div>

          {/* Environment Preferences */}
          <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-label-xs text-text-muted font-mono uppercase">
              <span className="material-symbols-outlined text-[18px]">tune</span>
              Environment Preferences
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-label-xs text-text-muted uppercase font-mono block mb-2">
                  Primary Language
                </span>
                <div className="flex gap-2">
                  {["C++", "Java", "Python"].map((lang) => {
                    const isSelected =
                      (profile.preferredLanguage || "C++").toLowerCase() ===
                      lang.toLowerCase();
                    return (
                      <span
                        key={lang}
                        className={`px-3 py-1.5 rounded font-mono text-label-xs font-semibold ${
                          isSelected
                            ? "bg-primary text-text-inverse border border-primary"
                            : "bg-surface-high border border-border text-text-muted"
                        }`}
                      >
                        {lang}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="text-label-xs text-text-muted uppercase font-mono block mb-2">
                  Target Role
                </span>
                <div className="p-2.5 rounded bg-surface-high border border-border text-body-sm text-text-primary font-mono truncate">
                  Software Development Engineer
                </div>
              </div>
            </div>
          </div>

          {/* Recent Assessments */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-title-md font-semibold text-text-primary">
                Recent Assessments
              </h3>
            </div>

            {recentAttempts.length > 0 ? (
              <div className="divide-y divide-border">
                {recentAttempts.map((att) => {
                  const score = att.score ?? 0;
                  return (
                    <div
                      key={att.id}
                      className="py-3 flex items-center justify-between text-body-sm"
                    >
                      <div className="truncate mr-4">
                        <span className="text-text-primary font-medium block truncate">
                          {att.testTitle}
                        </span>
                        <span className="text-label-xs text-text-muted font-mono">
                          {att.submittedAt ? formatDate(att.submittedAt) : "Recently"}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 font-mono text-label-xs flex-shrink-0">
                        <span className="font-bold text-text-primary">
                          {score}/100
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            score >= 70
                              ? "bg-secondary/10 text-secondary"
                              : "bg-tertiary/10 text-tertiary"
                          }`}
                        >
                          {score >= 70 ? "PASSED" : "REVIEW"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-body-sm text-text-muted py-4 text-center font-mono">
                No recent assessments taken yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
