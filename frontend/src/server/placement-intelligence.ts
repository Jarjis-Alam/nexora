import { db } from "@/db";
import {
  attempts,
  answers,
  questions,
  tests,
  subjects,
  topics,
  testSections,
  testQuestions,
} from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { calculateReadiness } from "./readiness";
import { getStudentPlacementTargets } from "./company-role-intelligence";

// ============================================================================
// 1. DATA CONTRACTS & ACTION TYPES
// ============================================================================

export type ActionCategory = "FIX" | "REINFORCE" | "MAINTAIN";

export interface ActionPriority {
  id: string;
  priorityNumber: string; // "01", "02", "03", etc.
  category: ActionCategory; // "FIX" | "REINFORCE" | "MAINTAIN"
  domain: string; // e.g. "DBMS"
  domainName: string; // e.g. "Database Management Systems"
  topic: string; // e.g. "Transactions"
  topicId: string;
  accuracy: number;
  totalAttempts: number;
  correctCount: number;
  unansweredCount: number;
  impact: string; // "Critical Weakness", "High-Impact Weakness", "Moderate Deficit", "Competitive Benchmark"
  why: string; // Explainable rationale
  evidence: string; // Real empirical signals
  action: string; // Concrete prescriptive directive
  ctaLabel: string; // "Start Practice" | "Practice" | "Review"
  ctaHref: string; // URL linking to test/practice
  targetRelevance?: {
    isTargetAligned: boolean;
    roleName?: string;
  };
}

export interface PlacementIntelligence {
  userId: string;
  hasBaseline: boolean;
  dataSufficiency: {
    status: "zero_data" | "limited_data" | "sufficient_data";
    hasCompletedBaseline: boolean;
    isZeroData: boolean;
    message: string;
    attemptsCount: number;
    questionsAttempted: number;
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
  };
  priorities: ActionPriority[];
  recommendations: ActionPriority[];
  strengths: ActionPriority[];
  weaknesses: ActionPriority[];
  targetAlignment: {
    hasTargets: boolean;
    primaryRole: string | null;
    primaryCompany: string | null;
    focusedDomains: string[];
  };
  emptyState: {
    show: boolean;
    title: string;
    message: string;
    ctaLabel: string;
    ctaHref: string;
  } | null;
  baselineAction: {
    title: string;
    reason: string;
    ctaLabel: string;
    ctaHref: string;
  } | null;
}

// ============================================================================
// 2. DOMAIN RELEVANCE BY TARGET ROLE
// ============================================================================

const ROLE_DOMAIN_RELEVANCE: Record<string, string[]> = {
  "software-engineer": ["DSA", "DBMS", "OS", "OOP", "SQL"],
  "backend-engineer": ["DBMS", "SQL", "OS", "CN", "DSA"],
  "frontend-engineer": ["DSA", "OOP", "APT"],
  "full-stack-engineer": ["DSA", "DBMS", "SQL", "OS", "OOP"],
  "data-engineer": ["SQL", "DBMS", "DSA", "OS"],
  "systems-engineer": ["OS", "CN", "DSA", "DBMS"],
  "devops-engineer": ["OS", "CN", "DBMS"],
  "qa-engineer": ["OOP", "DBMS", "SQL", "APT"],
};

// ============================================================================
// 3. TARGETED PRACTICE TEST CREATOR / RESOLVER
// ============================================================================

