import { db } from "@/db";
import {
  attempts,
  answers,
  questions,
  tests,
  skillScores,
  testQuestions,
  attemptQuestions,
} from "@/db/schema";
import { eq, and, count, sql } from "drizzle-orm";
import { round2 } from "@/lib/utils";

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

  // Determine negative marking parameters from attempt snapshot (falling back to parent test for legacy attempts)
  const isNegativeMarkingActive = attempt.negativeMarkingEnabled ?? test.negativeMarkingEnabled ?? false;
  const penaltyRate = isNegativeMarkingActive ? Number(attempt.negativeMarkRate ?? test.negativeMarkRate ?? 0) : 0;

  // 3. Load all questions for this attempt/test along with correct answer keys
  const attemptQCountRes = await db
    .select({ count: count() })
    .from(attemptQuestions)
    .where(eq(attemptQuestions.attemptId, attemptId));
  const hasAttemptQuestions = Number(attemptQCountRes[0]?.count || 0) > 0;

  const testQuestionRows = hasAttemptQuestions
    ? await db
        .select({
          questionId: questions.id,
          questionType: questions.questionType,
          correctAnswer: questions.correctAnswer,
          options: questions.options,
          marks: questions.marks,
          subjectId: questions.subjectId,
          topicId: questions.topicId,
          optionOrder: attemptQuestions.optionOrder,
          questionTypeSnapshot: attemptQuestions.questionTypeSnapshot,
          marksSnapshot: attemptQuestions.marksSnapshot,
          optionsSnapshot: attemptQuestions.optionsSnapshot,
          correctAnswerSnapshot: attemptQuestions.correctAnswerSnapshot,
        })
        .from(attemptQuestions)
        .innerJoin(questions, eq(attemptQuestions.questionId, questions.id))
        .where(eq(attemptQuestions.attemptId, attemptId))
    : await db
        .select({
          questionId: questions.id,
          questionType: questions.questionType,
          correctAnswer: questions.correctAnswer,
          options: questions.options,
          marks: questions.marks,
          subjectId: questions.subjectId,
          topicId: questions.topicId,
          optionOrder: sql<null>`null`.as("optionOrder"),
          questionTypeSnapshot: sql<null>`null`.as("questionTypeSnapshot"),
          marksSnapshot: sql<null>`null`.as("marksSnapshot"),
          optionsSnapshot: sql<null>`null`.as("optionsSnapshot"),
          correctAnswerSnapshot: sql<null>`null`.as("correctAnswerSnapshot"),
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
    { earned: number; total: number; correct: number; count: number; attempted: number }
  > = {};
  const topicAgg: Record<
    string,
    {
      subjectId: string;
      earned: number;
      total: number;
      correct: number;
      count: number;
      attempted: number;
    }
  > = {};

  const answerUpdates: {
    id: string;
    isCorrect: boolean;
  }[] = [];

  for (const q of testQuestionRows) {
    // Phase 7C.1: Scoring configuration is frozen per attempt (marksSnapshot/questionTypeSnapshot),
    // falling back to live question values only for historical attempts without snapshots.
    const marks = q.marksSnapshot ?? q.marks;
    const questionType = q.questionTypeSnapshot ?? q.questionType;

    totalPossibleScore += marks;

    if (!subjectAgg[q.subjectId]) {
      subjectAgg[q.subjectId] = { earned: 0, total: 0, correct: 0, count: 0, attempted: 0 };
    }
    subjectAgg[q.subjectId].total += marks;
    subjectAgg[q.subjectId].count += 1;

    if (!topicAgg[q.topicId]) {
      topicAgg[q.topicId] = {
        subjectId: q.subjectId,
        earned: 0,
        total: 0,
        correct: 0,
        count: 0,
        attempted: 0,
      };
    }
    topicAgg[q.topicId].total += marks;
    topicAgg[q.topicId].count += 1;

    const studentAns = answersMap.get(q.questionId);
    let isCorrect = false;

    if (studentAns && studentAns.selectedAnswer !== null && studentAns.selectedAnswer !== undefined) {
      totalAnsweredCount += 1;
      subjectAgg[q.subjectId].attempted += 1;
      topicAgg[q.topicId].attempted += 1;

      // Resolve options and correct answer snapshots (safeguard against question bank mutations)
      const rawOptions =
        (q.optionsSnapshot as string[] | null) ||
        (q.options as string[] | null) ||
        [];
      const rawCorrect =
        q.correctAnswerSnapshot !== null &&
        q.correctAnswerSnapshot !== undefined
          ? q.correctAnswerSnapshot
          : q.correctAnswer;

      if (questionType === "single_choice") {
        const studentChoiceStr = String(studentAns.selectedAnswer).trim();
        if (studentChoiceStr.startsWith("opt_")) {
          // Synthetic canonical option identity evaluation
          const rawCorrectStr = String(rawCorrect).trim();
          let canonicalCorrectOptId: string | null = null;
          if (rawCorrectStr.startsWith("opt_")) {
            canonicalCorrectOptId = rawCorrectStr;
          } else {
            const idx = rawOptions.findIndex(
              (opt: string) => opt.trim() === rawCorrectStr
            );
            if (idx >= 0) {
              canonicalCorrectOptId = `opt_${idx}`;
            }
          }
          isCorrect =
            canonicalCorrectOptId !== null &&
            studentChoiceStr === canonicalCorrectOptId;
        } else {
          // Historical fallback: literal text matching
          isCorrect = studentChoiceStr === String(rawCorrect).trim();
        }
      } else if (questionType === "multiple_choice") {
        const studentRaw = studentAns.selectedAnswer;
        const studentArr = Array.isArray(studentRaw)
          ? studentRaw.map(String)
          : [String(studentRaw)];

        const hasOptionIds = studentArr.some((item) => item.startsWith("opt_"));
        if (hasOptionIds) {
          const rawCorrectArr = Array.isArray(rawCorrect)
            ? (rawCorrect as unknown[]).map(String)
            : [String(rawCorrect)];

          const canonicalCorrectIds = rawCorrectArr
            .map((c) => {
              const cStr = c.trim();
              if (cStr.startsWith("opt_")) return cStr;
              const idx = rawOptions.findIndex((opt: string) => opt.trim() === cStr);
              return idx >= 0 ? `opt_${idx}` : cStr;
            })
            .sort();

          const sortedStudentArr = [...studentArr].sort();
          isCorrect =
            sortedStudentArr.length === canonicalCorrectIds.length &&
            sortedStudentArr.every((val, idx) => val === canonicalCorrectIds[idx]);
        } else {
          // Historical fallback
          const correctArr = Array.isArray(rawCorrect)
            ? (rawCorrect as unknown[]).map(String).sort()
            : [String(rawCorrect)];
          const sortedStudent = [...studentArr].sort();
          isCorrect =
            sortedStudent.length === correctArr.length &&
            sortedStudent.every((val, idx) => val === correctArr[idx]);
        }
      }

      if (isCorrect) {
        totalScore = round2(totalScore + marks);
        correctCount += 1;
        subjectAgg[q.subjectId].earned = round2(subjectAgg[q.subjectId].earned + marks);
        subjectAgg[q.subjectId].correct += 1;
        topicAgg[q.topicId].earned = round2(topicAgg[q.topicId].earned + marks);
        topicAgg[q.topicId].correct += 1;
      } else {
        // Incorrect answer: deduct proportional penalty if negative marking active
        if (isNegativeMarkingActive && penaltyRate > 0) {
          const penalty = round2(marks * penaltyRate);
          totalScore = round2(totalScore - penalty);
          subjectAgg[q.subjectId].earned = round2(subjectAgg[q.subjectId].earned - penalty);
          topicAgg[q.topicId].earned = round2(topicAgg[q.topicId].earned - penalty);
        }
      }

      answerUpdates.push({
        id: studentAns.id,
        isCorrect,
      });
    }
    // Note: Unanswered questions ALWAYS receive 0 marks and 0 penalty
  }

  // 5. Update each student answer with isCorrect
  for (const upd of answerUpdates) {
    await db
      .update(answers)
      .set({ isCorrect: upd.isCorrect, updatedAt: new Date() })
      .where(eq(answers.id, upd.id));
  }

  // 6. Calculate accuracy and normalized score out of 100
  const rawScore = totalScore;
  const normalizedScore =
    totalPossibleScore > 0
      ? Math.max(0, Math.round((rawScore / totalPossibleScore) * 100))
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
    const subjAcc = val.attempted > 0 ? Math.round((val.correct / val.attempted) * 100) : 0;
    skillScoreInserts.push({
      attemptId,
      subjectId: subjId,
      topicId: null,
      score: Math.max(0, val.earned),
      total: val.total,
      accuracy: Math.max(0, Math.min(100, subjAcc)),
    });
  }

  // Topic skill scores
  for (const [topId, val] of Object.entries(topicAgg)) {
    const topAcc = val.attempted > 0 ? Math.round((val.correct / val.attempted) * 100) : 0;
    skillScoreInserts.push({
      attemptId,
      subjectId: val.subjectId,
      topicId: topId,
      score: Math.max(0, val.earned),
      total: val.total,
      accuracy: Math.max(0, Math.min(100, topAcc)),
    });
  }

  if (skillScoreInserts.length > 0) {
    await db.insert(skillScores).values(skillScoreInserts);
  }

  return {
    success: true,
    attemptId,
    rawScore,
    score: normalizedScore,
    accuracy,
    timeTaken,
    correctCount,
    incorrectCount: totalAnsweredCount - correctCount,
    unansweredCount: testQuestionRows.length - totalAnsweredCount,
    totalQuestions: testQuestionRows.length,
  };
}
