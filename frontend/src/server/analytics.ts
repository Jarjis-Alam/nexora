import { db } from "@/db";
import {
  attempts,
  answers,
  questions,
  tests,
  subjects,
  topics,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { calculateReadiness } from "./readiness";

export interface AnalyticsData {
  hasData: boolean;
  overview: {
    avgScore: number;
    avgAccuracy: number;
    testsCompleted: number;
    questionsAttempted: number;
    questionsCorrect: number;
  };
  readiness: {
    score: number | null;
    level: string | null;
    breakdown: {
      aptitude: number;
      dsa: number;
      coreCs: number;
      sql: number;
    } | null;
  };
  performanceOverTime: {
    date: string;
    score: number;
    accuracy: number;
    testTitle: string;
  }[];
  difficultyPerformance: {
    difficulty: "easy" | "medium" | "hard";
    accuracy: number;
    attempted: number;
    correct: number;
  }[];
  topicPerformance: {
    topicId: string;
    topicName: string;
    subjectName: string;
    subjectCode: string;
    attempts: number;
    accuracy: number;
  }[];
  strongestTopics: {
    topicName: string;
    subjectCode: string;
    accuracy: number;
  }[];
  weakestTopics: {
    topicName: string;
    subjectCode: string;
    accuracy: number;
  }[];
  accuracyVsSpeed: {
    testTitle: string;
    avgTimePerQuestionSec: number;
    accuracy: number;
    date: string;
  }[];
  recentTests: {
    id: string;
    testId: string;
    testTitle: string;
    type: string;
    score: number;
    accuracy: number;
    timeTaken: number;
    submittedAt: string;
  }[];
}

export async function getAnalyticsData(userId: string): Promise<AnalyticsData> {
  // 1. Fetch all submitted attempts
  const submittedAttempts = await db
    .select({
      id: attempts.id,
      testId: attempts.testId,
      testTitle: tests.title,
      testType: tests.type,
      score: attempts.score,
      accuracy: attempts.accuracy,
      timeTaken: attempts.timeTaken,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(tests, eq(attempts.testId, tests.id))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")))
    .orderBy(asc(attempts.submittedAt));

  if (submittedAttempts.length === 0) {
    return {
      hasData: false,
      overview: {
        avgScore: 0,
        avgAccuracy: 0,
        testsCompleted: 0,
        questionsAttempted: 0,
        questionsCorrect: 0,
      },
      readiness: { score: null, level: null, breakdown: null },
      performanceOverTime: [],
      difficultyPerformance: [
        { difficulty: "easy", accuracy: 0, attempted: 0, correct: 0 },
        { difficulty: "medium", accuracy: 0, attempted: 0, correct: 0 },
        { difficulty: "hard", accuracy: 0, attempted: 0, correct: 0 },
      ],
      topicPerformance: [],
      strongestTopics: [],
      weakestTopics: [],
      accuracyVsSpeed: [],
      recentTests: [],
    };
  }

  // 2. Overview statistics
  const testsCompleted = submittedAttempts.length;
  const avgScore = Math.round(
    submittedAttempts.reduce((acc, curr) => acc + (curr.score || 0), 0) /
      testsCompleted
  );
  const avgAccuracy = Math.round(
    submittedAttempts.reduce((acc, curr) => acc + (curr.accuracy || 0), 0) /
      testsCompleted
  );

  // 3. Question-level aggregation from answers
  const answerRows = await db
    .select({
      answerId: answers.id,
      isCorrect: answers.isCorrect,
      timeSpent: answers.timeSpent,
      difficulty: questions.difficulty,
      topicId: topics.id,
      topicName: topics.name,
      subjectCode: subjects.code,
      subjectName: subjects.name,
    })
    .from(answers)
    .innerJoin(attempts, eq(answers.attemptId, attempts.id))
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(topics, eq(questions.topicId, topics.id))
    .innerJoin(subjects, eq(questions.subjectId, subjects.id))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")));

  const questionsAttempted = answerRows.length;
  const questionsCorrect = answerRows.filter((a) => a.isCorrect === true).length;

  // 4. Performance over time
  const performanceOverTime = submittedAttempts.map((att) => ({
    date: att.submittedAt
      ? new Date(att.submittedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : "N/A",
    score: att.score || 0,
    accuracy: att.accuracy || 0,
    testTitle: att.testTitle,
  }));

  // 5. Difficulty performance
  const diffMap: Record<
    "easy" | "medium" | "hard",
    { attempted: number; correct: number }
  > = {
    easy: { attempted: 0, correct: 0 },
    medium: { attempted: 0, correct: 0 },
    hard: { attempted: 0, correct: 0 },
  };

  answerRows.forEach((ans) => {
    if (ans.difficulty && diffMap[ans.difficulty]) {
      diffMap[ans.difficulty].attempted += 1;
      if (ans.isCorrect) diffMap[ans.difficulty].correct += 1;
    }
  });

  const difficultyPerformance: AnalyticsData["difficultyPerformance"] = (
    ["easy", "medium", "hard"] as const
  ).map((diff) => {
    const data = diffMap[diff];
    const acc =
      data.attempted > 0
        ? Math.round((data.correct / data.attempted) * 100)
        : 0;
    return {
      difficulty: diff,
      accuracy: acc,
      attempted: data.attempted,
      correct: data.correct,
    };
  });

  // 6. Topic performance
  const topicMap: Record<
    string,
    {
      topicId: string;
      topicName: string;
      subjectName: string;
      subjectCode: string;
      attempts: number;
      correct: number;
    }
  > = {};

  answerRows.forEach((ans) => {
    if (!topicMap[ans.topicId]) {
      topicMap[ans.topicId] = {
        topicId: ans.topicId,
        topicName: ans.topicName,
        subjectName: ans.subjectName,
        subjectCode: ans.subjectCode,
        attempts: 0,
        correct: 0,
      };
    }
    topicMap[ans.topicId].attempts += 1;
    if (ans.isCorrect) topicMap[ans.topicId].correct += 1;
  });

  const topicPerformance = Object.values(topicMap).map((t) => ({
    topicId: t.topicId,
    topicName: t.topicName,
    subjectName: t.subjectName,
    subjectCode: t.subjectCode,
    attempts: t.attempts,
    accuracy: t.attempts > 0 ? Math.round((t.correct / t.attempts) * 100) : 0,
  }));

  // Strongest & Weakest topics
  const sortedTopics = [...topicPerformance].sort((a, b) => b.accuracy - a.accuracy);
  const strongestTopics = sortedTopics
    .filter((t) => t.accuracy >= 70)
    .slice(0, 5)
    .map((t) => ({
      topicName: t.topicName,
      subjectCode: t.subjectCode,
      accuracy: t.accuracy,
    }));

  const weakestTopics = [...topicPerformance]
    .sort((a, b) => a.accuracy - b.accuracy)
    .filter((t) => t.accuracy < 70)
    .slice(0, 5)
    .map((t) => ({
      topicName: t.topicName,
      subjectCode: t.subjectCode,
      accuracy: t.accuracy,
    }));

  // 7. Accuracy vs Speed (average time per question vs accuracy per test attempt)
  const accuracyVsSpeed = submittedAttempts.map((att) => {
    const timeTakenSec = att.timeTaken || 60;
    const avgTimePerQuestion = Math.round(timeTakenSec / 20); // normalized estimate

    return {
      testTitle: att.testTitle,
      avgTimePerQuestionSec: avgTimePerQuestion,
      accuracy: att.accuracy || 0,
      date: att.submittedAt ? new Date(att.submittedAt).toLocaleDateString() : "",
    };
  });

  // 8. Readiness
  const readinessRes = await calculateReadiness(userId);

  // 9. Recent Tests
  const recentTests = [...submittedAttempts]
    .reverse()
    .slice(0, 10)
    .map((att) => ({
      id: att.id,
      testId: att.testId,
      testTitle: att.testTitle,
      type: att.testType,
      score: att.score || 0,
      accuracy: att.accuracy || 0,
      timeTaken: att.timeTaken || 0,
      submittedAt: att.submittedAt ? att.submittedAt.toISOString() : "",
    }));

  return {
    hasData: true,
    overview: {
      avgScore,
      avgAccuracy,
      testsCompleted,
      questionsAttempted,
      questionsCorrect,
    },
    readiness: {
      score: readinessRes.readinessScore,
      level: readinessRes.level?.label || null,
      breakdown: readinessRes.breakdown
        ? {
            aptitude: readinessRes.breakdown.aptitude,
            dsa: readinessRes.breakdown.dsa,
            coreCs: readinessRes.breakdown.coreCs,
            sql: readinessRes.breakdown.sql,
          }
        : null,
    },
    performanceOverTime,
    difficultyPerformance,
    topicPerformance,
    strongestTopics,
    weakestTopics,
    accuracyVsSpeed,
    recentTests,
  };
}
