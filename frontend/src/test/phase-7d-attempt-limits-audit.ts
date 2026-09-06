import { db } from "@/db";
import {
  users,
  tests,
  testSections,
  testQuestions,
  attempts,
  questions,
  subjects,
} from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  startOrResumeAttempt,
  getAttemptExamState,
  duplicateTest,
} from "@/server/tests";
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

async function runPhase7DAttemptLimitsAudit() {
  console.log("==================================================");
  console.log("🔒 NEXORA — PHASE 7D: ATTEMPT LIMITS AUDIT");
  console.log("==================================================\n");

  const cleanupUserIds: string[] = [];
  const cleanupTestIds: string[] = [];
  const cleanupQuestionIds: string[] = [];
  const cleanupSubjectIds: string[] = [];

  try {
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const [studentA] = await db
      .insert(users)
      .values({
        email: `student7dA-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    const [studentB] = await db
      .insert(users)
      .values({
        email: `student7dB-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    cleanupUserIds.push(studentA.id, studentB.id);

    const existing = await db
      .select({ subjectId: questions.subjectId, topicId: questions.topicId })
      .from(questions)
      .limit(1);
    const subjectId = existing[0].subjectId;
    const topicId = existing[0].topicId;

    const createdQuestions = [];
    for (let i = 1; i <= 2; i++) {
      const [q] = await db
        .insert(questions)
        .values({
          subjectId,
          topicId,
          question: `7D Q${i}: Which protocol is connection-oriented?`,
          questionType: "single_choice",
          options: ["UDP", "TCP", "HTTP", "DNS"],
          correctAnswer: "TCP",
          marks: 4,
          difficulty: "easy",
        })
        .returning();
      createdQuestions.push(q);
      cleanupQuestionIds.push(q.id);
    }
    const [q1, q2] = createdQuestions;

    async function makeTest(opts: {
      title: string;
      attemptLimit?: number | null;
      randomizeQuestions?: boolean;
      randomizeOptions?: boolean;
      isPublished?: boolean;
      duration?: number;
    }) {
      const [test] = await db
        .insert(tests)
        .values({
          title: opts.title,
          description: null,
          duration: opts.duration ?? 30,
          type: "mixed",
          difficulty: "easy",
          totalMarks: 8,
          randomizeQuestions: opts.randomizeQuestions ?? false,
          randomizeOptions: opts.randomizeOptions ?? false,
          attemptLimit: opts.attemptLimit === undefined ? null : opts.attemptLimit,
          isPublished: opts.isPublished ?? true,
        })
        .returning();
      cleanupTestIds.push(test.id);
      const [sec] = await db
        .insert(testSections)
        .values({ testId: test.id, title: "Section 1", sectionOrder: 1 })
        .returning();
      await db.insert(testQuestions).values([
        { testId: test.id, sectionId: sec.id, questionId: q1.id, questionOrder: 1 },
        { testId: test.id, sectionId: sec.id, questionId: q2.id, questionOrder: 2 },
      ]);
      return test;
    }

    async function submittedCount(testId: string, userId: string) {
      const res = await db
        .select({ n: sql<number>`count(*)` })
        .from(attempts)
        .where(
          and(
            eq(attempts.testId, testId),
            eq(attempts.userId, userId),
            eq(attempts.status, "submitted")
          )
        );
      return Number(res[0]?.n ?? 0);
    }

    async function inProgressCount(testId: string, userId: string) {
      const res = await db
        .select({ n: sql<number>`count(*)` })
        .from(attempts)
        .where(
          and(
            eq(attempts.testId, testId),
            eq(attempts.userId, userId),
            eq(attempts.status, "in_progress")
          )
        );
      return Number(res[0]?.n ?? 0);
    }

    // ----------------------------------------------------
    // TEST SUITE 1: SCHEMA / DEFAULTS / CHECK CONSTRAINT
    // ----------------------------------------------------
    console.log("--- TEST SUITE 1: SCHEMA, DEFAULTS & CHECK CONSTRAINT ---");
    const defaultTest = await makeTest({ title: `7D Default ${Date.now()}` });
    assert(
      defaultTest.attemptLimit === null,
      "tests.attempt_limit defaults to NULL (unlimited)"
    );

    let zeroRejected = false;
    try {
      await db.insert(tests).values({
        title: `Bad Zero ${Date.now()}`,
        duration: 30,
        type: "mixed",
        totalMarks: 8,
        attemptLimit: 0,
      });
    } catch {
      zeroRejected = true;
    }
    assert(zeroRejected, "DB CHECK rejects attempt_limit = 0");

    let negativeRejected = false;
    try {
      await db.insert(tests).values({
        title: `Bad Neg ${Date.now()}`,
        duration: 30,
        type: "mixed",
        totalMarks: 8,
        attemptLimit: -5,
      });
    } catch {
      negativeRejected = true;
    }
    assert(negativeRejected, "DB CHECK rejects negative attempt_limit");

    // ----------------------------------------------------
    // TEST SUITE 2: NULL = UNLIMITED
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 2: NULL = UNLIMITED (backward compatible) ---");
    for (let i = 0; i < 3; i++) {
      const start = await startOrResumeAttempt(defaultTest.id, studentA.id);
      assert(start.isResumed === false, `Unlimited test: attempt #${i + 1} created`);
      await gradeAttempt(start.attemptId, studentA.id);
    }
    assert(
      (await submittedCount(defaultTest.id, studentA.id)) === 3,
      "Unlimited test allows 3 sequential submitted attempts"
    );

    // ----------------------------------------------------
    // TEST SUITE 3: LIMIT = 1
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 3: LIMIT = 1 ---");
    const testL1 = await makeTest({ title: `7D L1 ${Date.now()}`, attemptLimit: 1 });
    const l1Start = await startOrResumeAttempt(testL1.id, studentA.id);
    assert(l1Start.isResumed === false, "Limit 1: first attempt created");
    assert(l1Start.attemptLimit === 1, "start response reports attemptLimit = 1");
    assert(l1Start.attemptsUsed === 0, "start response reports attemptsUsed = 0");
    assert(l1Start.attemptsRemaining === 1, "start response reports attemptsRemaining = 1");
    await gradeAttempt(l1Start.attemptId, studentA.id);

    let l1Denied = false;
    try {
      await startOrResumeAttempt(testL1.id, studentA.id);
    } catch (err) {
      l1Denied = String((err as Error).message).includes("Attempt limit reached");
    }
    assert(l1Denied, "Limit 1: second start after submission is denied");
    assert(
      (await submittedCount(testL1.id, studentA.id)) === 1,
      "Limit 1: only one submitted attempt exists after denial"
    );
    assert(
      (await inProgressCount(testL1.id, studentA.id)) === 0,
      "Limit 1: denial inserted NO new attempt row"
    );

    // ----------------------------------------------------
    // TEST SUITE 4: LIMIT = 2 AND LIMIT = 3
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 4: LIMIT = 2 AND LIMIT = 3 ---");
    const testL2 = await makeTest({ title: `7D L2 ${Date.now()}`, attemptLimit: 2 });
    for (let i = 1; i <= 2; i++) {
      const s = await startOrResumeAttempt(testL2.id, studentA.id);
      assert(s.isResumed === false, `Limit 2: attempt #${i} created`);
      await gradeAttempt(s.attemptId, studentA.id);
    }
    let l2Denied = false;
    try {
      await startOrResumeAttempt(testL2.id, studentA.id);
    } catch (err) {
      l2Denied = String((err as Error).message).includes("Attempt limit reached");
    }
    assert(l2Denied, "Limit 2: third start after 2 submissions denied");

    const testL3 = await makeTest({ title: `7D L3 ${Date.now()}`, attemptLimit: 3 });
    for (let i = 1; i <= 3; i++) {
      const s = await startOrResumeAttempt(testL3.id, studentA.id);
      assert(s.isResumed === false, `Limit 3: attempt #${i} created`);
      await gradeAttempt(s.attemptId, studentA.id);
    }
    let l3Denied = false;
    try {
      await startOrResumeAttempt(testL3.id, studentA.id);
    } catch (err) {
      l3Denied = String((err as Error).message).includes("Attempt limit reached");
    }
    assert(l3Denied, "Limit 3: fourth start after 3 submissions denied");

    // ----------------------------------------------------
    // TEST SUITE 5: ACTIVE ATTEMPT RESUME EXEMPTION
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 5: ACTIVE ATTEMPT RESUME EXEMPTION ---");
    const testResume = await makeTest({ title: `7D Resume ${Date.now()}`, attemptLimit: 1 });
    const r1 = await startOrResumeAttempt(testResume.id, studentA.id);
    const r2 = await startOrResumeAttempt(testResume.id, studentA.id);
    assert(r2.isResumed === true, "Limit 1 with active attempt: START resumes (not denied)");
    assert(r2.attemptId === r1.attemptId, "Resume returns the same attemptId");
    assert(
      (await inProgressCount(testResume.id, studentA.id)) === 1,
      "Exactly one active attempt row remains after resume"
    );
    assert(r2.attemptLimit === 1, "Resume response reports attemptLimit");
    assert(r2.attemptsUsed === 0, "Resume response reports attemptsUsed = 0");

    // ----------------------------------------------------
    // TEST SUITE 6: EXPIRY CONSUMES AN ATTEMPT
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 6: EXPIRY AUTO-SUBMIT CONSUMES AN ATTEMPT ---");
    const testExpire = await makeTest({ title: `7D Expire ${Date.now()}`, attemptLimit: 1 });
    const expStart = await startOrResumeAttempt(testExpire.id, studentA.id);
    // Age the attempt beyond the 30-minute duration
    await db
      .update(attempts)
      .set({ startedAt: new Date(Date.now() - 40 * 60 * 1000) })
      .where(eq(attempts.id, expStart.attemptId));
    let expDenied = false;
    try {
      await startOrResumeAttempt(testExpire.id, studentA.id);
    } catch (err) {
      expDenied = String((err as Error).message).includes("Attempt limit reached");
    }
    const expRow = (await db.select().from(attempts).where(eq(attempts.id, expStart.attemptId)))[0];
    assert(expRow.status === "submitted", "Expired attempt auto-submitted");
    assert(expDenied, "Expired (now submitted) attempt consumed the single allowance -> denied");
    assert(
      (await submittedCount(testExpire.id, studentA.id)) === 1,
      "Expiry produced exactly one submitted attempt"
    );

    // ----------------------------------------------------
    // TEST SUITE 7: REFRESH (exam state stability)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 7: REFRESH ---");
    const stateA = await getAttemptExamState(r1.attemptId, studentA.id);
    const stateB = await getAttemptExamState(r1.attemptId, studentA.id);
    assert(!stateA.isExpired && !stateB.isExpired, "Active exam state is not expired");
    if (!stateA.isExpired && !stateB.isExpired) {
      assert(
        JSON.stringify(stateA.questions) === JSON.stringify(stateB.questions),
        "Refresh returns identical exam state"
      );
    }

    // ----------------------------------------------------
    // TEST SUITE 8: MULTIPLE TABS (concurrent resume)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 8: MULTIPLE TABS / CONCURRENT RESUME ---");
    const [tab1, tab2] = await Promise.all([
      startOrResumeAttempt(testResume.id, studentA.id),
      startOrResumeAttempt(testResume.id, studentA.id),
    ]);
    assert(
      tab1.attemptId === tab2.attemptId && tab1.attemptId === r1.attemptId,
      "Two tabs converge on the same active attempt"
    );
    assert(
      (await inProgressCount(testResume.id, studentA.id)) === 1,
      "Multiple tabs never create a second active attempt"
    );

    // ----------------------------------------------------
    // TEST SUITE 9: CONCURRENT START RACE (limit = 1)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 9: CONCURRENT START RACE (limit = 1) ---");
    const raceTest = await makeTest({ title: `7D Race ${Date.now()}`, attemptLimit: 1 });
    const [race1, race2] = await Promise.all([
      startOrResumeAttempt(raceTest.id, studentA.id),
      startOrResumeAttempt(raceTest.id, studentA.id),
    ]);
    assert(
      race1.attemptId === race2.attemptId,
      "Two concurrent starts converge on a single attempt"
    );
    assert(
      (await inProgressCount(raceTest.id, studentA.id)) === 1,
      "Concurrent start race: exactly ONE active attempt created"
    );
    assert(
      (await submittedCount(raceTest.id, studentA.id)) === 0,
      "Concurrent start race: zero submitted attempts"
    );
    const allRaceRows = await db
      .select()
      .from(attempts)
      .where(and(eq(attempts.testId, raceTest.id), eq(attempts.userId, studentA.id)));
    assert(allRaceRows.length === 1, "Concurrent start race: exactly one attempt row total");

    // Race #2: after the first attempt is submitted, two concurrent starts must create zero attempts
    await gradeAttempt(race1.attemptId, studentA.id);
    const settled = await Promise.allSettled([
      startOrResumeAttempt(raceTest.id, studentA.id),
      startOrResumeAttempt(raceTest.id, studentA.id),
    ]);
    assert(
      settled.every((r) => r.status === "rejected"),
      "After limit consumed: both concurrent starts are denied"
    );
    assert(
      (await inProgressCount(raceTest.id, studentA.id)) === 0 &&
        (await submittedCount(raceTest.id, studentA.id)) === 1,
      "After limit consumed: zero new attempts created by concurrent starts"
    );

    // ----------------------------------------------------
    // TEST SUITE 10: OWNERSHIP / FORGED IDS / DIRECT BYPASS
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 10: OWNERSHIP, FORGED IDS & DIRECT BYPASS ---");
    // Ownership: student B has their own independent allowance
    const bStart = await startOrResumeAttempt(testL1.id, studentB.id);
    assert(bStart.isResumed === false, "Student B has an independent allowance (A at limit, B can start)");
    await gradeAttempt(bStart.attemptId, studentB.id);

    // Cross-user exam state access
    let crossDenied = false;
    try {
      await getAttemptExamState(bStart.attemptId, studentA.id);
    } catch {
      crossDenied = true;
    }
    assert(crossDenied, "Forged attempt ownership: user A cannot read user B's attempt state");

    // Forged test ID
    let forgedTestDenied = false;
    try {
      await startOrResumeAttempt("00000000-0000-0000-0000-000000000000", studentA.id);
    } catch (err) {
      forgedTestDenied = String((err as Error).message) === "Test not found";
    }
    assert(forgedTestDenied, "Forged test ID rejected");

    // Direct repeated invocation (simulating repeated POSTs) cannot bypass the limit
    let directBypassBlocked = true;
    for (let i = 0; i < 3; i++) {
      try {
        await startOrResumeAttempt(testL1.id, studentB.id);
        directBypassBlocked = false;
      } catch {
        // expected after B's allowance (1) is consumed
      }
    }
    assert(directBypassBlocked, "Repeated direct calls cannot bypass the limit (student B blocked)");

    // ----------------------------------------------------
    // TEST SUITE 11: DUPLICATE TEST COPIES LIMIT, NOT HISTORY
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 11: DUPLICATE TEST ---");
    const dupRes = await duplicateTest(testL2.id);
    assert(dupRes.test.attemptLimit === 2, "Duplicate test copies attemptLimit = 2");
    assert(dupRes.test.isPublished === false, "Duplicate test is a draft");
    const dupAttempts = await db
      .select()
      .from(attempts)
      .where(eq(attempts.testId, dupRes.test.id));
    assert(dupAttempts.length === 0, "Duplicate test copies NO attempt history");
    cleanupTestIds.push(dupRes.test.id);

    // ----------------------------------------------------
    // TEST SUITE 12: ADMIN LIMIT EDITS (reduce/increase/unlimited)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 12: ADMIN LIMIT EDITS ---");
    const adminTest = await makeTest({ title: `7D Admin ${Date.now()}`, attemptLimit: 2 });
    for (let i = 1; i <= 2; i++) {
      const s = await startOrResumeAttempt(adminTest.id, studentA.id);
      await gradeAttempt(s.attemptId, studentA.id);
    }
    const adminAttemptsBefore = (
      await db
        .select({ id: attempts.id, status: attempts.status, score: attempts.score })
        .from(attempts)
        .where(eq(attempts.testId, adminTest.id))
        .orderBy(asc(attempts.startedAt))
    ).map((a) => JSON.stringify(a));
    const readinessBefore = JSON.stringify(await calculateReadiness(studentA.id));

    // Reduce 2 -> 1
    await db.update(tests).set({ attemptLimit: 1 }).where(eq(tests.id, adminTest.id));
    let reducedDenied = false;
    try {
      await startOrResumeAttempt(adminTest.id, studentA.id);
    } catch (err) {
      reducedDenied = String((err as Error).message).includes("Attempt limit reached");
    }
    assert(reducedDenied, "Admin reduces limit below used count -> new attempt denied");

    // Increase 1 -> 3
    await db.update(tests).set({ attemptLimit: 3 }).where(eq(tests.id, adminTest.id));
    const increased = await startOrResumeAttempt(adminTest.id, studentA.id);
    assert(increased.isResumed === false, "Admin increases limit -> new attempt allowed");
    assert(increased.attemptsUsed === 2, "Increased limit response reports attemptsUsed = 2");
    assert(increased.attemptsRemaining === 1, "Increased limit response reports attemptsRemaining = 1");
    await gradeAttempt(increased.attemptId, studentA.id);

    // Unlimited conversion (null)
    await db.update(tests).set({ attemptLimit: null }).where(eq(tests.id, adminTest.id));
    const unlimited = await startOrResumeAttempt(adminTest.id, studentA.id);
    assert(unlimited.isResumed === false, "Unlimited conversion -> new attempt allowed");

    const adminAttemptsAfter = (
      await db
        .select({ id: attempts.id, status: attempts.status, score: attempts.score })
        .from(attempts)
        .where(eq(attempts.testId, adminTest.id))
        .orderBy(asc(attempts.startedAt))
    )
      .slice(0, 2)
      .map((a) => JSON.stringify(a));
    assert(
      JSON.stringify(adminAttemptsBefore) === JSON.stringify(adminAttemptsAfter),
      "Admin limit edits NEVER modify historical attempts (rows, statuses, scores intact)"
    );
    const readinessAfter = JSON.stringify(await calculateReadiness(studentA.id));
    assert(
      readinessBefore === readinessAfter,
      "Analytics/readiness unchanged by attempt-limit enforcement"
    );

    // ----------------------------------------------------
    // TEST SUITE 13: PUBLISHED / DRAFT CONSISTENCY
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 13: PUBLISHED / DRAFT CONSISTENCY ---");
    const draftTest = await makeTest({
      title: `7D Draft ${Date.now()}`,
      attemptLimit: 1,
      isPublished: false,
    });
    await db.update(users).set({ isAdmin: true }).where(eq(users.id, studentB.id));
    const draftStart = await startOrResumeAttempt(draftTest.id, studentB.id);
    await gradeAttempt(draftStart.attemptId, studentB.id);
    let draftDenied = false;
    try {
      await startOrResumeAttempt(draftTest.id, studentB.id);
    } catch (err) {
      draftDenied = String((err as Error).message).includes("Attempt limit reached");
    }
    await db.update(users).set({ isAdmin: false }).where(eq(users.id, studentB.id));
    assert(draftDenied, "Draft tests enforce attempt limits identically");

    // ----------------------------------------------------
    // TEST SUITE 14: OPTION/QUESTION RANDOMIZATION COMPATIBILITY
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 14: RANDOMIZATION COMBINATIONS WITH LIMITS ---");
    const combos = [
      { q: false, o: false, name: "OFF / OFF" },
      { q: true, o: false, name: "ON / OFF" },
      { q: false, o: true, name: "OFF / ON" },
      { q: true, o: true, name: "ON / ON" },
    ];
    for (const combo of combos) {
      const comboTest = await makeTest({
        title: `7D Combo ${combo.name} ${Date.now()}`,
        attemptLimit: 1,
        randomizeQuestions: combo.q,
        randomizeOptions: combo.o,
      });
      const cs = await startOrResumeAttempt(comboTest.id, studentA.id);
      assert(cs.isResumed === false, `Combo [${combo.name}]: attempt created under limit 1`);
      const cState = await getAttemptExamState(cs.attemptId, studentA.id);
      assert(
        !cState.isExpired && cState.questions.length === 2,
        `Combo [${combo.name}]: exam state intact under limit enforcement`
      );
      await gradeAttempt(cs.attemptId, studentA.id);
      let cDenied = false;
      try {
        await startOrResumeAttempt(comboTest.id, studentA.id);
      } catch (err) {
        cDenied = String((err as Error).message).includes("Attempt limit reached");
      }
      assert(cDenied, `Combo [${combo.name}]: limit enforced after submission`);
    }

  } catch (error) {
    console.error("Audit encountered unexpected fatal error:", error);
    failed++;
  } finally {
    console.log("\n--- CLEANUP ---");
    for (const tId of cleanupTestIds) {
      await db.delete(tests).where(eq(tests.id, tId)).catch(() => {});
    }
    for (const qId of cleanupQuestionIds) {
      await db.delete(questions).where(eq(questions.id, qId)).catch(() => {});
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
  console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase7DAttemptLimitsAudit().catch((err) => {
  console.error("Fatal test failure:", err);
  process.exit(1);
});