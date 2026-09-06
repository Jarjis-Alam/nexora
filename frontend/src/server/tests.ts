import { db } from "@/db";
import {
  tests,
  testSections,
  questions,
  testQuestions,
  attempts,
  attemptQuestions,
  answers,
  subjects,
  topics,
  users,
  questionPools,
  questionPoolQuestions,
} from "@/db/schema";
import { eq, and, desc, asc, sql, count, inArray } from "drizzle-orm";
import { gradeAttempt } from "./grading";
import { shuffleArray } from "@/lib/random";
import { getEffectiveTestStatus } from "@/lib/lifecycle";

export async function getPublishedTests(userId?: string) {
  const now = new Date();
  const allTests = await db
    .select({
      id: tests.id,
      title: tests.title,
      description: tests.description,
      type: tests.type,
      duration: tests.duration,
      difficulty: tests.difficulty,
      totalMarks: tests.totalMarks,
      status: tests.status,
      scheduledStartAt: tests.scheduledStartAt,
      scheduledEndAt: tests.scheduledEndAt,
      scheduleTimezone: tests.scheduleTimezone,
      isPublished: tests.isPublished,
    })
    .from(tests)
    .where(inArray(tests.status, ["published", "closed"]))
    .orderBy(asc(tests.type), asc(tests.title));

  // For each test, get count of questions and best score of user
  const testsWithStats = await Promise.all(
    allTests.map(async (t) => {
      const effectiveStatus = getEffectiveTestStatus(t, now);

      // Question count: fixed questions + sum of selectionCount across all pools
      const qCountRes = await db
        .select({ count: sql<number>`count(*)` })
        .from(testQuestions)
        .where(eq(testQuestions.testId, t.id));
      const poolCountRes = await db
        .select({ sum: sql<number>`COALESCE(sum(${questionPools.selectionCount}), 0)` })
        .from(questionPools)
        .where(eq(questionPools.testId, t.id));
      const questionCount =
        Number(qCountRes[0]?.count || 0) + Number(poolCountRes[0]?.sum || 0);

      // Best score and latest attempt status
      const userAttempts = userId
        ? await db
            .select({
              id: attempts.id,
              status: attempts.status,
              score: attempts.score,
            })
            .from(attempts)
            .where(and(eq(attempts.testId, t.id), eq(attempts.userId, userId)))
            .orderBy(desc(attempts.score))
        : [];

      const bestScore = userAttempts.find((a) => a.status === "submitted")?.score ?? null;
      const hasInProgress = userAttempts.some((a) => a.status === "in_progress");

      return {
        ...t,
        effectiveStatus,
        lifecycleStatus: t.status,
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

export async function getTestDetails(
  testId: string,
  userId: string,
  isAdmin: boolean = false
) {
  const testList = await db
    .select()
    .from(tests)
    .where(eq(tests.id, testId))
    .limit(1);

  if (testList.length === 0) return null;
  const test = testList[0];

  const now = new Date();
  const effectiveStatus = getEffectiveTestStatus(test, now);

  // Security barrier: Non-admin students cannot view draft tests (404 behavior)
  if (!isAdmin && test.status === "draft") {
    return null;
  }

  // Question count: fixed questions + sum of selectionCount across all pools
  const qCountRes = await db
    .select({ count: sql<number>`count(*)` })
    .from(testQuestions)
    .where(eq(testQuestions.testId, test.id));
  const poolCountRes = await db
    .select({ sum: sql<number>`COALESCE(sum(${questionPools.selectionCount}), 0)` })
    .from(questionPools)
    .where(eq(questionPools.testId, test.id));
  const questionCount =
    Number(qCountRes[0]?.count || 0) + Number(poolCountRes[0]?.sum || 0);

  // Distinct subjects covered in this test (fixed questions + pool questions)
  const fixedSubjectRows = await db
    .selectDistinct({
      subjectId: subjects.id,
      name: subjects.name,
      code: subjects.code,
    })
    .from(testQuestions)
    .innerJoin(questions, eq(testQuestions.questionId, questions.id))
    .innerJoin(subjects, eq(questions.subjectId, subjects.id))
    .where(eq(testQuestions.testId, test.id));

  const poolSubjectRows = await db
    .selectDistinct({
      subjectId: subjects.id,
      name: subjects.name,
      code: subjects.code,
    })
    .from(questionPools)
    .innerJoin(
      questionPoolQuestions,
      eq(questionPools.id, questionPoolQuestions.poolId)
    )
    .innerJoin(questions, eq(questionPoolQuestions.questionId, questions.id))
    .innerJoin(subjects, eq(questions.subjectId, subjects.id))
    .where(eq(questionPools.testId, test.id));

  const subjectMap = new Map<string, typeof fixedSubjectRows[0]>();
  for (const s of fixedSubjectRows) subjectMap.set(s.subjectId, s);
  for (const s of poolSubjectRows) subjectMap.set(s.subjectId, s);
  const subjectRows = Array.from(subjectMap.values());

  // Sections for this test with question counts (fixed + pool selectionCount)
  const sectionRows = await db
    .select({
      id: testSections.id,
      title: testSections.title,
      description: testSections.description,
      sectionOrder: testSections.sectionOrder,
    })
    .from(testSections)
    .where(eq(testSections.testId, test.id))
    .orderBy(asc(testSections.sectionOrder));

  const sectionsWithCounts = await Promise.all(
    sectionRows.map(async (sec) => {
      const countRes = await db
        .select({ count: sql<number>`count(*)` })
        .from(testQuestions)
        .where(eq(testQuestions.sectionId, sec.id));
      const secPoolCountRes = await db
        .select({ sum: sql<number>`COALESCE(sum(${questionPools.selectionCount}), 0)` })
        .from(questionPools)
        .where(eq(questionPools.sectionId, sec.id));
      return {
        ...sec,
        questionCount:
          Number(countRes[0]?.count || 0) +
          Number(secPoolCountRes[0]?.sum || 0),
      };
    })
  );

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

  // If archived and non-admin, only accessible if student previously attempted it
  if (!isAdmin && test.status === "archived" && userAttempts.length === 0) {
    return null;
  }

  return {
    ...test,
    effectiveStatus,
    questionCount,
    sections: sectionsWithCounts,
    subjects: subjectRows,
    attempts: userAttempts,
  };
}

export async function startOrResumeAttempt(testId: string, userId: string) {
  // Check if user exists
  const userList = await db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(eq(users.id, userId)).limit(1);
  if (userList.length === 0) {
    throw new Error("User not found or session invalid. Please log in again.");
  }

  // Check if test exists
  const testList = await db.select().from(tests).where(eq(tests.id, testId)).limit(1);
  if (testList.length === 0) {
    throw new Error("Test not found");
  }
  const test = testList[0];

  // Serialize the resume-check + limit-check + create under a transaction-scoped advisory lock
  // so concurrent START requests cannot bypass the attempt limit (Phase 7D).
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${userId} || ':' || ${testId}))`
    );

    const totalAllowedSeconds = test.duration * 60;

    // 1. Resumable active attempt? RESUME it regardless of the attempt limit.
    const activeAttempts = await tx
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
      const elapsedSeconds = (Date.now() - new Date(existing.startedAt).getTime()) / 1000;
      if (elapsedSeconds >= totalAllowedSeconds) {
        // Auto-submit the expired attempt (it consumes an attempt), then create a new one below.
        await gradeAttempt(existing.id, userId);
      } else {
        const usedRes = await tx
          .select({ count: sql<number>`count(*)` })
          .from(attempts)
          .where(
            and(
              eq(attempts.testId, testId),
              eq(attempts.userId, userId),
              eq(attempts.status, "submitted")
            )
          );
        const used = Number(usedRes[0]?.count ?? 0);
        return {
          attemptId: existing.id,
          isResumed: true,
          attemptLimit: test.attemptLimit ?? null,
          attemptsUsed: used,
          attemptsRemaining:
            test.attemptLimit === null || test.attemptLimit === undefined
              ? null
              : Math.max(0, test.attemptLimit - used),
        };
      }
    }

    // Phase 8 Server Authorization: Check lifecycle availability before creating a NEW attempt.
    const now = new Date();
    const effectiveStatus = getEffectiveTestStatus(test, now);
    const userIsAdmin = Boolean(userList[0].isAdmin);
    if (effectiveStatus !== "active") {
      if (test.status === "draft" && userIsAdmin) {
        // Admins retain access to manage and test draft tests
      } else {
        if (test.status === "draft") {
          throw new Error("Test not found");
        }
        if (effectiveStatus === "scheduled") {
          throw new Error("This test is not available yet.");
        }
        if (effectiveStatus === "closed") {
          throw new Error("This test is closed and no longer accepts new attempts.");
        }
        if (effectiveStatus === "archived") {
          throw new Error("This test is archived and no longer available.");
        }
        throw new Error("This test is currently not available.");
      }
    }

    // 2. Count submitted attempts (the only state that consumes the allowance).
    const submittedCountRes = await tx
      .select({ count: sql<number>`count(*)` })
      .from(attempts)
      .where(
        and(
          eq(attempts.testId, testId),
          eq(attempts.userId, userId),
          eq(attempts.status, "submitted")
        )
      );
    const submittedCount = Number(submittedCountRes[0]?.count ?? 0);

    // 3. Enforce the attempt limit before creating a new attempt.
    if (
      test.attemptLimit !== null &&
      test.attemptLimit !== undefined &&
      submittedCount >= test.attemptLimit
    ) {
      throw new Error(
        `Attempt limit reached. You have used all ${test.attemptLimit} allowed attempt${
          test.attemptLimit === 1 ? "" : "s"
        } for this test.`
      );
    }

    // 4. Create new attempt with resolved question sequence
    const [att] = await tx
      .insert(attempts)
      .values({
        userId,
        testId,
        status: "in_progress",
        startedAt: new Date(),
        currentQuestion: 0,
        remainingTime: totalAllowedSeconds,
        negativeMarkingEnabled: test.negativeMarkingEnabled,
        negativeMarkRate: test.negativeMarkRate,
      })
      .returning();

    // Fetch canonical sections
    const sections = await tx
      .select({
        id: testSections.id,
        sectionOrder: testSections.sectionOrder,
      })
      .from(testSections)
      .where(eq(testSections.testId, testId))
      .orderBy(asc(testSections.sectionOrder));

    // Fetch canonical test questions with options and correctAnswer
    const canonicalQuestions = await tx
      .select({
        questionId: testQuestions.questionId,
        sectionId: testQuestions.sectionId,
        questionOrder: testQuestions.questionOrder,
        question: questions.question,
        questionType: questions.questionType,
        marks: questions.marks,
        options: questions.options,
        correctAnswer: questions.correctAnswer,
      })
      .from(testQuestions)
      .innerJoin(questions, eq(testQuestions.questionId, questions.id))
      .where(eq(testQuestions.testId, testId))
      .orderBy(asc(testQuestions.questionOrder));

    // Group fixed questions by section
    const questionsBySection = new Map<string, typeof canonicalQuestions>();
    for (const q of canonicalQuestions) {
      if (!questionsBySection.has(q.sectionId)) {
        questionsBySection.set(q.sectionId, []);
      }
      questionsBySection.get(q.sectionId)!.push(q);
    }

    // Phase 7F: Fetch question pools and their member questions for this test
    const pools = await tx
      .select({
        id: questionPools.id,
        sectionId: questionPools.sectionId,
        title: questionPools.title,
        selectionCount: questionPools.selectionCount,
        poolOrder: questionPools.poolOrder,
      })
      .from(questionPools)
      .where(eq(questionPools.testId, testId))
      .orderBy(asc(questionPools.poolOrder));

    const poolsBySection = new Map<string, typeof pools>();
    for (const p of pools) {
      if (!poolsBySection.has(p.sectionId)) {
        poolsBySection.set(p.sectionId, []);
      }
      poolsBySection.get(p.sectionId)!.push(p);
    }

    const poolQuestionsByPool = new Map<
      string,
      {
        questionId: string;
        poolId: string;
        questionOrder: number;
        question: string;
        questionType: "single_choice" | "multiple_choice";
        marks: number;
        options: unknown;
        correctAnswer: unknown;
      }[]
    >();

    if (pools.length > 0) {
      const poolIds = pools.map((p) => p.id);
      const poolQRows = await tx
        .select({
          questionId: questionPoolQuestions.questionId,
          poolId: questionPoolQuestions.poolId,
          questionOrder: questionPoolQuestions.questionOrder,
          question: questions.question,
          questionType: questions.questionType,
          marks: questions.marks,
          options: questions.options,
          correctAnswer: questions.correctAnswer,
        })
        .from(questionPoolQuestions)
        .innerJoin(questions, eq(questionPoolQuestions.questionId, questions.id))
        .where(sql`${questionPoolQuestions.poolId} IN ${poolIds}`)
        .orderBy(asc(questionPoolQuestions.questionOrder));

      for (const row of poolQRows) {
        if (!poolQuestionsByPool.has(row.poolId)) {
          poolQuestionsByPool.set(row.poolId, []);
        }
        poolQuestionsByPool.get(row.poolId)!.push(row);
      }
    }

    // Build resolved attempt questions with randomized/canonical option order and snapshots
    let globalOrder = 1;
    const selectedQuestionIds = new Set<string>();
    const attemptQuestionRows: {
      attemptId: string;
      questionId: string;
      sectionId: string;
      poolId: string | null;
      questionOrder: number;
      optionOrder: string[];
      questionTextSnapshot: string;
      questionTypeSnapshot: "single_choice" | "multiple_choice";
      marksSnapshot: number;
      optionsSnapshot: string[];
      correctAnswerSnapshot: unknown;
    }[] = [];

    for (const sec of sections) {
      const sectionCandidates: {
        questionId: string;
        sectionId: string;
        poolId: string | null;
        questionOrder: number;
        question: string;
        questionType: "single_choice" | "multiple_choice";
        marks: number;
        options: unknown;
        correctAnswer: unknown;
      }[] = [];

      // Step A: Fixed questions for this section
      const secFixedQs = questionsBySection.get(sec.id) || [];
      for (const q of secFixedQs) {
        if (!selectedQuestionIds.has(q.questionId)) {
          selectedQuestionIds.add(q.questionId);
          sectionCandidates.push({
            ...q,
            poolId: null,
          });
        }
      }

      // Step B: Sample from pools in this section
      const secPools = poolsBySection.get(sec.id) || [];
      for (const pool of secPools) {
        const pQuestions = poolQuestionsByPool.get(pool.id) || [];
        const eligible = pQuestions.filter((q) => !selectedQuestionIds.has(q.questionId));

        if (eligible.length < pool.selectionCount) {
          throw new Error(
            `Unable to start assessment: Pool "${pool.title}" has insufficient eligible questions (${eligible.length} available, ${pool.selectionCount} required). Please contact test administrator.`
          );
        }

        // Cryptographically sample selectionCount questions
        const sampled = shuffleArray(eligible).slice(0, pool.selectionCount);

        // If randomizeQuestions is false, order sampled questions by their canonical pool questionOrder
        const orderedSampled = test.randomizeQuestions
          ? sampled
          : [...sampled].sort((a, b) => a.questionOrder - b.questionOrder);

        for (const sq of orderedSampled) {
          selectedQuestionIds.add(sq.questionId);
          sectionCandidates.push({
            questionId: sq.questionId,
            sectionId: sec.id,
            poolId: pool.id,
            questionOrder: sq.questionOrder,
            question: sq.question,
            questionType: sq.questionType,
            marks: sq.marks,
            options: sq.options,
            correctAnswer: sq.correctAnswer,
          });
        }
      }

      // Step C: Section Shuffling
      const orderedSecQs = test.randomizeQuestions
        ? shuffleArray(sectionCandidates)
        : sectionCandidates;

      // Step D: Option Shuffling & Snapshots
      for (const q of orderedSecQs) {
        const rawOptions = Array.isArray(q.options) ? (q.options as string[]) : [];
        const canonicalOptionIds = rawOptions.map((_, i) => `opt_${i}`);
        const optionOrder =
          test.randomizeOptions && canonicalOptionIds.length > 1
            ? shuffleArray(canonicalOptionIds)
            : canonicalOptionIds;

        attemptQuestionRows.push({
          attemptId: att.id,
          questionId: q.questionId,
          sectionId: sec.id,
          poolId: q.poolId,
          questionOrder: globalOrder++,
          optionOrder,
          questionTextSnapshot: q.question,
          questionTypeSnapshot: q.questionType,
          marksSnapshot: q.marks,
          optionsSnapshot: rawOptions,
          correctAnswerSnapshot: q.correctAnswer,
        });
      }
    }

    if (attemptQuestionRows.length > 0) {
      await tx.insert(attemptQuestions).values(attemptQuestionRows);
    }

    return {
      attemptId: att.id,
      isResumed: false,
      attemptLimit: test.attemptLimit ?? null,
      attemptsUsed: submittedCount,
      attemptsRemaining:
        test.attemptLimit === null || test.attemptLimit === undefined
          ? null
          : Math.max(0, test.attemptLimit - submittedCount),
    };
  });

  return result;
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
      negativeMarkingEnabled: attempts.negativeMarkingEnabled,
      negativeMarkRate: attempts.negativeMarkRate,
      testTitle: tests.title,
      durationMinutes: tests.duration,
      testType: tests.type,
      testNegativeMarkingEnabled: tests.negativeMarkingEnabled,
      testNegativeMarkRate: tests.negativeMarkRate,
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
      isExpired: true as const,
      status: "submitted",
      attemptId,
      testId: attempt.testId,
    };
  }

  // 2. Fetch questions in order using hybrid resolver (attempt_questions if available, fallback to test_questions)
  // SECURITY: DO NOT SELECT correctAnswer or explanation!
  const attemptQCountRes = await db
    .select({ count: count() })
    .from(attemptQuestions)
    .where(eq(attemptQuestions.attemptId, attemptId));
  const hasAttemptQuestions = Number(attemptQCountRes[0]?.count || 0) > 0;

  let questionRows;
  if (hasAttemptQuestions) {
    questionRows = await db
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
        sectionId: testSections.id,
        sectionTitle: testSections.title,
        sectionOrder: testSections.sectionOrder,
        questionOrder: attemptQuestions.questionOrder,
        optionOrder: attemptQuestions.optionOrder,
        questionTextSnapshot: attemptQuestions.questionTextSnapshot,
        questionTypeSnapshot: attemptQuestions.questionTypeSnapshot,
        marksSnapshot: attemptQuestions.marksSnapshot,
        optionsSnapshot: attemptQuestions.optionsSnapshot,
      })
      .from(attemptQuestions)
      .innerJoin(testSections, eq(attemptQuestions.sectionId, testSections.id))
      .innerJoin(questions, eq(attemptQuestions.questionId, questions.id))
      .innerJoin(subjects, eq(questions.subjectId, subjects.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(eq(attemptQuestions.attemptId, attemptId))
      .orderBy(asc(attemptQuestions.questionOrder));
  } else {
    questionRows = await db
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
        sectionId: testSections.id,
        sectionTitle: testSections.title,
        sectionOrder: testSections.sectionOrder,
        questionOrder: testQuestions.questionOrder,
        optionOrder: sql<null>`null`.as("optionOrder"),
        questionTextSnapshot: sql<null>`null`.as("questionTextSnapshot"),
        questionTypeSnapshot: sql<null>`null`.as("questionTypeSnapshot"),
        marksSnapshot: sql<null>`null`.as("marksSnapshot"),
        optionsSnapshot: sql<null>`null`.as("optionsSnapshot"),
      })
      .from(testQuestions)
      .innerJoin(testSections, eq(testQuestions.sectionId, testSections.id))
      .innerJoin(questions, eq(testQuestions.questionId, questions.id))
      .innerJoin(subjects, eq(questions.subjectId, subjects.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(eq(testQuestions.testId, attempt.testId))
      .orderBy(asc(testSections.sectionOrder), asc(testQuestions.questionOrder));
  }

  const formattedQuestions = questionRows.map((q) => {
    const rawOptions =
      (q.optionsSnapshot as string[] | null) ||
      (q.options as string[] | null) ||
      [];
    const optionOrder = q.optionOrder as string[] | null;

    if (optionOrder && Array.isArray(optionOrder) && optionOrder.length > 0) {
      const presentationOptions = optionOrder.map((optId) => {
        const idx = parseInt(optId.replace("opt_", ""), 10);
        return {
          id: optId,
          text: rawOptions[idx] ?? "",
        };
      });
      return {
        id: q.id,
        question: q.questionTextSnapshot ?? q.question,
        questionType: q.questionTypeSnapshot ?? q.questionType,
        options: presentationOptions,
        difficulty: q.difficulty,
        marks: q.marksSnapshot ?? q.marks,
        expectedTime: q.expectedTime,
        subjectName: q.subjectName,
        subjectCode: q.subjectCode,
        topicName: q.topicName,
        sectionId: q.sectionId,
        sectionTitle: q.sectionTitle,
        sectionOrder: q.sectionOrder,
        questionOrder: q.questionOrder,
      };
    }

    return {
      id: q.id,
      question: q.questionTextSnapshot ?? q.question,
      questionType: q.questionTypeSnapshot ?? q.questionType,
      options: rawOptions,
      difficulty: q.difficulty,
      marks: q.marksSnapshot ?? q.marks,
      expectedTime: q.expectedTime,
      subjectName: q.subjectName,
      subjectCode: q.subjectCode,
      topicName: q.topicName,
      sectionId: q.sectionId,
      sectionTitle: q.sectionTitle,
      sectionOrder: q.sectionOrder,
      questionOrder: q.questionOrder,
    };
  });

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
      selectedAnswer: unknown;
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
    isExpired: false as const,
    attemptId: attempt.id,
    testId: attempt.testId,
    testTitle: attempt.testTitle,
    testType: attempt.testType,
    status: attempt.status,
    totalDurationSeconds: totalDurationSec,
    remainingSeconds,
    currentQuestionIndex: attempt.currentQuestion,
    markingPolicy: {
      negativeMarkingEnabled: attempt.negativeMarkingEnabled ?? attempt.testNegativeMarkingEnabled ?? false,
      negativeMarkRate: Number(attempt.negativeMarkRate ?? attempt.testNegativeMarkRate ?? 0),
    },
    questions: formattedQuestions,
    answers: answersMap,
  };
}

export async function saveAnswer(
  attemptId: string,
  userId: string,
  questionId: string,
  selectedAnswer: unknown,
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

  // Security: Validate question belongs to attempt
  const attemptQ = await db
    .select({
      questionId: attemptQuestions.questionId,
      optionOrder: attemptQuestions.optionOrder,
      optionsSnapshot: attemptQuestions.optionsSnapshot,
    })
    .from(attemptQuestions)
    .where(
      and(
        eq(attemptQuestions.attemptId, attemptId),
        eq(attemptQuestions.questionId, questionId)
      )
    )
    .limit(1);

  if (attemptQ.length === 0) {
    // Fallback check for legacy attempts without attempt_questions
    const legacyQ = await db
      .select({ questionId: testQuestions.questionId })
      .from(testQuestions)
      .where(
        and(
          eq(testQuestions.testId, attemptList[0].testId),
          eq(testQuestions.questionId, questionId)
        )
      )
      .limit(1);
    if (legacyQ.length === 0) {
      throw new Error("Question does not belong to this test attempt");
    }
  } else {
    // Security: Validate submitted option identities
    const validOptionIds = (attemptQ[0].optionOrder as string[] | null) || [];
    if (selectedAnswer !== null && selectedAnswer !== undefined) {
      const validateOption = (choice: unknown) => {
        if (typeof choice === "string") {
          if (choice.startsWith("opt_")) {
            if (!validOptionIds.includes(choice)) {
              throw new Error("Invalid option identity submitted");
            }
          }
        }
      };

      if (typeof selectedAnswer === "string") {
        validateOption(selectedAnswer);
      } else if (Array.isArray(selectedAnswer)) {
        for (const ansItem of selectedAnswer) {
          validateOption(ansItem);
        }
      }
    }
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

export async function duplicateTest(sourceTestId: string) {
  return await db.transaction(async (tx) => {
    const sourceRows = await tx
      .select()
      .from(tests)
      .where(eq(tests.id, sourceTestId))
      .limit(1);

    if (sourceRows.length === 0) {
      throw new Error("SOURCE_TEST_NOT_FOUND");
    }

    const source = sourceRows[0];

    // Query source sections
    const sourceSections = await tx
      .select({
        id: testSections.id,
        title: testSections.title,
        description: testSections.description,
        sectionOrder: testSections.sectionOrder,
      })
      .from(testSections)
      .where(eq(testSections.testId, source.id))
      .orderBy(asc(testSections.sectionOrder));

    const sourceQuestions = await tx
      .select({
        questionId: testQuestions.questionId,
        sectionId: testQuestions.sectionId,
        questionOrder: testQuestions.questionOrder,
      })
      .from(testQuestions)
      .where(eq(testQuestions.testId, source.id))
      .orderBy(asc(testQuestions.questionOrder));

    const baseCandidate = `${source.title} — Copy`;
    const titleRows = await tx
      .select({ title: tests.title })
      .from(tests);
    const existingTitles = new Set(titleRows.map((r) => r.title));

    let nextTitle = baseCandidate;
    let copyNumber = 2;

    if (nextTitle.length > 255) {
      const suffix = " — Copy";
      const maxBaseLen = 255 - suffix.length;
      nextTitle = `${source.title.slice(0, maxBaseLen)}${suffix}`;
    }

    while (existingTitles.has(nextTitle)) {
      const suffix = ` — Copy ${copyNumber}`;
      let base = source.title;
      if (base.length + suffix.length > 255) {
        base = base.slice(0, 255 - suffix.length);
      }
      nextTitle = `${base}${suffix}`;
      copyNumber += 1;
    }

    const [newTest] = await tx
      .insert(tests)
      .values({
        title: nextTitle,
        description: source.description,
        instructions: source.instructions,
        type: source.type,
        duration: source.duration,
        difficulty: source.difficulty,
        totalMarks: source.totalMarks,
        negativeMarkingEnabled: source.negativeMarkingEnabled,
        negativeMarkRate: source.negativeMarkRate,
        randomizeQuestions: source.randomizeQuestions,
        randomizeOptions: source.randomizeOptions,
        attemptLimit: source.attemptLimit,
        status: "draft",
        isPublished: false,
        scheduledStartAt: null,
        scheduledEndAt: null,
        scheduleTimezone: null,
      })
      .returning();

    // Map old section IDs to new duplicated section IDs
    const oldSectionIdToNew = new Map<string, string>();

    if (sourceSections.length > 0) {
      for (const s of sourceSections) {
        const [newSec] = await tx
          .insert(testSections)
          .values({
            testId: newTest.id,
            title: s.title,
            description: s.description,
            sectionOrder: s.sectionOrder,
          })
          .returning();
        oldSectionIdToNew.set(s.id, newSec.id);
      }
    } else {
      // Fallback default section if source test somehow had no sections
      const [defaultSec] = await tx
        .insert(testSections)
        .values({
          testId: newTest.id,
          title: "General",
          sectionOrder: 1,
        })
        .returning();
      oldSectionIdToNew.set("default", defaultSec.id);
    }

    if (sourceQuestions.length > 0) {
      const fallbackSecId = oldSectionIdToNew.values().next().value as string;
      await tx.insert(testQuestions).values(
        sourceQuestions.map((q) => ({
          testId: newTest.id,
          sectionId: oldSectionIdToNew.get(q.sectionId) || fallbackSecId,
          questionId: q.questionId,
          questionOrder: q.questionOrder,
        }))
      );
    }

    // Phase 7F: Duplicate question pools and their questions
    const sourcePools = await tx
      .select()
      .from(questionPools)
      .where(eq(questionPools.testId, source.id))
      .orderBy(asc(questionPools.poolOrder));

    const oldPoolIdToNew = new Map<string, string>();
    let poolSelectionTotal = 0;

    for (const pool of sourcePools) {
      poolSelectionTotal += pool.selectionCount;
      const fallbackSecId = oldSectionIdToNew.values().next().value as string;
      const targetSecId = oldSectionIdToNew.get(pool.sectionId) || fallbackSecId;
      const [newPool] = await tx
        .insert(questionPools)
        .values({
          testId: newTest.id,
          sectionId: targetSecId,
          title: pool.title,
          description: pool.description,
          selectionCount: pool.selectionCount,
          poolOrder: pool.poolOrder,
        })
        .returning();
      oldPoolIdToNew.set(pool.id, newPool.id);
    }

    if (sourcePools.length > 0) {
      const sourcePoolIds = sourcePools.map((p) => p.id);
      const sourcePoolQuestions = await tx
        .select()
        .from(questionPoolQuestions)
        .where(sql`${questionPoolQuestions.poolId} IN ${sourcePoolIds}`)
        .orderBy(asc(questionPoolQuestions.questionOrder));

      if (sourcePoolQuestions.length > 0) {
        await tx.insert(questionPoolQuestions).values(
          sourcePoolQuestions.map((pq) => ({
            poolId: oldPoolIdToNew.get(pq.poolId)!,
            questionId: pq.questionId,
            questionOrder: pq.questionOrder,
          }))
        );
      }
    }

    return {
      test: newTest,
      questionCount: sourceQuestions.length + poolSelectionTotal,
    };
  });
}
