import { db } from "@/db";
import {
  tests,
  questions,
  testQuestions,
  attempts,
  answers,
  subjects,
  topics,
} from "@/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import { gradeAttempt } from "./grading";

export async function getPublishedTests(userId: string) {
  const allTests = await db
    .select({
      id: tests.id,
      title: tests.title,
      description: tests.description,
      type: tests.type,
      duration: tests.duration,
      difficulty: tests.difficulty,
      totalMarks: tests.totalMarks,
      isPublished: tests.isPublished,
    })
    .from(tests)
    .where(eq(tests.isPublished, true))
    .orderBy(asc(tests.type), asc(tests.title));

  // For each test, get count of questions and best score of user
  const testsWithStats = await Promise.all(
    allTests.map(async (t) => {
      // Question count
      const qCountRes = await db
        .select({ count: sql<number>`count(*)` })
        .from(testQuestions)
        .where(eq(testQuestions.testId, t.id));
      const questionCount = Number(qCountRes[0]?.count || 0);

      // Best score and latest attempt status
      const userAttempts = await db
        .select({
          id: attempts.id,
          status: attempts.status,
          score: attempts.score,
        })
        .from(attempts)
        .where(and(eq(attempts.testId, t.id), eq(attempts.userId, userId)))
        .orderBy(desc(attempts.score));

      const bestScore = userAttempts.find((a) => a.status === "submitted")?.score ?? null;
      const hasInProgress = userAttempts.some((a) => a.status === "in_progress");

      return {
        ...t,
        questionCount,
        bestScore,
        status: hasInProgress
          ? "in_progress"
          : bestScore !== null
          ? "completed"
          : "not_attempted",
      };
    })
  );

  return testsWithStats;
}

