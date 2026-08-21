import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getTestDetails } from "@/server/tests";
import { StartTestButton } from "@/components/tests/start-test-button";
import { formatDate, formatDuration } from "@/lib/utils";

export default async function TestDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: testId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  const test = await getTestDetails(testId, session.user.id);
  if (!test) notFound();

  return (
    <div className="space-y-8 pb-16">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-label-xs font-mono text-text-muted">
        <Link href="/tests" className="hover:text-text-primary transition-colors">
          Tests
        </Link>
        <span className="text-border">/</span>
        <span className="text-text-primary truncate">{test.title}</span>
      </div>

      {/* Header section with Start Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-label-xs px-2 py-0.5 rounded bg-primary/10 text-primary-text border border-primary/20 uppercase font-mono">
              {test.type.replace("_", " ")}
            </span>
            <span className="text-label-xs text-text-muted font-mono">
              ID: {test.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <h1 className="text-headline-lg font-bold text-text-primary">
            {test.title}
          </h1>
          <p className="text-body-md text-text-secondary mt-2 max-w-2xl leading-relaxed">
            {test.description}
          </p>
        </div>

        <div className="flex-shrink-0">
          <StartTestButton testId={test.id} />
        </div>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-5">
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

        <div className="bg-surface border border-border rounded-lg p-5">
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

        <div className="bg-surface border border-border rounded-lg p-5">
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

        <div className="bg-surface border border-border rounded-lg p-5">
          <span className="material-symbols-outlined text-text-muted text-[20px] mb-2 block">
            thermostat
          </span>
          <span className="text-3xl font-bold font-mono text-text-primary capitalize block">
            {test.difficulty || "Mixed"}
          </span>
          <span className="text-label-xs text-text-muted uppercase font-mono mt-1 block">
            Difficulty
          </span>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Col (Span 8) */}
        <div className="lg:col-span-8 space-y-8">
          {/* Subjects Covered */}
          <section className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary-text text-[20px]">
                category
              </span>
              <h3 className="text-title-md font-semibold text-text-primary">
                Subjects Covered
              </h3>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {test.subjects.map((subj) => (
                <span
                  key={subj.subjectId}
                  className="px-3 py-1.5 rounded bg-surface-high border border-border text-body-sm text-text-primary flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  {subj.name}
                </span>
              ))}
            </div>
          </section>

          {/* Before You Begin */}
          <section className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-6">
              <span className="material-symbols-outlined text-tertiary text-[20px]">
                info
              </span>
              <h3 className="text-title-md font-semibold text-text-primary">
                Before You Begin
              </h3>
            </div>

            <div className="space-y-4 text-body-sm text-text-secondary">
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
            </div>
          </section>
        </div>

        {/* Right Col (Span 4) */}
        <div className="lg:col-span-4">
          <section className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
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
                    className="py-3 flex items-center justify-between text-body-sm"
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

                    <div className="text-right">
                      {att.status === "submitted" ? (
                        <>
                          <span className="font-mono font-bold text-secondary">
                            {att.score}/100
                          </span>
                          <Link
                            href={`/tests/${test.id}/result?attemptId=${att.id}`}
                            className="block text-label-xs text-primary-text hover:text-primary transition-colors font-mono mt-0.5"
                          >
                            View Result →
                          </Link>
                        </>
                      ) : (
                        <Link
                          href={`/tests/${test.id}/attempt?attemptId=${att.id}`}
                          className="text-label-xs text-tertiary hover:underline font-mono"
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
                No previous attempts recorded for this test.
              </p>
            )}

            <div className="mt-6 pt-4 border-t border-border text-label-xs text-text-muted text-center font-mono">
              Only your highest score is considered for placement readiness.
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
