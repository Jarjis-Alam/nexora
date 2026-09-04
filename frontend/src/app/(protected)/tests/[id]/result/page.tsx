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
  testQuestions,
} from "@/db/schema";
import { eq, and, desc, asc, isNull } from "drizzle-orm";
import { formatDuration } from "@/lib/utils";
import { DetailedReviewTable } from "@/components/assessment/detailed-review-table";

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
  const questionRows = await db
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
      selectedAnswer: answers.selectedAnswer,
      isCorrect: answers.isCorrect,
      timeSpent: answers.timeSpent,
    })
    .from(testQuestions)
    .innerJoin(questions, eq(testQuestions.questionId, questions.id))
    .innerJoin(subjects, eq(questions.subjectId, subjects.id))
    .innerJoin(topics, eq(questions.topicId, topics.id))
    .leftJoin(
      answers,
      and(
        eq(answers.questionId, questions.id),
        eq(answers.attemptId, attempt.id)
      )
    )
    .where(eq(testQuestions.testId, testId))
    .orderBy(asc(testQuestions.questionOrder));

  const totalQuestions = questionRows.length;
  const correctCount = questionRows.filter((q) => q.isCorrect === true).length;
  const answeredCount = questionRows.filter(
    (q) => q.selectedAnswer !== null && q.selectedAnswer !== undefined
  ).length;
  const incorrectCount = answeredCount - correctCount;
  const unansweredCount = totalQuestions - answeredCount;

  return (
    <div className="space-y-10 pb-20">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-label-xs px-2 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/20 uppercase font-mono font-bold">
              COMPLETED
            </span>
            <span className="text-label-xs text-text-muted font-mono">
              ID: {attempt.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <h1 className="text-headline-lg font-bold text-text-primary">
            Assessment Results
          </h1>
          <p className="text-body-md text-text-secondary mt-1">
            {attempt.testTitle}
          </p>
        </div>

        {/* Score & Accuracy banner */}
        <div className="flex items-center gap-8 bg-surface border border-border px-6 py-4 rounded-xl">
          <div className="text-right">
            <div className="flex items-baseline gap-1 font-mono">
              <span className="text-4xl font-bold text-primary-text">
                {attempt.score ?? 0}
              </span>
              <span className="text-text-muted text-sm">/ 100</span>
            </div>
            <span className="text-label-xs text-text-muted uppercase font-mono mt-0.5 block">
              Overall Score
            </span>
          </div>

          <div className="h-10 w-px bg-border" />

          <div className="text-right">
            <span className="text-4xl font-bold font-mono text-secondary block">
              {attempt.accuracy ?? 0}%
            </span>
            <span className="text-label-xs text-text-muted uppercase font-mono mt-0.5 block">
              Accuracy
            </span>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Correct */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <span className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Correct
          </span>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-3xl font-bold text-secondary">{correctCount}</span>
            <span className="text-text-muted text-sm">/ {totalQuestions}</span>
          </div>
        </div>

        {/* Incorrect */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <span className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Incorrect
          </span>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-3xl font-bold text-error">{incorrectCount}</span>
            <span className="text-text-muted text-sm">/ {totalQuestions}</span>
          </div>
        </div>

        {/* Unanswered */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <span className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Unanswered
          </span>
          <div className="flex items-baseline gap-1 font-mono">
            <span className="text-3xl font-bold text-tertiary">{unansweredCount}</span>
            <span className="text-text-muted text-sm">/ {totalQuestions}</span>
          </div>
        </div>

        {/* Time Taken */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <span className="text-label-xs text-text-muted uppercase font-mono block mb-2">
            Time Taken
          </span>
          <div className="font-mono text-3xl font-bold text-text-primary">
            {formatDuration(attempt.timeTaken || 0)}
          </div>
        </div>
      </div>

      {/* Subject Breakdown */}
      {subjectScores.length > 0 && (
        <section className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <span className="material-symbols-outlined text-primary-text text-[20px]">
              bar_chart
            </span>
            <h3 className="text-title-md font-semibold text-text-primary">
              Subject Breakdown
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjectScores.map((s) => (
              <div key={s.subjectId} className="space-y-2">
                <div className="flex justify-between text-body-sm">
                  <span className="text-text-primary font-medium">{s.subjectName}</span>
                  <span className="text-primary-text font-mono font-bold">
                    {Math.round(s.accuracy)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-surface-high rounded-full overflow-hidden">
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
      )}

      {/* Detailed Review Table with Explanations */}
      <section className="bg-surface border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <span className="material-symbols-outlined text-primary-text text-[20px]">
            checklist
          </span>
          <h3 className="text-title-md font-semibold text-text-primary">
            Detailed Review
          </h3>
        </div>

        <DetailedReviewTable questions={questionRows} />
      </section>

      {/* Return to Dashboard CTA */}
      <div className="flex justify-end pt-4">
        <Link
          href="/dashboard"
          className="bg-primary text-text-inverse font-semibold text-body-sm px-8 py-3 rounded hover:bg-primary-text transition-colors flex items-center gap-2 shadow-sm"
        >
          Return to Dashboard
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
