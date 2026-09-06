import { db } from "@/db";
import {
  attempts,
  answers,
  questions,
  tests,
  subjects,
  topics,
  attemptQuestions,
  testQuestions,
  questionPools,
  questionPoolQuestions,
} from "@/db/schema";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { calculateReadiness, ReadinessResult } from "./readiness";
import { getEffectiveTestStatus } from "@/lib/lifecycle";

// ============================================================================
// 1. CENTRALIZED EVIDENCE THRESHOLDS & POLICY RULES
// ============================================================================

export const EVIDENCE_THRESHOLDS = {
  ZERO_ATTEMPTS: 0,
  LIMITED_DATA_MAX_ATTEMPTS: 2,
  SUBJECT_RECOMMENDATION_MIN_ATTEMPTS: 3,
  TOPIC_RECOMMENDATION_MIN_QUESTIONS: 5,
  STRONG_WEAK_SIGNAL_QUESTIONS: 10,
  CONFIDENCE: {
    HIGH_MIN_QUESTIONS: 20,
    MEDIUM_MIN_QUESTIONS: 10,
    LOW_MIN_QUESTIONS: 5,
  },
  ACCURACY: {
    CRITICAL_WEAK: 50,
    HIGH_WEAK: 60,
    WEAK_THRESHOLD: 70,
    STRONG_THRESHOLD: 80,
    VERY_STRONG_THRESHOLD: 85,
  },
  PROGRESSION: {
    EASY_TO_MEDIUM_ACCURACY: 80,
    MEDIUM_TO_HARD_ACCURACY: 70,
    MEDIUM_REINFORCE_ACCURACY: 50,
    MIN_SAMPLE_SIZE: 5,
  },
  UNANSWERED: {
    HIGH_RATE_PERCENT: 20,
    MIN_TOTAL_QUESTIONS: 15,
  },
  NEGATIVE_MARKING: {
    AVG_PENALTY_MARKS_THRESHOLD: 2.0,
    MIN_NEGATIVE_ATTEMPTS: 1,
  },
  CONSISTENCY: {
    INACTIVITY_DAYS_THRESHOLD: 14,
    LOW_CONSISTENCY_SCORE: 55,
  },
  MAX_RECOMMENDATIONS: 5,
  MIN_RECOMMENDATIONS: 1,
} as const;

// ============================================================================
// 2. TYPES AND DATA CONTRACTS
// ============================================================================

export type RecommendationType =
  | "WEAK_TOPIC"
  | "WEAK_SUBJECT"
  | "DIFFICULTY_PROGRESSION"
  | "CONSISTENCY"
  | "RETAKE_REVIEW"
  | "MAINTENANCE";

export type RecommendationPriority = "Critical" | "High" | "Medium" | "Low";

export type TrendDirection =
  | "improving"
  | "stable"
  | "declining"
  | "insufficient_data";

export type ConfidenceLevel = "Low" | "Medium" | "High";

export interface StudentRecommendation {
  id: string;
  type: RecommendationType;
  priority: RecommendationPriority;
  priorityRank: number; // 4 = Critical, 3 = High, 2 = Medium, 1 = Low
  title: string;
  action: string;
  reason: string;
  subject: string | null;
  subjectCode: string | null;
  topic: string | null;
  topicId: string | null;
  metric: string;
  route: string;
  ctaText: string;
  confidence: ConfidenceLevel;
  recommendedTestId?: string | null;
  recommendedTestTitle?: string | null;
}

export interface ReadinessContributor {
  name: string;
  code: string;
  score: number;
  weight: number;
  type: "positive" | "negative";
  status: string;
  differenceFromBenchmark: number;
}

export interface TopicPerformanceItem {
  topicId: string;
  topicName: string;
  subjectName: string;
  subjectCode: string;
  accuracy: number;
  totalAttempts: number;
  correctCount: number;
  unansweredCount: number;
  priority:
    | "CRITICAL"
    | "HIGH_PRIORITY"
    | "NEEDS_PRACTICE"
    | "MAINTAINING"
    | "STRONG";
  weaknessScore: number;
  trend: TrendDirection;
  confidence: ConfidenceLevel;
}

export interface EligibleRecommendedTest {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard" | null;
  duration: number;
  questionCount: number;
  matchingReason: string;
  subjectCodes: string[];
}

export interface StudentIntelligence {
  userId: string;
  dataSufficiency: {
    hasData: boolean;
    hasCompletedBaseline: boolean;
    attemptsCount: number;
    questionsAttempted: number;
    status: "zero_data" | "limited_data" | "sufficient_data";
    message: string;
  };
  readiness: {
    score: number | null;
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
    positiveContributors: ReadinessContributor[];
    negativeContributors: ReadinessContributor[];
  };
  trend: {
    overall: TrendDirection;
    subjectTrends: Record<string, TrendDirection>;
    recentAttemptAvg: number | null;
    earlierAttemptAvg: number | null;
  };
  difficulty: {
    progressionTarget: "easy" | "medium" | "hard" | null;
    easy: { accuracy: number; attempted: number; correct: number };
    medium: { accuracy: number; attempted: number; correct: number };
    hard: { accuracy: number; attempted: number; correct: number };
  };
  discipline: {
    unansweredRate: number;
    unansweredCount: number;
    totalPresented: number;
    hasUnansweredIssue: boolean;
    negativeMarkingLossAvg: number;
    negativeMarkedCount: number;
    hasNegativeMarkingIssue: boolean;
    daysSinceLastAttempt: number | null;
  };
  weakAreas: TopicPerformanceItem[];
  strengths: {
    topSubjects: { name: string; code: string; score: number }[];
    topTopics: {
      topicName: string;
      subjectCode: string;
      accuracy: number;
      totalAttempts: number;
    }[];
  };
  recommendations: StudentRecommendation[];
  topAction: StudentRecommendation | null;
  eligibleRecommendedTests: EligibleRecommendedTest[];
}

// ============================================================================
// 3. EXPLAINABILITY: DETERMINISTIC REASON GENERATOR
// ============================================================================

