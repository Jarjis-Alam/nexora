import { db } from "@/db";
import {
  attempts,
  answers,
  questions,
  tests,
  subjects,
  topics,
  users,
  profiles,
  testSections,
  questionPools,
  questionPoolQuestions,
  attemptQuestions,
  testQuestions,
} from "@/db/schema";
import {
  eq,
  and,
  sql,
  desc,
  asc,
  inArray,
  gte,
  lte,
  count,
} from "drizzle-orm";
import {
  getEffectiveTestStatus,
  type TestStatus,
  type EffectiveStatus,
} from "@/lib/lifecycle";
import { round2 } from "@/lib/utils";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface AdminAnalyticsFilters {
  testId?: string;
  subjectId?: string;
  topicId?: string;
  status?: string; // "all" | "draft" | "published" | "closed" | "archived"
  dateRange?: "7d" | "30d" | "90d" | "all" | string;
  startDate?: string;
  endDate?: string;
}

export interface AdminQuestionFilters extends AdminAnalyticsFilters {
  difficulty?: "easy" | "medium" | "hard" | "all";
  qualitySignal?:
    | "all"
    | "high_failure"
    | "high_skip"
    | "high_success"
    | "low_sample"
    | "too_difficult"
    | "too_easy";
  search?: string;
}

export interface AdminOverviewData {
  metrics: {
    totalTests: number;
    totalAttempts: number;
    submittedAttempts: number;
    activeAttempts: number;
    expiredAttempts: number;
    completionRate: number; // submitted / total * 100
    avgScore: number;
    avgAccuracy: number;
    uniqueStudents: number;
    avgTimeUsedSec: number;
    questionsAnswered: number;
  };
  negativeMarkingSummary: {
    hasNegativeMarkingTests: boolean;
    totalPenaltyMarks: number;
    avgPenaltyPerAttempt: number;
    incorrectPenaltiesCount: number;
    totalCorrectMarks: number;
    netMarks: number;
  };
  scoreDistribution: {
    bin: string; // "0–20", "21–40", "41–60", "61–80", "81–100"
    count: number;
    percentage: number;
  }[];
  accuracyDistribution: {
    bin: string;
    count: number;
    percentage: number;
  }[];
  performanceTrend: {
    date: string;
    avgScore: number;
    avgAccuracy: number;
    attemptsCount: number;
  }[];
  isLimitedHistory: boolean;
  subjectPerformance: {
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    questionsServed: number;
    questionsAnswered: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number;
    avgMarks: number;
  }[];
  topicPerformance: {
    topicId: string;
    topicName: string;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    questionsAttempted: number;
    correct: number;
    incorrect: number;
    accuracy: number;
  }[];
  difficultyPerformance: {
    difficulty: "easy" | "medium" | "hard";
    questionsServed: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number;
    avgMarks: number;
  }[];
}

export interface AdminTestPerformanceItem {
  id: string;
  title: string;
  status: TestStatus;
  effectiveStatus: EffectiveStatus;
  type: string;
  totalMarks: number;
  duration: number;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  createdAt: string;
  totalAttempts: number;
  submittedAttempts: number;
  activeAttempts: number;
  completionRate: number;
  uniqueStudents: number;
  avgScore: number;
  avgAccuracy: number;
  avgTimeTakenSec: number;
}

export interface AdminQuestionPerformanceItem {
  questionId: string;
  questionText: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  topicId: string;
  topicName: string;
  difficulty: "easy" | "medium" | "hard";
  marks: number;
  attemptsServed: number;
  answeredCount: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  accuracy: number;
  avgMarksEarned: number;
  difficultyLabel:
    | "Very Difficult"
    | "Difficult"
    | "Normal"
    | "Easy"
    | "Very Easy"
    | "Unassessed";
  qualitySignals: string[];
}

export interface AdminTestDetailData {
  test: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    status: TestStatus;
    effectiveStatus: EffectiveStatus;
    type: string;
    totalMarks: number;
    duration: number;
    attemptLimit: number | null;
    negativeMarkingEnabled: boolean;
    negativeMarkRate: number;
    randomizeQuestions: boolean;
    randomizeOptions: boolean;
    scheduledStartAt: string | null;
    scheduledEndAt: string | null;
    scheduleTimezone: string | null;
    createdAt: string;
  };
  metrics: {
    totalAttempts: number;
    submittedAttempts: number;
    activeAttempts: number;
    expiredAttempts: number;
    completionRate: number;
    uniqueStudents: number;
    avgScore: number;
    avgAccuracy: number;
    avgTimeTakenSec: number;
  };
  negativeMarking: {
    enabled: boolean;
    rate: number;
    totalPenaltiesCount: number;
    totalPenaltyMarks: number;
    avgPenaltyPerAttempt: number;
    totalCorrectMarks: number;
    netMarks: number;
  };
  scoreDistribution: { bin: string; count: number; percentage: number }[];
  accuracyDistribution: { bin: string; count: number; percentage: number }[];
  performanceTrend: {
    date: string;
    avgScore: number;
    avgAccuracy: number;
    attemptsCount: number;
  }[];
  isLimitedHistory: boolean;
  sectionPerformance: {
    sectionId: string;
    sectionTitle: string;
    sectionOrder: number;
    questionCount: number;
    attempts: number;
    questionsServed: number;
    answered: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number;
    avgMarks: number;
  }[];
  subjectPerformance: {
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    questionsServed: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number;
    avgMarks: number;
  }[];
  difficultyPerformance: {
    difficulty: "easy" | "medium" | "hard";
    questionsServed: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number;
    avgMarks: number;
  }[];
  poolPerformance: {
    poolId: string;
    title: string;
    sectionId: string;
    sectionTitle: string;
    selectionCount: number;
    candidateQuestionsCount: number;
    selectedQuestionsCount: number;
    attemptsExposure: number;
    correct: number;
    incorrect: number;
    unanswered: number;
    accuracy: number;
    avgMarks: number;
  }[];
  questionPerformance: AdminQuestionPerformanceItem[];
}

export interface AdminActiveAttemptItem {
  attemptId: string;
  testId: string;
  testTitle: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  startedAt: string;
  durationMinutes: number;
  timeRemainingSec: number | null;
  currentQuestion: number;
  status: "in_progress";
}

export interface AdminTestComparisonResult {
  testA: {
    id: string;
    title: string;
    status: TestStatus;
    effectiveStatus: EffectiveStatus;
    totalAttempts: number;
    submittedAttempts: number;
    completionRate: number;
    avgScore: number;
    avgAccuracy: number;
    avgTimeTakenSec: number;
    uniqueStudents: number;
  };
  testB: {
    id: string;
    title: string;
    status: TestStatus;
    effectiveStatus: EffectiveStatus;
    totalAttempts: number;
    submittedAttempts: number;
    completionRate: number;
    avgScore: number;
    avgAccuracy: number;
    avgTimeTakenSec: number;
    uniqueStudents: number;
  };
}

// ============================================================================
// HELPER: DATE BOUNDARY RESOLVER
// ============================================================================