export async function getOrCreateTargetedPracticeTest(params: {
  topicId?: string;
  subjectCode?: string;
}): Promise<{ id: string; title: string; duration: number; questionCount: number }> {
  const { topicId, subjectCode } = params;

  let targetTopic: { id: string; name: string; subjectId: string } | null = null;
  let targetSubject: { id: string; name: string; code: string; category: string } | null = null;

  if (topicId) {
    const topicRows = await db
      .select({
        id: topics.id,
        name: topics.name,
        subjectId: topics.subjectId,
        subjectName: subjects.name,
        subjectCode: subjects.code,
        subjectCategory: subjects.category,
      })
      .from(topics)
      .innerJoin(subjects, eq(topics.subjectId, subjects.id))
      .where(eq(topics.id, topicId))
      .limit(1);

    if (topicRows.length > 0) {
      targetTopic = {
        id: topicRows[0].id,
        name: topicRows[0].name,
        subjectId: topicRows[0].subjectId,
      };
      targetSubject = {
        id: topicRows[0].subjectId,
        name: topicRows[0].subjectName,
        code: topicRows[0].subjectCode,
        category: topicRows[0].subjectCategory,
      };
    }
  }

  if (!targetSubject && subjectCode) {
    const subjRows = await db
      .select({
        id: subjects.id,
        name: subjects.name,
        code: subjects.code,
        category: subjects.category,
      })
      .from(subjects)
      .where(eq(subjects.code, subjectCode))
      .limit(1);

    if (subjRows.length > 0) {
      targetSubject = subjRows[0];
    }
  }

  if (!targetSubject) {
    // Fallback: Return baseline or first published test
    const fallbackTest = await db
      .select({ id: tests.id, title: tests.title, duration: tests.duration })
      .from(tests)
      .where(eq(tests.isPublished, true))
      .limit(1);

    if (fallbackTest.length > 0) {
      return {
        id: fallbackTest[0].id,
        title: fallbackTest[0].title,
        duration: fallbackTest[0].duration,
        questionCount: 10,
      };
    }
    throw new Error("No tests available in system.");
  }

  // Canonical practice test title
  const practiceTitle = targetTopic
    ? `Practice: ${targetSubject.code} — ${targetTopic.name}`
    : `Practice: ${targetSubject.code} Fundamentals`;

  // 1. Check if practice test already exists in DB
  const existingTestRows = await db
    .select({
      id: tests.id,
      title: tests.title,
      duration: tests.duration,
    })
    .from(tests)
    .where(eq(tests.title, practiceTitle))
    .limit(1);

  if (existingTestRows.length > 0) {
    const existing = existingTestRows[0];
    const qCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(testQuestions)
      .where(eq(testQuestions.testId, existing.id));

    return {
      id: existing.id,
      title: existing.title,
      duration: existing.duration,
      questionCount: Number(qCount[0]?.count || 5),
    };
  }

  // 2. Select targeted questions from database
  let candidateQuestions: {
    id: string;
    marks: number;
  }[] = [];

  if (targetTopic) {
    candidateQuestions = await db
      .select({
        id: questions.id,
        marks: questions.marks,
      })
      .from(questions)
      .where(eq(questions.topicId, targetTopic.id))
      .limit(10);
  }

  // If fewer than 5 topic questions, supplement with general questions from the same subject
  if (candidateQuestions.length < 5) {
    const existingIds = candidateQuestions.map((q) => q.id);
    const supplementQuestions = await db
      .select({
        id: questions.id,
        marks: questions.marks,
      })
      .from(questions)
      .where(
        existingIds.length > 0
          ? and(
              eq(questions.subjectId, targetSubject.id),
              sql`${questions.id} NOT IN ${existingIds}`
            )
          : eq(questions.subjectId, targetSubject.id)
      )
      .limit(10 - candidateQuestions.length);

    candidateQuestions = [...candidateQuestions, ...supplementQuestions];
  }

  if (candidateQuestions.length === 0) {
    // Ultimate fallback: grab any 5 questions from the subject
    candidateQuestions = await db
      .select({ id: questions.id, marks: questions.marks })
      .from(questions)
      .where(eq(questions.subjectId, targetSubject.id))
      .limit(5);
  }

  const durationMinutes = Math.max(10, Math.min(30, candidateQuestions.length * 2));
  const totalMarks = candidateQuestions.reduce((sum, q) => sum + (q.marks || 2), 0);
  const testType = targetSubject.category === "aptitude" ? "aptitude" : "cs_fundamentals";

  // 3. Create test and link questions in transaction
  const [createdTest] = await db
    .insert(tests)
    .values({
      title: practiceTitle,
      description: targetTopic
        ? `Targeted practice session focused on ${targetTopic.name} (${targetSubject.name}).`
        : `Targeted practice session covering core ${targetSubject.name} concepts.`,
      type: testType,
      duration: durationMinutes,
      difficulty: "medium",
      totalMarks,
      isPublished: true,
      status: "published",
    })
    .returning();

  const [createdSection] = await db
    .insert(testSections)
    .values({
      testId: createdTest.id,
      title: targetTopic ? `${targetSubject.code} — ${targetTopic.name}` : targetSubject.name,
      sectionOrder: 1,
    })
    .returning();

  await db.insert(testQuestions).values(
    candidateQuestions.map((q, idx) => ({
      testId: createdTest.id,
      sectionId: createdSection.id,
      questionId: q.id,
      questionOrder: idx + 1,
    }))
  );

  return {
    id: createdTest.id,
    title: createdTest.title,
    duration: createdTest.duration,
    questionCount: candidateQuestions.length,
  };
}

