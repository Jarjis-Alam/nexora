import { db } from "@/db";
import {
  attempts,
  tests,
  skillScores,
  subjects,
  topics,
  questions,
  answers,
} from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { READINESS_WEIGHTS } from "@/lib/constants";
import { getReadinessLevel } from "@/lib/utils";

export interface ReadinessResult {
  hasCompletedBaseline: boolean;
  readinessScore: number | null;
  level: { label: string; color: string } | null;
  breakdown: {
    aptitude: number;
    dsa: number;
    coreCs: number;
    sql: number;
    overallTest: number;
    consistency: number;
  } | null;
  subjectScores: {
    subjectId: string;
    code: string;
    name: string;
    score: number;
    status: string;
  }[];
}

export async function calculateReadiness(userId: string): Promise<ReadinessResult> {
  // 1. Check if user has completed baseline assessment
  const baselineAttempts = await db
    .select({
      id: attempts.id,
      score: attempts.score,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(tests, eq(attempts.testId, tests.id))
    .where(
      and(
        eq(attempts.userId, userId),
        eq(tests.type, "baseline"),
        eq(attempts.status, "submitted")
      )
    )
    .orderBy(desc(attempts.submittedAt))
    .limit(1);

  const hasCompletedBaseline = baselineAttempts.length > 0;

  // 2. Fetch all subjects
  const allSubjects = await db.select().from(subjects);
  const subjectByCode: Record<string, typeof allSubjects[0]> = {};
  allSubjects.forEach((s) => {
    subjectByCode[s.code] = s;
  });

  // 3. If baseline is not completed, return empty state with zeroed/null readiness
  if (!hasCompletedBaseline) {
    return {
      hasCompletedBaseline: false,
      readinessScore: null,
      level: null,
      breakdown: null,
      subjectScores: allSubjects.map((s) => ({
        subjectId: s.id,
        code: s.code,
        name: s.name,
        score: 0,
        status: "NOT ATTEMPTED",
      })),
    };
  }

  // 4. Calculate average score per subject across all submitted attempts
  const subjectPerformance = await db
    .select({
      subjectId: skillScores.subjectId,
      avgAccuracy: sql<number>`AVG(${skillScores.accuracy})`,
    })
    .from(skillScores)
    .innerJoin(attempts, eq(skillScores.attemptId, attempts.id))
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.status, "submitted"),
        sql`${skillScores.topicId} IS NULL`
      )
    )
    .groupBy(skillScores.subjectId);

  const scoreMap: Record<string, number> = {};
  subjectPerformance.forEach((row) => {
    scoreMap[row.subjectId] = Math.round(Number(row.avgAccuracy) || 0);
  });

  const getSubjectScore = (code: string): number => {
    const subj = subjectByCode[code];
    if (!subj) return 0;
    return scoreMap[subj.id] ?? 0;
  };

  const aptScore = getSubjectScore("APT");
  const dsaScore = getSubjectScore("DSA");
  const dbmsScore = getSubjectScore("DBMS");
  const osScore = getSubjectScore("OS");
  const cnScore = getSubjectScore("CN");
  const oopScore = getSubjectScore("OOP");
  const sqlScore = getSubjectScore("SQL");

  // Core CS is the average of DBMS, OS, CN, OOP
  const coreCsScores = [dbmsScore, osScore, cnScore, oopScore].filter((s) => s > 0);
  const coreCsAverage =
    coreCsScores.length > 0
      ? Math.round(coreCsScores.reduce((a, b) => a + b, 0) / coreCsScores.length)
      : Math.round((dbmsScore + osScore + cnScore + oopScore) / 4);

  // 5. Calculate Overall Test Performance (average score of all submitted tests)
  const allSubmittedAttempts = await db
    .select({
      score: attempts.score,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")));

  const overallTestScore =
    allSubmittedAttempts.length > 0
      ? Math.round(
          allSubmittedAttempts.reduce((acc, curr) => acc + (curr.score || 0), 0) /
            allSubmittedAttempts.length
        )
      : 0;

  // 6. Calculate Consistency (based on test volume and distinct active days)
  const uniqueDays = new Set(
    allSubmittedAttempts.map((a) =>
      new Date(a.submittedAt || a.startedAt).toISOString().split("T")[0]
    )
  ).size;

  const consistencyScore = Math.min(
    100,
    Math.round(40 + uniqueDays * 15 + allSubmittedAttempts.length * 5)
  );

  // 7. Weighted Readiness Calculation
  const calculatedReadiness = Math.round(
    aptScore * READINESS_WEIGHTS.aptitude +
      dsaScore * READINESS_WEIGHTS.dsa +
      coreCsAverage * READINESS_WEIGHTS.core_cs +
      sqlScore * READINESS_WEIGHTS.sql +
      overallTestScore * READINESS_WEIGHTS.overall_test +
      consistencyScore * READINESS_WEIGHTS.consistency
  );

  const finalReadiness = Math.max(0, Math.min(100, calculatedReadiness));
  const level = getReadinessLevel(finalReadiness);

  // Subject scores formatted for dashboard / profile
  const subjectScores = allSubjects.map((s) => {
    const sc = scoreMap[s.id] ?? 0;
    let status = "WEAK";
    if (sc >= 80) status = "STRONG";
    else if (sc >= 60) status = "COMPETITIVE";
    else if (sc >= 40) status = "NEEDS WORK";

    return {
      subjectId: s.id,
      code: s.code,
      name: s.name,
      score: sc,
      status,
    };
  });

  return {
    hasCompletedBaseline: true,
    readinessScore: finalReadiness,
    level,
    breakdown: {
      aptitude: aptScore,
      dsa: dsaScore,
      coreCs: coreCsAverage,
      sql: sqlScore,
      overallTest: overallTestScore,
      consistency: consistencyScore,
    },
    subjectScores,
  };
}

export interface WeakArea {
  topicId: string;
  topicName: string;
  subjectName: string;
  subjectCode: string;
  accuracy: number;
  totalAttempts: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export async function detectWeakAreas(userId: string): Promise<WeakArea[]> {
  const topicStats = await db
    .select({
      topicId: topics.id,
      topicName: topics.name,
      subjectName: subjects.name,
      subjectCode: subjects.code,
      totalAttempts: sql<number>`COUNT(${answers.id})`,
      correctCount: sql<number>`SUM(CASE WHEN ${answers.isCorrect} = true THEN 1 ELSE 0 END)`,
    })
    .from(answers)
    .innerJoin(attempts, eq(answers.attemptId, attempts.id))
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(topics, eq(questions.topicId, topics.id))
    .innerJoin(subjects, eq(questions.subjectId, subjects.id))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")))
    .groupBy(topics.id, topics.name, subjects.name, subjects.code);

  const weakAreas: WeakArea[] = [];

  for (const stat of topicStats) {
    const total = Number(stat.totalAttempts) || 0;
    const correct = Number(stat.correctCount) || 0;
    if (total === 0) continue;

    const accuracy = Math.round((correct / total) * 100);

    if (accuracy < 70) {
      let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";
      if (total >= 10 && accuracy < 50) {
        priority = "HIGH";
      } else if (accuracy < 60 || total >= 5) {
        priority = "MEDIUM";
      }

      weakAreas.push({
        topicId: stat.topicId,
        topicName: stat.topicName,
        subjectName: stat.subjectName,
        subjectCode: stat.subjectCode,
        accuracy,
        totalAttempts: total,
        priority,
      });
    }
  }

  weakAreas.sort((a, b) => {
    const priorityScore = { HIGH: 3, MEDIUM: 2, LOW: 1 };
    if (priorityScore[a.priority] !== priorityScore[b.priority]) {
      return priorityScore[b.priority] - priorityScore[a.priority];
    }
    if (a.accuracy !== b.accuracy) {
      return a.accuracy - b.accuracy;
    }
    return b.totalAttempts - a.totalAttempts;
  });

  return weakAreas.slice(0, 5);
}