export function resolveDateBoundaries(filters?: {
  dateRange?: string;
  startDate?: string;
  endDate?: string;
}): { fromDate?: Date; toDate?: Date } {
  const now = new Date();
  if (filters?.startDate && filters?.endDate) {
    const from = new Date(filters.startDate);
    const to = new Date(filters.endDate);
    if (!isNaN(from.getTime()) && !isNaN(to.getTime())) {
      if (!filters.endDate.includes("T")) {
        to.setUTCHours(23, 59, 59, 999);
      }
      return { fromDate: from, toDate: to };
    }
  }

  const range = filters?.dateRange || "all";
  if (range === "7d") {
    return { fromDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
  } else if (range === "30d") {
    return { fromDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
  } else if (range === "90d") {
    return { fromDate: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
  }
  return {};
}

// ============================================================================
// 1. OVERVIEW ANALYTICS (DASHBOARD TOP-LEVEL)
// ============================================================================

export async function getAdminOverviewAnalytics(
  filters: AdminAnalyticsFilters = {}
): Promise<AdminOverviewData> {
  const { fromDate, toDate } = resolveDateBoundaries(filters);

  // 1. Filtered Tests Count
  const testCountWhere =
    filters.status && filters.status !== "all"
      ? eq(tests.status, filters.status as TestStatus)
      : undefined;
  const totalTestsRes = await db
    .select({ count: count() })
    .from(tests)
    .where(testCountWhere);
  const totalTests = Number(totalTestsRes[0]?.count || 0);

  // 2. Aggregate Attempts Metrics
  const attemptConditions: any[] = [];
  if (filters.testId) {
    attemptConditions.push(eq(attempts.testId, filters.testId));
  }
  if (filters.status && filters.status !== "all") {
    attemptConditions.push(
      sql`${attempts.testId} IN (SELECT id FROM tests WHERE status = ${filters.status})`
    );
  }
  if (filters.subjectId && filters.subjectId !== "all") {
    attemptConditions.push(
      sql`${attempts.id} IN (
        SELECT attempt_id FROM attempt_questions aq 
        JOIN questions q ON aq.question_id = q.id 
        WHERE q.subject_id = ${filters.subjectId}
        UNION
        SELECT a.id FROM attempts a
        JOIN test_questions tq ON tq.test_id = a.test_id
        JOIN questions q ON tq.question_id = q.id
        WHERE q.subject_id = ${filters.subjectId}
      )`
    );
  }

  // Date filters apply to submitted attempts, but also allow measuring attempts submitted in window
  if (fromDate) {
    attemptConditions.push(
      sql`(${attempts.submittedAt} >= ${fromDate.toISOString()} OR (${attempts.status} = 'in_progress' AND ${attempts.startedAt} >= ${fromDate.toISOString()}))`
    );
  }
  if (toDate) {
    attemptConditions.push(
      sql`(${attempts.submittedAt} <= ${toDate.toISOString()} OR (${attempts.status} = 'in_progress' AND ${attempts.startedAt} <= ${toDate.toISOString()}))`
    );
  }

  const whereClause =
    attemptConditions.length > 0 ? and(...attemptConditions) : undefined;

  const attemptMetricsRes = await db
    .select({
      totalAttempts: count(),
      submittedAttempts: sql<number>`count(case when ${attempts.status} = 'submitted' then 1 end)`,
      activeAttempts: sql<number>`count(case when ${attempts.status} = 'in_progress' then 1 end)`,
      expiredAttempts: sql<number>`count(case when ${attempts.status} = 'expired' then 1 end)`,
      uniqueStudents: sql<number>`count(distinct ${attempts.userId})`,
      avgScore: sql<number | null>`avg(case when ${attempts.status} = 'submitted' then ${attempts.score} end)`,
      avgAccuracy: sql<number | null>`avg(case when ${attempts.status} = 'submitted' then ${attempts.accuracy} end)`,
      avgTimeUsedSec: sql<number | null>`avg(case when ${attempts.status} = 'submitted' then ${attempts.timeTaken} end)`,
    })
    .from(attempts)
    .where(whereClause);

  const rawMetrics = attemptMetricsRes[0] || {
    totalAttempts: 0,
    submittedAttempts: 0,
    activeAttempts: 0,
    expiredAttempts: 0,
    uniqueStudents: 0,
    avgScore: null,
    avgAccuracy: null,
    avgTimeUsedSec: null,
  };

  const totalAttempts = Number(rawMetrics.totalAttempts || 0);
  const submittedAttempts = Number(rawMetrics.submittedAttempts || 0);
  const activeAttempts = Number(rawMetrics.activeAttempts || 0);
  const expiredAttempts = Number(rawMetrics.expiredAttempts || 0);
  const uniqueStudents = Number(rawMetrics.uniqueStudents || 0);
  const completionRate =
    totalAttempts > 0
      ? Math.round((submittedAttempts / totalAttempts) * 100)
      : 0;
  const avgScore = rawMetrics.avgScore !== null ? Math.round(Number(rawMetrics.avgScore)) : 0;
  const avgAccuracy = rawMetrics.avgAccuracy !== null ? Math.round(Number(rawMetrics.avgAccuracy)) : 0;
  const avgTimeUsedSec =
    rawMetrics.avgTimeUsedSec !== null ? Math.round(Number(rawMetrics.avgTimeUsedSec)) : 0;

  // 3. Questions Answered Count
  const submittedFilterClause = whereClause
    ? and(whereClause, eq(attempts.status, "submitted"))
    : eq(attempts.status, "submitted");

  const questionsAnsweredRes = await db
    .select({
      count: count(),
    })
    .from(answers)
    .innerJoin(attempts, eq(answers.attemptId, attempts.id))
    .where(and(submittedFilterClause, sql`${answers.selectedAnswer} IS NOT NULL`));
  const questionsAnswered = Number(questionsAnsweredRes[0]?.count || 0);

  // 4. Score Distribution & Accuracy Distribution (0–20, 21–40, 41–60, 61–80, 81–100)
  const distRes = await db
    .select({
      score0_20: sql<number>`count(case when ${attempts.score} >= 0 and ${attempts.score} <= 20 then 1 end)`,
      score21_40: sql<number>`count(case when ${attempts.score} > 20 and ${attempts.score} <= 40 then 1 end)`,
      score41_60: sql<number>`count(case when ${attempts.score} > 40 and ${attempts.score} <= 60 then 1 end)`,
      score61_80: sql<number>`count(case when ${attempts.score} > 60 and ${attempts.score} <= 80 then 1 end)`,
      score81_100: sql<number>`count(case when ${attempts.score} > 80 and ${attempts.score} <= 100 then 1 end)`,
      acc0_20: sql<number>`count(case when ${attempts.accuracy} >= 0 and ${attempts.accuracy} <= 20 then 1 end)`,
      acc21_40: sql<number>`count(case when ${attempts.accuracy} > 20 and ${attempts.accuracy} <= 40 then 1 end)`,
      acc41_60: sql<number>`count(case when ${attempts.accuracy} > 40 and ${attempts.accuracy} <= 60 then 1 end)`,
      acc61_80: sql<number>`count(case when ${attempts.accuracy} > 60 and ${attempts.accuracy} <= 80 then 1 end)`,
      acc81_100: sql<number>`count(case when ${attempts.accuracy} > 80 and ${attempts.accuracy} <= 100 then 1 end)`,
    })
    .from(attempts)
    .where(submittedFilterClause);

  const rawDist = distRes[0] || {};
  const s0 = Number(rawDist.score0_20 || 0);
  const s1 = Number(rawDist.score21_40 || 0);
  const s2 = Number(rawDist.score41_60 || 0);
  const s3 = Number(rawDist.score61_80 || 0);
  const s4 = Number(rawDist.score81_100 || 0);

  const scoreDistribution = [
    { bin: "0–20", count: s0, percentage: submittedAttempts > 0 ? Math.round((s0 / submittedAttempts) * 100) : 0 },
    { bin: "21–40", count: s1, percentage: submittedAttempts > 0 ? Math.round((s1 / submittedAttempts) * 100) : 0 },
    { bin: "41–60", count: s2, percentage: submittedAttempts > 0 ? Math.round((s2 / submittedAttempts) * 100) : 0 },
    { bin: "61–80", count: s3, percentage: submittedAttempts > 0 ? Math.round((s3 / submittedAttempts) * 100) : 0 },
    { bin: "81–100", count: s4, percentage: submittedAttempts > 0 ? Math.round((s4 / submittedAttempts) * 100) : 0 },
  ];

  const a0 = Number(rawDist.acc0_20 || 0);
  const a1 = Number(rawDist.acc21_40 || 0);
  const a2 = Number(rawDist.acc41_60 || 0);
  const a3 = Number(rawDist.acc61_80 || 0);
  const a4 = Number(rawDist.acc81_100 || 0);

  const accuracyDistribution = [
    { bin: "0–20", count: a0, percentage: submittedAttempts > 0 ? Math.round((a0 / submittedAttempts) * 100) : 0 },
    { bin: "21–40", count: a1, percentage: submittedAttempts > 0 ? Math.round((a1 / submittedAttempts) * 100) : 0 },
    { bin: "41–60", count: a2, percentage: submittedAttempts > 0 ? Math.round((a2 / submittedAttempts) * 100) : 0 },
    { bin: "61–80", count: a3, percentage: submittedAttempts > 0 ? Math.round((a3 / submittedAttempts) * 100) : 0 },
    { bin: "81–100", count: a4, percentage: submittedAttempts > 0 ? Math.round((a4 / submittedAttempts) * 100) : 0 },
  ];

  // 5. Performance Trend (Score & Accuracy by date, submitted attempts only)
  const trendRes = await db
    .select({
      dateStr: sql<string>`TO_CHAR(${attempts.submittedAt}, 'YYYY-MM-DD')`,
      avgScore: sql<number>`avg(${attempts.score})`,
      avgAccuracy: sql<number>`avg(${attempts.accuracy})`,
      attemptsCount: count(),
    })
    .from(attempts)
    .where(submittedFilterClause)
    .groupBy(sql`TO_CHAR(${attempts.submittedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${attempts.submittedAt}, 'YYYY-MM-DD') asc`);

  const performanceTrend = trendRes.map((r) => ({
    date: r.dateStr,
    avgScore: Math.round(Number(r.avgScore)),
    avgAccuracy: Math.round(Number(r.avgAccuracy)),
    attemptsCount: Number(r.attemptsCount),
  }));

  const isLimitedHistory = performanceTrend.length <= 1;

  // 6. Negative Marking Metrics
  const negMarkingRes = await db.execute(sql`
    SELECT
      COUNT(DISTINCT a.id) as negative_attempts_count,
      COUNT(DISTINCT CASE WHEN ans.is_correct = FALSE THEN ans.id END) as incorrect_penalties_count,
      COALESCE(SUM(CASE 
        WHEN ans.is_correct = FALSE 
        THEN (COALESCE(aq.marks_snapshot, q.marks) * COALESCE(a.negative_mark_rate, t.negative_mark_rate, 0)::numeric)
        ELSE 0 
      END), 0) as total_penalty_marks,
      COALESCE(SUM(CASE 
        WHEN ans.is_correct = TRUE 
        THEN COALESCE(aq.marks_snapshot, q.marks) 
        ELSE 0 
      END), 0) as total_correct_marks
    FROM attempts a
    JOIN tests t ON a.test_id = t.id
    LEFT JOIN attempt_questions aq ON aq.attempt_id = a.id
    LEFT JOIN questions q ON aq.question_id = q.id
    LEFT JOIN answers ans ON ans.attempt_id = a.id AND ans.question_id = aq.question_id
    WHERE a.status = 'submitted'
      AND (a.negative_marking_enabled = TRUE OR t.negative_marking_enabled = TRUE)
      ${filters.testId ? sql`AND a.test_id = ${filters.testId}` : sql``}
      ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
      ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
  `);

  const negRow = negMarkingRes.rows[0] as any;
  const negAttemptsCount = Number(negRow?.negative_attempts_count || 0);
  const incorrectPenaltiesCount = Number(negRow?.incorrect_penalties_count || 0);
  const totalPenaltyMarks = round2(Number(negRow?.total_penalty_marks || 0));
  const totalCorrectMarks = round2(Number(negRow?.total_correct_marks || 0));
  const avgPenaltyPerAttempt =
    negAttemptsCount > 0
      ? round2(totalPenaltyMarks / negAttemptsCount)
      : 0;

  const negativeMarkingSummary = {
    hasNegativeMarkingTests: negAttemptsCount > 0,
    totalPenaltyMarks,
    avgPenaltyPerAttempt,
    incorrectPenaltiesCount,
    totalCorrectMarks,
    netMarks: round2(totalCorrectMarks - totalPenaltyMarks),
  };

  // 7. Subject & Difficulty Performance via Unified CTE
  const subjectAndDiffRes = await db.execute(sql`
    WITH served AS (
      SELECT
        aq.attempt_id,
        aq.question_id,
        COALESCE(aq.marks_snapshot, q.marks) as marks,
        q.subject_id,
        q.topic_id,
        q.difficulty
      FROM attempt_questions aq
      JOIN attempts a ON aq.attempt_id = a.id
      JOIN questions q ON aq.question_id = q.id
      WHERE a.status = 'submitted'
        ${filters.testId ? sql`AND a.test_id = ${filters.testId}` : sql``}
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
      UNION ALL
      SELECT
        a.id as attempt_id,
        tq.question_id,
        q.marks,
        q.subject_id,
        q.topic_id,
        q.difficulty
      FROM attempts a
      JOIN test_questions tq ON tq.test_id = a.test_id
      JOIN questions q ON tq.question_id = q.id
      WHERE a.status = 'submitted'
        AND NOT EXISTS (SELECT 1 FROM attempt_questions aq WHERE aq.attempt_id = a.id)
        ${filters.testId ? sql`AND a.test_id = ${filters.testId}` : sql``}
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
    )
    SELECT
      s.subject_id,
      sub.name as subject_name,
      sub.code as subject_code,
      COUNT(*) as questions_served,
      COUNT(ans.id) as questions_answered,
      COUNT(CASE WHEN ans.is_correct = TRUE THEN 1 END) as correct,
      COUNT(CASE WHEN ans.is_correct = FALSE THEN 1 END) as incorrect,
      COUNT(CASE WHEN ans.id IS NULL OR ans.selected_answer IS NULL THEN 1 END) as unanswered,
      COALESCE(SUM(CASE WHEN ans.is_correct = TRUE THEN s.marks ELSE 0 END), 0) as earned_marks
    FROM served s
    JOIN subjects sub ON s.subject_id = sub.id
    LEFT JOIN answers ans ON ans.attempt_id = s.attempt_id AND ans.question_id = s.question_id
    GROUP BY s.subject_id, sub.name, sub.code
    ORDER BY sub.name ASC
  `);

  const subjectPerformance = (subjectAndDiffRes.rows as any[]).map((row) => {
    const served = Number(row.questions_served || 0);
    const answered = Number(row.questions_answered || 0);
    const correct = Number(row.correct || 0);
    const incorrect = Number(row.incorrect || 0);
    const unanswered = Number(row.unanswered || 0);
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const avgMarks = served > 0 ? round2(Number(row.earned_marks || 0) / served) : 0;
    return {
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      subjectCode: row.subject_code,
      questionsServed: served,
      questionsAnswered: answered,
      correct,
      incorrect,
      unanswered,
      accuracy,
      avgMarks,
    };
  });

  // Topic Performance
  const topicRes = await db.execute(sql`
    WITH served AS (
      SELECT
        aq.attempt_id,
        aq.question_id,
        q.subject_id,
        q.topic_id
      FROM attempt_questions aq
      JOIN attempts a ON aq.attempt_id = a.id
      JOIN questions q ON aq.question_id = q.id
      WHERE a.status = 'submitted'
        ${filters.testId ? sql`AND a.test_id = ${filters.testId}` : sql``}
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
      UNION ALL
      SELECT
        a.id as attempt_id,
        tq.question_id,
        q.subject_id,
        q.topic_id
      FROM attempts a
      JOIN test_questions tq ON tq.test_id = a.test_id
      JOIN questions q ON tq.question_id = q.id
      WHERE a.status = 'submitted'
        AND NOT EXISTS (SELECT 1 FROM attempt_questions aq WHERE aq.attempt_id = a.id)
        ${filters.testId ? sql`AND a.test_id = ${filters.testId}` : sql``}
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
    )
    SELECT
      s.topic_id,
      t.name as topic_name,
      s.subject_id,
      sub.name as subject_name,
      sub.code as subject_code,
      COUNT(ans.id) as questions_attempted,
      COUNT(CASE WHEN ans.is_correct = TRUE THEN 1 END) as correct,
      COUNT(CASE WHEN ans.is_correct = FALSE THEN 1 END) as incorrect
    FROM served s
    JOIN topics t ON s.topic_id = t.id
    JOIN subjects sub ON s.subject_id = sub.id
    JOIN answers ans ON ans.attempt_id = s.attempt_id AND ans.question_id = s.question_id
    GROUP BY s.topic_id, t.name, s.subject_id, sub.name, sub.code
    ORDER BY t.name ASC
  `);

  const topicPerformance = (topicRes.rows as any[]).map((row) => {
    const attempted = Number(row.questions_attempted || 0);
    const correct = Number(row.correct || 0);
    const incorrect = Number(row.incorrect || 0);
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    return {
      topicId: row.topic_id,
      topicName: row.topic_name,
      subjectId: row.subject_id,
      subjectName: row.subject_name,
      subjectCode: row.subject_code,
      questionsAttempted: attempted,
      correct,
      incorrect,
      accuracy,
    };
  });

  // Difficulty Performance
  const diffRes = await db.execute(sql`
    WITH served AS (
      SELECT
        aq.attempt_id,
        aq.question_id,
        COALESCE(aq.marks_snapshot, q.marks) as marks,
        q.difficulty
      FROM attempt_questions aq
      JOIN attempts a ON aq.attempt_id = a.id
      JOIN questions q ON aq.question_id = q.id
      WHERE a.status = 'submitted'
        ${filters.testId ? sql`AND a.test_id = ${filters.testId}` : sql``}
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
      UNION ALL
      SELECT
        a.id as attempt_id,
        tq.question_id,
        q.marks,
        q.difficulty
      FROM attempts a
      JOIN test_questions tq ON tq.test_id = a.test_id
      JOIN questions q ON tq.question_id = q.id
      WHERE a.status = 'submitted'
        AND NOT EXISTS (SELECT 1 FROM attempt_questions aq WHERE aq.attempt_id = a.id)
        ${filters.testId ? sql`AND a.test_id = ${filters.testId}` : sql``}
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
    )
    SELECT
      s.difficulty,
      COUNT(*) as questions_served,
      COUNT(CASE WHEN ans.is_correct = TRUE THEN 1 END) as correct,
      COUNT(CASE WHEN ans.is_correct = FALSE THEN 1 END) as incorrect,
      COUNT(CASE WHEN ans.id IS NULL OR ans.selected_answer IS NULL THEN 1 END) as unanswered,
      COALESCE(SUM(CASE WHEN ans.is_correct = TRUE THEN s.marks ELSE 0 END), 0) as earned_marks
    FROM served s
    LEFT JOIN answers ans ON ans.attempt_id = s.attempt_id AND ans.question_id = s.question_id
    GROUP BY s.difficulty
  `);

  const diffMap = new Map<string, any>();
  (diffRes.rows as any[]).forEach((r) => {
    diffMap.set(r.difficulty, r);
  });

  const difficulties: ("easy" | "medium" | "hard")[] = ["easy", "medium", "hard"];
  const difficultyPerformance = difficulties.map((d) => {
    const row = diffMap.get(d);
    const served = Number(row?.questions_served || 0);
    const correct = Number(row?.correct || 0);
    const incorrect = Number(row?.incorrect || 0);
    const unanswered = Number(row?.unanswered || 0);
    const answered = correct + incorrect;
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const avgMarks = served > 0 ? round2(Number(row?.earned_marks || 0) / served) : 0;
    return {
      difficulty: d,
      questionsServed: served,
      correct,
      incorrect,
      unanswered,
      accuracy,
      avgMarks,
    };
  });

  return {
    metrics: {
      totalTests,
      totalAttempts,
      submittedAttempts,
      activeAttempts,
      expiredAttempts,
      completionRate,
      avgScore,
      avgAccuracy,
      uniqueStudents,
      avgTimeUsedSec,
      questionsAnswered,
    },
    negativeMarkingSummary,
    scoreDistribution,
    accuracyDistribution,
    performanceTrend,
    isLimitedHistory,
    subjectPerformance,
    topicPerformance,
    difficultyPerformance,
  };
}

// ============================================================================
// 2. TEST PERFORMANCE LIST (TABLE / CARDS)
// ============================================================================

export async function getAdminTestPerformanceList(
  filters: AdminAnalyticsFilters & {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}
): Promise<{
  tests: AdminTestPerformanceItem[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}> {
  const { fromDate, toDate } = resolveDateBoundaries(filters);
  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.max(1, Math.min(100, Number(filters.limit || 20)));
  const offset = (page - 1) * limit;

  // Build conditions
  const testConditions: any[] = [];
  if (filters.status && filters.status !== "all") {
    testConditions.push(eq(tests.status, filters.status as TestStatus));
  }
  if (filters.testId) {
    testConditions.push(eq(tests.id, filters.testId));
  }

  const whereClause =
    testConditions.length > 0 ? and(...testConditions) : undefined;

  // Total count of matching tests
  const countRes = await db
    .select({ count: count() })
    .from(tests)
    .where(whereClause);
  const total = Number(countRes[0]?.count || 0);

  // Fetch tests with attempt statistics
  const testRows = await db
    .select({
      id: tests.id,
      title: tests.title,
      status: tests.status,
      type: tests.type,
      totalMarks: tests.totalMarks,
      duration: tests.duration,
      isPublished: tests.isPublished,
      scheduledStartAt: tests.scheduledStartAt,
      scheduledEndAt: tests.scheduledEndAt,
      scheduleTimezone: tests.scheduleTimezone,
      createdAt: tests.createdAt,
    })
    .from(tests)
    .where(whereClause)
    .orderBy(desc(tests.createdAt))
    .limit(limit)
    .offset(offset);

  const testIds = testRows.map((t) => t.id);

  // Aggregate metrics per test in one query
  const testMetricsMap = new Map<string, any>();
  if (testIds.length > 0) {
    const attemptAggRes = await db
      .select({
        testId: attempts.testId,
        totalAttempts: count(),
        submittedAttempts: sql<number>`count(case when ${attempts.status} = 'submitted' then 1 end)`,
        activeAttempts: sql<number>`count(case when ${attempts.status} = 'in_progress' then 1 end)`,
        uniqueStudents: sql<number>`count(distinct ${attempts.userId})`,
        avgScore: sql<number | null>`avg(case when ${attempts.status} = 'submitted' then ${attempts.score} end)`,
        avgAccuracy: sql<number | null>`avg(case when ${attempts.status} = 'submitted' then ${attempts.accuracy} end)`,
        avgTimeTaken: sql<number | null>`avg(case when ${attempts.status} = 'submitted' then ${attempts.timeTaken} end)`,
      })
      .from(attempts)
      .where(
        and(
          inArray(attempts.testId, testIds),
          fromDate ? gte(attempts.submittedAt, fromDate) : undefined,
          toDate ? lte(attempts.submittedAt, toDate) : undefined
        )
      )
      .groupBy(attempts.testId);

    attemptAggRes.forEach((agg) => {
      testMetricsMap.set(agg.testId, agg);
    });
  }

  const items: AdminTestPerformanceItem[] = testRows.map((t) => {
    const agg = testMetricsMap.get(t.id) || {};
    const totalAtt = Number(agg.totalAttempts || 0);
    const subAtt = Number(agg.submittedAttempts || 0);
    const actAtt = Number(agg.activeAttempts || 0);
    const uniq = Number(agg.uniqueStudents || 0);
    const completionRate =
      totalAtt > 0 ? Math.round((subAtt / totalAtt) * 100) : 0;
    const avgScore = agg.avgScore !== null && agg.avgScore !== undefined ? Math.round(Number(agg.avgScore)) : 0;
    const avgAccuracy =
      agg.avgAccuracy !== null && agg.avgAccuracy !== undefined ? Math.round(Number(agg.avgAccuracy)) : 0;
    const avgTimeTakenSec =
      agg.avgTimeTaken !== null && agg.avgTimeTaken !== undefined ? Math.round(Number(agg.avgTimeTaken)) : 0;

    const effectiveStatus = getEffectiveTestStatus({
      status: t.status,
      scheduledStartAt: t.scheduledStartAt,
      scheduledEndAt: t.scheduledEndAt,
      scheduleTimezone: t.scheduleTimezone,
      isPublished: t.isPublished,
    });

    return {
      id: t.id,
      title: t.title,
      status: t.status,
      effectiveStatus,
      type: t.type,
      totalMarks: t.totalMarks,
      duration: t.duration,
      scheduledStartAt: t.scheduledStartAt
        ? new Date(t.scheduledStartAt).toISOString()
        : null,
      scheduledEndAt: t.scheduledEndAt
        ? new Date(t.scheduledEndAt).toISOString()
        : null,
      createdAt: new Date(t.createdAt).toISOString(),
      totalAttempts: totalAtt,
      submittedAttempts: subAtt,
      activeAttempts: actAtt,
      completionRate,
      uniqueStudents: uniq,
      avgScore,
      avgAccuracy,
      avgTimeTakenSec,
    };
  });

  // Handle in-memory sorting if requested
  if (filters.sortBy) {
    const key = filters.sortBy as keyof AdminTestPerformanceItem;
    const order = filters.sortOrder === "asc" ? 1 : -1;
    items.sort((a, b) => {
      const valA = a[key] ?? 0;
      const valB = b[key] ?? 0;
      if (typeof valA === "string" && typeof valB === "string") {
        return valA.localeCompare(valB) * order;
      }
      return ((valA as number) - (valB as number)) * order;
    });
  }

  return {
    tests: items,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

// ============================================================================
// 3. TEST DETAIL ANALYTICS (DEEP DIVE /admin/analytics/tests/[id])
// ============================================================================

export async function getAdminTestDetailAnalytics(
  testId: string,
  filters: { dateRange?: string; startDate?: string; endDate?: string } = {}
): Promise<AdminTestDetailData | null> {
  const { fromDate, toDate } = resolveDateBoundaries(filters);

  // 1. Fetch test entity
  const testRes = await db
    .select()
    .from(tests)
    .where(eq(tests.id, testId))
    .limit(1);

  if (testRes.length === 0) {
    return null;
  }
  const test = testRes[0];
  const effectiveStatus = getEffectiveTestStatus({
    status: test.status,
    scheduledStartAt: test.scheduledStartAt,
    scheduledEndAt: test.scheduledEndAt,
    scheduleTimezone: test.scheduleTimezone,
    isPublished: test.isPublished,
  });

  // 2. Aggregate attempt metrics for this test
  const attemptConditions: any[] = [eq(attempts.testId, testId)];
  if (fromDate) {
    attemptConditions.push(
      sql`(${attempts.submittedAt} >= ${fromDate.toISOString()} OR (${attempts.status} = 'in_progress' AND ${attempts.startedAt} >= ${fromDate.toISOString()}))`
    );
  }
  if (toDate) {
    attemptConditions.push(
      sql`(${attempts.submittedAt} <= ${toDate.toISOString()} OR (${attempts.status} = 'in_progress' AND ${attempts.startedAt} <= ${toDate.toISOString()}))`
    );
  }

  const attemptMetricsRes = await db
    .select({
      totalAttempts: count(),
      submittedAttempts: sql<number>`count(case when ${attempts.status} = 'submitted' then 1 end)`,
      activeAttempts: sql<number>`count(case when ${attempts.status} = 'in_progress' then 1 end)`,
      expiredAttempts: sql<number>`count(case when ${attempts.status} = 'expired' then 1 end)`,
      uniqueStudents: sql<number>`count(distinct ${attempts.userId})`,
      avgScore: sql<number | null>`avg(case when ${attempts.status} = 'submitted' then ${attempts.score} end)`,
      avgAccuracy: sql<number | null>`avg(case when ${attempts.status} = 'submitted' then ${attempts.accuracy} end)`,
      avgTimeTakenSec: sql<number | null>`avg(case when ${attempts.status} = 'submitted' then ${attempts.timeTaken} end)`,
    })
    .from(attempts)
    .where(and(...attemptConditions));

  const rawM = attemptMetricsRes[0] || {};
  const totalAttempts = Number(rawM.totalAttempts || 0);
  const submittedAttempts = Number(rawM.submittedAttempts || 0);
  const activeAttempts = Number(rawM.activeAttempts || 0);
  const expiredAttempts = Number(rawM.expiredAttempts || 0);
  const uniqueStudents = Number(rawM.uniqueStudents || 0);
  const completionRate =
    totalAttempts > 0
      ? Math.round((submittedAttempts / totalAttempts) * 100)
      : 0;
  const avgScore = rawM.avgScore !== null ? Math.round(Number(rawM.avgScore)) : 0;
  const avgAccuracy = rawM.avgAccuracy !== null ? Math.round(Number(rawM.avgAccuracy)) : 0;
  const avgTimeTakenSec =
    rawM.avgTimeTakenSec !== null ? Math.round(Number(rawM.avgTimeTakenSec)) : 0;

  // 3. Score & Accuracy Distributions
  const submittedClause = and(...attemptConditions, eq(attempts.status, "submitted"));
  const distRes = await db
    .select({
      s0: sql<number>`count(case when ${attempts.score} >= 0 and ${attempts.score} <= 20 then 1 end)`,
      s1: sql<number>`count(case when ${attempts.score} > 20 and ${attempts.score} <= 40 then 1 end)`,
      s2: sql<number>`count(case when ${attempts.score} > 40 and ${attempts.score} <= 60 then 1 end)`,
      s3: sql<number>`count(case when ${attempts.score} > 60 and ${attempts.score} <= 80 then 1 end)`,
      s4: sql<number>`count(case when ${attempts.score} > 80 and ${attempts.score} <= 100 then 1 end)`,
      a0: sql<number>`count(case when ${attempts.accuracy} >= 0 and ${attempts.accuracy} <= 20 then 1 end)`,
      a1: sql<number>`count(case when ${attempts.accuracy} > 20 and ${attempts.accuracy} <= 40 then 1 end)`,
      a2: sql<number>`count(case when ${attempts.accuracy} > 40 and ${attempts.accuracy} <= 60 then 1 end)`,
      a3: sql<number>`count(case when ${attempts.accuracy} > 60 and ${attempts.accuracy} <= 80 then 1 end)`,
      a4: sql<number>`count(case when ${attempts.accuracy} > 80 and ${attempts.accuracy} <= 100 then 1 end)`,
    })
    .from(attempts)
    .where(submittedClause);

  const d = distRes[0] || {};
  const scoreDistribution = [
    { bin: "0–20", count: Number(d.s0 || 0), percentage: submittedAttempts > 0 ? Math.round((Number(d.s0 || 0) / submittedAttempts) * 100) : 0 },
    { bin: "21–40", count: Number(d.s1 || 0), percentage: submittedAttempts > 0 ? Math.round((Number(d.s1 || 0) / submittedAttempts) * 100) : 0 },
    { bin: "41–60", count: Number(d.s2 || 0), percentage: submittedAttempts > 0 ? Math.round((Number(d.s2 || 0) / submittedAttempts) * 100) : 0 },
    { bin: "61–80", count: Number(d.s3 || 0), percentage: submittedAttempts > 0 ? Math.round((Number(d.s3 || 0) / submittedAttempts) * 100) : 0 },
    { bin: "81–100", count: Number(d.s4 || 0), percentage: submittedAttempts > 0 ? Math.round((Number(d.s4 || 0) / submittedAttempts) * 100) : 0 },
  ];

  const accuracyDistribution = [
    { bin: "0–20", count: Number(d.a0 || 0), percentage: submittedAttempts > 0 ? Math.round((Number(d.a0 || 0) / submittedAttempts) * 100) : 0 },
    { bin: "21–40", count: Number(d.a1 || 0), percentage: submittedAttempts > 0 ? Math.round((Number(d.a1 || 0) / submittedAttempts) * 100) : 0 },
    { bin: "41–60", count: Number(d.a2 || 0), percentage: submittedAttempts > 0 ? Math.round((Number(d.a2 || 0) / submittedAttempts) * 100) : 0 },
    { bin: "61–80", count: Number(d.a3 || 0), percentage: submittedAttempts > 0 ? Math.round((Number(d.a3 || 0) / submittedAttempts) * 100) : 0 },
    { bin: "81–100", count: Number(d.a4 || 0), percentage: submittedAttempts > 0 ? Math.round((Number(d.a4 || 0) / submittedAttempts) * 100) : 0 },
  ];

  // 4. Performance Trend over time
  const trendRes = await db
    .select({
      dateStr: sql<string>`TO_CHAR(${attempts.submittedAt}, 'YYYY-MM-DD')`,
      avgScore: sql<number>`avg(${attempts.score})`,
      avgAccuracy: sql<number>`avg(${attempts.accuracy})`,
      attemptsCount: count(),
    })
    .from(attempts)
    .where(submittedClause)
    .groupBy(sql`TO_CHAR(${attempts.submittedAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`TO_CHAR(${attempts.submittedAt}, 'YYYY-MM-DD') asc`);

  const performanceTrend = trendRes.map((r) => ({
    date: r.dateStr,
    avgScore: Math.round(Number(r.avgScore)),
    avgAccuracy: Math.round(Number(r.avgAccuracy)),
    attemptsCount: Number(r.attemptsCount),
  }));
  const isLimitedHistory = performanceTrend.length <= 1;

  // 5. Negative Marking Details
  const isNegActive = Boolean(test.negativeMarkingEnabled);
  const negRate = isNegActive ? Number(test.negativeMarkRate || 0) : 0;

  const negRes = await db.execute(sql`
    SELECT
      COUNT(DISTINCT CASE WHEN ans.is_correct = FALSE THEN ans.id END) as penalties_count,
      COALESCE(SUM(CASE 
        WHEN ans.is_correct = FALSE 
        THEN (COALESCE(aq.marks_snapshot, q.marks) * COALESCE(a.negative_mark_rate, ${negRate})::numeric)
        ELSE 0 
      END), 0) as total_penalty,
      COALESCE(SUM(CASE 
        WHEN ans.is_correct = TRUE 
        THEN COALESCE(aq.marks_snapshot, q.marks) 
        ELSE 0 
      END), 0) as total_correct
    FROM attempts a
    LEFT JOIN attempt_questions aq ON aq.attempt_id = a.id
    LEFT JOIN questions q ON aq.question_id = q.id
    LEFT JOIN answers ans ON ans.attempt_id = a.id AND ans.question_id = aq.question_id
    WHERE a.test_id = ${testId}
      AND a.status = 'submitted'
      ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
      ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
  `);

  const negRow = negRes.rows[0] as any;
  const totalPenaltiesCount = Number(negRow?.penalties_count || 0);
  const totalPenaltyMarks = round2(Number(negRow?.total_penalty || 0));
  const totalCorrectMarks = round2(Number(negRow?.total_correct || 0));
  const avgPenaltyPerAttempt =
    submittedAttempts > 0 ? round2(totalPenaltyMarks / submittedAttempts) : 0;

  const negativeMarking = {
    enabled: isNegActive,
    rate: negRate,
    totalPenaltiesCount,
    totalPenaltyMarks,
    avgPenaltyPerAttempt,
    totalCorrectMarks,
    netMarks: round2(totalCorrectMarks - totalPenaltyMarks),
  };

  // 6. Section Performance (Phase 6C)
  const sectionRes = await db.execute(sql`
    SELECT
      COALESCE(ts.id, aq.section_id) as section_id,
      COALESCE(ts.title, 'Section ' || COALESCE(ts.section_order, 1)) as section_title,
      COALESCE(ts.section_order, 1) as section_order,
      COUNT(DISTINCT aq.question_id) as distinct_questions,
      COUNT(DISTINCT a.id) as attempts_count,
      COUNT(aq.id) as questions_served,
      COUNT(ans.id) as answered,
      COUNT(CASE WHEN ans.is_correct = TRUE THEN 1 END) as correct,
      COUNT(CASE WHEN ans.is_correct = FALSE THEN 1 END) as incorrect,
      COUNT(CASE WHEN ans.id IS NULL OR ans.selected_answer IS NULL THEN 1 END) as unanswered,
      COALESCE(SUM(CASE WHEN ans.is_correct = TRUE THEN COALESCE(aq.marks_snapshot, q.marks) ELSE 0 END), 0) as total_marks_earned
    FROM attempt_questions aq
    JOIN attempts a ON aq.attempt_id = a.id
    JOIN questions q ON aq.question_id = q.id
    LEFT JOIN test_sections ts ON aq.section_id = ts.id
    LEFT JOIN answers ans ON ans.attempt_id = a.id AND ans.question_id = aq.question_id
    WHERE a.test_id = ${testId}
      AND a.status = 'submitted'
      ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
      ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
    GROUP BY COALESCE(ts.id, aq.section_id), ts.title, ts.section_order
    ORDER BY COALESCE(ts.section_order, 1) ASC
  `);

  const sectionPerformance = (sectionRes.rows as any[]).map((r) => {
    const served = Number(r.questions_served || 0);
    const answered = Number(r.answered || 0);
    const correct = Number(r.correct || 0);
    const incorrect = Number(r.incorrect || 0);
    const unanswered = Number(r.unanswered || 0);
    const attemptsCount = Number(r.attempts_count || 0);
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const avgMarks =
      attemptsCount > 0
        ? round2(Number(r.total_marks_earned || 0) / attemptsCount)
        : 0;

    return {
      sectionId: r.section_id,
      sectionTitle: r.section_title,
      sectionOrder: Number(r.section_order || 1),
      questionCount: Number(r.distinct_questions || 0),
      attempts: attemptsCount,
      questionsServed: served,
      answered,
      correct,
      incorrect,
      unanswered,
      accuracy,
      avgMarks,
    };
  });

  // 7. Question Pool Performance (Phase 7F)
  const poolRes = await db.execute(sql`
    SELECT
      qp.id as pool_id,
      qp.title as pool_title,
      qp.section_id,
      COALESCE(ts.title, 'Section') as section_title,
      qp.selection_count,
      (SELECT COUNT(*) FROM question_pool_questions qpq WHERE qpq.pool_id = qp.id) as candidate_count,
      COUNT(DISTINCT aq.question_id) as selected_questions_count,
      COUNT(aq.id) as attempts_exposure,
      COUNT(CASE WHEN ans.is_correct = TRUE THEN 1 END) as correct,
      COUNT(CASE WHEN ans.is_correct = FALSE THEN 1 END) as incorrect,
      COUNT(CASE WHEN ans.id IS NULL OR ans.selected_answer IS NULL THEN 1 END) as unanswered,
      COALESCE(SUM(CASE WHEN ans.is_correct = TRUE THEN COALESCE(aq.marks_snapshot, q.marks) ELSE 0 END), 0) as total_marks_earned
    FROM question_pools qp
    LEFT JOIN test_sections ts ON qp.section_id = ts.id
    LEFT JOIN attempt_questions aq ON aq.pool_id = qp.id
    LEFT JOIN attempts a ON aq.attempt_id = a.id AND a.status = 'submitted'
      ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
      ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
    LEFT JOIN questions q ON aq.question_id = q.id
    LEFT JOIN answers ans ON ans.attempt_id = a.id AND ans.question_id = aq.question_id
    WHERE qp.test_id = ${testId}
    GROUP BY qp.id, qp.title, qp.section_id, ts.title, qp.selection_count
    ORDER BY qp.pool_order ASC
  `);

  const poolPerformance = (poolRes.rows as any[]).map((r) => {
    const exposure = Number(r.attempts_exposure || 0);
    const correct = Number(r.correct || 0);
    const incorrect = Number(r.incorrect || 0);
    const answered = correct + incorrect;
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const avgMarks =
      exposure > 0 ? round2(Number(r.total_marks_earned || 0) / exposure) : 0;

    return {
      poolId: r.pool_id,
      title: r.pool_title,
      sectionId: r.section_id,
      sectionTitle: r.section_title,
      selectionCount: Number(r.selection_count || 1),
      candidateQuestionsCount: Number(r.candidate_count || 0),
      selectedQuestionsCount: Number(r.selected_questions_count || 0),
      attemptsExposure: exposure,
      correct,
      incorrect,
      unanswered: Number(r.unanswered || 0),
      accuracy,
      avgMarks,
    };
  });

  // 8. Subject & Difficulty Performance for this test
  const subjectRes = await db.execute(sql`
    WITH served AS (
      SELECT
        aq.attempt_id,
        aq.question_id,
        COALESCE(aq.marks_snapshot, q.marks) as marks,
        q.subject_id
      FROM attempt_questions aq
      JOIN attempts a ON aq.attempt_id = a.id
      JOIN questions q ON aq.question_id = q.id
      WHERE a.test_id = ${testId}
        AND a.status = 'submitted'
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
      UNION ALL
      SELECT
        a.id as attempt_id,
        tq.question_id,
        q.marks,
        q.subject_id
      FROM attempts a
      JOIN test_questions tq ON tq.test_id = a.test_id
      JOIN questions q ON tq.question_id = q.id
      WHERE a.test_id = ${testId}
        AND a.status = 'submitted'
        AND NOT EXISTS (SELECT 1 FROM attempt_questions aq WHERE aq.attempt_id = a.id)
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
    )
    SELECT
      s.subject_id,
      sub.name as subject_name,
      sub.code as subject_code,
      COUNT(*) as questions_served,
      COUNT(CASE WHEN ans.is_correct = TRUE THEN 1 END) as correct,
      COUNT(CASE WHEN ans.is_correct = FALSE THEN 1 END) as incorrect,
      COUNT(CASE WHEN ans.id IS NULL OR ans.selected_answer IS NULL THEN 1 END) as unanswered,
      COALESCE(SUM(CASE WHEN ans.is_correct = TRUE THEN s.marks ELSE 0 END), 0) as total_marks_earned
    FROM served s
    JOIN subjects sub ON s.subject_id = sub.id
    LEFT JOIN answers ans ON ans.attempt_id = s.attempt_id AND ans.question_id = s.question_id
    GROUP BY s.subject_id, sub.name, sub.code
    ORDER BY sub.name ASC
  `);

  const subjectPerformance = (subjectRes.rows as any[]).map((r) => {
    const served = Number(r.questions_served || 0);
    const correct = Number(r.correct || 0);
    const incorrect = Number(r.incorrect || 0);
    const unanswered = Number(r.unanswered || 0);
    const answered = correct + incorrect;
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const avgMarks =
      served > 0 ? round2(Number(r.total_marks_earned || 0) / served) : 0;

    return {
      subjectId: r.subject_id,
      subjectName: r.subject_name,
      subjectCode: r.subject_code,
      questionsServed: served,
      correct,
      incorrect,
      unanswered,
      accuracy,
      avgMarks,
    };
  });

  // Difficulty performance
  const diffRes = await db.execute(sql`
    WITH served AS (
      SELECT
        aq.attempt_id,
        aq.question_id,
        COALESCE(aq.marks_snapshot, q.marks) as marks,
        q.difficulty
      FROM attempt_questions aq
      JOIN attempts a ON aq.attempt_id = a.id
      JOIN questions q ON aq.question_id = q.id
      WHERE a.test_id = ${testId}
        AND a.status = 'submitted'
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
      UNION ALL
      SELECT
        a.id as attempt_id,
        tq.question_id,
        q.marks,
        q.difficulty
      FROM attempts a
      JOIN test_questions tq ON tq.test_id = a.test_id
      JOIN questions q ON tq.question_id = q.id
      WHERE a.test_id = ${testId}
        AND a.status = 'submitted'
        AND NOT EXISTS (SELECT 1 FROM attempt_questions aq WHERE aq.attempt_id = a.id)
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
    )
    SELECT
      s.difficulty,
      COUNT(*) as questions_served,
      COUNT(CASE WHEN ans.is_correct = TRUE THEN 1 END) as correct,
      COUNT(CASE WHEN ans.is_correct = FALSE THEN 1 END) as incorrect,
      COUNT(CASE WHEN ans.id IS NULL OR ans.selected_answer IS NULL THEN 1 END) as unanswered,
      COALESCE(SUM(CASE WHEN ans.is_correct = TRUE THEN s.marks ELSE 0 END), 0) as total_marks_earned
    FROM served s
    LEFT JOIN answers ans ON ans.attempt_id = s.attempt_id AND ans.question_id = s.question_id
    GROUP BY s.difficulty
  `);

  const diffMap = new Map<string, any>();
  (diffRes.rows as any[]).forEach((r) => diffMap.set(r.difficulty, r));
  const difficulties: ("easy" | "medium" | "hard")[] = ["easy", "medium", "hard"];
  const difficultyPerformance = difficulties.map((d) => {
    const row = diffMap.get(d);
    const served = Number(row?.questions_served || 0);
    const correct = Number(row?.correct || 0);
    const incorrect = Number(row?.incorrect || 0);
    const unanswered = Number(row?.unanswered || 0);
    const answered = correct + incorrect;
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
    const avgMarks =
      served > 0 ? round2(Number(row?.total_marks_earned || 0) / served) : 0;

    return {
      difficulty: d,
      questionsServed: served,
      correct,
      incorrect,
      unanswered,
      accuracy,
      avgMarks,
    };
  });

  // 9. Question Performance for this test
  const questionAnalyticsRes = await getAdminQuestionAnalytics({
    testId,
    dateRange: filters.dateRange,
    startDate: filters.startDate,
    endDate: filters.endDate,
    limit: 100,
  });

  return {
    test: {
      id: test.id,
      title: test.title,
      description: test.description,
      instructions: test.instructions,
      status: test.status,
      effectiveStatus,
      type: test.type,
      totalMarks: test.totalMarks,
      duration: test.duration,
      attemptLimit: test.attemptLimit,
      negativeMarkingEnabled: test.negativeMarkingEnabled,
      negativeMarkRate: Number(test.negativeMarkRate || 0),
      randomizeQuestions: test.randomizeQuestions,
      randomizeOptions: test.randomizeOptions,
      scheduledStartAt: test.scheduledStartAt
        ? new Date(test.scheduledStartAt).toISOString()
        : null,
      scheduledEndAt: test.scheduledEndAt
        ? new Date(test.scheduledEndAt).toISOString()
        : null,
      scheduleTimezone: test.scheduleTimezone,
      createdAt: new Date(test.createdAt).toISOString(),
    },
    metrics: {
      totalAttempts,
      submittedAttempts,
      activeAttempts,
      expiredAttempts,
      completionRate,
      uniqueStudents,
      avgScore,
      avgAccuracy,
      avgTimeTakenSec,
    },
    negativeMarking,
    scoreDistribution,
    accuracyDistribution,
    performanceTrend,
    isLimitedHistory,
    sectionPerformance,
    subjectPerformance,
    difficultyPerformance,
    poolPerformance,
    questionPerformance: questionAnalyticsRes.questions,
  };
}

// ============================================================================
// 4. QUESTION ANALYTICS & QUALITY SIGNALS
// ============================================================================

export async function getAdminQuestionAnalytics(
  filters: AdminQuestionFilters & {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  } = {}
): Promise<{
  questions: AdminQuestionPerformanceItem[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}> {
  const { fromDate, toDate } = resolveDateBoundaries(filters);
  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.max(1, Math.min(200, Number(filters.limit || 50)));

  const rawRes = await db.execute(sql`
    WITH served AS (
      SELECT
        aq.attempt_id,
        aq.question_id,
        COALESCE(aq.marks_snapshot, q.marks) as marks,
        COALESCE(aq.question_text_snapshot, q.question) as question_text,
        q.subject_id,
        q.topic_id,
        q.difficulty
      FROM attempt_questions aq
      JOIN attempts a ON aq.attempt_id = a.id
      JOIN questions q ON aq.question_id = q.id
      WHERE a.status = 'submitted'
        ${filters.testId ? sql`AND a.test_id = ${filters.testId}` : sql``}
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
      UNION ALL
      SELECT
        a.id as attempt_id,
        tq.question_id,
        q.marks,
        q.question as question_text,
        q.subject_id,
        q.topic_id,
        q.difficulty
      FROM attempts a
      JOIN test_questions tq ON tq.test_id = a.test_id
      JOIN questions q ON tq.question_id = q.id
      WHERE a.status = 'submitted'
        AND NOT EXISTS (SELECT 1 FROM attempt_questions aq WHERE aq.attempt_id = a.id)
        ${filters.testId ? sql`AND a.test_id = ${filters.testId}` : sql``}
        ${fromDate ? sql`AND a.submitted_at >= ${fromDate.toISOString()}` : sql``}
        ${toDate ? sql`AND a.submitted_at <= ${toDate.toISOString()}` : sql``}
    )
    SELECT
      s.question_id,
      MAX(s.question_text) as question_text,
      s.subject_id,
      sub.name as subject_name,
      sub.code as subject_code,
      s.topic_id,
      t.name as topic_name,
      s.difficulty,
      MAX(s.marks) as marks,
      COUNT(*) as attempts_served,
      COUNT(ans.id) as answered_count,
      COUNT(CASE WHEN ans.is_correct = TRUE THEN 1 END) as correct_count,
      COUNT(CASE WHEN ans.is_correct = FALSE THEN 1 END) as incorrect_count,
      COUNT(CASE WHEN ans.id IS NULL OR ans.selected_answer IS NULL THEN 1 END) as unanswered_count,
      COALESCE(SUM(CASE WHEN ans.is_correct = TRUE THEN s.marks ELSE 0 END), 0) as total_earned_marks
    FROM served s
    JOIN subjects sub ON s.subject_id = sub.id
    JOIN topics t ON s.topic_id = t.id
    LEFT JOIN answers ans ON ans.attempt_id = s.attempt_id AND ans.question_id = s.question_id
    WHERE 1=1
      ${filters.subjectId && filters.subjectId !== "all" ? sql`AND s.subject_id = ${filters.subjectId}` : sql``}
      ${filters.topicId && filters.topicId !== "all" ? sql`AND s.topic_id = ${filters.topicId}` : sql``}
      ${filters.difficulty && filters.difficulty !== "all" ? sql`AND s.difficulty = ${filters.difficulty}` : sql``}
      ${filters.search ? sql`AND s.question_text ILIKE ${"%" + filters.search + "%"}` : sql``}
    GROUP BY s.question_id, s.subject_id, sub.name, sub.code, s.topic_id, t.name, s.difficulty
  `);

  let items: AdminQuestionPerformanceItem[] = (rawRes.rows as any[]).map(
    (row) => {
      const served = Number(row.attempts_served || 0);
      const answered = Number(row.answered_count || 0);
      const correct = Number(row.correct_count || 0);
      const incorrect = Number(row.incorrect_count || 0);
      const unanswered = Number(row.unanswered_count || 0);
      const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;
      const avgMarksEarned =
        served > 0 ? round2(Number(row.total_earned_marks || 0) / served) : 0;

      // Difficulty classification thresholds
      let difficultyLabel: AdminQuestionPerformanceItem["difficultyLabel"] =
        "Unassessed";
      if (answered > 0) {
        if (accuracy < 30) difficultyLabel = "Very Difficult";
        else if (accuracy < 50) difficultyLabel = "Difficult";
        else if (accuracy < 80) difficultyLabel = "Normal";
        else if (accuracy <= 95) difficultyLabel = "Easy";
        else difficultyLabel = "Very Easy";
      }

      // Observational Quality Signals
      const qualitySignals: string[] = [];
      const skipRate = served > 0 ? (unanswered / served) * 100 : 0;

      if (served < 5) {
        qualitySignals.push("Low sample size");
      }
      if (served >= 5 && accuracy < 30) {
        qualitySignals.push("High failure rate");
      }
      if (served >= 5 && accuracy < 20) {
        qualitySignals.push("Potentially too difficult");
      }
      if (served >= 5 && skipRate >= 40) {
        qualitySignals.push("High skip rate");
      }
      if (served >= 5 && accuracy >= 90) {
        qualitySignals.push("High success rate");
      }
      if (served >= 5 && accuracy > 95) {
        qualitySignals.push("Potentially too easy");
      }

      return {
        questionId: row.question_id,
        questionText: row.question_text || "",
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        subjectCode: row.subject_code,
        topicId: row.topic_id,
        topicName: row.topic_name,
        difficulty: row.difficulty,
        marks: Number(row.marks || 1),
        attemptsServed: served,
        answeredCount: answered,
        correctCount: correct,
        incorrectCount: incorrect,
        unansweredCount: unanswered,
        accuracy,
        avgMarksEarned,
        difficultyLabel,
        qualitySignals,
      };
    }
  );

  // Filter by qualitySignal if requested
  if (filters.qualitySignal && filters.qualitySignal !== "all") {
    const sig = filters.qualitySignal;
    items = items.filter((q) => {
      if (sig === "high_failure")
        return q.qualitySignals.includes("High failure rate");
      if (sig === "high_skip")
        return q.qualitySignals.includes("High skip rate");
      if (sig === "high_success")
        return q.qualitySignals.includes("High success rate");
      if (sig === "low_sample")
        return q.qualitySignals.includes("Low sample size");
      if (sig === "too_difficult")
        return q.qualitySignals.includes("Potentially too difficult");
      if (sig === "too_easy")
        return q.qualitySignals.includes("Potentially too easy");
      return true;
    });
  }

  // Sort
  if (filters.sortBy) {
    const key = filters.sortBy;
    const order = filters.sortOrder === "asc" ? 1 : -1;
    if (key === "hardest") {
      items.sort((a, b) => (a.accuracy - b.accuracy) * order);
    } else if (key === "easiest") {
      items.sort((a, b) => (b.accuracy - a.accuracy) * order);
    } else if (key === "most_attempted") {
      items.sort((a, b) => (b.attemptsServed - a.attemptsServed) * order);
    } else if (key === "most_skipped") {
      items.sort((a, b) => (b.unansweredCount - a.unansweredCount) * order);
    } else {
      items.sort((a: any, b: any) => {
        const vA = a[key] ?? 0;
        const vB = b[key] ?? 0;
        return (vA > vB ? 1 : -1) * order;
      });
    }
  } else {
    // Default sort by attemptsServed desc
    items.sort((a, b) => b.attemptsServed - a.attemptsServed);
  }

  const total = items.length;
  const paginatedItems = items.slice((page - 1) * limit, page * limit);

  return {
    questions: paginatedItems,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

// ============================================================================
// 5. OPERATIONAL ACTIVE ATTEMPTS (PRIVACY SAFE)
// ============================================================================

export async function getAdminActiveAttempts(
  limit: number = 50
): Promise<AdminActiveAttemptItem[]> {
  const activeRes = await db
    .select({
      attemptId: attempts.id,
      testId: attempts.testId,
      startedAt: attempts.startedAt,
      testTitle: tests.title,
      duration: tests.duration,
      studentId: users.id,
      studentEmail: users.email,
      studentName: profiles.name,
    })
    .from(attempts)
    .innerJoin(tests, eq(attempts.testId, tests.id))
    .innerJoin(users, eq(attempts.userId, users.id))
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(attempts.status, "in_progress"))
    .orderBy(desc(attempts.startedAt))
    .limit(limit);

  if (activeRes.length === 0) {
    return [];
  }

  const attemptIds = activeRes.map((a) => a.attemptId);

  // Count answers logged per attempt
  const answerCounts = await db
    .select({
      attemptId: answers.attemptId,
      answeredCount: count(),
    })
    .from(answers)
    .where(inArray(answers.attemptId, attemptIds))
    .groupBy(answers.attemptId);

  const answerMap = new Map<string, number>();
  answerCounts.forEach((ac) => {
    answerMap.set(ac.attemptId, Number(ac.answeredCount || 0));
  });

  const now = Date.now();

  return activeRes.map((row) => {
    const startedMs = new Date(row.startedAt).getTime();
    const durationSec = (row.duration || 60) * 60;
    const elapsedSec = Math.max(0, Math.floor((now - startedMs) / 1000));
    const timeRemainingSec = Math.max(0, durationSec - elapsedSec);
    const answeredCount = answerMap.get(row.attemptId) || 0;

    return {
      attemptId: row.attemptId,
      testId: row.testId,
      testTitle: row.testTitle,
      studentId: row.studentId,
      studentName: row.studentName || row.studentEmail.split("@")[0],
      studentEmail: row.studentEmail,
      startedAt: new Date(row.startedAt).toISOString(),
      durationMinutes: row.duration,
      timeRemainingSec,
      currentQuestion: answeredCount + 1,
      status: "in_progress",
    };
  });
}

// ============================================================================
// 6. TEST COMPARISON (TEST A vs TEST B)
// ============================================================================

export async function compareAdminTests(
  testIdA: string,
  testIdB: string
): Promise<AdminTestComparisonResult | null> {
  const [analyticsA, analyticsB] = await Promise.all([
    getAdminTestDetailAnalytics(testIdA),
    getAdminTestDetailAnalytics(testIdB),
  ]);

  if (!analyticsA || !analyticsB) {
    return null;
  }

  return {
    testA: {
      id: analyticsA.test.id,
      title: analyticsA.test.title,
      status: analyticsA.test.status,
      effectiveStatus: analyticsA.test.effectiveStatus,
      totalAttempts: analyticsA.metrics.totalAttempts,
      submittedAttempts: analyticsA.metrics.submittedAttempts,
      completionRate: analyticsA.metrics.completionRate,
      avgScore: analyticsA.metrics.avgScore,
      avgAccuracy: analyticsA.metrics.avgAccuracy,
      avgTimeTakenSec: analyticsA.metrics.avgTimeTakenSec,
      uniqueStudents: analyticsA.metrics.uniqueStudents,
    },
    testB: {
      id: analyticsB.test.id,
      title: analyticsB.test.title,
      status: analyticsB.test.status,
      effectiveStatus: analyticsB.test.effectiveStatus,
      totalAttempts: analyticsB.metrics.totalAttempts,
      submittedAttempts: analyticsB.metrics.submittedAttempts,
      completionRate: analyticsB.metrics.completionRate,
      avgScore: analyticsB.metrics.avgScore,
      avgAccuracy: analyticsB.metrics.avgAccuracy,
      avgTimeTakenSec: analyticsB.metrics.avgTimeTakenSec,
      uniqueStudents: analyticsB.metrics.uniqueStudents,
    },
  };
}
