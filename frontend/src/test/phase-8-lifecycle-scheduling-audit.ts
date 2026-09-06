import { db } from "@/db";
import {
  users,
  tests,
  testSections,
  testQuestions,
  attempts,
  questions,
  subjects,
  topics,
  questionPools,
  questionPoolQuestions,
} from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  startOrResumeAttempt,
  getTestDetails,
  getPublishedTests,
  duplicateTest,
  getAttemptExamState,
} from "@/server/tests";
import {
  getEffectiveTestStatus,
  isTestAvailableForNewAttempts,
  validateLifecycleTransition,
  validateSchedule,
  type TestStatus,
} from "@/lib/lifecycle";
import { gradeAttempt } from "@/server/grading";
import { calculateReadiness } from "@/server/readiness";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

async function runPhase8LifecycleSchedulingAudit() {
  console.log("==================================================");
  console.log("🔒 NEXORA — PHASE 8: TEST LIFECYCLE & SCHEDULING AUDIT");
  console.log("==================================================\n");

  const cleanupUserIds: string[] = [];
  const cleanupTestIds: string[] = [];
  const cleanupQuestionIds: string[] = [];
  const cleanupPoolIds: string[] = [];
  const cleanupTopicIds: string[] = [];
  const cleanupSubjectIds: string[] = [];

  try {
    // ----------------------------------------------------
    // SETUP: Test Users
    // ----------------------------------------------------
    const passwordHash = await bcrypt.hash("TestPass123!", 10);
    const [studentA] = await db
      .insert(users)
      .values({
        email: `student8a-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    const [studentB] = await db
      .insert(users)
      .values({
        email: `student8b-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    const [adminUser] = await db
      .insert(users)
      .values({
        email: `admin8-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: true,
      })
      .returning();

    cleanupUserIds.push(studentA.id, studentB.id, adminUser.id);

    const existing = await db
      .select({ subjectId: questions.subjectId, topicId: questions.topicId })
      .from(questions)
      .limit(1);
    const subjectId = existing[0].subjectId;
    const topicId = existing[0].topicId;

    // Questions
    const createdQuestions = [];
    for (let i = 1; i <= 4; i++) {
      const [q] = await db
        .insert(questions)
        .values({
          subjectId,
          topicId,
          question: `P8 Lifecycle Question ${i}: State transition?`,
          questionType: "single_choice",
          options: ["Draft", "Published", "Closed", "Archived"],
          correctAnswer: "Published",
          marks: 4,
          difficulty: "medium",
        })
        .returning();
      createdQuestions.push(q);
      cleanupQuestionIds.push(q.id);
    }
    const [q1, q2, q3, q4] = createdQuestions;

    // Helper: Make test
    async function createTestFixture(opts: {
      title: string;
      status?: TestStatus;
      scheduledStartAt?: Date | null;
      scheduledEndAt?: Date | null;
      scheduleTimezone?: string | null;
      attemptLimit?: number | null;
      negativeMarkingEnabled?: boolean;
      negativeMarkRate?: number;
      type?: "aptitude" | "cs_fundamentals" | "mixed" | "baseline";
    }) {
      const [test] = await db
        .insert(tests)
        .values({
          title: opts.title,
          description: "Phase 8 lifecycle test fixture",
          duration: 3600,
          totalMarks: 8,
          status: opts.status ?? "published",
          isPublished: (opts.status ?? "published") === "published",
          scheduledStartAt: opts.scheduledStartAt ?? null,
          scheduledEndAt: opts.scheduledEndAt ?? null,
          scheduleTimezone: opts.scheduleTimezone ?? null,
          attemptLimit: opts.attemptLimit ?? null,
          negativeMarkingEnabled: opts.negativeMarkingEnabled ?? false,
          negativeMarkRate: String(opts.negativeMarkRate ?? 0),
          type: opts.type ?? "mixed",
        })
        .returning();

      cleanupTestIds.push(test.id);

      const [sec] = await db
        .insert(testSections)
        .values({
          testId: test.id,
          title: "Section A",
          sectionOrder: 1,
        })
        .returning();

      await db.insert(testQuestions).values([
        { testId: test.id, sectionId: sec.id, questionId: q1.id, questionOrder: 1 },
        { testId: test.id, sectionId: sec.id, questionId: q2.id, questionOrder: 2 },
      ]);

      return test;
    }

    // ====================================================
    // GROUP 1: UNIT / EFFECTIVE STATUS RESOLUTION LOGIC
    // ====================================================
    console.log("--- Group 1: Effective Status Logic ---");

    const tDraft = { status: "draft" as const, scheduledStartAt: null, scheduledEndAt: null };
    assert(getEffectiveTestStatus(tDraft) === "draft", "status=draft resolves to effective 'draft'");
    assert(isTestAvailableForNewAttempts(tDraft) === false, "status=draft cannot receive new attempts");

    const tArchived = { status: "archived" as const, scheduledStartAt: null, scheduledEndAt: null };
    assert(getEffectiveTestStatus(tArchived) === "archived", "status=archived resolves to effective 'archived'");
    assert(isTestAvailableForNewAttempts(tArchived) === false, "status=archived cannot receive new attempts");

    const tClosed = { status: "closed" as const, scheduledStartAt: null, scheduledEndAt: null };
    assert(getEffectiveTestStatus(tClosed) === "closed", "status=closed resolves to effective 'closed'");
    assert(isTestAvailableForNewAttempts(tClosed) === false, "status=closed cannot receive new attempts");

    const tEvergreen = { status: "published" as const, scheduledStartAt: null, scheduledEndAt: null };
    assert(getEffectiveTestStatus(tEvergreen) === "active", "status=published without schedule resolves to effective 'active'");
    assert(isTestAvailableForNewAttempts(tEvergreen) === true, "status=published without schedule is available for new attempts");

    // Scheduled: future start
    const futureStart = new Date(Date.now() + 3600000);
    const futureEnd = new Date(Date.now() + 7200000);
    const tFuture = { status: "published" as const, scheduledStartAt: futureStart, scheduledEndAt: futureEnd };
    assert(getEffectiveTestStatus(tFuture) === "scheduled", "status=published with future start resolves to 'scheduled'");
    assert(isTestAvailableForNewAttempts(tFuture) === false, "scheduled test cannot receive new attempts before start");

    // Half-Open Window Tests [startAt, endAt)
    const exactStart = new Date("2026-09-06T12:00:00.000Z");
    const exactEnd = new Date("2026-09-06T14:00:00.000Z");
    const windowTest = { status: "published" as const, scheduledStartAt: exactStart, scheduledEndAt: exactEnd };

    // Before start: 11:59:59.999Z -> scheduled
    assert(
      getEffectiveTestStatus(windowTest, new Date("2026-09-06T11:59:59.999Z")) === "scheduled",
      "Half-open: 1ms before start resolves to 'scheduled'"
    );

    // Exact start: 12:00:00.000Z -> active
    assert(
      getEffectiveTestStatus(windowTest, new Date("2026-09-06T12:00:00.000Z")) === "active",
      "Half-open: Exact start (inclusive) resolves to 'active'"
    );

    // During window: 13:00:00.000Z -> active
    assert(
      getEffectiveTestStatus(windowTest, new Date("2026-09-06T13:00:00.000Z")) === "active",
      "Half-open: Middle of window resolves to 'active'"
    );

    // Just before end: 13:59:59.999Z -> active
    assert(
      getEffectiveTestStatus(windowTest, new Date("2026-09-06T13:59:59.999Z")) === "active",
      "Half-open: 1ms before end resolves to 'active'"
    );

    // Exact end: 14:00:00.000Z -> closed (exclusive)
    assert(
      getEffectiveTestStatus(windowTest, new Date("2026-09-06T14:00:00.000Z")) === "closed",
      "Half-open: Exact end (exclusive) resolves to 'closed'"
    );

    // After end: 14:00:01.000Z -> closed
    assert(
      getEffectiveTestStatus(windowTest, new Date("2026-09-06T14:00:01.000Z")) === "closed",
      "Half-open: Past end resolves to 'closed'"
    );

    // Start only (no end): past start -> active
    const openEnded = { status: "published" as const, scheduledStartAt: exactStart, scheduledEndAt: null };
    assert(
      getEffectiveTestStatus(openEnded, new Date("2026-09-06T15:00:00.000Z")) === "active",
      "Schedule with start only resolves to 'active' once start is reached"
    );

    // ====================================================
    // GROUP 2: TRANSITION & SCHEDULE VALIDATION
    // ====================================================
    console.log("\n--- Group 2: Transition & Schedule Validation ---");

    // Valid transitions
    assert(validateLifecycleTransition("draft", "published", false).ok, "Allowed: draft -> published");
    assert(validateLifecycleTransition("draft", "archived", false).ok, "Allowed: draft -> archived");
    assert(validateLifecycleTransition("published", "closed", true).ok, "Allowed: published -> closed");
    assert(validateLifecycleTransition("published", "archived", true).ok, "Allowed: published -> archived");
    assert(validateLifecycleTransition("closed", "published", true).ok, "Allowed: closed -> published (reopen)");
    assert(validateLifecycleTransition("closed", "archived", true).ok, "Allowed: closed -> archived");
    assert(validateLifecycleTransition("published", "draft", false).ok, "Allowed: published -> draft when 0 attempts");

    // Invalid transitions
    assert(!validateLifecycleTransition("published", "draft", true).ok, "Rejected: published -> draft when attempts exist");
    assert(!validateLifecycleTransition("archived", "published", false).ok, "Rejected: archived -> published (terminal)");
    assert(!validateLifecycleTransition("archived", "draft", false).ok, "Rejected: archived -> draft (terminal)");
    assert(!validateLifecycleTransition("archived", "closed", false).ok, "Rejected: archived -> closed (terminal)");
    assert(!validateLifecycleTransition("draft", "closed", false).ok, "Rejected: draft -> closed directly");

    // Schedule validation
    assert(validateSchedule(null, null).ok, "Schedule: both null is valid (evergreen)");
    assert(validateSchedule(futureStart, null).ok, "Schedule: start only is valid");
    assert(validateSchedule(futureStart, futureEnd).ok, "Schedule: end > start is valid");
    assert(!validateSchedule(null, futureEnd).ok, "Schedule: end without start is invalid");
    assert(!validateSchedule(futureEnd, futureStart).ok, "Schedule: end < start is invalid");
    assert(!validateSchedule(futureStart, futureStart).ok, "Schedule: end == start is invalid");

    // Database Check Constraint for schedule
    let dbConstraintFired = false;
    try {
      await db.insert(tests).values({
        title: "Invalid Constraint Test",
        duration: 3600,
        totalMarks: 10,
        type: "mixed",
        status: "published",
        scheduledStartAt: futureEnd,
        scheduledEndAt: futureStart, // Invalid!
      });
    } catch (err: unknown) {
      const errRecord = err as { message?: string; cause?: { message?: string; constraint?: string } } | undefined;
      const fullErr = `${errRecord?.message ?? ""} ${errRecord?.cause?.message ?? ""} ${errRecord?.cause?.constraint ?? ""}`;
      dbConstraintFired = fullErr.includes("tests_schedule_range_check") ||
        fullErr.includes("check constraint");
    }
    assert(dbConstraintFired, "Database CHECK constraint enforces scheduled_end_at > scheduled_start_at");

    // Timezone string preservation
    const tzTest = await createTestFixture({
      title: "Timezone Test Asia/Kolkata",
      status: "published",
      scheduledStartAt: futureStart,
      scheduledEndAt: futureEnd,
      scheduleTimezone: "Asia/Kolkata",
    });
    const [fetchedTz] = await db.select().from(tests).where(eq(tests.id, tzTest.id));
    assert(fetchedTz.scheduleTimezone === "Asia/Kolkata", "IANA timezone identifier preserved exactly ('Asia/Kolkata')");

    // ====================================================
    // GROUP 3: SECURITY BOUNDARY & AUTHORIZATION
    // ====================================================
    console.log("\n--- Group 3: Server Authorization & Security Gaps ---");

    const draftTest = await createTestFixture({
      title: "Draft Security Test",
      status: "draft",
    });

    // 1. Student cannot access draft test via getTestDetails
    const studentDraftView = await getTestDetails(draftTest.id, studentA.id, false);
    assert(studentDraftView === null, "Security: Student cannot view draft test details by UUID (returns null)");

    // Admin CAN access draft test
    const adminDraftView = await getTestDetails(draftTest.id, adminUser.id, true);
    assert(adminDraftView !== null && adminDraftView.id === draftTest.id, "Admin can view draft test details");

    // 2. Student cannot start draft test
    let studentDraftStartBlocked = false;
    try {
      await startOrResumeAttempt(draftTest.id, studentA.id);
    } catch (err) {
      const msg = String((err as Error).message);
      studentDraftStartBlocked = msg.includes("not available") || msg.includes("not found") || msg.includes("Test not found");
    }
    assert(studentDraftStartBlocked, "Security: Student cannot start a draft test");

    // 3. Published Evergreen test is accessible and startable
    const evergreenTest = await createTestFixture({
      title: "Evergreen Published Test",
      status: "published",
    });

    const studentEvergreenView = await getTestDetails(evergreenTest.id, studentA.id, false);
    assert(studentEvergreenView !== null, "Published evergreen test accessible to student");
    assert(studentEvergreenView?.effectiveStatus === "active", "Evergreen test effectiveStatus is 'active'");

    const startEvergreen = await startOrResumeAttempt(evergreenTest.id, studentA.id);
    assert(startEvergreen.isResumed === false, "Student successfully starts evergreen published test");

    // 4. Future Scheduled Test blocks start
    const scheduledTest = await createTestFixture({
      title: "Future Scheduled Test",
      status: "published",
      scheduledStartAt: new Date(Date.now() + 86400000), // +24 hours
      scheduledEndAt: new Date(Date.now() + 90000000),
      scheduleTimezone: "UTC",
    });

    const studentScheduledView = await getTestDetails(scheduledTest.id, studentA.id, false);
    assert(studentScheduledView !== null, "Scheduled test viewable by student for information/prep");
    assert(studentScheduledView?.effectiveStatus === "scheduled", "Scheduled test effectiveStatus is 'scheduled'");

    let scheduledStartBlocked = false;
    try {
      await startOrResumeAttempt(scheduledTest.id, studentA.id);
    } catch (err) {
      scheduledStartBlocked = String((err as Error).message).includes("not available yet");
    }
    assert(scheduledStartBlocked, "Security: Starting future scheduled test rejected with 'not available yet'");

    // 5. Expired Schedule Test blocks new attempts
    const expiredTest = await createTestFixture({
      title: "Expired Scheduled Test",
      status: "published",
      scheduledStartAt: new Date(Date.now() - 7200000), // -2 hours
      scheduledEndAt: new Date(Date.now() - 3600000),   // -1 hour
      scheduleTimezone: "UTC",
    });

    const studentExpiredView = await getTestDetails(expiredTest.id, studentA.id, false);
    assert(studentExpiredView?.effectiveStatus === "closed", "Expired scheduled test effectiveStatus is 'closed'");

    let expiredStartBlocked = false;
    try {
      await startOrResumeAttempt(expiredTest.id, studentA.id);
    } catch (err) {
      expiredStartBlocked = String((err as Error).message).includes("closed and no longer accepts new attempts");
    }
    assert(expiredStartBlocked, "Security: Starting expired scheduled test rejected with 'closed and no longer accepts new attempts'");

    // 6. Manually Closed Test blocks new attempts
    const closedTest = await createTestFixture({
      title: "Manually Closed Test",
      status: "closed",
    });

    let closedStartBlocked = false;
    try {
      await startOrResumeAttempt(closedTest.id, studentA.id);
    } catch (err) {
      closedStartBlocked = String((err as Error).message).includes("closed and no longer accepts new attempts");
    }
    assert(closedStartBlocked, "Security: Starting closed test rejected with closed message");

    // 7. Archived Test blocks new attempts
    const archivedTest = await createTestFixture({
      title: "Archived Test",
      status: "archived",
    });

    let archivedStartBlocked = false;
    try {
      await startOrResumeAttempt(archivedTest.id, studentA.id);
    } catch (err) {
      const msg = String((err as Error).message);
      archivedStartBlocked = msg.includes("archived") || msg.includes("not available") || msg.includes("no longer available");
    }
    assert(archivedStartBlocked, "Security: Starting archived test rejected");

    // ====================================================
    // GROUP 4: ACTIVE ATTEMPT IN-FLIGHT CONTINUITY
    // ====================================================
    console.log("\n--- Group 4: In-Flight Attempt Continuity ---");

    // Scenario A: Test is closed while attempt is in progress
    const closingContinuityTest = await createTestFixture({
      title: "Active Continuity Test - Closing",
      status: "published",
    });

    // Student A starts while published
    const inFlightA = await startOrResumeAttempt(closingContinuityTest.id, studentA.id);
    assert(inFlightA.isResumed === false, "Student A started attempt while test was published");

    // Admin closes the test
    await db.update(tests).set({ status: "closed" }).where(eq(tests.id, closingContinuityTest.id));

    // Student B attempts NEW attempt -> rejected!
    let studentBBlocked = false;
    try {
      await startOrResumeAttempt(closingContinuityTest.id, studentB.id);
    } catch (err) {
      studentBBlocked = String((err as Error).message).includes("closed");
    }
    assert(studentBBlocked, "New student cannot start newly closed test");

    // Student A resumes their existing in-flight attempt -> allowed!
    const studentAResume = await startOrResumeAttempt(closingContinuityTest.id, studentA.id);
    assert(studentAResume.isResumed === true, "Student A successfully resumed active attempt after test closure");
    assert(studentAResume.attemptId === inFlightA.attemptId, "Resumed attempt preserves exact attemptId");

    // Exam state intact
    const examStateA = await getAttemptExamState(studentAResume.attemptId, studentA.id);
    assert(examStateA.questions!.length === 2, "Exam questions intact upon resume after closure");

    // Scenario B: Test schedule expires while attempt is in progress
    const expiryContinuityTest = await createTestFixture({
      title: "Active Continuity Test - Schedule Expiry",
      status: "published",
      scheduledStartAt: new Date(Date.now() - 3600000), // -1h
      scheduledEndAt: new Date(Date.now() + 3600000),   // +1h
    });

    // Student B starts while inside window
    const inFlightB = await startOrResumeAttempt(expiryContinuityTest.id, studentB.id);
    assert(inFlightB.isResumed === false, "Student B started attempt inside schedule window");

    // Schedule window expires: set scheduledEndAt to past
    await db
      .update(tests)
      .set({ scheduledEndAt: new Date(Date.now() - 60000) })
      .where(eq(tests.id, expiryContinuityTest.id));

    // Student A attempts new attempt on expired test -> rejected!
    let studentANewBlocked = false;
    try {
      await startOrResumeAttempt(expiryContinuityTest.id, studentA.id);
    } catch (err) {
      studentANewBlocked = String((err as Error).message).includes("closed");
    }
    assert(studentANewBlocked, "New attempt rejected after schedule expiry");

    // Student B resumes in-flight attempt -> allowed!
    const studentBResume = await startOrResumeAttempt(expiryContinuityTest.id, studentB.id);
    assert(studentBResume.isResumed === true, "Student B successfully resumed in-flight attempt after schedule expiry");
    assert(studentBResume.attemptId === inFlightB.attemptId, "Resumed attempt preserves exact attemptId after schedule expiry");

    // ====================================================
    // GROUP 5: DUPLICATE TEST LIFECYCLE RESET
    // ====================================================
    console.log("\n--- Group 5: Duplicate Test Lifecycle Reset ---");

    const sourceTest = await createTestFixture({
      title: "Source Scheduled Closed Test",
      status: "closed",
      scheduledStartAt: new Date(Date.now() - 7200000),
      scheduledEndAt: new Date(Date.now() - 3600000),
      scheduleTimezone: "Europe/London",
      attemptLimit: 2,
      negativeMarkingEnabled: true,
      negativeMarkRate: 0.25,
    });

    const dupResult = await duplicateTest(sourceTest.id);
    assert(Boolean(dupResult.test.id), "Duplicate test succeeded");
    cleanupTestIds.push(dupResult.test.id);

    const [dupRecord] = await db.select().from(tests).where(eq(tests.id, dupResult.test.id));
    assert(dupRecord.status === "draft", "Duplicate test status reset to 'draft'");
    assert(dupRecord.isPublished === false, "Duplicate test isPublished reset to false");
    assert(dupRecord.scheduledStartAt === null, "Duplicate test scheduledStartAt cleared to null");
    assert(dupRecord.scheduledEndAt === null, "Duplicate test scheduledEndAt cleared to null");
    assert(dupRecord.scheduleTimezone === null, "Duplicate test scheduleTimezone cleared to null");

    // Verify configurations preserved
    assert(dupRecord.attemptLimit === 2, "Duplicate preserved attempt limit");
    assert(dupRecord.negativeMarkingEnabled === true, "Duplicate preserved negative marking");
    assert(Number(dupRecord.negativeMarkRate) === 0.25, "Duplicate preserved negative mark rate");

    // ====================================================
    // GROUP 6: BASELINE ASSESSMENT EVERGREEN COMPATIBILITY
    // ====================================================
    console.log("\n--- Group 6: Baseline Assessment Compatibility ---");

    const baselineTest = await createTestFixture({
      title: "P8 Baseline Assessment Test",
      type: "baseline",
      status: "published",
    });

    const baselineDetails = await getTestDetails(baselineTest.id, studentA.id, false);
    assert(baselineDetails !== null, "Baseline assessment is accessible to student");
    assert(baselineDetails?.effectiveStatus === "active", "Baseline assessment has effectiveStatus 'active'");

    const baselineAttempt = await startOrResumeAttempt(baselineTest.id, studentB.id);
    assert(baselineAttempt.attemptId.length > 0, "Student B can start baseline assessment");

    // ====================================================
    // GROUP 7: RESULTS & ANALYTICS SURVIVE TEST ARCHIVE
    // ====================================================
    console.log("\n--- Group 7: Results & Analytics Survive Lifecycle Changes ---");

    // Student A submits attempt on closingContinuityTest
    await gradeAttempt(inFlightA.attemptId, studentA.id);

    // Now archive closingContinuityTest
    await db.update(tests).set({ status: "archived" }).where(eq(tests.id, closingContinuityTest.id));

    // Historical details should still load for student who completed attempt
    const studentHistoryView = await getTestDetails(closingContinuityTest.id, studentA.id, false);
    assert(studentHistoryView !== null, "Student can still view details/results of an archived test they attempted");
    assert(studentHistoryView?.effectiveStatus === "archived", "Archived test has effectiveStatus 'archived'");
    assert(studentHistoryView?.attempts.length === 1, "Historical attempt preserved under archived test");
    assert(studentHistoryView?.attempts[0].status === "submitted", "Historical attempt status intact as 'submitted'");

    // Calculate readiness for Student A
    const readiness = await calculateReadiness(studentA.id);
    assert(readiness !== null, "calculateReadiness runs cleanly with archived/closed tests");
    assert(Array.isArray(readiness.subjectScores), "Readiness subject scores array returned cleanly");

    // ====================================================
    // GROUP 8: PHASE 7 INTEGRATION & POOL SAMPLING
    // ====================================================
    console.log("\n--- Group 8: Phase 7 Feature Interaction with Lifecycle ---");

    // Create a pool test
    const [poolTest] = await db
      .insert(tests)
      .values({
        title: "P8 Pool Scheduled Test",
        duration: 3600,
        totalMarks: 4,
        status: "published",
        scheduledStartAt: new Date(Date.now() + 3600000), // Scheduled in future
        type: "mixed",
      })
      .returning();
    cleanupTestIds.push(poolTest.id);

    const [poolSec] = await db
      .insert(testSections)
      .values({
        testId: poolTest.id,
        title: "Pool Section",
        sectionOrder: 1,
      })
      .returning();

    const [p8Pool] = await db
      .insert(questionPools)
      .values({
        testId: poolTest.id,
        sectionId: poolSec.id,
        title: "Lifecycle Pool",
        selectionCount: 1,
        poolOrder: 1,
      })
      .returning();
    cleanupPoolIds.push(p8Pool.id);

    await db.insert(questionPoolQuestions).values([
      { poolId: p8Pool.id, questionId: q3.id, questionOrder: 1 },
      { poolId: p8Pool.id, questionId: q4.id, questionOrder: 2 },
    ]);

    // Viewing future scheduled test: must NOT create attempts or select pool questions
    const poolScheduledDetails = await getTestDetails(poolTest.id, studentA.id, false);
    assert(poolScheduledDetails?.effectiveStatus === "scheduled", "Pool test is in 'scheduled' state");

    const attemptsCountBefore = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(attempts)
      .where(eq(attempts.testId, poolTest.id));
    assert(attemptsCountBefore[0].count === 0, "Viewing scheduled pool test created 0 attempts");

    // Attempting to start future test blocked: zero attempts created
    try {
      await startOrResumeAttempt(poolTest.id, studentA.id);
    } catch {
      // Expected
    }
    const attemptsCountAfterFail = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(attempts)
      .where(eq(attempts.testId, poolTest.id));
    assert(attemptsCountAfterFail[0].count === 0, "Failed start on scheduled pool test created 0 attempts");

    // Now open the test (clear schedule)
    await db
      .update(tests)
      .set({ scheduledStartAt: null, scheduledEndAt: null })
      .where(eq(tests.id, poolTest.id));

    // Start test now: selects pool question exactly once
    const poolStarted = await startOrResumeAttempt(poolTest.id, studentA.id);
    assert(poolStarted.isResumed === false, "Successfully started pool test once active");

    const examStatePool1 = await getAttemptExamState(poolStarted.attemptId, studentA.id);
    assert(examStatePool1.questions!.length === 1, "Pool selection chose exactly 1 question");
    const chosenQId = examStatePool1.questions![0].id;

    // Resume attempt: does NOT reselect pool question
    const poolResumed = await startOrResumeAttempt(poolTest.id, studentA.id);
    assert(poolResumed.isResumed === true, "Resumed pool attempt");
    const examStatePool2 = await getAttemptExamState(poolStarted.attemptId, studentA.id);
    assert(examStatePool2.questions!.length === 1, "Resumed attempt still has 1 question");
    assert(examStatePool2.questions![0].id === chosenQId, "Resumed attempt preserves exact pool-selected question");

    // Check attempt snapshot immutability: closing test does not alter snapshots
    await db.update(tests).set({ status: "closed" }).where(eq(tests.id, poolTest.id));
    const examStatePool3 = await getAttemptExamState(poolStarted.attemptId, studentA.id);
    assert(examStatePool3.questions![0].id === chosenQId, "Closing test did not alter attempt question snapshots");

    // ====================================================
    // GROUP 9: STUDENT CATALOG FILTERING
    // ====================================================
    console.log("\n--- Group 9: Student Catalog Filtering ---");

    const publishedTests = await getPublishedTests(studentA.id);
    const catalogTestIds = publishedTests.map((t) => t.id);

    assert(!catalogTestIds.includes(draftTest.id), "Draft test excluded from student catalog");
    assert(catalogTestIds.includes(evergreenTest.id), "Evergreen test included in student catalog");
    assert(catalogTestIds.includes(scheduledTest.id), "Scheduled test included in student catalog with effectiveStatus 'scheduled'");

    const scheduledCatalogItem = publishedTests.find((t) => t.id === scheduledTest.id);
    assert(scheduledCatalogItem?.effectiveStatus === "scheduled", "Catalog correctly marks upcoming test as 'scheduled'");

    // ====================================================
    // GROUP 10: ACTION AUTHORIZATION & DIRECT CALL GUARDS
    // ====================================================
    console.log("\n--- Group 10: Action Authorization Guards ---");

    let actionAnonBlocked = false;
    try {
      const { updateTestLifecycleAction } = await import("@/server/actions");
      await updateTestLifecycleAction(evergreenTest.id, { status: "closed" });
    } catch (err) {
      actionAnonBlocked = String((err as Error).message).includes("Unauthorized") ||
        String((err as Error).message).includes("invariant") ||
        String((err as Error).message).includes("headers");
    }
    assert(actionAnonBlocked, "Unauthorized / anonymous mutation of lifecycle via action rejected");

  } catch (error) {
    console.error("Audit encountered fatal unexpected error:", error);
    failed++;
  } finally {
    console.log("\n--- CLEANUP ---");
    for (const tId of cleanupTestIds) {
      await db.delete(tests).where(eq(tests.id, tId)).catch(() => {});
    }
    for (const pId of cleanupPoolIds) {
      await db.delete(questionPools).where(eq(questionPools.id, pId)).catch(() => {});
    }
    for (const qId of cleanupQuestionIds) {
      await db.delete(questions).where(eq(questions.id, qId)).catch(() => {});
    }
    for (const tId of cleanupTopicIds) {
      await db.delete(topics).where(eq(topics.id, tId)).catch(() => {});
    }
    for (const sId of cleanupSubjectIds) {
      await db.delete(subjects).where(eq(subjects.id, sId)).catch(() => {});
    }
    for (const uId of cleanupUserIds) {
      await db.delete(users).where(eq(users.id, uId)).catch(() => {});
    }
    console.log("Cleanup completed.");
  }

  console.log("\n==================================================");
  console.log(`PHASE 8 AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase8LifecycleSchedulingAudit().catch((err) => {
  console.error("Fatal test failure:", err);
  process.exit(1);
});
