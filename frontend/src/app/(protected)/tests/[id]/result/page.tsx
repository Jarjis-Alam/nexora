import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  attempts,
  tests,
  answers,
  questions,
  subjects,
  topics,
  skillScores,
  testSections,
  testQuestions,
  attemptQuestions,
} from "@/db/schema";
import { eq, and, desc, asc, isNull, sql } from "drizzle-orm";
import { formatDuration, formatScore } from "@/lib/utils";
import { DetailedReviewTable } from "@/components/assessment/detailed-review-table";
import { getDailyExecutionPlan } from "@/server/placement-execution";

export default async function AssessmentResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ attemptId?: string }>;
}) {
  const { id: testId } = await params;
  const { attemptId } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  // Fetch attempt
  const conditions = [
    eq(attempts.testId, testId),
    eq(attempts.userId, session.user.id),
  ];
  if (attemptId) {
    conditions.push(eq(attempts.id, attemptId));
  }

  const attemptRows = await db
    .select({
      id: attempts.id,
      testId: attempts.testId,
      status: attempts.status,
      score: attempts.score,
      accuracy: attempts.accuracy,
      timeTaken: attempts.timeTaken,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
      testTitle: tests.title,
      testType: tests.type,
      totalMarks: tests.totalMarks,
      negativeMarkingEnabled: attempts.negativeMarkingEnabled,
      negativeMarkRate: attempts.negativeMarkRate,
      testNegativeMarkingEnabled: tests.negativeMarkingEnabled,
      testNegativeMarkRate: tests.negativeMarkRate,
    })
    .from(attempts)
    .innerJoin(tests, eq(attempts.testId, tests.id))
    .where(and(...conditions))
    .orderBy(desc(attempts.submittedAt))
    .limit(1);

  if (attemptRows.length === 0) {
    notFound();
  }

  const attempt = attemptRows[0];

  // Security guard: If attempt is still active / in_progress, redirect back to the exam engine
  if (attempt.status === "in_progress") {
    redirect(`/tests/${testId}/attempt`);
  }

  // 0. Fetch Placement Execution OS Daily Plan
  const dailyPlan = await getDailyExecutionPlan(session.user.id);

  // 1. Fetch per-subject skill breakdown for this attempt
  const subjectScores = await db
    .select({
      subjectId: skillScores.subjectId,
      score: skillScores.score,
      total: skillScores.total,
      accuracy: skillScores.accuracy,
      subjectName: subjects.name,
      subjectCode: subjects.code,
    })
    .from(skillScores)
    .innerJoin(subjects, eq(skillScores.subjectId, subjects.id))
    .where(
      and(
        eq(skillScores.attemptId, attempt.id),
        isNull(skillScores.topicId)
      )
    );

  // 2. Fetch all questions and student answers with correct answers & explanations (NOW SECURELY REVEALED POST-SUBMISSION)
  // Hybrid resolver: Use persisted attempt_questions if present; fallback to test_questions for legacy attempts.
  const attemptQuestionCountRes = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(attemptQuestions)
    .where(eq(attemptQuestions.attemptId, attempt.id));
  const hasAttemptQuestions = (attemptQuestionCountRes[0]?.count ?? 0) > 0;

  const questionRows = hasAttemptQuestions
    ? await db
        .select({
          questionId: questions.id,
          question: questions.question,
          questionType: questions.questionType,
          options: questions.options,
          correctAnswer: questions.correctAnswer,
          explanation: questions.explanation,
          marks: questions.marks,
          difficulty: questions.difficulty,
          subjectName: subjects.name,
          subjectCode: subjects.code,
          topicName: topics.name,
          order: attemptQuestions.questionOrder,
          sectionId: testSections.id,
          sectionTitle: testSections.title,
          sectionOrder: testSections.sectionOrder,
          selectedAnswer: answers.selectedAnswer,
          isCorrect: answers.isCorrect,
          timeSpent: answers.timeSpent,
          optionOrder: attemptQuestions.optionOrder,
          questionTextSnapshot: attemptQuestions.questionTextSnapshot,
          questionTypeSnapshot: attemptQuestions.questionTypeSnapshot,
          marksSnapshot: attemptQuestions.marksSnapshot,
          optionsSnapshot: attemptQuestions.optionsSnapshot,
          correctAnswerSnapshot: attemptQuestions.correctAnswerSnapshot,
        })
        .from(attemptQuestions)
        .innerJoin(questions, eq(attemptQuestions.questionId, questions.id))
        .innerJoin(subjects, eq(questions.subjectId, subjects.id))
        .innerJoin(topics, eq(questions.topicId, topics.id))
        .leftJoin(testSections, eq(attemptQuestions.sectionId, testSections.id))
        .leftJoin(
          answers,
          and(
            eq(answers.questionId, questions.id),
            eq(answers.attemptId, attempt.id)
          )
        )
        .where(eq(attemptQuestions.attemptId, attempt.id))
        .orderBy(asc(attemptQuestions.questionOrder))
    : await db
        .select({
          questionId: questions.id,
          question: questions.question,
          questionType: questions.questionType,
          options: questions.options,
          correctAnswer: questions.correctAnswer,
          explanation: questions.explanation,
          marks: questions.marks,
          difficulty: questions.difficulty,
          subjectName: subjects.name,
          subjectCode: subjects.code,
          topicName: topics.name,
          order: testQuestions.questionOrder,
          sectionId: testSections.id,
          sectionTitle: testSections.title,
          sectionOrder: testSections.sectionOrder,
          selectedAnswer: answers.selectedAnswer,
          isCorrect: answers.isCorrect,
          timeSpent: answers.timeSpent,
          optionOrder: sql<null>`null`.as("optionOrder"),
          questionTextSnapshot: sql<null>`null`.as("questionTextSnapshot"),
          questionTypeSnapshot: sql<null>`null`.as("questionTypeSnapshot"),
          marksSnapshot: sql<null>`null`.as("marksSnapshot"),
          optionsSnapshot: sql<null>`null`.as("optionsSnapshot"),
          correctAnswerSnapshot: sql<null>`null`.as("correctAnswerSnapshot"),
        })
        .from(testQuestions)
        .innerJoin(questions, eq(testQuestions.questionId, questions.id))
        .innerJoin(subjects, eq(questions.subjectId, subjects.id))
        .innerJoin(topics, eq(questions.topicId, topics.id))
        .leftJoin(testSections, eq(testQuestions.sectionId, testSections.id))
        .leftJoin(
          answers,
          and(
            eq(answers.questionId, questions.id),
            eq(answers.attemptId, attempt.id)
          )
        )
        .where(eq(testQuestions.testId, testId))
        .orderBy(asc(testSections.sectionOrder), asc(testQuestions.questionOrder));

  const reviewQuestions = questionRows.map((q) => {
    const rawOptions =
      ((q as any).optionsSnapshot as string[] | null) ||
      (q.options as string[] | null) ||
      [];
    const rawCorrect =
      (q as any).correctAnswerSnapshot !== null &&
      (q as any).correctAnswerSnapshot !== undefined
        ? (q as any).correctAnswerSnapshot
        : q.correctAnswer;
    const optionOrder = (q as any).optionOrder as string[] | null;
    const questionTextSnapshot = (q as any).questionTextSnapshot as string | null;
    const questionTypeSnapshot = (q as any).questionTypeSnapshot as
      | "single_choice"
      | "multiple_choice"
      | null;
    const marksSnapshot = (q as any).marksSnapshot as number | null;

    let presentationOptions: any = rawOptions;
    if (optionOrder && Array.isArray(optionOrder) && optionOrder.length > 0) {
      presentationOptions = optionOrder.map((optId) => {
        const idx = parseInt(optId.replace("opt_", ""), 10);
        return {
          id: optId,
          text: rawOptions[idx] ?? "",
        };
      });
    }

    return {
      ...q,
      question: questionTextSnapshot ?? q.question,
      questionType: questionTypeSnapshot ?? q.questionType,
      marks: marksSnapshot ?? q.marks,
      options: presentationOptions,
      correctAnswer: rawCorrect,
    };
  });

  const totalQuestions = reviewQuestions.length;
  const correctCount = reviewQuestions.filter((q) => q.isCorrect === true).length;
  const answeredCount = reviewQuestions.filter(
    (q) => q.selectedAnswer !== null && q.selectedAnswer !== undefined
  ).length;
  const incorrectCount = answeredCount - correctCount;
  const unansweredCount = totalQuestions - answeredCount;

  const isNegativeMarkingActive = attempt.negativeMarkingEnabled ?? attempt.testNegativeMarkingEnabled ?? false;
  const penaltyRate = isNegativeMarkingActive ? Number(attempt.negativeMarkRate ?? attempt.testNegativeMarkRate ?? 0) : 0;

  // 3. Compute section-level breakdown from graded questionRows
  const sectionBreakdownMap = new Map<
    string,
    {
      id: string;
      title: string;
      order: number;
      totalQuestions: number;
      correctCount: number;
      totalMarks: number;
      earnedMarks: number;
    }
  >();

  reviewQuestions.forEach((q) => {
    const secId = q.sectionId || "default";
    const secTitle = q.sectionTitle || "General";
    const secOrder = q.sectionOrder ?? 1;

    if (!sectionBreakdownMap.has(secId)) {
      sectionBreakdownMap.set(secId, {
        id: secId,
        title: secTitle,
        order: secOrder,
        totalQuestions: 0,
        correctCount: 0,
        totalMarks: 0,
        earnedMarks: 0,
      });
    }

    const sec = sectionBreakdownMap.get(secId)!;
    sec.totalQuestions++;
    sec.totalMarks += q.marks || 1;
    const hasAnswered = q.selectedAnswer !== null && q.selectedAnswer !== undefined;
    if (hasAnswered) {
      if (q.isCorrect === true) {
        sec.correctCount++;
        sec.earnedMarks += q.marks || 1;
      } else if (isNegativeMarkingActive && penaltyRate > 0) {
        sec.earnedMarks -= Math.round(((q.marks || 1) * penaltyRate + Number.EPSILON) * 100) / 100;
      }
    }
  });

  const sectionBreakdowns = Array.from(sectionBreakdownMap.values()).sort(
    (a, b) => a.order - b.order
  );

  const sortedSubjects = [...subjectScores].sort((a, b) => a.accuracy - b.accuracy);
  const weakestSubject = sortedSubjects.length > 0 ? sortedSubjects[0] : null;

  const matchingAction = dailyPlan.actions.find(
    (a) =>
      a.practiceTarget?.testId === testId ||
      reviewQuestions.some((q) => q.topicName === a.topic)
  );
  const nextAction = dailyPlan.actions.find(
    (a) => a.status !== "COMPLETED" && a.id !== matchingAction?.id
  );

  return (
    <div className="space-y-8 pb-28 pr-28 lg:pr-0">
      {/* Top Header */}
      <div className="flex flex-col gap-6 border-b border-border pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="rounded border border-secondary/20 bg-secondary/10 px-2 py-1 text-label-xs font-mono font-bold uppercase text-secondary">
              COMPLETED
            </span>
            <span className="text-label-xs font-mono text-text-muted">
              ID: {attempt.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <h1 className="max-w-3xl break-words text-headline-lg font-bold text-text-primary">
            {attempt.testTitle}
          </h1>
          <p className="mt-1 text-body-md text-text-secondary">Assessment Results</p>
          {attempt.testType === "baseline" && (
            <p className="mt-3 flex items-center gap-2 text-body-sm text-primary-text">
              <span className="material-symbols-outlined text-[17px]">flag</span>
              Initial placement benchmark recorded.
            </p>
          )}
          {isNegativeMarkingActive && penaltyRate > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-error/20 bg-error/10 px-3 py-1.5 text-body-xs font-mono text-error">
              <span className="material-symbols-outlined text-[16px]">warning</span>
              <span>Negative Marking Applied: -{(penaltyRate * 100).toFixed(0)}% on incorrect answers (Unanswered: 0)</span>
            </div>
          )}
        </div>

        {/* Score & Accuracy banner */}
        <div className="flex w-full max-w-xl items-center justify-between gap-5 rounded-xl border border-border bg-surface px-5 py-4 sm:gap-8 sm:px-6 xl:w-auto">
          <div className="text-left sm:text-right">
            <div className="flex items-baseline gap-1 font-mono">
              <span className="text-4xl font-bold text-primary-text">
                {attempt.score ?? 0}
              </span>
              <span className="text-text-muted text-sm">/ 100</span>
            </div>
            <span className="mt-0.5 block text-label-xs font-mono uppercase text-text-muted">
              Overall Score
            </span>
          </div>

          <div className="h-12 w-px bg-border" />

          <div className="text-right">
            <span className="block text-4xl font-bold font-mono text-secondary">
              {attempt.accuracy ?? 0}%
            </span>
            <span className="mt-0.5 block text-label-xs font-mono uppercase text-text-muted">
              Accuracy
            </span>
          </div>
          <p className="hidden max-w-[10rem] text-right text-label-xs leading-relaxed text-text-muted sm:block">
            {answeredCount > 0
              ? `${correctCount} of ${answeredCount} answered correctly`
              : "No questions answered"}
          </p>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {/* Correct */}
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <span className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Correct
          </span>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-3xl font-bold text-secondary">{correctCount}</span>
            <span className="text-text-muted text-sm">/ {totalQuestions}</span>
          </div>
        </div>

        {/* Incorrect */}
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <span className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Incorrect
          </span>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-3xl font-bold text-error">{incorrectCount}</span>
            <span className="text-text-muted text-sm">/ {totalQuestions}</span>
          </div>
          {isNegativeMarkingActive && penaltyRate > 0 && incorrectCount > 0 && (
            <span className="mt-1 block text-[11px] font-mono text-error/80">
              Penalized at {(penaltyRate * 100).toFixed(0)}%
            </span>
          )}
        </div>

        {/* Unanswered */}
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <span className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Unanswered
          </span>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-3xl font-bold text-tertiary">{unansweredCount}</span>
            <span className="text-text-muted text-sm">/ {totalQuestions}</span>
          </div>
        </div>

        {/* Time Taken */}
        <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
          <span className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Time Taken
          </span>
          <div className="font-mono text-3xl font-bold text-text-primary">
            {formatDuration(attempt.timeTaken || 0)}
          </div>
        </div>
      </div>

      {/* Section Performance Breakdown (Phase 6C) */}
      {sectionBreakdowns.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-text text-[20px]">
                view_week
              </span>
              <h3 className="text-title-md font-semibold text-text-primary">
                Section Performance
              </h3>
            </div>
            <span className="text-label-xs font-mono uppercase text-text-muted">
              {sectionBreakdowns.length} {sectionBreakdowns.length === 1 ? "Section" : "Sections"}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sectionBreakdowns.map((sec) => {
              const accuracy =
                sec.totalQuestions > 0
                  ? Math.round((sec.correctCount / sec.totalQuestions) * 100)
                  : 0;
              return (
                <div
                  key={sec.id}
                  className="rounded-lg border border-border/70 bg-base/40 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-body-sm font-semibold text-text-primary truncate">
                      {sec.title}
                    </span>
                    <span className="font-mono text-label-xs text-primary-text font-bold shrink-0">
                      {sec.correctCount} / {sec.totalQuestions} ({accuracy}%)
                    </span>
                  </div>

                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-high">
                    <div
                      className={`h-full ${
                        accuracy >= 75
                          ? "bg-secondary"
                          : accuracy >= 50
                          ? "bg-primary"
                          : "bg-tertiary"
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, accuracy))}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-label-xs font-mono text-text-muted">
                    <span>Marks: {formatScore(Math.max(0, sec.earnedMarks))} / {sec.totalMarks}</span>
                    <span>Order #{sec.order}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Subject Breakdown */}
      {subjectScores.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary-text text-[20px]">
              bar_chart
            </span>
            <h3 className="text-title-md font-semibold text-text-primary">
              Subject Breakdown
            </h3>
            </div>
            <span className="text-label-xs font-mono uppercase text-text-muted">
              {subjectScores.length} domains
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {subjectScores.map((s) => (
              <div key={s.subjectId} className="rounded-lg border border-border/70 bg-base/40 p-3.5">
                <div className="flex min-w-0 items-center justify-between gap-3 text-body-sm">
                  <span className="min-w-0 text-text-primary font-medium">{s.subjectName}</span>
                  <span className="shrink-0 text-primary-text font-mono font-bold">
                    {Math.round(s.accuracy)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-high">
                  <div
                    className={`h-full ${
                      s.accuracy >= 75
                        ? "bg-secondary"
                        : s.accuracy >= 50
                        ? "bg-primary"
                        : "bg-tertiary"
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, s.accuracy))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-surface/60 p-8 text-center">
          <span className="material-symbols-outlined text-[26px] text-text-muted">bar_chart_off</span>
          <h3 className="mt-2 text-body-md font-semibold text-text-primary">Subject data unavailable</h3>
          <p className="mt-1 text-body-sm text-text-muted">No subject-level breakdown was recorded for this attempt.</p>
        </section>
      )}

      {/* What to Improve Next */}
      {weakestSubject && (
        <section className="rounded-xl border border-primary/30 bg-surface p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/70 pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary-text text-[20px]">
                trending_up
              </span>
              <h3 className="text-title-md font-semibold text-text-primary">
                What to Improve Next
              </h3>
            </div>
            <span className="text-label-xs font-mono uppercase text-text-muted">
              Targeted Recommendation
            </span>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-lg bg-surface-high border border-border/80">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded bg-tertiary/20 text-tertiary border border-tertiary/30">
                  Focus Area
                </span>
                <span className="text-body-md font-bold text-text-primary">
                  {weakestSubject.subjectName}
                </span>
                <span className="font-mono text-label-xs text-text-muted">
                  ({Math.round(weakestSubject.accuracy)}% accuracy)
                </span>
              </div>
              <p className="mt-1.5 text-body-sm text-text-secondary leading-relaxed">
                {weakestSubject.subjectName} scored lowest in this attempt. Targeted practice in this domain will yield the highest readiness gain on your personalized placement roadmap.
              </p>
            </div>

            <Link
              href="/roadmap"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-body-sm font-semibold text-text-inverse transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/60 shrink-0"
            >
              <span>View Roadmap</span>
              <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
            </Link>
          </div>
        </section>
      )}

      {/* Result to next step */}
      <section className="flex flex-col gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <p className="text-label-xs font-mono uppercase tracking-wider text-primary-text">Result → Next Step</p>
          <h3 className="mt-1 text-title-md font-semibold text-text-primary">
            {attempt.testType === "baseline" ? "Your benchmark is ready to explore." : "Keep building your placement readiness."}
          </h3>
          <p className="mt-1 text-body-sm text-text-secondary">
            {attempt.testType === "baseline"
              ? "Review your performance profile, consult your roadmap, or continue from the dashboard."
              : "Review this attempt, check updated roadmap recommendations, or choose another test."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="#detailed-review"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-body-sm font-semibold text-text-primary transition-colors hover:border-primary hover:bg-surface-high focus:outline-none focus:ring-2 focus:ring-primary/60"
          >
            Review Answers
            <span className="material-symbols-outlined text-[17px]">list_alt</span>
          </Link>
          <Link
            href="/roadmap"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-body-sm font-semibold text-text-inverse transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/60"
          >
            View Roadmap
            <span className="material-symbols-outlined text-[17px]">map</span>
          </Link>
          <Link
            href={attempt.testType === "baseline" ? "/dashboard" : "/tests"}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-body-sm font-semibold text-text-primary transition-colors hover:border-primary hover:bg-surface-high focus:outline-none focus:ring-2 focus:ring-primary/60"
          >
            {attempt.testType === "baseline" ? "Dashboard" : "Take Another Test"}
            <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
          </Link>
        </div>
      </section>

      {/* Execution OS: TODAY'S PLAN Continuation */}
      {dailyPlan.hasEnoughData && (
        <section className="rounded-xl border border-secondary/30 bg-surface p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/70 pb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">
                task_alt
              </span>
              <h3 className="text-title-md font-bold text-text-primary">
                TODAY&apos;S PLAN
              </h3>
            </div>
            <span className="text-label-xs font-mono text-secondary uppercase font-semibold">
              Execution Progress: {dailyPlan.completedCount} / {dailyPlan.totalCount} Complete ({dailyPlan.progressPercent}%)
            </span>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-lg bg-surface-high border border-border/80">
            <div className="space-y-1">
              {matchingAction && matchingAction.status === "COMPLETED" ? (
                <div className="flex items-center gap-2 text-secondary font-mono text-body-sm font-semibold">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  <span>✓ This action is complete</span>
                  <span className="text-text-muted">({matchingAction.domain} → {matchingAction.topic})</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-text-primary font-mono text-body-sm font-semibold">
                  <span className="material-symbols-outlined text-[18px] text-secondary">check</span>
                  <span>Test completed</span>
                  <span className="text-text-muted">({attempt.accuracy}% accuracy)</span>
                </div>
              )}

              {nextAction ? (
                <div className="text-body-sm text-text-secondary pt-1">
                  <span className="text-text-muted font-mono text-[11px] uppercase mr-2">Next in Today&apos;s Plan:</span>
                  <span className="font-bold text-text-primary">{nextAction.domain} → {nextAction.topic}</span>
                  <span className="font-mono text-[11px] text-text-muted ml-2">({nextAction.targetCount} questions)</span>
                </div>
              ) : (
                <p className="text-body-sm text-secondary font-medium pt-1">
                  ✓ All actions for today are complete! 100% daily execution achieved.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {nextAction ? (
                <Link
                  href={nextAction.ctaHref}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-body-sm font-semibold text-text-inverse transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/60"
                >
                  <span>CONTINUE TODAY&apos;S PLAN</span>
                  <span className="material-symbols-outlined text-[17px]">arrow_forward</span>
                </Link>
              ) : (
                <Link
                  href="/dashboard"
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-secondary/15 border border-secondary/30 px-5 text-body-sm font-semibold text-secondary transition-colors hover:bg-secondary/25"
                >
                  <span>VIEW TODAY&apos;S PROGRESS</span>
                  <span className="material-symbols-outlined text-[17px]">check</span>
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Detailed Review Table with Explanations */}
      <section id="detailed-review" className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary-text text-[20px]">
            checklist
          </span>
          <h3 className="text-title-md font-semibold text-text-primary">
            Detailed Review
          </h3>
          </div>
          <span className="text-label-xs font-mono uppercase text-text-muted">{totalQuestions} questions</span>
        </div>

        <DetailedReviewTable questions={reviewQuestions} />
      </section>

      {/* Return to Dashboard CTA */}
      <div className="flex flex-wrap justify-end gap-3 pt-1">
        <Link
          href="/roadmap"
          className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-5 text-body-sm font-semibold text-text-primary transition-colors hover:border-primary hover:bg-surface-high focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          <span className="material-symbols-outlined text-[18px]">map</span>
          View Roadmap
        </Link>
        <Link
          href="/dashboard"
          className="flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-body-sm font-semibold text-text-inverse transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/60"
        >
          Return to Dashboard
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
