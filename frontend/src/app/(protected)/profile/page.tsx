import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { profiles, users, attempts, tests } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { calculateReadiness, detectWeakAreas } from "@/server/readiness";
import { formatDate } from "@/lib/utils";
import { ProfileEditor } from "@/components/profile/profile-editor";
import { PlacementTargetsEditor } from "@/components/profile/placement-targets-editor";
import {
  getStudentPlacementTargets,
  searchCompanies,
  searchRoles,
} from "@/server/company-role-intelligence";

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
  const strongestSkill =
    readiness.hasCompletedBaseline && (sortedSubjects[0]?.score || 0) > 0
      ? sortedSubjects[0].code
      : null;
  const focusArea = weakAreas[0]?.subjectCode || null;

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
  // Fetch Placement Targets and catalog
  const placementTargets = await getStudentPlacementTargets(session.user.id);
  const allRoles = await searchRoles({ includeInactive: true, limit: 100 });
  const allCompanies = await searchCompanies({ includeInactive: true, limit: 100 });

  return (
    <div className="space-y-8 pb-28 pr-28 lg:pr-0">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-headline-lg font-bold text-text-primary">Student Profile</h1>
          <p className="mt-1 text-label-xs font-mono uppercase text-text-muted">NEXORA / PLACEMENT PROFILE</p>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Col: Personal & Academic Profile (Span 4) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Identity Card */}
          <div className="rounded-xl border border-border bg-surface p-6 text-center">
            <div
              role="img"
              aria-label={`${profile.name} profile`}
              className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-primary/30 bg-surface-high bg-cover bg-center text-3xl font-bold font-mono text-primary-text"
              style={profile.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})` } : undefined}
            >
              {!profile.avatarUrl && profile.name.charAt(0).toUpperCase()}
            </div>

            <div className="mt-4">
              <h2 className="text-title-md font-bold text-text-primary">{profile.name}</h2>
              <p className="mt-1 break-all text-body-sm text-text-secondary">{profile.email}</p>
              <p className="mt-2 text-label-xs font-mono uppercase text-text-muted">
                {profile.branch || "Academic details not set"}
              </p>
            </div>

            <div className="mt-5 space-y-2 border-t border-border pt-4 text-left font-mono text-label-xs">
              <div className="flex items-start justify-between gap-4">
                <span className="uppercase text-text-muted">Institution</span>
                <span className="max-w-[160px] text-right font-semibold text-text-primary">
                  {profile.college || "Not set"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="uppercase text-text-muted">Branch</span>
                <span className="max-w-[160px] text-right font-semibold text-text-primary">
                  {profile.branch || "Not set"}
                </span>
              </div>
              <div className="flex items-start justify-between gap-4">
                <span className="uppercase text-text-muted">Graduation Year</span>
                <span className="font-semibold text-text-primary">{profile.graduationYear || "Not set"}</span>
              </div>
            </div>
          </div>

          {/* Editable Personal Info Card */}
          <ProfileEditor initialProfile={profile} />
        </div>

        {/* Right Col: Placement Metrics & Preferences (Span 8) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Placement Profile Metrics Banner */}
          <div className="rounded-xl border border-primary/20 bg-surface p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-6 text-label-xs text-secondary font-mono uppercase font-bold">
              <span className="material-symbols-outlined text-[18px]">trending_up</span>
              Placement Profile
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 sm:gap-6">
              <div>
                <span className="text-label-xs text-text-muted uppercase font-mono block mb-1">
                  Overall Readiness
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold font-mono text-text-primary">
                    {readiness.readinessScore !== null
                      ? `${readiness.readinessScore}%`
                      : "--"}
                  </span>
                  <span className="text-label-xs font-mono uppercase text-primary-text">
                    {readiness.level?.label || "Not assessed"}
                  </span>
                </div>
                <div className="w-full bg-surface-high h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-primary h-full"
                    style={{ width: `${readiness.readinessScore || 0}%` }}
                  />
                </div>
              </div>

              <div className="border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                <span className="text-label-xs text-text-muted uppercase font-mono block mb-1">
                  Strongest Skill
                </span>
                <div className="text-3xl font-bold font-mono text-primary-text flex items-center gap-2 mt-1">
                  <span className="material-symbols-outlined text-primary-text text-[24px]">
                    code
                  </span>
                  {strongestSkill || "Not established yet"}
                </div>
              </div>

              <div className="border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                <span className="text-label-xs text-text-muted uppercase font-mono block mb-1">
                  Current Focus Area
                </span>
                <div className="text-3xl font-bold font-mono text-tertiary flex items-center gap-2 mt-1">
                  <span className="material-symbols-outlined text-tertiary text-[24px]">
                    memory
                  </span>
                  {focusArea || "Not established yet"}
                </div>
              </div>
            </div>
          </div>

          {/* Placement Roadmap Entry (Phase 12) */}
          <div className="rounded-xl border border-border bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                <span className="material-symbols-outlined text-[18px]">alt_route</span>
              </div>
              <div>
                <span className="text-body-sm font-semibold text-text-primary block">
                  Your Placement Roadmap
                </span>
                <span className="text-[12px] font-mono text-text-muted block">
                  Personalized preparation sequence based on your readiness and targets.
                </span>
              </div>
            </div>
            <Link
              href="/roadmap"
              id="profile-view-roadmap-btn"
              className="px-4 py-2 rounded-lg bg-surface-high border border-primary/30 text-primary-text hover:bg-surface-highest text-[12px] font-mono font-medium transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto flex-shrink-0"
            >
              <span>View Roadmap</span>
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>
          </div>

          {/* Target Strategy Entry (Phase 16) */}
          <div className="rounded-xl border border-primary/30 bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center text-primary flex-shrink-0">
                <span className="material-symbols-outlined text-[18px]">crosshair</span>
              </div>
              <div>
                <span className="text-body-sm font-semibold text-text-primary block">
                  Target Strategy Engine
                </span>
                <span className="text-[12px] font-mono text-text-muted block">
                  Requirement matrix, gap analysis, and tailored preparation priorities.
                </span>
              </div>
            </div>
            <Link
              href="/target"
              id="profile-view-target-strategy-btn"
              className="px-4 py-2 rounded-lg bg-primary text-text-inverse hover:bg-primary-text text-[12px] font-mono font-semibold transition-colors inline-flex items-center gap-1.5 self-start sm:self-auto flex-shrink-0 shadow-sm"
            >
              <span>View Target Strategy</span>
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>
          </div>

          {/* Placement Targets (Phase 11A) */}
          <PlacementTargetsEditor
            initialTargets={placementTargets}
            allRoles={allRoles}
            allCompanies={allCompanies}
          />

          {/* Environment Preferences */}
          <div className="space-y-4 rounded-xl border border-border bg-surface p-5 sm:p-6">
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
                        className={`rounded border px-3 py-1.5 font-mono text-label-xs font-semibold ${
                          isSelected
                            ? "border-primary bg-primary text-text-inverse"
                            : "border-border bg-surface-high text-text-muted"
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
                <div className="rounded border border-border bg-surface-high p-2.5 text-body-sm font-mono text-text-primary">
                  {placementTargets.primaryRole ? (
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{placementTargets.primaryRole.name}</span>
                      <span className="text-[10px] text-primary uppercase font-mono px-1.5 py-0.5 rounded bg-primary/10">
                        Configured
                      </span>
                    </div>
                  ) : (
                    <span className="text-text-muted">Not set</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Recent Assessments */}
          <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-title-md font-semibold text-text-primary">
                Recent Assessments
              </h3>
              <span className="text-label-xs font-mono uppercase text-text-muted">{recentAttempts.length} recorded</span>
            </div>

            {recentAttempts.length > 0 ? (
              <div className="divide-y divide-border">
                {recentAttempts.map((att) => {
                  const score = att.score ?? 0;
                  return (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-4 py-3 text-body-sm"
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
                          className={`rounded border px-2 py-0.5 font-bold ${
                            score >= 70
                              ? "border-secondary/20 bg-secondary/10 text-secondary"
                              : "border-tertiary/20 bg-tertiary/10 text-tertiary"
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
                No assessments completed yet. Start your baseline assessment to begin tracking readiness.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