export function buildRecommendationReason(params: {
  type: RecommendationType;
  subjectName?: string;
  subjectCode?: string;
  topicName?: string;
  accuracy?: number;
  questionCount?: number;
  overallAverage?: number;
  trend?: TrendDirection;
  easyAccuracy?: number;
  easyCount?: number;
  mediumAccuracy?: number;
  mediumCount?: number;
  avgPenaltyMarks?: number;
  unansweredRate?: number;
  unansweredCount?: number;
  totalPresented?: number;
  inactivityDays?: number;
  recentScore?: number;
  testTitle?: string;
}): string {
  switch (params.type) {
    case "WEAK_TOPIC": {
      const acc = params.accuracy ?? 0;
      const count = params.questionCount ?? 0;
      const topic = params.topicName || "this topic";
      let detail = `Your accuracy in ${topic} is ${acc}% across ${count} questions.`;
      if (params.overallAverage && acc < params.overallAverage) {
        detail += ` This is ${params.overallAverage - acc}% below your overall average (${params.overallAverage}%).`;
      }
      if (params.trend === "declining") {
        detail += ` Your accuracy has declined in recent attempts.`;
      }
      return detail;
    }

    case "WEAK_SUBJECT": {
      const subj = params.subjectName || params.subjectCode || "this subject";
      const acc = params.accuracy ?? 0;
      const count = params.questionCount ?? 0;
      let detail = `${subj} is currently your largest readiness gap with ${acc}% accuracy across ${count} questions.`;
      if (params.trend === "declining") {
        detail += ` Recent test performances indicate a downward trend.`;
      } else {
        detail += ` Improving this domain will yield the highest increase in overall placement readiness.`;
      }
      return detail;
    }

    case "DIFFICULTY_PROGRESSION": {
      if (
        params.easyAccuracy !== undefined &&
        params.mediumAccuracy !== undefined
      ) {
        return `Your Easy accuracy is ${params.easyAccuracy}% across ${params.easyCount ?? 0} questions, while Medium accuracy is ${params.mediumAccuracy}%. Advancing to Medium difficulty will bridge this gap.`;
      }
      if (params.mediumAccuracy !== undefined && params.mediumAccuracy >= 70) {
        return `Your Medium accuracy is solid at ${params.mediumAccuracy}% across ${params.mediumCount ?? 0} questions. Advancing to Hard difficulty questions is the next step to achieve tier-1 placement readiness.`;
      }
      if (params.mediumAccuracy !== undefined && params.mediumAccuracy < 50) {
        return `Your Medium accuracy is ${params.mediumAccuracy}% across ${params.mediumCount ?? 0} questions. Reinforcing core concepts before attempting harder questions will stabilize your performance.`;
      }
      return `Targeting calibrated difficulty levels will systematically improve your interview velocity.`;
    }

    case "CONSISTENCY": {
      if (params.inactivityDays !== undefined && params.inactivityDays >= 14) {
        return `You have not completed a test in ${params.inactivityDays} days. Taking a mixed assessment refreshes your performance baseline and keeps core skills active.`;
      }
      return `Complete regular assessments to build a consistent testing habit and maintain accurate placement readiness indexing.`;
    }

    case "RETAKE_REVIEW": {
      const title = params.testTitle ? `"${params.testTitle}"` : "your recent test";
      return `Your score on ${title} was ${params.recentScore ?? 0}%. Reviewing incorrect responses now reinforces retention and prevents recurring errors.`;
    }

    case "MAINTENANCE": {
      const subj = params.subjectName || params.subjectCode || "this subject";
      return `${subj} is currently one of your strongest areas at ${params.accuracy ?? 0}% accuracy. Maintain this advantage with occasional mixed practice.`;
    }

    default:
      return "Target this high-value action to improve your placement preparation velocity.";
  }
}

// ============================================================================
// 4. WEAK AREA DETECTION WITH EVIDENCE & RECENCY MODEL
// ============================================================================

export function calculateWeaknessScore(
  accuracy: number,
  totalAttempts: number,
  trend: TrendDirection
): number {
  if (totalAttempts < EVIDENCE_THRESHOLDS.TOPIC_RECOMMENDATION_MIN_QUESTIONS) {
    return 0;
  }
  const accuracyDeficit = Math.max(
    0,
    EVIDENCE_THRESHOLDS.ACCURACY.WEAK_THRESHOLD - accuracy
  );
  if (accuracyDeficit <= 0) return 0;

  // Evidence confidence factor: 5-9 -> 0.6, 10-19 -> 0.8, 20+ -> 1.0
  let evidenceFactor = 0.6;
  if (totalAttempts >= EVIDENCE_THRESHOLDS.CONFIDENCE.HIGH_MIN_QUESTIONS) {
    evidenceFactor = 1.0;
  } else if (
    totalAttempts >= EVIDENCE_THRESHOLDS.CONFIDENCE.MEDIUM_MIN_QUESTIONS
  ) {
    evidenceFactor = 0.8;
  }

  // Recency trend factor: declining worsens weakness (1.2), improving lessens (0.8)
  let recencyFactor = 1.0;
  if (trend === "declining") recencyFactor = 1.2;
  else if (trend === "improving") recencyFactor = 0.8;

  return Math.round(accuracyDeficit * evidenceFactor * recencyFactor * 10) / 10;
}

// ============================================================================
// 5. DETERMINISTIC STUDENT INTELLIGENCE ENGINE
// ============================================================================