export async function getTestDetails(testId: string, userId: string) {
  const testList = await db
    .select()
    .from(tests)
    .where(eq(tests.id, testId))
    .limit(1);

  if (testList.length === 0) return null;
  const test = testList[0];

  // Question count
  const qCountRes = await db
    .select({ count: sql<number>`count(*)` })
    .from(testQuestions)
    .where(eq(testQuestions.testId, test.id));
  const questionCount = Number(qCountRes[0]?.count || 0);

  // Distinct subjects covered in this test
  const subjectRows = await db
    .selectDistinct({
      subjectId: subjects.id,
      name: subjects.name,
      code: subjects.code,
    })
    .from(testQuestions)
    .innerJoin(questions, eq(testQuestions.questionId, questions.id))
    .innerJoin(subjects, eq(questions.subjectId, subjects.id))
    .where(eq(testQuestions.testId, test.id));

  // User's previous attempts for this test
  const userAttempts = await db
    .select({
      id: attempts.id,
      status: attempts.status,
      score: attempts.score,
      accuracy: attempts.accuracy,
      timeTaken: attempts.timeTaken,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .where(and(eq(attempts.testId, test.id), eq(attempts.userId, userId)))
    .orderBy(desc(attempts.startedAt));

  return {
    ...test,
    questionCount,
    subjects: subjectRows,
    attempts: userAttempts,
  };
}

export async function startOrResumeAttempt(testId: string, userId: string) {
  // Check if test exists
  const testList = await db.select().from(tests).where(eq(tests.id, testId)).limit(1);
  if (testList.length === 0) {
    throw new Error("Test not found");
  }
  const test = testList[0];

  // Check for active attempt in progress
  const activeAttempts = await db
    .select()
    .from(attempts)
    .where(
      and(
        eq(attempts.testId, testId),
        eq(attempts.userId, userId),
        eq(attempts.status, "in_progress")
      )
    )
    .orderBy(desc(attempts.startedAt))
    .limit(1);

  if (activeAttempts.length > 0) {
    const existing = activeAttempts[0];

    // Check if time expired
    const elapsedSeconds = (Date.now() - new Date(existing.startedAt).getTime()) / 1000;
    const totalAllowedSeconds = test.duration * 60;

    if (elapsedSeconds >= totalAllowedSeconds) {
      // Auto-submit expired attempt
      await gradeAttempt(existing.id, userId);
      // Create new attempt
    } else {
      return { attemptId: existing.id, isResumed: true };
    }
  }

  // Create new attempt
  const totalAllowedSeconds = test.duration * 60;
  const newAttempt = await db
    .insert(attempts)
    .values({
      userId,
      testId,
      status: "in_progress",
      startedAt: new Date(),
      currentQuestion: 0,
      remainingTime: totalAllowedSeconds,
    })
    .returning();

  return { attemptId: newAttempt[0].id, isResumed: false };
}

export async function getAttemptExamState(attemptId: string, userId: string) {
  // 1. Fetch attempt and verify ownership
  const attemptList = await db
    .select({
      id: attempts.id,
      userId: attempts.userId,
      testId: attempts.testId,
      status: attempts.status,
      startedAt: attempts.startedAt,
      currentQuestion: attempts.currentQuestion,
      testTitle: tests.title,
      durationMinutes: tests.duration,
      testType: tests.type,
    })
    .from(attempts)
    .innerJoin(tests, eq(attempts.testId, tests.id))
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1);

  if (attemptList.length === 0) {
    throw new Error("Attempt not found or access denied");
  }

  const attempt = attemptList[0];

  // Calculate remaining seconds server-side
  const elapsedSec = Math.floor(
    (Date.now() - new Date(attempt.startedAt).getTime()) / 1000
  );
  const totalDurationSec = attempt.durationMinutes * 60;
  const remainingSeconds = Math.max(0, totalDurationSec - elapsedSec);

  // If time is up and still in_progress, grade it now
  if (remainingSeconds <= 0 && attempt.status === "in_progress") {
    await gradeAttempt(attemptId, userId);
    return {
      isExpired: true,
      status: "submitted",
      attemptId,
      testId: attempt.testId,
    };
  }

  // 2. Fetch questions in order — SECURITY: DO NOT SELECT correctAnswer or explanation!
  const questionRows = await db
    .select({
      id: questions.id,
      question: questions.question,
      questionType: questions.questionType,
      options: questions.options,
      difficulty: questions.difficulty,
      marks: questions.marks,
      expectedTime: questions.expectedTime,
      subjectName: subjects.name,
      subjectCode: subjects.code,
      topicName: topics.name,
      questionOrder: testQuestions.questionOrder,
    })
    .from(testQuestions)
    .innerJoin(questions, eq(testQuestions.questionId, questions.id))
    .innerJoin(subjects, eq(questions.subjectId, subjects.id))
    .innerJoin(topics, eq(questions.topicId, topics.id))
    .where(eq(testQuestions.testId, attempt.testId))
    .orderBy(asc(testQuestions.questionOrder));

  // 3. Fetch saved answers for this attempt
  const savedAnswers = await db
    .select({
      questionId: answers.questionId,
      selectedAnswer: answers.selectedAnswer,
      markedForReview: answers.markedForReview,
      timeSpent: answers.timeSpent,
    })
    .from(answers)
    .where(eq(answers.attemptId, attemptId));

  const answersMap: Record<
    string,
    {
      selectedAnswer: any;
      markedForReview: boolean;
      timeSpent: number;
    }
  > = {};

  savedAnswers.forEach((a) => {
    answersMap[a.questionId] = {
      selectedAnswer: a.selectedAnswer,
      markedForReview: a.markedForReview,
      timeSpent: a.timeSpent || 0,
    };
  });

  return {
    isExpired: false,
    attemptId: attempt.id,
    testId: attempt.testId,
    testTitle: attempt.testTitle,
    testType: attempt.testType,
    status: attempt.status,
    totalDurationSeconds: totalDurationSec,
    remainingSeconds,
    currentQuestionIndex: attempt.currentQuestion,
    questions: questionRows,
    answers: answersMap,
  };
}

export async function saveAnswer(
  attemptId: string,
  userId: string,
  questionId: string,
  selectedAnswer: any,
  timeSpentSec: number = 0
) {
  // Verify ownership & status
  const attemptList = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1);

  if (attemptList.length === 0 || attemptList[0].status !== "in_progress") {
    throw new Error("Attempt is not editable");
  }

  // Upsert answer
  const existing = await db
    .select()
    .from(answers)
    .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(answers)
      .set({
        selectedAnswer,
        timeSpent: (existing[0].timeSpent || 0) + timeSpentSec,
        updatedAt: new Date(),
      })
      .where(eq(answers.id, existing[0].id));
  } else {
    await db.insert(answers).values({
      attemptId,
      questionId,
      selectedAnswer,
      timeSpent: timeSpentSec,
    });
  }

  return { success: true };
}

export async function toggleReviewMark(
  attemptId: string,
  userId: string,
  questionId: string
) {
  const attemptList = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1);

  if (attemptList.length === 0 || attemptList[0].status !== "in_progress") {
    throw new Error("Attempt is not editable");
  }

  const existing = await db
    .select()
    .from(answers)
    .where(and(eq(answers.attemptId, attemptId), eq(answers.questionId, questionId)))
    .limit(1);

  let isMarked = false;
  if (existing.length > 0) {
    isMarked = !existing[0].markedForReview;
    await db
      .update(answers)
      .set({ markedForReview: isMarked, updatedAt: new Date() })
      .where(eq(answers.id, existing[0].id));
  } else {
    isMarked = true;
    await db.insert(answers).values({
      attemptId,
      questionId,
      markedForReview: true,
    });
  }

  return { success: true, markedForReview: isMarked };
}

export async function updateCurrentQuestionIndex(
  attemptId: string,
  userId: string,
  index: number
) {
  await db
    .update(attempts)
    .set({ currentQuestion: index })
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)));
}
