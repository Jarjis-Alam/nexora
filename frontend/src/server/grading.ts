import { db } from "@/db";
import {
  attempts,
  answers,
  questions,
  tests,
  skillScores,
  testQuestions,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function gradeAttempt(attemptId: string, userId: string) {
  // 1. Verify ownership and that attempt is in_progress
  const attemptList = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, attemptId), eq(attempts.userId, userId)))
    .limit(1);

  if (attemptList.length === 0) {
    throw new Error("Attempt not found or unauthorized");
  }

  const attempt = attemptList[0];
  if (attempt.status !== "in_progress") {
    // Already graded or expired
    return { success: true, attemptId, status: attempt.status };
  }

  // 2. Fetch test details for total marks & questions
  const testList = await db
    .select()
    .from(tests)
    .where(eq(tests.id, attempt.testId))
    .limit(1);

  if (testList.length === 0) {
    throw new Error("Associated test not found");
  }
  const test = testList[0];

  // 3. Load all questions for this test along with correct answer keys
  const testQuestionRows = await db
    .select({
      questionId: questions.id,
      questionType: questions.questionType,
      correctAnswer: questions.correctAnswer,
      marks: questions.marks,
      subjectId: questions.subjectId,
      topicId: questions.topicId,
    })
    .from(testQuestions)
    .innerJoin(questions, eq(testQuestions.questionId, questions.id))
    .where(eq(testQuestions.testId, test.id));

  // 4. Load all student answers for this attempt
  const studentAnswers = await db
    .select()
    .from(answers)
    .where(eq(answers.attemptId, attemptId));

  const answersMap = new Map<string, (typeof studentAnswers)[0]>();
  studentAnswers.forEach((ans) => {
    answersMap.set(ans.questionId, ans);
  });

  let totalScore = 0;
  let totalPossibleScore = 0;
  let correctCount = 0;
  let totalAnsweredCount = 0;

  // Track per-subject and per-topic aggregations
  const subjectAgg: Record<
    string,
    { earned: number; total: number; correct: number; count: number }
  > = {};
  const topicAgg: Record<
    string,
    {
      subjectId: string;
      earned: number;
      total: number;
      correct: number;
      count: number;
    }
  > = {};

  const answerUpdates: {
    id: string;
    isCorrect: boolean;
  }[] = [];

  for (const q of testQuestionRows) {
    totalPossibleScore += q.marks;

    if (!subjectAgg[q.subjectId]) {
      subjectAgg[q.subjectId] = { earned: 0, total: 0, correct: 0, count: 0 };
    }
    subjectAgg[q.subjectId].total += q.marks;
    subjectAgg[q.subjectId].count += 1;

    if (!topicAgg[q.topicId]) {
      topicAgg[q.topicId] = {
        subjectId: q.subjectId,
        earned: 0,
        total: 0,
        correct: 0,
        count: 0,
      };
    }
    topicAgg[q.topicId].total += q.marks;
    topicAgg[q.topicId].count += 1;

    const studentAns = answersMap.get(q.questionId);
    let isCorrect = false;

    if (studentAns && studentAns.selectedAnswer !== null && studentAns.selectedAnswer !== undefined) {
      totalAnsweredCount += 1;

      // Evaluation based on question type
      if (q.questionType === "single_choice") {
        isCorrect =
          String(studentAns.selectedAnswer).trim() ===
          String(q.correctAnswer).trim();
      } else if (q.questionType === "multiple_choice") {
        // Set comparison
        const studentArr = Array.isArray(studentAns.selectedAnswer)
          ? studentAns.selectedAnswer.map(String).sort()
          : [String(studentAns.selectedAnswer)];
        const correctArr = Array.isArray(q.correctAnswer)
          ? (q.correctAnswer as unknown[]).map(String).sort()
          : [String(q.correctAnswer)];

        isCorrect =
          studentArr.length === correctArr.length &&
          studentArr.every((val, idx) => val === correctArr[idx]);
      }

      if (isCorrect) {
        totalScore += q.marks;
        correctCount += 1;
        subjectAgg[q.subjectId].earned += q.marks;
        subjectAgg[q.subjectId].correct += 1;
        topicAgg[q.topicId].earned += q.marks;
        topicAgg[q.topicId].correct += 1;
      }

      answerUpdates.push({
        id: studentAns.id,
        isCorrect,
      });
    }
  }

  // 5. Update each student answer with isCorrect
  for (const upd of answerUpdates) {
    await db
      .update(answers)
      .set({ isCorrect: upd.isCorrect, updatedAt: new Date() })
      .where(eq(answers.id, upd.id));
  }

  // 6. Calculate accuracy and normalized score out of 100
  const normalizedScore =
    totalPossibleScore > 0
      ? Math.round((totalScore / totalPossibleScore) * 100)
      : 0;

  const accuracy =
    totalAnsweredCount > 0
      ? Math.round((correctCount / totalAnsweredCount) * 100)
      : 0;

  const submittedAt = new Date();
  const timeTaken = Math.max(
    0,
    Math.round((submittedAt.getTime() - new Date(attempt.startedAt).getTime()) / 1000)
  );

  // 7. Update attempt to submitted
  await db
    .update(attempts)
    .set({
      status: "submitted",
      submittedAt,
      score: normalizedScore,
      accuracy,
      timeTaken,
    })
    .where(eq(attempts.id, attemptId));

  // 8. Delete any previous skill scores for this attempt (if any) and insert new ones
  await db.delete(skillScores).where(eq(skillScores.attemptId, attemptId));

  const skillScoreInserts: {
    attemptId: string;
    subjectId: string;
    topicId: string | null;
    score: number;
    total: number;
    accuracy: number;
  }[] = [];

  // Subject skill scores
  for (const [subjId, val] of Object.entries(subjectAgg)) {
    const subjAcc = val.total > 0 ? (val.earned / val.total) * 100 : 0;
    skillScoreInserts.push({
      attemptId,
      subjectId: subjId,
      topicId: null,
      score: val.earned,
      total: val.total,
      accuracy: Math.round(subjAcc),
    });
  }

  // Topic skill scores
  for (const [topId, val] of Object.entries(topicAgg)) {
    const topAcc = val.total > 0 ? (val.earned / val.total) * 100 : 0;
    skillScoreInserts.push({
      attemptId,
      subjectId: val.subjectId,
      topicId: topId,
      score: val.earned,
      total: val.total,
      accuracy: Math.round(topAcc),
    });
  }

  if (skillScoreInserts.length > 0) {
    await db.insert(skillScores).values(skillScoreInserts);
  }

  return {
    success: true,
    attemptId,
    score: normalizedScore,
    accuracy,
    timeTaken,
    correctCount,
    totalQuestions: testQuestionRows.length,
  };
}