export async function getStudentIntelligence(
  userId: string,
  nowInput?: Date | string | number | null
): Promise<StudentIntelligence> {
  const now = nowInput ? new Date(nowInput) : new Date();

  // 1. Fetch submitted attempts with details
  const submittedAttempts = await db
    .select({
      id: attempts.id,
      testId: attempts.testId,
      testTitle: tests.title,
      testType: tests.type,
      score: attempts.score,
      accuracy: attempts.accuracy,
      timeTaken: attempts.timeTaken,
      negativeMarkingEnabled: attempts.negativeMarkingEnabled,
      negativeMarkRate: attempts.negativeMarkRate,
      startedAt: attempts.startedAt,
      submittedAt: attempts.submittedAt,
    })
    .from(attempts)
    .innerJoin(tests, eq(attempts.testId, tests.id))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")))
    .orderBy(asc(attempts.submittedAt)); // Chronological order

  const attemptsCount = submittedAttempts.length;

  // 2. Fetch baseline readiness
  const readinessRes: ReadinessResult = await calculateReadiness(userId);
  const hasCompletedBaseline = readinessRes.hasCompletedBaseline;

  // 3. ZERO-DATA EXPERIENCE
  if (attemptsCount === 0 || !hasCompletedBaseline) {
    return {
      userId,
      dataSufficiency: {
        hasData: false,
        hasCompletedBaseline: false,
        attemptsCount: 0,
        questionsAttempted: 0,
        status: "zero_data",
        message:
          "Complete your baseline assessment to unlock personalized recommendations and placement readiness indexing.",
      },
      readiness: {
        score: null,
        level: null,
        breakdown: null,
        subjectScores: readinessRes.subjectScores,
        positiveContributors: [],
        negativeContributors: [],
      },
      trend: {
        overall: "insufficient_data",
        subjectTrends: {},
        recentAttemptAvg: null,
        earlierAttemptAvg: null,
      },
      difficulty: {
        progressionTarget: null,
        easy: { accuracy: 0, attempted: 0, correct: 0 },
        medium: { accuracy: 0, attempted: 0, correct: 0 },
        hard: { accuracy: 0, attempted: 0, correct: 0 },
      },
      discipline: {
        unansweredRate: 0,
        unansweredCount: 0,
        totalPresented: 0,
        hasUnansweredIssue: false,
        negativeMarkingLossAvg: 0,
        negativeMarkedCount: 0,
        hasNegativeMarkingIssue: false,
        daysSinceLastAttempt: null,
      },
      weakAreas: [],
      strengths: { topSubjects: [], topTopics: [] },
      recommendations: [],
      topAction: null,
      eligibleRecommendedTests: [],
    };
  }

  // 4. Fetch detailed answers and attempt questions
  const attemptIds = submittedAttempts.map((a) => a.id);

  const answerRows = await db
    .select({
      id: answers.id,
      attemptId: answers.attemptId,
      questionId: answers.questionId,
      isCorrect: answers.isCorrect,
      selectedAnswer: answers.selectedAnswer,
      timeSpent: answers.timeSpent,
      difficulty: questions.difficulty,
      marks: questions.marks,
      topicId: topics.id,
      topicName: topics.name,
      subjectId: subjects.id,
      subjectCode: subjects.code,
      subjectName: subjects.name,
    })
    .from(answers)
    .innerJoin(attempts, eq(answers.attemptId, attempts.id))
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(topics, eq(questions.topicId, topics.id))
    .innerJoin(subjects, eq(questions.subjectId, subjects.id))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")));

  // Calculate total questions presented vs answered across all submitted tests
  const attemptQuestionCounts = await db
    .select({
      attemptId: attemptQuestions.attemptId,
      count: sql<number>`count(*)`,
    })
    .from(attemptQuestions)
    .where(inArray(attemptQuestions.attemptId, attemptIds))
    .groupBy(attemptQuestions.attemptId);

  const aqCountMap = new Map<string, number>();
  attemptQuestionCounts.forEach((row) => {
    aqCountMap.set(row.attemptId, Number(row.count) || 0);
  });

  // Fallback if attemptQuestions table wasn't used for older tests: count answers or testQuestions
  let totalQuestionsPresented = 0;
  for (const att of submittedAttempts) {
    const aqCount = aqCountMap.get(att.id);
    if (aqCount && aqCount > 0) {
      totalQuestionsPresented += aqCount;
    } else {
      // Fallback: total answers recorded for this attempt
      const ansCount = answerRows.filter((a) => a.attemptId === att.id).length;
      totalQuestionsPresented += Math.max(ansCount, 1);
    }
  }

  const answeredRows = answerRows.filter(
    (a) => a.selectedAnswer !== null && a.selectedAnswer !== undefined
  );
  const totalQuestionsAnswered = answeredRows.length;
  const unansweredCount = Math.max(
    0,
    totalQuestionsPresented - totalQuestionsAnswered
  );
  const unansweredRate =
    totalQuestionsPresented > 0
      ? Math.round((unansweredCount / totalQuestionsPresented) * 100)
      : 0;

  // 5. RECENCY & TREND MODEL
  // If count >= 3, compare earlier half of attempts vs recent half of attempts
  let overallTrend: TrendDirection = "insufficient_data";
  let recentAttemptAvg: number | null = null;
  let earlierAttemptAvg: number | null = null;

  if (attemptsCount >= 3) {
    const half = Math.floor(attemptsCount / 2);
    const earlier = submittedAttempts.slice(0, half);
    const recent = submittedAttempts.slice(half);

    earlierAttemptAvg = Math.round(
      earlier.reduce((acc, curr) => acc + (curr.accuracy || 0), 0) / earlier.length
    );
    recentAttemptAvg = Math.round(
      recent.reduce((acc, curr) => acc + (curr.accuracy || 0), 0) / recent.length
    );

    const diff = recentAttemptAvg - earlierAttemptAvg;
    if (diff >= 5) overallTrend = "improving";
    else if (diff <= -5) overallTrend = "declining";
    else overallTrend = "stable";
  }

  // Group answers by attempt chronology to compute topic and subject trends
  const attemptOrderMap = new Map<string, number>();
  submittedAttempts.forEach((att, idx) => {
    attemptOrderMap.set(att.id, idx);
  });

  // Per-topic aggregation
  const topicStatsMap = new Map<
    string,
    {
      topicId: string;
      topicName: string;
      subjectName: string;
      subjectCode: string;
      totalAttempts: number;
      correctCount: number;
      unansweredCount: number;
      earlierCorrect: number;
      earlierTotal: number;
      recentCorrect: number;
      recentTotal: number;
    }
  >();

  const subjectStatsMap = new Map<
    string,
    {
      subjectCode: string;
      subjectName: string;
      totalAttempts: number;
      correctCount: number;
      earlierCorrect: number;
      earlierTotal: number;
      recentCorrect: number;
      recentTotal: number;
    }
  >();

  const halfAttemptIdx = Math.floor(attemptsCount / 2);

  for (const ans of answerRows) {
    // Topic stats
    if (!topicStatsMap.has(ans.topicId)) {
      topicStatsMap.set(ans.topicId, {
        topicId: ans.topicId,
        topicName: ans.topicName,
        subjectName: ans.subjectName,
        subjectCode: ans.subjectCode,
        totalAttempts: 0,
        correctCount: 0,
        unansweredCount: 0,
        earlierCorrect: 0,
        earlierTotal: 0,
        recentCorrect: 0,
        recentTotal: 0,
      });
    }
    const tStat = topicStatsMap.get(ans.topicId)!;
    tStat.totalAttempts++;
    if (ans.isCorrect) tStat.correctCount++;
    if (ans.selectedAnswer === null || ans.selectedAnswer === undefined) {
      tStat.unansweredCount++;
    }

    const attIdx = attemptOrderMap.get(ans.attemptId) ?? 0;
    if (attIdx < halfAttemptIdx) {
      tStat.earlierTotal++;
      if (ans.isCorrect) tStat.earlierCorrect++;
    } else {
      tStat.recentTotal++;
      if (ans.isCorrect) tStat.recentCorrect++;
    }

    // Subject stats
    if (!subjectStatsMap.has(ans.subjectCode)) {
      subjectStatsMap.set(ans.subjectCode, {
        subjectCode: ans.subjectCode,
        subjectName: ans.subjectName,
        totalAttempts: 0,
        correctCount: 0,
        earlierCorrect: 0,
        earlierTotal: 0,
        recentCorrect: 0,
        recentTotal: 0,
      });
    }
    const sStat = subjectStatsMap.get(ans.subjectCode)!;
    sStat.totalAttempts++;
    if (ans.isCorrect) sStat.correctCount++;
    if (attIdx < halfAttemptIdx) {
      sStat.earlierTotal++;
      if (ans.isCorrect) sStat.earlierCorrect++;
    } else {
      sStat.recentTotal++;
      if (ans.isCorrect) sStat.recentCorrect++;
    }
  }

  // Compute subject trends
  const subjectTrends: Record<string, TrendDirection> = {};
  subjectStatsMap.forEach((sStat, code) => {
    if (attemptsCount < 3 || sStat.earlierTotal < 3 || sStat.recentTotal < 3) {
      subjectTrends[code] = "insufficient_data";
    } else {
      const earlyAcc = Math.round((sStat.earlierCorrect / sStat.earlierTotal) * 100);
      const recAcc = Math.round((sStat.recentCorrect / sStat.recentTotal) * 100);
      const sDiff = recAcc - earlyAcc;
      if (sDiff >= 5) subjectTrends[code] = "improving";
      else if (sDiff <= -5) subjectTrends[code] = "declining";
      else subjectTrends[code] = "stable";
    }
  });

  // 6. TOPIC PRIORITIZATION & WEAK AREA DETECTION
  const topicPriorities: TopicPerformanceItem[] = [];

  topicStatsMap.forEach((stat) => {
    const accuracy =
      stat.totalAttempts > 0
        ? Math.round((stat.correctCount / stat.totalAttempts) * 100)
        : 0;

    let trend: TrendDirection = "insufficient_data";
    if (attemptsCount >= 3 && stat.earlierTotal >= 2 && stat.recentTotal >= 2) {
      const earlyAcc = Math.round((stat.earlierCorrect / stat.earlierTotal) * 100);
      const recAcc = Math.round((stat.recentCorrect / stat.recentTotal) * 100);
      const tDiff = recAcc - earlyAcc;
      if (tDiff >= 5) trend = "improving";
      else if (tDiff <= -5) trend = "declining";
      else trend = "stable";
    }

    let confidence: ConfidenceLevel = "Low";
    if (stat.totalAttempts >= EVIDENCE_THRESHOLDS.CONFIDENCE.HIGH_MIN_QUESTIONS) {
      confidence = "High";
    } else if (
      stat.totalAttempts >= EVIDENCE_THRESHOLDS.CONFIDENCE.MEDIUM_MIN_QUESTIONS
    ) {
      confidence = "Medium";
    }

    let priority: TopicPerformanceItem["priority"] = "MAINTAINING";
    if (
      stat.totalAttempts >= EVIDENCE_THRESHOLDS.STRONG_WEAK_SIGNAL_QUESTIONS &&
      accuracy < EVIDENCE_THRESHOLDS.ACCURACY.CRITICAL_WEAK
    ) {
      priority = "CRITICAL";
    } else if (
      stat.totalAttempts >=
        EVIDENCE_THRESHOLDS.TOPIC_RECOMMENDATION_MIN_QUESTIONS &&
      accuracy < EVIDENCE_THRESHOLDS.ACCURACY.HIGH_WEAK
    ) {
      priority = "HIGH_PRIORITY";
    } else if (
      stat.totalAttempts >=
        EVIDENCE_THRESHOLDS.TOPIC_RECOMMENDATION_MIN_QUESTIONS &&
      accuracy < EVIDENCE_THRESHOLDS.ACCURACY.WEAK_THRESHOLD
    ) {
      priority = "NEEDS_PRACTICE";
    } else if (
      stat.totalAttempts >=
        EVIDENCE_THRESHOLDS.TOPIC_RECOMMENDATION_MIN_QUESTIONS &&
      accuracy >= EVIDENCE_THRESHOLDS.ACCURACY.VERY_STRONG_THRESHOLD
    ) {
      priority = "STRONG";
    } else {
      priority = "MAINTAINING";
    }

    const weaknessScore = calculateWeaknessScore(
      accuracy,
      stat.totalAttempts,
      trend
    );

    topicPriorities.push({
      topicId: stat.topicId,
      topicName: stat.topicName,
      subjectName: stat.subjectName,
      subjectCode: stat.subjectCode,
      accuracy,
      totalAttempts: stat.totalAttempts,
      correctCount: stat.correctCount,
      unansweredCount: stat.unansweredCount,
      priority,
      weaknessScore,
      trend,
      confidence,
    });
  });

  // Filter true weak areas: accuracy < 70 and questions >= 5
  const weakAreas = topicPriorities
    .filter(
      (t) =>
        t.totalAttempts >=
          EVIDENCE_THRESHOLDS.TOPIC_RECOMMENDATION_MIN_QUESTIONS &&
        t.accuracy < EVIDENCE_THRESHOLDS.ACCURACY.WEAK_THRESHOLD
    )
    .sort((a, b) => {
      // Sort by weakness score desc, then sample size desc, then alphabetical
      if (b.weaknessScore !== a.weaknessScore) {
        return b.weaknessScore - a.weaknessScore;
      }
      if (a.accuracy !== b.accuracy) {
        return a.accuracy - b.accuracy;
      }
      if (b.totalAttempts !== a.totalAttempts) {
        return b.totalAttempts - a.totalAttempts;
      }
      return a.topicName.localeCompare(b.topicName);
    });

  // 7. STRENGTHS DETECTION
  const strongTopics = topicPriorities
    .filter(
      (t) =>
        t.totalAttempts >=
          EVIDENCE_THRESHOLDS.TOPIC_RECOMMENDATION_MIN_QUESTIONS &&
        t.accuracy >= EVIDENCE_THRESHOLDS.ACCURACY.STRONG_THRESHOLD
    )
    .sort((a, b) => {
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      if (b.totalAttempts !== a.totalAttempts)
        return b.totalAttempts - a.totalAttempts;
      return a.topicName.localeCompare(b.topicName);
    })
    .slice(0, 5)
    .map((t) => ({
      topicName: t.topicName,
      subjectCode: t.subjectCode,
      accuracy: t.accuracy,
      totalAttempts: t.totalAttempts,
    }));

  const strongSubjects = readinessRes.subjectScores
    .filter((s) => s.score >= EVIDENCE_THRESHOLDS.ACCURACY.STRONG_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map((s) => ({
      name: s.name,
      code: s.code,
      score: s.score,
    }));

  // 8. READINESS CONTRIBUTORS (DRIVERS)
  const breakdown = readinessRes.breakdown;
  const currentReadiness = readinessRes.readinessScore ?? 0;

  const positiveContributors: ReadinessContributor[] = [];
  const negativeContributors: ReadinessContributor[] = [];

  if (breakdown) {
    const components: {
      name: string;
      code: string;
      score: number;
      weight: number;
    }[] = [
      { name: "Aptitude", code: "APT", score: breakdown.aptitude, weight: 0.2 },
      { name: "DSA", code: "DSA", score: breakdown.dsa, weight: 0.2 },
      { name: "Core CS", code: "CORE_CS", score: breakdown.coreCs, weight: 0.3 },
      { name: "SQL", code: "SQL", score: breakdown.sql, weight: 0.1 },
      {
        name: "Overall Test Performance",
        code: "OVERALL_TEST",
        score: breakdown.overallTest,
        weight: 0.1,
      },
      {
        name: "Consistency",
        code: "CONSISTENCY",
        score: breakdown.consistency,
        weight: 0.1,
      },
    ];

    for (const comp of components) {
      const diff = comp.score - currentReadiness;
      let status = "Developing";
      if (comp.score >= 80) status = "Strong";
      else if (comp.score >= 65) status = "Competitive";
      else if (comp.score < 50) status = "Needs Work";

      const contributor: ReadinessContributor = {
        name: comp.name,
        code: comp.code,
        score: comp.score,
        weight: comp.weight,
        type: comp.score >= currentReadiness ? "positive" : "negative",
        status,
        differenceFromBenchmark: diff,
      };

      if (comp.score >= currentReadiness || comp.score >= 70) {
        positiveContributors.push(contributor);
      } else {
        negativeContributors.push(contributor);
      }
    }

    // Sort positive contributors: highest score and impact first
    positiveContributors.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.weight - a.weight;
    });

    // Sort negative contributors: lowest score (largest gap) first
    negativeContributors.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return b.weight - a.weight;
    });
  }

  // 9. DIFFICULTY PROGRESSION
  const diffAgg: Record<
    "easy" | "medium" | "hard",
    { attempted: number; correct: number }
  > = {
    easy: { attempted: 0, correct: 0 },
    medium: { attempted: 0, correct: 0 },
    hard: { attempted: 0, correct: 0 },
  };

  for (const a of answerRows) {
    if (a.difficulty && diffAgg[a.difficulty]) {
      diffAgg[a.difficulty].attempted++;
      if (a.isCorrect) diffAgg[a.difficulty].correct++;
    }
  }

  const easyAcc =
    diffAgg.easy.attempted > 0
      ? Math.round((diffAgg.easy.correct / diffAgg.easy.attempted) * 100)
      : 0;
  const medAcc =
    diffAgg.medium.attempted > 0
      ? Math.round((diffAgg.medium.correct / diffAgg.medium.attempted) * 100)
      : 0;
  const hardAcc =
    diffAgg.hard.attempted > 0
      ? Math.round((diffAgg.hard.correct / diffAgg.hard.attempted) * 100)
      : 0;

  let progressionTarget: "easy" | "medium" | "hard" | null = null;
  if (
    diffAgg.easy.attempted >=
      EVIDENCE_THRESHOLDS.PROGRESSION.MIN_SAMPLE_SIZE &&
    easyAcc >= EVIDENCE_THRESHOLDS.PROGRESSION.EASY_TO_MEDIUM_ACCURACY
  ) {
    if (
      diffAgg.medium.attempted <
        EVIDENCE_THRESHOLDS.PROGRESSION.MIN_SAMPLE_SIZE ||
      medAcc < EVIDENCE_THRESHOLDS.PROGRESSION.MEDIUM_TO_HARD_ACCURACY
    ) {
      progressionTarget = "medium";
    } else if (
      medAcc >= EVIDENCE_THRESHOLDS.PROGRESSION.MEDIUM_TO_HARD_ACCURACY
    ) {
      progressionTarget = "hard";
    }
  }

  // 10. DISCIPLINE & NEGATIVE MARKING SIGNALS
  let totalNegativeMarkedAttempts = 0;
  let totalPenaltyMarksLost = 0;

  for (const att of submittedAttempts) {
    const isNeg = att.negativeMarkingEnabled ?? false;
    const rate = Number(att.negativeMarkRate || 0);
    if (isNeg && rate > 0) {
      totalNegativeMarkedAttempts++;
      // Count incorrect answers for this attempt
      const incorrectInAtt = answerRows.filter(
        (a) => a.attemptId === att.id && a.isCorrect === false
      );
      for (const inc of incorrectInAtt) {
        const marks = inc.marks || 2;
        totalPenaltyMarksLost += marks * rate;
      }
    }
  }

  const negativeMarkingLossAvg =
    totalNegativeMarkedAttempts > 0
      ? Math.round((totalPenaltyMarksLost / totalNegativeMarkedAttempts) * 10) / 10
      : 0;

  const hasNegativeMarkingIssue =
    totalNegativeMarkedAttempts >=
      EVIDENCE_THRESHOLDS.NEGATIVE_MARKING.MIN_NEGATIVE_ATTEMPTS &&
    negativeMarkingLossAvg >=
      EVIDENCE_THRESHOLDS.NEGATIVE_MARKING.AVG_PENALTY_MARKS_THRESHOLD;

  const hasUnansweredIssue =
    totalQuestionsPresented >=
      EVIDENCE_THRESHOLDS.UNANSWERED.MIN_TOTAL_QUESTIONS &&
    unansweredRate >= EVIDENCE_THRESHOLDS.UNANSWERED.HIGH_RATE_PERCENT;

  // Days since last attempt
  const latestAttempt = submittedAttempts[submittedAttempts.length - 1];
  const lastAttemptDate = latestAttempt?.submittedAt
    ? new Date(latestAttempt.submittedAt)
    : null;
  const daysSinceLastAttempt = lastAttemptDate
    ? Math.max(
        0,
        Math.floor((now.getTime() - lastAttemptDate.getTime()) / (1000 * 60 * 60 * 24))
      )
    : null;

  // 11. FETCH ELIGIBLE TESTS FOR RECOMMENDATION ROUTING
  // Rule 16: Never recommend draft, scheduled before availability, closed, or archived tests.
  // Rule 16 & 26: Never recommend tests where attempt limit is exhausted.
  const candidateTests = await db
    .select({
      id: tests.id,
      title: tests.title,
      status: tests.status,
      difficulty: tests.difficulty,
      duration: tests.duration,
      attemptLimit: tests.attemptLimit,
      scheduledStartAt: tests.scheduledStartAt,
      scheduledEndAt: tests.scheduledEndAt,
      scheduleTimezone: tests.scheduleTimezone,
      isPublished: tests.isPublished,
    })
    .from(tests)
    .where(inArray(tests.status, ["published", "closed"]));

  // Check attempt counts for candidate tests
  const userAttemptCounts = await db
    .select({
      testId: attempts.testId,
      count: sql<number>`count(*)`,
    })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.status, "submitted"),
        inArray(
          attempts.testId,
          candidateTests.map((t) => t.id)
        )
      )
    )
    .groupBy(attempts.testId);

  const testAttemptCountMap = new Map<string, number>();
  userAttemptCounts.forEach((r) => {
    testAttemptCountMap.set(r.testId, Number(r.count) || 0);
  });

  const eligibleTests: EligibleRecommendedTest[] = [];

  for (const t of candidateTests) {
    const effectiveStatus = getEffectiveTestStatus(t, now);
    if (effectiveStatus !== "active") continue;

    // Check attempt limit
    const usedAttempts = testAttemptCountMap.get(t.id) ?? 0;
    if (
      t.attemptLimit !== null &&
      t.attemptLimit !== undefined &&
      usedAttempts >= t.attemptLimit
    ) {
      continue;
    }

    // Fetch subjects covered in this test
    const fixedSubj = await db
      .selectDistinct({ code: subjects.code })
      .from(testQuestions)
      .innerJoin(questions, eq(testQuestions.questionId, questions.id))
      .innerJoin(subjects, eq(questions.subjectId, subjects.id))
      .where(eq(testQuestions.testId, t.id));

    const poolSubj = await db
      .selectDistinct({ code: subjects.code })
      .from(questionPools)
      .innerJoin(
        questionPoolQuestions,
        eq(questionPools.id, questionPoolQuestions.poolId)
      )
      .innerJoin(questions, eq(questionPoolQuestions.questionId, questions.id))
      .innerJoin(subjects, eq(questions.subjectId, subjects.id))
      .where(eq(questionPools.testId, t.id));

    const subjSet = new Set<string>();
    fixedSubj.forEach((s) => subjSet.add(s.code));
    poolSubj.forEach((s) => subjSet.add(s.code));

    // Question count
    const qCountRes = await db
      .select({ count: sql<number>`count(*)` })
      .from(testQuestions)
      .where(eq(testQuestions.testId, t.id));
    const poolCountRes = await db
      .select({
        sum: sql<number>`COALESCE(sum(${questionPools.selectionCount}), 0)`,
      })
      .from(questionPools)
      .where(eq(questionPools.testId, t.id));
    const qCount =
      Number(qCountRes[0]?.count || 0) + Number(poolCountRes[0]?.sum || 0);

    eligibleTests.push({
      id: t.id,
      title: t.title,
      difficulty: t.difficulty,
      duration: t.duration,
      questionCount: qCount,
      matchingReason: "Available active test",
      subjectCodes: Array.from(subjSet),
    });
  }

  // 12. GENERATE RECOMMENDATIONS (NEXT-BEST-ACTION ENGINE)
  const candidateRecommendations: StudentRecommendation[] = [];

  // Data sufficiency check
  const isLimitedData =
    attemptsCount <= EVIDENCE_THRESHOLDS.LIMITED_DATA_MAX_ATTEMPTS;

  if (isLimitedData) {
    // Limited Data: Basic observation only
    candidateRecommendations.push({
      id: "limited-data-calibration",
      type: "CONSISTENCY",
      priority: "Medium",
      priorityRank: 2,
      title: "Establish Performance Baseline",
      action: "Complete another test to calibrate placement readiness",
      reason: `You have completed ${attemptsCount} ${
        attemptsCount === 1 ? "test" : "tests"
      } so far. Nexora requires at least 3 completed tests to reliably index subject trends and surface personalized weak areas.`,
      subject: null,
      subjectCode: null,
      topic: null,
      topicId: null,
      metric: `${attemptsCount}/3 calibration tests`,
      route: eligibleTests.length > 0 ? `/tests/${eligibleTests[0].id}` : "/tests",
      ctaText: "Take Next Test",
      confidence: "Low",
      recommendedTestId: eligibleTests[0]?.id || null,
      recommendedTestTitle: eligibleTests[0]?.title || null,
    });
  } else {
    // SUFFICIENT DATA (> 2 attempts): Generate personalized recommendations

    // 1. Weak Subject Recommendation (TYPE 2)
    // Identify lowest subject score among core subjects
    const testedSubjects = readinessRes.subjectScores
      .filter((s) => s.score > 0)
      .sort((a, b) => a.score - b.score);

    const lowestSubject = testedSubjects[0];
    if (lowestSubject && lowestSubject.score < EVIDENCE_THRESHOLDS.ACCURACY.WEAK_THRESHOLD) {
      const matchingTest = eligibleTests.find((t) =>
        t.subjectCodes.includes(lowestSubject.code)
      );

      const subjAnswers = answerRows.filter(
        (a) => a.subjectCode === lowestSubject.code
      );
      const subjTrend = subjectTrends[lowestSubject.code] || "insufficient_data";

      candidateRecommendations.push({
        id: `weak-subject-${lowestSubject.code.toLowerCase()}`,
        type: "WEAK_SUBJECT",
        priority: lowestSubject.score < 50 ? "Critical" : "High",
        priorityRank: lowestSubject.score < 50 ? 4 : 3,
        title: `Strengthen ${lowestSubject.name} Fundamentals`,
        action: `Focus practice on ${lowestSubject.name} core topics`,
        reason: buildRecommendationReason({
          type: "WEAK_SUBJECT",
          subjectName: lowestSubject.name,
          subjectCode: lowestSubject.code,
          accuracy: lowestSubject.score,
          questionCount: subjAnswers.length,
          trend: subjTrend,
        }),
        subject: lowestSubject.name,
        subjectCode: lowestSubject.code,
        topic: null,
        topicId: null,
        metric: `${lowestSubject.score}% subject score`,
        route: matchingTest ? `/tests/${matchingTest.id}` : "/tests",
        ctaText: `Practice ${lowestSubject.code}`,
        confidence:
          subjAnswers.length >= EVIDENCE_THRESHOLDS.CONFIDENCE.MEDIUM_MIN_QUESTIONS
            ? "High"
            : "Medium",
        recommendedTestId: matchingTest?.id || null,
        recommendedTestTitle: matchingTest?.title || null,
      });
    }

    // 2. Weak Topic Recommendations (TYPE 1)
    // Filter top weak topics (avoiding duplicates if subject recommendation already covers it directly)
    for (const wa of weakAreas.slice(0, 3)) {
      const matchingTest = eligibleTests.find((t) =>
        t.subjectCodes.includes(wa.subjectCode)
      );

      const isCritical =
        wa.accuracy < EVIDENCE_THRESHOLDS.ACCURACY.CRITICAL_WEAK &&
        wa.totalAttempts >= EVIDENCE_THRESHOLDS.STRONG_WEAK_SIGNAL_QUESTIONS;

      candidateRecommendations.push({
        id: `weak-topic-${wa.topicId}`,
        type: "WEAK_TOPIC",
        priority: isCritical ? "Critical" : wa.accuracy < 60 ? "High" : "Medium",
        priorityRank: isCritical ? 4 : wa.accuracy < 60 ? 3 : 2,
        title: `Target Weak Topic: ${wa.topicName}`,
        action: `Practice ${wa.subjectCode} • ${wa.topicName}`,
        reason: buildRecommendationReason({
          type: "WEAK_TOPIC",
          topicName: wa.topicName,
          accuracy: wa.accuracy,
          questionCount: wa.totalAttempts,
          overallAverage: currentReadiness,
          trend: wa.trend,
        }),
        subject: wa.subjectName,
        subjectCode: wa.subjectCode,
        topic: wa.topicName,
        topicId: wa.topicId,
        metric: `${wa.accuracy}% accuracy (${wa.correctCount}/${wa.totalAttempts})`,
        route: matchingTest ? `/tests/${matchingTest.id}` : "/tests",
        ctaText: `Practice Topic`,
        confidence: wa.confidence,
        recommendedTestId: matchingTest?.id || null,
        recommendedTestTitle: matchingTest?.title || null,
      });
    }

    // 3. Difficulty Progression (TYPE 3)
    if (
      diffAgg.easy.attempted >= EVIDENCE_THRESHOLDS.PROGRESSION.MIN_SAMPLE_SIZE &&
      easyAcc >= EVIDENCE_THRESHOLDS.PROGRESSION.EASY_TO_MEDIUM_ACCURACY &&
      (diffAgg.medium.attempted < EVIDENCE_THRESHOLDS.PROGRESSION.MIN_SAMPLE_SIZE ||
        medAcc < EVIDENCE_THRESHOLDS.PROGRESSION.MEDIUM_TO_HARD_ACCURACY)
    ) {
      const medTest = eligibleTests.find((t) => t.difficulty === "medium");
      candidateRecommendations.push({
        id: "difficulty-progression-medium",
        type: "DIFFICULTY_PROGRESSION",
        priority: "Medium",
        priorityRank: 2,
        title: "Advance to Medium Difficulty",
        action: "Take Medium difficulty placement assessments",
        reason: buildRecommendationReason({
          type: "DIFFICULTY_PROGRESSION",
          easyAccuracy: easyAcc,
          easyCount: diffAgg.easy.attempted,
          mediumAccuracy: medAcc,
          mediumCount: diffAgg.medium.attempted,
        }),
        subject: null,
        subjectCode: null,
        topic: null,
        topicId: null,
        metric: `${easyAcc}% Easy acc → ${medAcc}% Medium acc`,
        route: medTest ? `/tests/${medTest.id}` : "/tests",
        ctaText: "Practice Medium",
        confidence: "High",
        recommendedTestId: medTest?.id || null,
        recommendedTestTitle: medTest?.title || null,
      });
    } else if (
      diffAgg.medium.attempted >= EVIDENCE_THRESHOLDS.PROGRESSION.MIN_SAMPLE_SIZE &&
      medAcc >= EVIDENCE_THRESHOLDS.PROGRESSION.MEDIUM_TO_HARD_ACCURACY
    ) {
      const hardTest = eligibleTests.find((t) => t.difficulty === "hard");
      candidateRecommendations.push({
        id: "difficulty-progression-hard",
        type: "DIFFICULTY_PROGRESSION",
        priority: "Medium",
        priorityRank: 2,
        title: "Advance to Hard Difficulty",
        action: "Tackle Hard difficulty interview questions",
        reason: buildRecommendationReason({
          type: "DIFFICULTY_PROGRESSION",
          mediumAccuracy: medAcc,
          mediumCount: diffAgg.medium.attempted,
        }),
        subject: null,
        subjectCode: null,
        topic: null,
        topicId: null,
        metric: `${medAcc}% Medium acc`,
        route: hardTest ? `/tests/${hardTest.id}` : "/tests",
        ctaText: "Practice Hard",
        confidence: "High",
        recommendedTestId: hardTest?.id || null,
        recommendedTestTitle: hardTest?.title || null,
      });
    } else if (
      diffAgg.medium.attempted >= EVIDENCE_THRESHOLDS.PROGRESSION.MIN_SAMPLE_SIZE &&
      medAcc < EVIDENCE_THRESHOLDS.PROGRESSION.MEDIUM_REINFORCE_ACCURACY
    ) {
      candidateRecommendations.push({
        id: "difficulty-reinforce-medium",
        type: "DIFFICULTY_PROGRESSION",
        priority: "High",
        priorityRank: 3,
        title: "Reinforce Medium Fundamentals",
        action: "Focus on Medium difficulty concept consolidation",
        reason: buildRecommendationReason({
          type: "DIFFICULTY_PROGRESSION",
          mediumAccuracy: medAcc,
          mediumCount: diffAgg.medium.attempted,
        }),
        subject: null,
        subjectCode: null,
        topic: null,
        topicId: null,
        metric: `${medAcc}% Medium accuracy`,
        route: "/tests",
        ctaText: "Reinforce Fundamentals",
        confidence: "Medium",
      });
    }

    // 4. Negative Marking Penalty Signal (TYPE 4 or discipline recommendation)
    if (hasNegativeMarkingIssue) {
      candidateRecommendations.push({
        id: "negative-marking-discipline",
        type: "CONSISTENCY",
        priority: "High",
        priorityRank: 3,
        title: "Reduce Guessing on Negative Marking",
        action: "Practice selective answering to protect net score",
        reason: `You lost an average of ${negativeMarkingLossAvg.toFixed(
          1
        )} marks to incorrect answer penalties across ${totalNegativeMarkedAttempts} negative-marked tests. Skipping uncertain questions protects your placement score.`,
        subject: null,
        subjectCode: null,
        topic: null,
        topicId: null,
        metric: `-${negativeMarkingLossAvg.toFixed(1)} avg penalty marks`,
        route: "/analytics",
        ctaText: "View Penalty Analytics",
        confidence: "High",
      });
    }

    // 5. Unanswered Questions Signal
    if (hasUnansweredIssue) {
      candidateRecommendations.push({
        id: "unanswered-completion-discipline",
        type: "CONSISTENCY",
        priority: "Medium",
        priorityRank: 2,
        title: "Improve Test Completion Discipline",
        action: "Calibrate pacing to attempt all test questions",
        reason: `You left ${unansweredRate}% of questions unanswered (${unansweredCount}/${totalQuestionsPresented}) across recent tests. Pacing yourself ensures you don't miss accessible marks.`,
        subject: null,
        subjectCode: null,
        topic: null,
        topicId: null,
        metric: `${unansweredRate}% unanswered rate`,
        route: "/analytics",
        ctaText: "Review Test Speed",
        confidence: "High",
      });
    }

    // 6. Retake / Review (TYPE 5)
    // If latest attempt scored poorly (< 50%)
    if (
      latestAttempt &&
      (latestAttempt.score ?? 0) < 50 &&
      latestAttempt.testType !== "baseline"
    ) {
      candidateRecommendations.push({
        id: `retake-review-${latestAttempt.id}`,
        type: "RETAKE_REVIEW",
        priority: "High",
        priorityRank: 3,
        title: `Review Recent Test: ${latestAttempt.testTitle}`,
        action: "Review question solutions and explanations",
        reason: buildRecommendationReason({
          type: "RETAKE_REVIEW",
          testTitle: latestAttempt.testTitle,
          recentScore: latestAttempt.score ?? 0,
        }),
        subject: null,
        subjectCode: null,
        topic: null,
        topicId: null,
        metric: `${latestAttempt.score ?? 0}% on recent test`,
        route: `/tests/${latestAttempt.testId}/result?attemptId=${latestAttempt.id}`,
        ctaText: "Review Solutions",
        confidence: "High",
        recommendedTestId: latestAttempt.testId,
        recommendedTestTitle: latestAttempt.testTitle,
      });
    }

    // 7. Consistency Inactivity (TYPE 4)
    if (
      daysSinceLastAttempt !== null &&
      daysSinceLastAttempt >= EVIDENCE_THRESHOLDS.CONSISTENCY.INACTIVITY_DAYS_THRESHOLD
    ) {
      candidateRecommendations.push({
        id: "consistency-inactivity-refresh",
        type: "CONSISTENCY",
        priority: "High",
        priorityRank: 3,
        title: "Refresh Performance Baseline",
        action: "Take a mock test to restore active readiness",
        reason: buildRecommendationReason({
          type: "CONSISTENCY",
          inactivityDays: daysSinceLastAttempt,
        }),
        subject: null,
        subjectCode: null,
        topic: null,
        topicId: null,
        metric: `${daysSinceLastAttempt} days inactive`,
        route: eligibleTests.length > 0 ? `/tests/${eligibleTests[0].id}` : "/tests",
        ctaText: "Take Mock Test",
        confidence: "High",
        recommendedTestId: eligibleTests[0]?.id || null,
        recommendedTestTitle: eligibleTests[0]?.title || null,
      });
    }

    // 8. Maintenance Recommendation (TYPE 6)
    // If user has a strong subject but weak areas exist elsewhere
    if (strongSubjects.length > 0 && candidateRecommendations.length < 3) {
      const topStrong = strongSubjects[0];
      candidateRecommendations.push({
        id: `maintenance-${topStrong.code.toLowerCase()}`,
        type: "MAINTENANCE",
        priority: "Low",
        priorityRank: 1,
        title: `Maintain ${topStrong.name} Strength`,
        action: `Keep ${topStrong.name} benchmark sharp with periodic practice`,
        reason: buildRecommendationReason({
          type: "MAINTENANCE",
          subjectName: topStrong.name,
          subjectCode: topStrong.code,
          accuracy: topStrong.score,
        }),
        subject: topStrong.name,
        subjectCode: topStrong.code,
        topic: null,
        topicId: null,
        metric: `${topStrong.score}% accuracy • Strong`,
        route: "/tests",
        ctaText: `Practice ${topStrong.code}`,
        confidence: "High",
      });
    }
  }

  // 13. DEDUPLICATION AND DETERMINISTIC ORDERING
  // Rule 13, 28, 29: Stable deterministic tie-breakers, max 3-5 recommendations
  const seenActionKeys = new Set<string>();
  const deduplicatedRecommendations: StudentRecommendation[] = [];

  // Sort candidate recommendations deterministically:
  // 1. priorityRank DESC (4 > 3 > 2 > 1)
  // 2. confidence rank DESC (High: 3, Medium: 2, Low: 1)
  // 3. deterministic alpha id ASC
  candidateRecommendations.sort((a, b) => {
    if (b.priorityRank !== a.priorityRank) {
      return b.priorityRank - a.priorityRank;
    }
    const confScore = { High: 3, Medium: 2, Low: 1 };
    if (confScore[b.confidence] !== confScore[a.confidence]) {
      return confScore[b.confidence] - confScore[a.confidence];
    }
    return a.id.localeCompare(b.id);
  });

  for (const rec of candidateRecommendations) {
    // Prevent duplicate recommendations for the exact same subject/action
    const dedupeKey = `${rec.type}:${rec.subjectCode || "global"}:${
      rec.topicId || "any"
    }`;
    if (seenActionKeys.has(dedupeKey)) continue;
    seenActionKeys.add(dedupeKey);

    deduplicatedRecommendations.push(rec);
    if (
      deduplicatedRecommendations.length >=
      EVIDENCE_THRESHOLDS.MAX_RECOMMENDATIONS
    ) {
      break;
    }
  }

  const topAction = deduplicatedRecommendations[0] || null;

  return {
    userId,
    dataSufficiency: {
      hasData: true,
      hasCompletedBaseline: true,
      attemptsCount,
      questionsAttempted: totalQuestionsPresented,
      status: isLimitedData ? "limited_data" : "sufficient_data",
      message: isLimitedData
        ? "Early signal — Complete more tests to improve recommendation accuracy."
        : "Calibrated intelligence based on verified student activity.",
    },
    readiness: {
      score: readinessRes.readinessScore,
      level: readinessRes.level,
      breakdown: readinessRes.breakdown,
      subjectScores: readinessRes.subjectScores,
      positiveContributors,
      negativeContributors,
    },
    trend: {
      overall: overallTrend,
      subjectTrends,
      recentAttemptAvg,
      earlierAttemptAvg,
    },
    difficulty: {
      progressionTarget,
      easy: {
        accuracy: easyAcc,
        attempted: diffAgg.easy.attempted,
        correct: diffAgg.easy.correct,
      },
      medium: {
        accuracy: medAcc,
        attempted: diffAgg.medium.attempted,
        correct: diffAgg.medium.correct,
      },
      hard: {
        accuracy: hardAcc,
        attempted: diffAgg.hard.attempted,
        correct: diffAgg.hard.correct,
      },
    },
    discipline: {
      unansweredRate,
      unansweredCount,
      totalPresented: totalQuestionsPresented,
      hasUnansweredIssue,
      negativeMarkingLossAvg,
      negativeMarkedCount: totalNegativeMarkedAttempts,
      hasNegativeMarkingIssue,
      daysSinceLastAttempt,
    },
    weakAreas,
    strengths: {
      topSubjects: strongSubjects,
      topTopics: strongTopics,
    },
    recommendations: deduplicatedRecommendations,
    topAction,
    eligibleRecommendedTests: eligibleTests,
  };
}
