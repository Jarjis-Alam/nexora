import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTestDetails } from "@/server/tests";
import { StartTestButton } from "@/components/tests/start-test-button";
import { DuplicateTestButton } from "@/components/admin/duplicate-test-button";
import { formatDate, formatDateTime, formatDuration } from "@/lib/utils";

export default async function TestDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: testId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const isAdmin = Boolean((session.user as { isAdmin?: boolean })?.isAdmin);
  const test = await getTestDetails(testId, session.user.id, isAdmin);
  if (!test) notFound();

  const submittedAttemptCount = test.attempts.filter(
    (attempt) => attempt.status === "submitted"
  ).length;
  const hasInProgressAttempt = test.attempts.some(
    (attempt) => attempt.status === "in_progress"
  );
  const attemptLimit = test.attemptLimit ?? null;
  const attemptLimitReached =
    attemptLimit !== null && submittedAttemptCount >= attemptLimit;
  const hasInstructions = Boolean(
    test.instructions && test.instructions.trim() !== ""
  );

  return (
    <div className="space-y-8 pb-28 pr-28 lg:pr-0">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-label-xs font-mono text-text-muted">
        <Link href="/tests" className="hover:text-text-primary transition-colors">
          Tests
        </Link>
        <span className="text-border">/</span>
        <span className="text-text-primary truncate">{test.title}</span>
      </div>

      {/* Lifecycle Banners for Scheduled / Closed */}
      {test.effectiveStatus === "scheduled" && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 sm:p-5 flex items-start sm:items-center gap-4 text-text-primary">
          <span className="material-symbols-outlined text-[28px] text-primary shrink-0">event_upcoming</span>
          <div className="min-w-0">
            <h3 className="font-bold text-body-md text-primary-text">Scheduled Assessment</h3>
            <p className="text-body-sm text-text-secondary mt-0.5">
              This assessment is scheduled to open on{" "}
              <span className="font-mono text-text-primary font-medium">
                {test.scheduledStartAt ? formatDate(test.scheduledStartAt) : "the designated date"}
              </span>
              {test.scheduledStartAt && (
                <> at <span className="font-mono text-text-primary font-medium">{formatDateTime(test.scheduledStartAt).split(", ")[1]}</span></>
              )}
              {test.scheduleTimezone && ` (${test.scheduleTimezone})`}. Please return once the assessment starts to take your attempt.
            </p>
          </div>
        </div>
      )}

      {test.effectiveStatus === "closed" && !hasInProgressAttempt && (
        <div className="rounded-xl border border-border bg-surface-high p-4 sm:p-5 flex items-start sm:items-center gap-4 text-text-secondary">
          <span className="material-symbols-outlined text-[28px] text-text-muted shrink-0">lock_clock</span>
          <div className="min-w-0">
            <h3 className="font-bold text-body-md text-text-primary">Assessment Closed</h3>
            <p className="text-body-sm text-text-muted mt-0.5">
              The testing window for this assessment has concluded and new attempts are no longer accepted.
              {submittedAttemptCount > 0 && " You can review your past performance results below."}
            </p>
          </div>
        </div>
      )}

      {/* Header section with Start Button */}
      <div className="flex flex-col gap-6 border-b border-border pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="rounded border border-primary/20 bg-primary/10 px-2 py-1 text-label-xs font-mono uppercase text-primary-text">
              {test.type.replace("_", " ")}
            </span>
            <span className="text-label-xs font-mono text-text-muted">
              ID: {test.id.slice(0, 8).toUpperCase()}
            </span>
            {test.effectiveStatus === "scheduled" && (
              <span className="rounded border border-primary/30 bg-primary/20 px-2 py-1 text-label-xs font-mono font-bold uppercase text-primary-text">
                Scheduled
              </span>
            )}
            {test.effectiveStatus === "closed" && (
              <span className="rounded border border-border bg-surface-high px-2 py-1 text-label-xs font-mono font-bold uppercase text-text-muted">
                Closed
              </span>
            )}
            {test.negativeMarkingEnabled && (
              <span className="rounded border border-error/20 bg-error/10 px-2 py-1 text-label-xs font-mono font-bold uppercase text-error">
                Negative Marking: -{((Number(test.negativeMarkRate) || 0) * 100).toFixed(0)}%
              </span>
            )}
            {attemptLimit === null ? (
              <span className="rounded border border-border bg-surface-high px-2 py-1 text-label-xs font-mono uppercase text-text-muted">
                Unlimited attempts
              </span>
            ) : (
              <span className="rounded border border-secondary/20 bg-secondary/10 px-2 py-1 text-label-xs font-mono uppercase text-secondary">
                Attempts: {submittedAttemptCount} / {attemptLimit}
              </span>
            )}
          </div>
          <h1 className="break-words text-headline-lg font-bold text-text-primary">
            {test.title}
          </h1>
          {test.description ? (
            <p className="mt-2 max-w-2xl text-body-md leading-relaxed text-text-secondary">
              {test.description}
            </p>
          ) : (
            <p className="mt-2 text-body-sm text-text-muted">Description unavailable.</p>
          )}
          {test.type === "baseline" && (
            <p className="mt-3 flex items-center gap-2 text-body-sm text-primary-text">
              <span className="material-symbols-outlined text-[17px]">flag</span>
              Establish your starting placement-readiness benchmark.
            </p>
          )}
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-3">
          {isAdmin && (
            <DuplicateTestButton testId={test.id} testTitle={test.title} />
          )}
          <StartTestButton
            testId={test.id}
            hasInProgressAttempt={hasInProgressAttempt}
            attemptLimitReached={attemptLimitReached && !hasInProgressAttempt}
            requireAcknowledgement={
              hasInstructions && !hasInProgressAttempt && !attemptLimitReached
            }
            effectiveStatus={test.effectiveStatus}
          />
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 sm:gap-4">
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <span className="material-symbols-outlined text-text-muted text-[20px] mb-2 block">
            format_list_numbered
          </span>
          <span className="text-3xl font-bold font-mono text-text-primary block">
            {test.questionCount}
          </span>
          <span className="text-label-xs text-text-muted uppercase font-mono mt-1 block">
            Questions
          </span>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <span className="material-symbols-outlined text-text-muted text-[20px] mb-2 block">
            schedule
          </span>
          <span className="text-3xl font-bold font-mono text-text-primary block">
            {test.duration}
          </span>
          <span className="text-label-xs text-text-muted uppercase font-mono mt-1 block">
            Minutes
          </span>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <span className="material-symbols-outlined text-text-muted text-[20px] mb-2 block">
            emoji_events
          </span>
          <span className="text-3xl font-bold font-mono text-text-primary block">
            {test.totalMarks}
          </span>
          <span className="text-label-xs text-text-muted uppercase font-mono mt-1 block">
            Marks
          </span>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <span className="material-symbols-outlined text-text-muted text-[20px] mb-2 block">
            thermostat
          </span>
          <span className="text-3xl font-bold font-mono text-text-primary capitalize block">
            {test.difficulty || "Not set"}
          </span>
          <span className="text-label-xs text-text-muted uppercase font-mono mt-1 block">
            Difficulty
          </span>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Col (Span 8) */}
        <div className="space-y-6 lg:col-span-8 lg:space-y-8">
          {/* Subjects Covered */}
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-text text-[20px]">
                category
              </span>
              <h3 className="text-title-md font-semibold text-text-primary">
                Subjects Covered
              </h3>
            </div>

            {test.subjects.length > 0 ? (
              <div className="flex flex-wrap gap-2.5">
                {test.subjects.map((subj) => (
                <span
                  key={subj.subjectId}
                  className="flex items-center gap-2 rounded-lg border border-border bg-surface-high px-3 py-1.5 text-body-sm text-text-primary"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                  {subj.name}
                </span>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border px-4 py-5 text-body-sm text-text-muted">
                Curriculum details unavailable.
              </p>
            )}
          </section>

          {/* Test Sections Breakdown (Rendered when meaningful sections exist) */}
          {test.sections && test.sections.length > 0 && !(test.sections.length === 1 && test.sections[0].title === "General") && (
            <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary-text text-[20px]">
                    view_module
                  </span>
                  <h3 className="text-title-md font-semibold text-text-primary">
                    Assessment Sections
                  </h3>
                </div>
                <span className="text-label-xs font-mono uppercase text-text-muted">
                  {test.sections.length} sections
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {test.sections.map((sec) => (
                  <div
                    key={sec.id}
                    className="rounded-lg border border-border bg-surface-high p-4 flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-label-xs font-mono uppercase font-bold text-primary-text">
                          Part {sec.sectionOrder}
                        </span>
                        <span className="text-label-xs font-mono text-text-muted">
                          {sec.questionCount} {sec.questionCount === 1 ? "Question" : "Questions"}
                        </span>
                      </div>
                      <h4 className="text-body-sm font-semibold text-text-primary">
                        {sec.title}
                      </h4>
                      {sec.description && (
                        <p className="mt-1 text-label-xs text-text-secondary line-clamp-2">
                          {sec.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Test Instructions (Phase 7E) */}
          {hasInstructions && (
            <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-text text-[20px]">
                  menu_book
                </span>
                <h3 className="text-title-md font-semibold text-text-primary">
                  Test Instructions
                </h3>
              </div>
              <p className="whitespace-pre-wrap text-body-sm leading-relaxed text-text-secondary">
                {test.instructions}
              </p>
            </section>
          )}

          {/* Before You Begin */}
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-tertiary text-[20px]">
                info
              </span>
              <h3 className="text-title-md font-semibold text-text-primary">
                Before You Begin
              </h3>
            </div>

            <div className="grid gap-5 text-body-sm text-text-secondary sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-secondary text-[18px] mt-0.5">
                  check_circle
                </span>
                <p>
                  Ensure you have a stable internet connection. In case of page refresh or connection loss, your progress and timer will automatically restore.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-secondary text-[18px] mt-0.5">
                  check_circle
                </span>
                <p>
                  The exam timer runs continuously once started. When the timer hits 0:00, your exam will automatically submit for server-side evaluation.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-secondary text-[18px] mt-0.5">
                  check_circle
                </span>
                <p>
                  Questions can be single choice or multiple choice. You can mark questions for review and return to them anytime before final submission.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-secondary text-[18px] mt-0.5">
                  check_circle
                </span>
                <p>
                  Detailed explanations and correct answers are revealed immediately after test submission in your results report.
                </p>
              </div>

              {test.negativeMarkingEnabled && (
                <div className="flex items-start gap-3 sm:col-span-2 rounded-lg border border-error/20 bg-error/5 p-3 text-error">
                  <span className="material-symbols-outlined text-error text-[18px] mt-0.5">
                    warning
                  </span>
                  <p className="text-body-sm font-medium">
                    Negative marking is active: Incorrect answers deduct {((Number(test.negativeMarkRate) || 0) * 100).toFixed(0)}% of the question&apos;s marks. Unanswered questions do not incur any deduction.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right Col (Span 4) */}
        <div className="lg:col-span-4">
          <section className="rounded-xl border border-border bg-surface p-5 sm:p-6 lg:sticky lg:top-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-title-md font-semibold text-text-primary">
                Your Attempts
              </h3>
              <span className="text-label-xs px-2 py-0.5 rounded bg-surface-high border border-border font-mono text-text-muted">
                {test.attempts.length} Total
              </span>
            </div>

            {test.attempts.length > 0 ? (
              <div className="divide-y divide-border">
                {test.attempts.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between gap-4 py-4 text-body-sm"
                  >
                    <div>
                      <p className="text-text-primary font-medium">
                        {att.submittedAt ? formatDate(att.submittedAt) : "In Progress"}
                      </p>
                      <p className="text-label-xs text-text-muted font-mono">
                        {att.status === "submitted"
                          ? `Time: ${formatDuration(att.timeTaken || 0)}`
                          : "Active"}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      {att.status === "submitted" ? (
                        <>
                          <span className="font-mono font-bold text-secondary">
                            {att.score}/100
                          </span>
                          <Link
                            href={`/tests/${test.id}/result?attemptId=${att.id}`}
                            className="mt-1 block rounded px-1 py-0.5 text-label-xs font-mono text-primary-text transition-colors hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/60"
                          >
                            View Result →
                          </Link>
                        </>
                      ) : (
                        <Link
                          href={`/tests/${test.id}/attempt?attemptId=${att.id}`}
                          className="rounded px-1 py-0.5 text-label-xs font-mono text-tertiary hover:bg-tertiary/10 hover:underline focus:outline-none focus:ring-2 focus:ring-primary/60"
                        >
                          Resume →
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-text-muted py-4 text-center">
                No attempts yet. Start this assessment to establish your first result.
              </p>
            )}

            <div className="mt-6 border-t border-border pt-4 text-center text-label-xs font-mono text-text-muted">
              Only your highest score is considered for placement readiness.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