// ============================================================================
// 4. PLACEMENT INTELLIGENCE & ACTION ENGINE CORE
// ============================================================================

export async function getPlacementIntelligence(userId: string): Promise<PlacementIntelligence> {
  if (!userId || typeof userId !== "string" || userId.trim() === "") {
    throw new Error("Invalid or unauthenticated user ID");
  }

  // 1. Fetch baseline & readiness state
  const readiness = await calculateReadiness(userId);

  // 2. Fetch placement target configuration
  const targets = await getStudentPlacementTargets(userId);
  const primaryRoleSlug = targets.primaryRole?.slug || null;
  const primaryRoleName = targets.primaryRole?.name || null;
  const primaryCompanyName = targets.primaryCompany?.name || null;

  // Target-aligned subject codes
  const focusedDomains: string[] = primaryRoleSlug && ROLE_DOMAIN_RELEVANCE[primaryRoleSlug]
    ? ROLE_DOMAIN_RELEVANCE[primaryRoleSlug]
    : targets.configured
    ? ["DSA", "DBMS", "OS", "SQL"] // Default tech stack if role slug isn't mapped
    : [];

  // Query baseline test for empty-state CTA
  const baselineTestRows = await db
    .select({ id: tests.id })
    .from(tests)
    .where(eq(tests.type, "baseline"))
    .limit(1);
  const baselineTestId = baselineTestRows[0]?.id || null;

  // Handle zero-data state if baseline is uncompleted
  if (!readiness.hasCompletedBaseline) {
    return {
      userId,
      hasBaseline: false,
      dataSufficiency: {
        status: "zero_data",
        hasCompletedBaseline: false,
        isZeroData: true,
        message: "Complete your first assessment to unlock personalized preparation recommendations.",
        attemptsCount: 0,
        questionsAttempted: 0,
      },
      readiness: {
        score: null,
        level: null,
        breakdown: null,
      },
      priorities: [],
      recommendations: [],
      strengths: [],
      weaknesses: [],
      targetAlignment: {
        hasTargets: targets.configured,
        primaryRole: primaryRoleName,
        primaryCompany: primaryCompanyName,
        focusedDomains,
      },
      emptyState: {
        show: true,
        title: "BUILD YOUR BASELINE",
        message: "Complete your first assessment to unlock personalized preparation recommendations.",
        ctaLabel: "Start Assessment",
        ctaHref: baselineTestId ? `/tests/${baselineTestId}` : "/assessment",
      },
      baselineAction: {
        title: "Build Your Baseline",
        reason: "Establish your placement readiness benchmark across 7 engineering domains.",
        ctaLabel: "Start Assessment",
        ctaHref: baselineTestId ? `/tests/${baselineTestId}` : "/assessment",
      },
    };
  }

  // 3. Fetch all submitted question answers for this user
  const submittedAnswers = await db
    .select({
      answerId: answers.id,
      isCorrect: answers.isCorrect,
      selectedAnswer: answers.selectedAnswer,
      questionId: questions.id,
      subjectId: questions.subjectId,
      subjectName: subjects.name,
      subjectCode: subjects.code,
      topicId: questions.topicId,
      topicName: topics.name,
      submittedAt: attempts.submittedAt,
    })
    .from(answers)
    .innerJoin(attempts, eq(answers.attemptId, attempts.id))
    .innerJoin(questions, eq(answers.questionId, questions.id))
    .innerJoin(subjects, eq(questions.subjectId, subjects.id))
    .innerJoin(topics, eq(questions.topicId, topics.id))
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")))
    .orderBy(desc(attempts.submittedAt));

  // Count distinct attempts
  const attemptCountRes = await db
    .select({ count: sql<number>`count(distinct ${attempts.id})` })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")));
  const totalAttemptsCount = Number(attemptCountRes[0]?.count || 0);

  // Group by topic
  interface TopicAccumulator {
    topicId: string;
    topicName: string;
    subjectId: string;
    subjectCode: string;
    subjectName: string;
    totalAttempts: number;
    correctCount: number;
    unansweredCount: number;
  }

  const topicMap = new Map<string, TopicAccumulator>();

  for (const ans of submittedAnswers) {
    if (!topicMap.has(ans.topicId)) {
      topicMap.set(ans.topicId, {
        topicId: ans.topicId,
        topicName: ans.topicName,
        subjectId: ans.subjectId,
        subjectCode: ans.subjectCode,
        subjectName: ans.subjectName,
        totalAttempts: 0,
        correctCount: 0,
        unansweredCount: 0,
      });
    }

    const acc = topicMap.get(ans.topicId)!;
    acc.totalAttempts += 1;
    if (ans.isCorrect === true) {
      acc.correctCount += 1;
    }
    if (ans.selectedAnswer === null || ans.selectedAnswer === undefined) {
      acc.unansweredCount += 1;
    }
  }

  // 4. Categorize & Score Priorities
  interface ScoredCandidate {
    priority: ActionPriority;
    priorityScore: number;
  }

  const scoredCandidates: ScoredCandidate[] = [];
  const strengthsList: ActionPriority[] = [];
  const weaknessesList: ActionPriority[] = [];

  for (const item of Array.from(topicMap.values())) {
    if (item.totalAttempts === 0) continue;

    const accuracy = Math.round((item.correctCount / item.totalAttempts) * 100);
    const isTargetAligned = focusedDomains.includes(item.subjectCode);

    let category: ActionCategory;
    let impact: string;
    let why: string;
    let action: string;
    let ctaLabel: string;
    let baseScore: number;

    if (accuracy < 50) {
      // Category: FIX
      category = "FIX";
      impact = accuracy < 40 ? "Critical Weakness" : "High-Impact Weakness";
      why = isTargetAligned && primaryRoleName
        ? `Lowest measured accuracy area. High relevance for your target role (${primaryRoleName}).`
        : `This is currently one of your weakest measured areas with significant deficit holding back readiness.`;
      action = `Complete targeted practice session in ${item.topicName} to eliminate conceptual deficits.`;
      ctaLabel = "Start Practice";
      // Higher deficit = higher score; bonus for target alignment
      baseScore = 1000 + (100 - accuracy) * 8 + (isTargetAligned ? 250 : 0) + item.totalAttempts * 2;
    } else if (accuracy < 75) {
      // Category: REINFORCE
      category = "REINFORCE";
      impact = "Moderate Deficit";
      why = isTargetAligned && primaryRoleName
        ? `Moderate proficiency established, but below competitive threshold for ${primaryRoleName}.`
        : `Adequate conceptual foundation, but performance is below the competitive placement benchmark of 75%.`;
      action = `Practice reinforcing problem sets in ${item.topicName} to build accuracy and speed.`;
      ctaLabel = "Practice";
      baseScore = 500 + (100 - accuracy) * 4 + (isTargetAligned ? 150 : 0) + item.totalAttempts;
    } else {
      // Category: MAINTAIN
      category = "MAINTAIN";
      impact = "Competitive Benchmark";
      why = `Strong mastery demonstrated (${accuracy}%). Periodic review maintains peak placement readiness.`;
      action = `Review key questions and patterns in ${item.topicName} to maintain accuracy under timed conditions.`;
      ctaLabel = "Review";
      baseScore = 100 + accuracy + (isTargetAligned ? 50 : 0);
    }

    const evidence = `${accuracy}% accuracy across ${item.totalAttempts} question${
      item.totalAttempts === 1 ? "" : "s"
    } (${item.correctCount} correct, ${item.totalAttempts - item.correctCount} incorrect)`;

    const priorityItem: ActionPriority = {
      id: `priority-${item.topicId}`,
      priorityNumber: "01", // assigned after sorting
      category,
      domain: item.subjectCode,
      domainName: item.subjectName,
      topic: item.topicName,
      topicId: item.topicId,
      accuracy,
      totalAttempts: item.totalAttempts,
      correctCount: item.correctCount,
      unansweredCount: item.unansweredCount,
      impact,
      why,
      evidence,
      action,
      ctaLabel,
      ctaHref: `/practice?topicId=${item.topicId}&subjectCode=${item.subjectCode}`,
      targetRelevance: {
        isTargetAligned,
        roleName: primaryRoleName || undefined,
      },
    };

    scoredCandidates.push({
      priority: priorityItem,
      priorityScore: baseScore,
    });

    if (category === "FIX" || category === "REINFORCE") {
      weaknessesList.push(priorityItem);
    } else {
      strengthsList.push(priorityItem);
    }
  }

  // 5. If no topic-level answers exist (fallback to subject scores from baseline)
  if (scoredCandidates.length === 0 && readiness.subjectScores.length > 0) {
    const sortedSubjs = [...readiness.subjectScores].sort((a, b) => a.score - b.score);
    for (const subj of sortedSubjs) {
      const isTargetAligned = focusedDomains.includes(subj.code);
      const category: ActionCategory = subj.score < 50 ? "FIX" : subj.score < 75 ? "REINFORCE" : "MAINTAIN";

      const priorityItem: ActionPriority = {
        id: `priority-subject-${subj.subjectId}`,
        priorityNumber: "01",
        category,
        domain: subj.code,
        domainName: subj.name,
        topic: `${subj.name} Fundamentals`,
        topicId: subj.subjectId,
        accuracy: subj.score,
        totalAttempts: 1,
        correctCount: 0,
        unansweredCount: 0,
        impact: category === "FIX" ? "High-Impact Weakness" : category === "REINFORCE" ? "Moderate Deficit" : "Competitive Benchmark",
        why: `Identified as a priority focus area based on baseline evaluation.`,
        evidence: `${subj.score}% overall domain benchmark recorded`,
        action: `Complete targeted practice covering core ${subj.name} fundamentals.`,
        ctaLabel: category === "MAINTAIN" ? "Review" : "Start Practice",
        ctaHref: `/practice?subjectCode=${subj.code}`,
        targetRelevance: {
          isTargetAligned,
          roleName: primaryRoleName || undefined,
        },
      };

      scoredCandidates.push({
        priority: priorityItem,
        priorityScore: category === "FIX" ? 1000 + (100 - subj.score) : category === "REINFORCE" ? 500 : 100,
      });

      if (category === "FIX" || category === "REINFORCE") {
        weaknessesList.push(priorityItem);
      } else {
        strengthsList.push(priorityItem);
      }
    }
  }

  // Sort candidates by priority score descending
  scoredCandidates.sort((a, b) => b.priorityScore - a.priorityScore);

  // Assign two-digit sequence numbering: "01", "02", "03", ...
  const orderedPriorities = scoredCandidates.map((c, idx) => ({
    ...c.priority,
    priorityNumber: String(idx + 1).padStart(2, "0"),
  }));

  const dataSufficiencyStatus =
    submittedAnswers.length >= 30
      ? "sufficient_data"
      : submittedAnswers.length > 0
      ? "limited_data"
      : "zero_data";

  return {
    userId,
    hasBaseline: true,
    dataSufficiency: {
      status: dataSufficiencyStatus,
      hasCompletedBaseline: true,
      isZeroData: false,
      message:
        dataSufficiencyStatus === "sufficient_data"
          ? "Calibrated against sufficient empirical attempt data."
          : "Early calibration based on initial attempts. Completing more tests increases precision.",
      attemptsCount: totalAttemptsCount,
      questionsAttempted: submittedAnswers.length,
    },
    readiness: {
      score: readiness.readinessScore,
      level: readiness.level,
      breakdown: readiness.breakdown,
    },
    priorities: orderedPriorities.slice(0, 5),
    recommendations: orderedPriorities.slice(0, 3),
    strengths: strengthsList.slice(0, 5),
    weaknesses: weaknessesList.slice(0, 5),
    targetAlignment: {
      hasTargets: targets.configured,
      primaryRole: primaryRoleName,
      primaryCompany: primaryCompanyName,
      focusedDomains,
    },
    emptyState: null,
    baselineAction: null,
  };
}
