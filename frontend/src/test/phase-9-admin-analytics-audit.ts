import { db } from "@/db";
import {
  tests,
  questions,
  attempts,
  answers,
  attemptQuestions,
  testSections,
  questionPools,
  questionPoolQuestions,
  users,
  profiles,
} from "@/db/schema";
import {
  getAdminOverviewAnalytics,
  getAdminTestPerformanceList,
  getAdminTestDetailAnalytics,
  getAdminQuestionAnalytics,
  getAdminActiveAttempts,
  compareAdminTests,
  resolveDateBoundaries,
} from "@/server/admin-analytics";
import { eq, sql, inArray } from "drizzle-orm";
import { calculateReadiness } from "@/server/readiness";

async function runPhase9Audit() {
  console.log("==================================================");
  console.log("📊 NEXORA — PHASE 9: ADMIN ANALYTICS AUDIT");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${description}`);
      failed++;
    }
  }

  // Tracking fixtures for cleanup
  const createdTestIds: string[] = [];
  const createdAttemptIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ------------------------------------------------------------------------
    // Group 1: Analytical Indexes Verification
    // ------------------------------------------------------------------------
    console.log("\n--- Group 1: Analytical Database Indexes ---");
    const indexCheckRes = await db.execute(sql`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE tablename IN ('attempts', 'attempt_questions', 'answers')
        AND indexname IN (
          'attempts_submitted_at_idx',
          'attempts_test_status_submitted_idx',
          'attempt_questions_attempt_id_idx',
          'answers_attempt_question_idx',
          'answers_question_is_correct_idx'
        );
    `);

    const foundIndexes = (indexCheckRes.rows as any[]).map((r) => r.indexname);
    assert(
      foundIndexes.includes("attempts_submitted_at_idx"),
      "Index attempts_submitted_at_idx is active"
    );
    assert(
      foundIndexes.includes("attempts_test_status_submitted_idx"),
      "Index attempts_test_status_submitted_idx is active"
    );
    assert(
      foundIndexes.includes("attempt_questions_attempt_id_idx"),
      "Index attempt_questions_attempt_id_idx is active"
    );
    assert(
      foundIndexes.includes("answers_attempt_question_idx"),
      "Index answers_attempt_question_idx is active"
    );
    assert(
      foundIndexes.includes("answers_question_is_correct_idx"),
      "Index answers_question_is_correct_idx is active"
    );

    // ------------------------------------------------------------------------
    // Group 2: Setup Test Data Fixtures for Controlled Telemetry
    // ------------------------------------------------------------------------
    console.log("\n--- Group 2: Test Data & Aggregation Fixtures ---");

    // Fetch existing test questions to build a fixture test
    const repoQuestions = await db
      .select({ id: questions.id, marks: questions.marks, difficulty: questions.difficulty })
      .from(questions)
      .limit(6);

    assert(repoQuestions.length >= 4, "Sufficient repository questions exist for telemetry testing");

    // Create a student user
    const [testStudent] = await db
      .insert(users)
      .values({
        email: `audit_admin_analytics_${Date.now()}@nexora.internal`,
        passwordHash: "audit_hash",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(testStudent.id);

    await db.insert(profiles).values({
      userId: testStudent.id,
      name: "Analytics Audit Student",
    });

    // Create Test A with negative marking enabled
    const [testA] = await db
      .insert(tests)
      .values({
        title: `Telemetry Alpha Assessment ${Date.now()}`,
        duration: 30,
        type: "aptitude",
        totalMarks: 10,
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.25",
        status: "published",
        isPublished: true,
      })
      .returning();
    createdTestIds.push(testA.id);

    // Create Section on Test A
    const [sectionA] = await db
      .insert(testSections)
      .values({
        testId: testA.id,
        title: "Section Alpha",
        sectionOrder: 1,
      })
      .returning();

    // Create Pool on Test A
    const [poolA] = await db
      .insert(questionPools)
      .values({
        testId: testA.id,
        sectionId: sectionA.id,
        title: "Dynamic Problem Pool",
        selectionCount: 1,
        poolOrder: 1,
      })
      .returning();

    await db.insert(questionPoolQuestions).values({
      poolId: poolA.id,
      questionId: repoQuestions[0].id,
      questionOrder: 1,
    });

    // Create Attempt 1: Submitted (Score: 80%, Accuracy: 80%, Duration: 120s)
    const [attempt1] = await db
      .insert(attempts)
      .values({
        userId: testStudent.id,
        testId: testA.id,
        status: "submitted",
        score: 80,
        accuracy: 80,
        timeTaken: 120,
        startedAt: new Date(Date.now() - 300000),
        submittedAt: new Date(),
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.25",
      })
      .returning();
    createdAttemptIds.push(attempt1.id);

    // Link attempt_questions
    await db.insert(attemptQuestions).values([
      {
        attemptId: attempt1.id,
        questionId: repoQuestions[0].id,
        sectionId: sectionA.id,
        poolId: poolA.id,
        questionOrder: 1,
        marksSnapshot: 2,
        questionTextSnapshot: "Audit Q1 Snapshot",
      },
      {
        attemptId: attempt1.id,
        questionId: repoQuestions[1].id,
        sectionId: sectionA.id,
        questionOrder: 2,
        marksSnapshot: 2,
        questionTextSnapshot: "Audit Q2 Snapshot",
      },
    ]);

    // Answers for Attempt 1: Q0 correct, Q1 incorrect (triggers negative marking deduction: 2 * 0.25 = 0.50)
    await db.insert(answers).values([
      {
        attemptId: attempt1.id,
        questionId: repoQuestions[0].id,
        selectedAnswer: "A",
        isCorrect: true,
        timeSpent: 30,
      },
      {
        attemptId: attempt1.id,
        questionId: repoQuestions[1].id,
        selectedAnswer: "B",
        isCorrect: false,
        timeSpent: 45,
      },
    ]);

    // Create Attempt 2: In Progress (Live attempt)
    const [attempt2] = await db
      .insert(attempts)
      .values({
        userId: testStudent.id,
        testId: testA.id,
        status: "in_progress",
        startedAt: new Date(Date.now() - 60000), // 1 minute ago
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.25",
      })
      .returning();
    createdAttemptIds.push(attempt2.id);

    // Answer 1 logged for attempt 2
    await db.insert(answers).values({
      attemptId: attempt2.id,
      questionId: repoQuestions[0].id,
      selectedAnswer: "A",
      isCorrect: true,
      timeSpent: 20,
    });

    // ------------------------------------------------------------------------
    // Group 3: Overview Analytics Metric Verification
    // ------------------------------------------------------------------------
    console.log("\n--- Group 3: Overview Metrics Calculation ---");
    const overview = await getAdminOverviewAnalytics({ testId: testA.id });

    assert(overview.metrics.totalAttempts >= 2, "Total attempts counted accurately (>=2)");
    assert(overview.metrics.submittedAttempts >= 1, "Submitted attempts isolated accurately (>=1)");
    assert(overview.metrics.activeAttempts >= 1, "Active in-flight attempts isolated accurately (>=1)");
    assert(
      overview.metrics.completionRate > 0 && overview.metrics.completionRate <= 100,
      `Completion rate computed: ${overview.metrics.completionRate}%`
    );
    assert(overview.metrics.avgScore === 80, `Average score strictly reflects submitted attempt (80%)`);
    assert(overview.metrics.avgAccuracy === 80, `Average accuracy strictly reflects submitted attempt (80%)`);
    assert(overview.metrics.avgTimeUsedSec === 120, `Average time taken calculated strictly: ${overview.metrics.avgTimeUsedSec}s`);
    assert(overview.metrics.uniqueStudents >= 1, "Unique student participation counted correctly");

    // Negative marking aggregate verification
    assert(
      overview.negativeMarkingSummary.hasNegativeMarkingTests === true,
      "Negative marking identified on test"
    );
    assert(
      overview.negativeMarkingSummary.incorrectPenaltiesCount >= 1,
      "Incorrect penalties count tracked"
    );
    assert(
      overview.negativeMarkingSummary.totalPenaltyMarks > 0,
      `Negative marks deducted: -${overview.negativeMarkingSummary.totalPenaltyMarks}`
    );
    assert(
      overview.negativeMarkingSummary.netMarks ===
        overview.negativeMarkingSummary.totalCorrectMarks - overview.negativeMarkingSummary.totalPenaltyMarks,
      "Net marks = Total Correct Marks - Total Penalties"
    );

    // ------------------------------------------------------------------------
    // Group 4: Distribution & Histograms
    // ------------------------------------------------------------------------
    console.log("\n--- Group 4: Distributions & Trend Lines ---");
    const totalScoreBinned = overview.scoreDistribution.reduce((sum, b) => sum + b.count, 0);
    assert(
      totalScoreBinned === overview.metrics.submittedAttempts,
      `Score distribution bins sum up exactly to submitted attempts (${totalScoreBinned} == ${overview.metrics.submittedAttempts})`
    );

    const totalAccBinned = overview.accuracyDistribution.reduce((sum, b) => sum + b.count, 0);
    assert(
      totalAccBinned === overview.metrics.submittedAttempts,
      `Accuracy distribution bins sum up exactly to submitted attempts (${totalAccBinned} == ${overview.metrics.submittedAttempts})`
    );

    assert(
      overview.scoreDistribution.find((b) => b.bin === "61–80")?.count === 1,
      "Attempt with score 80 correctly placed in 61–80 cohort"
    );

    assert(
      overview.performanceTrend.length >= 1,
      "Performance trend populated with at least 1 date point"
    );
    assert(
      overview.isLimitedHistory === (overview.performanceTrend.length <= 1),
      "isLimitedHistory flag correctly set when data points <= 1"
    );

    // ------------------------------------------------------------------------
    // Group 5: Granular Breakdown (Subject, Topic, Difficulty)
    // ------------------------------------------------------------------------
    console.log("\n--- Group 5: Granular Taxonomy Breakdowns ---");
    assert(overview.subjectPerformance.length > 0, "Subject performance array returned");
    const subj0 = overview.subjectPerformance[0];
    assert(typeof subj0.subjectName === "string", "Subject name populated");
    assert(typeof subj0.accuracy === "number" && subj0.accuracy >= 0 && subj0.accuracy <= 100, "Subject accuracy bounded in [0, 100]");

    assert(overview.topicPerformance.length > 0, "Topic performance array returned");
    const topic0 = overview.topicPerformance[0];
    assert(typeof topic0.topicName === "string", "Topic name populated");
    assert(typeof topic0.accuracy === "number", "Topic accuracy computed");

    assert(overview.difficultyPerformance.length === 3, "Difficulty performance contains 3 cohorts (easy, medium, hard)");
    const easyDiff = overview.difficultyPerformance.find((d) => d.difficulty === "easy");
    assert(easyDiff !== undefined, "Easy cohort present in difficulty breakdown");

    // ------------------------------------------------------------------------
    // Group 6: Test Performance Directory & Sorting
    // ------------------------------------------------------------------------
    console.log("\n--- Group 6: Assessment Directory & Comparative Metrics ---");
    const testListRes = await getAdminTestPerformanceList({ limit: 10 });
    assert(testListRes.tests.length > 0, "Test performance list returned records");
    assert(testListRes.pagination.total >= 1, "Pagination total count computed");

    const foundTestA = testListRes.tests.find((t) => t.id === testA.id);
    assert(foundTestA !== undefined, "Test A present in test performance list");
    assert(foundTestA?.effectiveStatus === "active", "Test A has effective status 'active'");
    assert(foundTestA?.submittedAttempts === 1, "Test A reports 1 submitted attempt");
    assert(foundTestA?.activeAttempts === 1, "Test A reports 1 active attempt");

    // ------------------------------------------------------------------------
    // Group 7: Test Deep Dive & Section / Pool Telemetry
    // ------------------------------------------------------------------------
    console.log("\n--- Group 7: Test Detail Telemetry ---");
    const detail = await getAdminTestDetailAnalytics(testA.id);
    assert(detail !== null, "Test detail analytics retrieved successfully");
    assert(detail?.test.id === testA.id, "Test detail matches requested test ID");
    assert(Boolean(detail && detail.sectionPerformance.length >= 1), "Section performance populated");
    assert(
      detail?.sectionPerformance[0]?.sectionTitle === "Section Alpha",
      "Section title resolved accurately"
    );
    assert(Boolean(detail && detail.poolPerformance.length >= 1), "Question pool performance populated");
    assert(
      detail?.poolPerformance[0]?.title === "Dynamic Problem Pool",
      "Pool title resolved accurately"
    );
    assert(
      Boolean(detail && detail.poolPerformance[0] && detail.poolPerformance[0].attemptsExposure >= 1),
      "Question pool exposure counted accurately"
    );

    // ------------------------------------------------------------------------
    // Group 8: Question Item Analysis & Quality Signals
    // ------------------------------------------------------------------------
    console.log("\n--- Group 8: Question Analysis & Quality Signals ---");
    const questionAnalytics = await getAdminQuestionAnalytics({ testId: testA.id });
    assert(questionAnalytics.questions.length > 0, "Question analytics items returned");

    const q0 = questionAnalytics.questions.find((q) => q.questionId === repoQuestions[0].id);
    assert(q0 !== undefined, "Served question present in analytics");
    assert(q0?.correctCount === 1, "Q0 correct count is 1");
    assert(q0?.accuracy === 100, "Q0 accuracy is 100%");
    assert(
      Boolean(q0?.qualitySignals.includes("Low sample size")),
      "Q0 with <5 attempts flagged with 'Low sample size'"
    );

    const q1 = questionAnalytics.questions.find((q) => q.questionId === repoQuestions[1].id);
    assert(q1?.incorrectCount === 1, "Q1 incorrect count is 1");
    assert(q1?.accuracy === 0, "Q1 accuracy is 0%");

    // ------------------------------------------------------------------------
    // Group 9: Operational Active In-Flight Attempts
    // ------------------------------------------------------------------------
    console.log("\n--- Group 9: Active In-Flight Operational Telemetry ---");
    const activeList = await getAdminActiveAttempts(20);
    assert(activeList.length >= 1, "Active attempts query returned live sessions");
    const activeAudit = activeList.find((a) => a.attemptId === attempt2.id);
    assert(activeAudit !== undefined, "In-flight attempt 2 located in active telemetry");
    assert(Boolean(activeAudit?.studentEmail.includes("audit_admin_analytics")), "Student email returned");
    assert(activeAudit?.studentName === "Analytics Audit Student", "Student name resolved from profile");
    assert(activeAudit?.testTitle === testA.title, "Test title resolved accurately");
    assert(activeAudit?.currentQuestion === 2, "Current question progress calculated (1 answer logged + 1)");
    assert(
      (activeAudit as any).passwordHash === undefined,
      "Privacy safe: zero password hashes exposed"
    );

    // ------------------------------------------------------------------------
    // Group 10: Test Side-by-Side Comparison
    // ------------------------------------------------------------------------
    console.log("\n--- Group 10: Test Side-by-Side Comparison ---");
    // Create Test B
    const [testB] = await db
      .insert(tests)
      .values({
        title: `Telemetry Beta Assessment ${Date.now()}`,
        duration: 45,
        type: "mixed",
        totalMarks: 20,
        status: "published",
        isPublished: true,
      })
      .returning();
    createdTestIds.push(testB.id);

    const comparison = await compareAdminTests(testA.id, testB.id);
    assert(comparison !== null, "Test comparison executed successfully");
    assert(comparison?.testA.id === testA.id, "Comparison Test A matches");
    assert(comparison?.testB.id === testB.id, "Comparison Test B matches");
    assert(comparison?.testA.submittedAttempts === 1, "Test A has 1 submission in comparison");
    assert(comparison?.testB.submittedAttempts === 0, "Test B has 0 submissions in comparison");

    // ------------------------------------------------------------------------
    // Group 11: Date Boundaries & Filter Sanitization
    // ------------------------------------------------------------------------
    console.log("\n--- Group 11: Date Boundaries & Filtering ---");
    const d7 = resolveDateBoundaries({ dateRange: "7d" });
    assert(d7.fromDate !== undefined, "7d preset resolves valid fromDate");

    const dCustom = resolveDateBoundaries({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
    assert(
      dCustom.fromDate?.toISOString().startsWith("2026-01-01") === true,
      "Custom date start resolved"
    );
    assert(
      dCustom.toDate?.toISOString().startsWith("2026-01-31") === true,
      "Custom date end resolved"
    );

    // ------------------------------------------------------------------------
    // Group 12: Zero Regression on Student Analytics & Readiness
    // ------------------------------------------------------------------------
    console.log("\n--- Group 12: Student Analytics & Readiness Zero Regression ---");
    const readiness = await calculateReadiness(testStudent.id);
    assert(readiness !== undefined, "Student calculateReadiness runs cleanly");
    assert(readiness.hasCompletedBaseline === false, "Student without baseline reports hasCompletedBaseline: false");
    assert(readiness.readinessScore === null, "Readiness score is null for uncalibrated user");
    assert(Array.isArray(readiness.subjectScores), "Subject scores array intact");

  } finally {
    // ------------------------------------------------------------------------
    // Cleanup Audit Fixtures
    // ------------------------------------------------------------------------
    console.log("\n--- Cleanup Telemetry Audit Fixtures ---");
    try {
      if (createdAttemptIds.length > 0) {
        await db.delete(answers).where(inArray(answers.attemptId, createdAttemptIds));
        await db.delete(attemptQuestions).where(inArray(attemptQuestions.attemptId, createdAttemptIds));
        await db.delete(attempts).where(inArray(attempts.id, createdAttemptIds));
      }
      if (createdTestIds.length > 0) {
        await db.delete(questionPoolQuestions).where(sql`pool_id IN (SELECT id FROM question_pools WHERE test_id IN (${sql.raw(createdTestIds.map(id => `'${id}'`).join(','))}))`);
        await db.delete(questionPools).where(inArray(questionPools.testId, createdTestIds));
        await db.delete(testSections).where(inArray(testSections.testId, createdTestIds));
        await db.delete(tests).where(inArray(tests.id, createdTestIds));
      }
      if (createdUserIds.length > 0) {
        await db.delete(profiles).where(inArray(profiles.userId, createdUserIds));
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
      console.log("  ✓ Cleanup complete.");
    } catch (cleanErr) {
      console.error("  Warning during cleanup:", cleanErr);
    }
  }

  console.log("\n==================================================");
  console.log(`PHASE 9 AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase9Audit().catch((err) => {
  console.error("Phase 9 Audit crashed:", err);
  process.exit(1);
});
