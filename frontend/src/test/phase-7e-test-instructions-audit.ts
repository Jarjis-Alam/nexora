import { db } from "@/db";
import {
  users,
  tests,
  testSections,
  testQuestions,
  attempts,
  questions,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  startOrResumeAttempt,
  getAttemptExamState,
  getTestDetails,
  duplicateTest,
} from "@/server/tests";
import { gradeAttempt } from "@/server/grading";
import { calculateReadiness } from "@/server/readiness";
import { parseTestInstructions } from "@/lib/instructions";

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

async function runPhase7ETestInstructionsAudit() {
  console.log("==================================================");
  console.log("📜 NEXORA — PHASE 7E: TEST INSTRUCTIONS AUDIT");
  console.log("==================================================\n");

  const cleanupUserIds: string[] = [];
  const cleanupTestIds: string[] = [];
  const cleanupQuestionIds: string[] = [];

  try {
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const [studentA] = await db
      .insert(users)
      .values({
        email: `student7eA-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    const [studentB] = await db
      .insert(users)
      .values({
        email: `student7eB-${Date.now()}@nexora.test`,
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
          question: `7E Q${i}: Which protocol is connection-oriented?`,
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
      instructions?: string | null;
      attemptLimit?: number | null;
      randomizeQuestions?: boolean;
      randomizeOptions?: boolean;
      negativeMarkingEnabled?: boolean;
      negativeMarkRate?: string;
      isPublished?: boolean;
    }) {
      const [test] = await db
        .insert(tests)
        .values({
          title: opts.title,
          description: null,
          instructions: opts.instructions === undefined ? null : opts.instructions,
          duration: 30,
          type: "mixed",
          difficulty: "easy",
          totalMarks: 8,
          randomizeQuestions: opts.randomizeQuestions ?? false,
          randomizeOptions: opts.randomizeOptions ?? false,
          attemptLimit: opts.attemptLimit === undefined ? null : opts.attemptLimit,
          negativeMarkingEnabled: opts.negativeMarkingEnabled ?? false,
          negativeMarkRate: opts.negativeMarkRate ?? "0.00",
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

    async function countAttempts(testId: string, userId: string) {
      const rows = await db
        .select()
        .from(attempts)
        .where(and(eq(attempts.testId, testId), eq(attempts.userId, userId)));
      return rows.length;
    }

    // ----------------------------------------------------
    // TEST SUITE 1: SCHEMA & NULLABLE BEHAVIOR (A, B)
    // ----------------------------------------------------
    console.log("--- TEST SUITE 1: SCHEMA & NULLABLE BEHAVIOR ---");
    const noInstr = await makeTest({ title: `7E NoInstr ${Date.now()}` });
    assert(noInstr.instructions === null, "tests.instructions defaults to NULL (no instructions)");

    // ----------------------------------------------------
    // TEST SUITE 2: VALIDATION (E, J, K, L, F, G)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 2: VALIDATION RULES ---");
    const vNull = parseTestInstructions(null);
    const vUndef = parseTestInstructions(undefined);
    const vEmpty = parseTestInstructions("");
    const vWs = parseTestInstructions("   \n\t  ");
    assert(vNull.ok && vNull.value === null, "null -> NULL (no instructions)");
    assert(vUndef.ok && vUndef.value === null, "undefined -> NULL");
    assert(vEmpty.ok && vEmpty.value === null, "empty string -> NULL");
    assert(vWs.ok && vWs.value === null, "whitespace-only -> NULL");

    const vTrim = parseTestInstructions("  Read carefully  ");
    assert(vTrim.ok && vTrim.value === "Read carefully", "valid string is trimmed");

    const vUnicode = parseTestInstructions("Instructions — ünïcode ✓ 日本語");
    assert(vUnicode.ok && vUnicode.value === "Instructions — ünïcode ✓ 日本語", "Unicode preserved");

    const vMulti = parseTestInstructions("Line 1\nLine 2\n\nLine 4");
    assert(
      vMulti.ok && vMulti.value === "Line 1\nLine 2\n\nLine 4",
      "Multiline content preserved (newlines intact)"
    );

    const v5000 = parseTestInstructions("x".repeat(5000));
    assert(v5000.ok && v5000.value!.length === 5000, "Exactly 5000 characters accepted");

    const vOver = parseTestInstructions("x".repeat(5001));
    assert(!vOver.ok && vOver.error.includes("5000"), ">5000 characters rejected");

    const vNonString = parseTestInstructions(42);
    assert(!vNonString.ok, "Non-string value rejected");

    // ----------------------------------------------------
    // TEST SUITE 3: STORAGE & UPDATE (C, D)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 3: STORAGE, UPDATE & EXPOSURE ---");
    const instrText = "This test has 2 questions. Answer every question.";
    const withInstr = await makeTest({
      title: `7E WithInstr ${Date.now()}`,
      instructions: instrText,
    });
    assert(
      withInstr.instructions === instrText,
      "Instructions stored on test creation"
    );

    // Update instructions (simulates the validated PATCH path)
    const updatedText = "Updated instructions: no calculators allowed.";
    await db
      .update(tests)
      .set({ instructions: updatedText })
      .where(eq(tests.id, withInstr.id));
    const [afterUpdate] = await db
      .select()
      .from(tests)
      .where(eq(tests.id, withInstr.id));
    assert(afterUpdate.instructions === updatedText, "Instructions updated");

    // Clear back to NULL (simulates PATCH with null)
    await db
      .update(tests)
      .set({ instructions: null })
      .where(eq(tests.id, withInstr.id));
    const [afterClear] = await db
      .select()
      .from(tests)
      .where(eq(tests.id, withInstr.id));
    assert(afterClear.instructions === null, "Instructions cleared back to NULL");

    // ----------------------------------------------------
    // TEST SUITE 4: STUDENT VISIBILITY VIA getTestDetails (M, N)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 4: VISIBILITY VIA getTestDetails ---");
    const visTest = await makeTest({
      title: `7E Vis ${Date.now()}`,
      instructions: "Read before you begin.",
    });
    const visDetails = await getTestDetails(visTest.id, studentA.id);
    assert(
      visDetails?.instructions === "Read before you begin.",
      "getTestDetails exposes instructions to the student"
    );
    const hiddenTest = await makeTest({ title: `7E Hidden ${Date.now()}` });
    const hiddenDetails = await getTestDetails(hiddenTest.id, studentA.id);
    assert(
      hiddenDetails?.instructions === null,
      "Absent instructions exposed as NULL (panel hidden by UI)"
    );

    // ----------------------------------------------------
    // TEST SUITE 5: XSS SAFE STORAGE (Q)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 5: XSS SAFE STORAGE ---");
    const xssPayload =
      '<script>alert("xss")</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">link</a>';
    const xssTest = await makeTest({
      title: `7E XSS ${Date.now()}`,
      instructions: xssPayload,
    });
    const xssDetails = await getTestDetails(xssTest.id, studentA.id);
    assert(
      xssDetails?.instructions === xssPayload,
      "XSS payload stored and served byte-identical as plain text (no sanitizer mangling)"
    );
    assert(
      (xssDetails?.instructions || "").includes("<script>"),
      "<script> remains literal text in storage"
    );
    assert(
      (xssDetails?.instructions || "").includes("onerror"),
      "Event-handler string remains literal text"
    );
    assert(
      (xssDetails?.instructions || "").includes("javascript:"),
      "Unsafe link string remains literal text"
    );

    // ----------------------------------------------------
    // TEST SUITE 6: VIEWING CREATES NO ATTEMPT (R)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 6: VIEWING CREATES NO ATTEMPT ---");
    const viewTest = await makeTest({
      title: `7E View ${Date.now()}`,
      instructions: "No attempt should be created by viewing.",
    });
    const before = await countAttempts(viewTest.id, studentA.id);
    await getTestDetails(viewTest.id, studentA.id); // the detail-page read path
    await getTestDetails(viewTest.id, studentA.id);
    const after = await countAttempts(viewTest.id, studentA.id);
    assert(before === 0 && after === 0, "Viewing the test detail creates ZERO attempts");

    // ----------------------------------------------------
    // TEST SUITE 7: SERVER NEVER GATES ON ACKNOWLEDGEMENT (S, T server-side)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 7: ACKNOWLEDGEMENT SEMANTICS (server side) ---");
    const ackTest = await makeTest({
      title: `7E Ack ${Date.now()}`,
      instructions: "You must read this.",
    });
    // The checkbox is client-only: the server must create the attempt without any ack input.
    const ackStart = await startOrResumeAttempt(ackTest.id, studentA.id);
    assert(
      ackStart.isResumed === false && !!ackStart.attemptId,
      "Server creates the attempt without requiring acknowledgement (client-side gating only)"
    );
    // Resume path: one click, no acknowledgement
    const ackResume = await startOrResumeAttempt(ackTest.id, studentA.id);
    assert(
      ackResume.isResumed === true && ackResume.attemptId === ackStart.attemptId,
      "Resume works in one click with instructions present (acknowledgement never blocks resume)"
    );

    // ----------------------------------------------------
    // TEST SUITE 8: ATTEMPT LIMIT INTERACTION (U)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 8: ATTEMPT LIMIT INTERACTION ---");
    const limitTest = await makeTest({
      title: `7E Limit ${Date.now()}`,
      instructions: "Instructions with limit 1.",
      attemptLimit: 1,
    });
    const limStart = await startOrResumeAttempt(limitTest.id, studentA.id);
    await gradeAttempt(limStart.attemptId, studentA.id);
    let limDenied = false;
    try {
      await startOrResumeAttempt(limitTest.id, studentA.id);
    } catch (err) {
      limDenied = String((err as Error).message).includes("Attempt limit reached");
    }
    assert(limDenied, "Attempt limit still enforced with instructions present");
    assert(
      (await countAttempts(limitTest.id, studentA.id)) === 1,
      "Viewing instructions never consumed the allowance"
    );

    // ----------------------------------------------------
    // TEST SUITE 9: TIMER STARTS AT ATTEMPT CREATION (V)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 9: TIMER STARTS AT ATTEMPT CREATION ---");
    const timerTest = await makeTest({
      title: `7E Timer ${Date.now()}`,
      instructions: "Timer must not run before start.",
    });
    const timerStart = await startOrResumeAttempt(timerTest.id, studentA.id);
    const timerState = await getAttemptExamState(timerStart.attemptId, studentA.id);
    if (!timerState.isExpired) {
      assert(
        Math.abs(timerState.remainingSeconds - 30 * 60) < 60,
        `Timer starts at attempt creation (~1800s remaining, got ${timerState.remainingSeconds})`
      );
    }

    // ----------------------------------------------------
    // TEST SUITE 10: DUPLICATE TEST (X, Y)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 10: DUPLICATE TEST ---");
    const dupSource = await makeTest({
      title: `7E DupSource ${Date.now()}`,
      instructions: "Copied instructions.",
      attemptLimit: 3,
    });
    const dupStart = await startOrResumeAttempt(dupSource.id, studentB.id);
    await gradeAttempt(dupStart.attemptId, studentB.id);
    const dupRes = await duplicateTest(dupSource.id);
    assert(
      dupRes.test.instructions === "Copied instructions.",
      "Duplicate test copies instructions"
    );
    const dupAttempts = await db
      .select()
      .from(attempts)
      .where(eq(attempts.testId, dupRes.test.id));
    assert(dupAttempts.length === 0, "Duplicate test copies NO attempt history");
    cleanupTestIds.push(dupRes.test.id);

    // ----------------------------------------------------
    // TEST SUITE 11: HISTORICAL + POST-START EDITS (Z, AA)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 11: HISTORICAL & POST-START EDITS ---");
    const histTest = await makeTest({
      title: `7E Hist ${Date.now()}`,
      instructions: "v1 instructions",
    });
    const histStart = await startOrResumeAttempt(histTest.id, studentA.id);
    await gradeAttempt(histStart.attemptId, studentA.id);
    const [gradedHist] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, histStart.attemptId));

    // Active-attempt test: edit instructions after start, exam state must not change
    const activeTest = await makeTest({
      title: `7E Active ${Date.now()}`,
      instructions: "v1",
    });
    const activeStart = await startOrResumeAttempt(activeTest.id, studentB.id);
    const stateBeforeEdit = await getAttemptExamState(activeStart.attemptId, studentB.id);
    await db
      .update(tests)
      .set({ instructions: "v2 - admin edited" })
      .where(eq(tests.id, activeTest.id));
    const stateAfterEdit = await getAttemptExamState(activeStart.attemptId, studentB.id);
    assert(
      !stateBeforeEdit.isExpired &&
        !stateAfterEdit.isExpired &&
        JSON.stringify(stateBeforeEdit.questions) === JSON.stringify(stateAfterEdit.questions),
      "Admin instructions edit after start does NOT affect the active attempt"
    );

    await db
      .update(tests)
      .set({ instructions: "v3 - edited after submission" })
      .where(eq(tests.id, histTest.id));
    const [gradedAfter] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, histStart.attemptId));
    assert(
      gradedHist.status === gradedAfter.status && gradedHist.score === gradedAfter.score,
      "Instruction edits after submission do NOT alter the historical result"
    );
    assert(
      gradedAfter.status === "submitted",
      "Submitted attempt status unchanged after instruction edit"
    );

    // ----------------------------------------------------
    // TEST SUITE 12: ANALYTICS / READINESS UNCHANGED (AB, AC)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 12: ANALYTICS / READINESS UNCHANGED ---");
    const readinessBefore = JSON.stringify(await calculateReadiness(studentA.id));
    await db
      .update(tests)
      .set({ instructions: "Post-readiness edit" })
      .where(eq(tests.id, viewTest.id));
    const readinessAfter = JSON.stringify(await calculateReadiness(studentA.id));
    assert(
      readinessBefore === readinessAfter,
      "Readiness unchanged by instructions (no scoring/analytics effect)"
    );
    const [scoredAttempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, histStart.attemptId));
    assert(
      Number(scoredAttempt.score) === Number(gradedHist.score) &&
        Number(scoredAttempt.accuracy) === Number(gradedHist.accuracy),
      "Score and accuracy of historical attempts unchanged"
    );

    // ----------------------------------------------------
    // TEST SUITE 13: REFRESH / MULTI-TAB / CONCURRENT (AD, AE, AF)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 13: REFRESH, MULTI-TAB & CONCURRENT START ---");
    const refreshState = await getAttemptExamState(activeStart.attemptId, studentB.id);
    assert(
      !refreshState.isExpired &&
        JSON.stringify(stateBeforeEdit.questions) === JSON.stringify(refreshState.questions),
      "Refresh returns identical exam state (instructions not part of exam payload)"
    );
    const [tab1, tab2] = await Promise.all([
      startOrResumeAttempt(activeTest.id, studentB.id),
      startOrResumeAttempt(activeTest.id, studentB.id),
    ]);
    assert(
      tab1.attemptId === tab2.attemptId && tab1.attemptId === activeStart.attemptId,
      "Multiple tabs converge on the same active attempt (7D protection intact)"
    );

    // ----------------------------------------------------
    // TEST SUITE 14: FULL-FLOW REGRESSION COMPATIBILITY (AG)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 14: FULL-FLOW REGRESSION COMPATIBILITY ---");
    const fullTest = await makeTest({
      title: `7E Full ${Date.now()}`,
      instructions: "Full flow: randomized options + negative marking + instructions.",
      randomizeOptions: true,
      randomizeQuestions: true,
      negativeMarkingEnabled: true,
      negativeMarkRate: "0.25",
    });
    const fullStart = await startOrResumeAttempt(fullTest.id, studentA.id);
    await gradeAttempt(fullStart.attemptId, studentA.id);
    const [fullGraded] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, fullStart.attemptId));
    assert(fullGraded.status === "submitted", "Full flow: attempt graded with instructions present");
    assert(
      typeof fullGraded.score === "number",
      "Full flow: score computed normally"
    );
    const fullDetails = await getTestDetails(fullTest.id, studentA.id);
    assert(
      fullDetails?.instructions ===
        "Full flow: randomized options + negative marking + instructions.",
      "Full flow: instructions still served alongside randomization/marking configuration"
    );

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

runPhase7ETestInstructionsAudit().catch((err) => {
  console.error("Fatal test failure:", err);
  process.exit(1);
});