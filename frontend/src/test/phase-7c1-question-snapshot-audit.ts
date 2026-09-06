import { db } from "@/db";
import {
  users,
  tests,
  testSections,
  testQuestions,
  attemptQuestions,
  questions,
  attempts,
  answers,
  subjects,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  startOrResumeAttempt,
  getAttemptExamState,
  saveAnswer,
} from "@/server/tests";
import { gradeAttempt } from "@/server/grading";

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

async function runPhase7C1QuestionSnapshotAudit() {
  console.log("==================================================");
  console.log("🛡️  NEXORA — PHASE 7C.1: QUESTION SNAPSHOT HARDENING AUDIT");
  console.log("==================================================\n");

  const cleanupUserIds: string[] = [];
  const cleanupTestIds: string[] = [];
  const cleanupQuestionIds: string[] = [];
  const cleanupSubjectIds: string[] = [];

  try {
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const [testStudent] = await db
      .insert(users)
      .values({
        email: `student-phase7c1-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    cleanupUserIds.push(testStudent.id);

    const existingQuestions = await db
      .select({
        subjectId: questions.subjectId,
        topicId: questions.topicId,
      })
      .from(questions)
      .limit(1);
    const subjectId = existingQuestions[0].subjectId;
    const topicId = existingQuestions[0].topicId;

    // Create 6 questions with known canonical values
    const qTexts = [
      "7C1 Q1: Which protocol is connection-oriented?",
      "7C1 Q2: Which protocol is connection-oriented?",
      "7C1 Q3: Which protocol is connection-oriented?",
      "7C1 Q4: Which protocol is connection-oriented?",
      "7C1 Q5: Which protocol is connection-oriented?",
      "7C1 Q6: Which protocol is connection-oriented?",
    ];
    const createdQuestions = [];
    for (let i = 1; i <= 6; i++) {
      const [q] = await db
        .insert(questions)
        .values({
          subjectId,
          topicId,
          question: qTexts[i - 1],
          questionType: "single_choice",
          options: ["UDP", "TCP", "HTTP", "DNS"],
          correctAnswer: "TCP", // canonical index 1 -> opt_1
          explanation: `Explanation for Q${i}`,
          marks: 4,
          difficulty: "easy",
          expectedTime: 60,
        })
        .returning();
      createdQuestions.push(q);
      cleanupQuestionIds.push(q.id);
    }
    const [q1, q2, q3, q4, q5, q6] = createdQuestions;

    // Helper: build a test with sections/questions and start an attempt
    async function makeTest(opts: {
      title: string;
      randomizeQuestions?: boolean;
      randomizeOptions?: boolean;
      negativeMarkingEnabled?: boolean;
      negativeMarkRate?: string;
      sections: { title: string; questions: { q: typeof q1; order: number }[] }[];
    }) {
      const [test] = await db
        .insert(tests)
        .values({
          title: opts.title,
          duration: 30,
          type: "mixed",
          difficulty: "easy",
          totalMarks: opts.sections.reduce(
            (sum, s) => sum + s.questions.length * 4,
            0
          ),
          negativeMarkingEnabled: opts.negativeMarkingEnabled ?? false,
          negativeMarkRate: opts.negativeMarkRate ?? "0.00",
          randomizeQuestions: opts.randomizeQuestions ?? false,
          randomizeOptions: opts.randomizeOptions ?? false,
          isPublished: true,
        })
        .returning();
      cleanupTestIds.push(test.id);
      for (const [sIdx, sec] of opts.sections.entries()) {
        const [dbSec] = await db
          .insert(testSections)
          .values({
            testId: test.id,
            title: sec.title,
            sectionOrder: sIdx + 1,
          })
          .returning();
        await db.insert(testQuestions).values(
          sec.questions.map(({ q, order }) => ({
            testId: test.id,
            sectionId: dbSec.id,
            questionId: q.id,
            questionOrder: order,
          }))
        );
      }
      return test;
    }

    // ----------------------------------------------------
    // TEST SUITE 1: SNAPSHOT CREATION (text, type, marks, options, correctAnswer, optionOrder)
    // ----------------------------------------------------
    console.log("--- TEST SUITE 1: SNAPSHOT CREATION AT ATTEMPT START ---");
    const testA = await makeTest({
      title: `7C1 Immutable Test A ${Date.now()}`,
      randomizeOptions: true,
      sections: [
        { title: "Section 1", questions: [{ q: q1, order: 1 }, { q: q2, order: 2 }] },
      ],
    });
    const startA = await startOrResumeAttempt(testA.id, testStudent.id);
    const aqRows = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, startA.attemptId))
      .orderBy(asc(attemptQuestions.questionOrder));

    assert(aqRows.length === 2, "Attempt A created 2 attempt_questions rows");

    const rowQ1 = aqRows.find((r) => r.questionId === q1.id)!;
    assert(
      rowQ1.questionTextSnapshot === qTexts[0],
      "questionTextSnapshot captures the question text at attempt start"
    );
    assert(
      rowQ1.questionTypeSnapshot === "single_choice",
      "questionTypeSnapshot captures the question type at attempt start"
    );
    assert(
      rowQ1.marksSnapshot === 4,
      "marksSnapshot captures the question marks at attempt start"
    );
    assert(
      Array.isArray(rowQ1.optionsSnapshot) &&
        JSON.stringify(rowQ1.optionsSnapshot) ===
          JSON.stringify(["UDP", "TCP", "HTTP", "DNS"]),
      "optionsSnapshot captures the canonical options at attempt start"
    );
    assert(
      rowQ1.correctAnswerSnapshot === "TCP",
      "correctAnswerSnapshot captures the canonical correct answer at attempt start"
    );
    assert(
      Array.isArray(rowQ1.optionOrder) &&
        rowQ1.optionOrder.length === 4 &&
        new Set(rowQ1.optionOrder).size === 4,
      "optionOrder is a valid 4-option permutation at attempt start"
    );

    // ----------------------------------------------------
    // TEST SUITE 2: ACTIVE EXAM USES SNAPSHOTS (refresh-consistent)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 2: ACTIVE EXAM USES SNAPSHOTS ---");
    const state1 = await getAttemptExamState(startA.attemptId, testStudent.id);
    assert(!state1.isExpired, "Attempt A exam state is active");
    let q1OptionsSnapshotJson: string | null = null;
    if (!state1.isExpired) {
      const sQ1 = state1.questions.find((q) => q.id === q1.id)!;
      assert(
        sQ1.question === qTexts[0],
        "Active exam question text comes from snapshot"
      );
      assert(
        sQ1.questionType === "single_choice",
        "Active exam question type comes from snapshot"
      );
      assert(sQ1.marks === 4, "Active exam marks come from snapshot");
      assert(
        Array.isArray(sQ1.options) &&
          sQ1.options.length === 4 &&
          typeof sQ1.options[0] === "object" &&
          "id" in sQ1.options[0],
        "Active exam options are { id, text } in persisted order"
      );
      assert(
        !("correctAnswer" in sQ1) && !("explanation" in sQ1),
        "SECURITY: correctAnswer and explanation hidden from active payload"
      );
      // Capture Q1's persisted presentation options for the edit-immunity check in Suite 4
      q1OptionsSnapshotJson = JSON.stringify(
        state1.questions.find((q) => q.id === q1.id)!.options
      );
      // Refresh: second fetch is identical
      const state2 = await getAttemptExamState(startA.attemptId, testStudent.id);
      if (!state2.isExpired) {
        assert(
          JSON.stringify(state1.questions) === JSON.stringify(state2.questions),
          "Refresh returns byte-identical exam state (frozen)"
        );
      }
    }

    // ----------------------------------------------------
    // TEST SUITE 3: RESUME PERSISTENCE
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 3: RESUME PERSISTENCE ---");
    const resumeA = await startOrResumeAttempt(testA.id, testStudent.id);
    assert(resumeA.isResumed === true, "Resume returns isResumed: true");
    assert(
      resumeA.attemptId === startA.attemptId,
      "Resume returns the same attemptId"
    );
    const stateResumed = await getAttemptExamState(resumeA.attemptId, testStudent.id);
    if (!state1.isExpired && !stateResumed.isExpired) {
      assert(
        JSON.stringify(state1.questions) === JSON.stringify(stateResumed.questions),
        "Resumed exam state is identical to the original (no reshuffle, no live reads)"
      );
    }

    // ----------------------------------------------------
    // TEST SUITE 4: QUESTION BANK EDIT AFTER START, BEFORE SUBMISSION
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 4: QUESTION BANK EDIT AFTER START (BEFORE SUBMISSION) ---");
    // Admin mutates Q1 in the Question Bank: text, type, marks, options, correctAnswer
    await db
      .update(questions)
      .set({
        question: "MUTATED QUESTION TEXT (live)",
        questionType: "multiple_choice",
        marks: 8,
        options: ["X", "Y", "Z", "W"],
        correctAnswer: ["Y"],
      })
      .where(eq(questions.id, q1.id));

    const stateAfterEdit = await getAttemptExamState(startA.attemptId, testStudent.id);
    if (!stateAfterEdit.isExpired) {
      const sQ1 = stateAfterEdit.questions.find((q) => q.id === q1.id)!;
      assert(
        sQ1.question === qTexts[0],
        "Question text edit cannot change the active exam (snapshot served)"
      );
      assert(
        sQ1.questionType === "single_choice",
        "Question type edit cannot change the active exam (snapshot served)"
      );
      assert(
        sQ1.marks === 4,
        "Marks edit cannot change the active exam (snapshot served)"
      );
      const texts = (sQ1.options as { text: string }[]).map((o) => o.text);
      const sortedTexts = [...texts].sort();
      assert(
        sortedTexts.length === 4 &&
          JSON.stringify(sortedTexts) ===
            JSON.stringify(["DNS", "HTTP", "TCP", "UDP"]),
        "Options edit cannot change the active exam (optionsSnapshot served)"
      );
      const order2 = JSON.stringify(sQ1.options);
      assert(
        q1OptionsSnapshotJson !== null && q1OptionsSnapshotJson === order2,
        "Option ordering unchanged after Question Bank edit"
      );
    }

    // Answer Q1 with opt_1 (CORRECT per snapshot: TCP), Q2 with opt_0 (INCORRECT)
    await saveAnswer(startA.attemptId, testStudent.id, q1.id, "opt_1", 10);
    await saveAnswer(startA.attemptId, testStudent.id, q2.id, "opt_0", 15);

    await gradeAttempt(startA.attemptId, testStudent.id);
    const [gradedA] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, startA.attemptId));

    assert(gradedA.status === "submitted", "Attempt A submitted after grading");
    // Snapshot marks: totalPossible = 4 + 4 = 8; correct +4 -> 50%
    // If live marks (8+4=12) were used: 67%. If live type/answer key were used: 0%.
    assert(
      Number(gradedA.score) === 50,
      `Grading uses snapshot marks/type/answer: score 50% (got: ${gradedA.score})`
    );
    assert(
      Number(gradedA.accuracy) === 50,
      `Accuracy unchanged by snapshots: 50% (got: ${gradedA.accuracy})`
    );

    // ----------------------------------------------------
    // TEST SUITE 5: QUESTION EDIT AFTER SUBMISSION
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 5: QUESTION EDIT AFTER SUBMISSION ---");
    await db
      .update(questions)
      .set({
        question: "AFTER SUBMIT EDIT (live)",
        questionType: "single_choice",
        marks: 10,
        options: ["X", "Y", "Z", "W"],
        correctAnswer: "Z",
      })
      .where(eq(questions.id, q1.id));

    const [attemptAAfter] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, startA.attemptId));
    assert(
      Number(attemptAAfter.score) === 50,
      "Submitted attempt score remains 50% after post-submission question edit"
    );
    assert(
      attemptAAfter.status === "submitted",
      "Submitted attempt status remains submitted"
    );

    const regradeA = await gradeAttempt(startA.attemptId, testStudent.id);
    assert(
      regradeA.status === "submitted",
      "gradeAttempt is idempotent on submitted attempts (no regrade)"
    );

    // A NEW attempt started after the edit must capture the CURRENT (edited) values
    const newAttempt = await startOrResumeAttempt(testA.id, testStudent.id);
    assert(newAttempt.isResumed === false, "New attempt created after edit");
    const newRows = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, newAttempt.attemptId));
    const newRowQ1 = newRows.find((r) => r.questionId === q1.id)!;
    assert(
      newRowQ1.questionTextSnapshot === "AFTER SUBMIT EDIT (live)",
      "New attempt snapshots the current question text (start-time capture)"
    );
    assert(
      newRowQ1.marksSnapshot === 10,
      "New attempt snapshots the current marks (start-time capture)"
    );
    assert(
      newRowQ1.questionTypeSnapshot === "single_choice",
      "New attempt snapshots the current question type (start-time capture)"
    );
    assert(
      newRowQ1.correctAnswerSnapshot === "Z",
      "New attempt snapshots the current correct answer (start-time capture)"
    );

    // ----------------------------------------------------
    // TEST SUITE 6: NEGATIVE MARKING USES SNAPSHOT MARKS
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 6: NEGATIVE MARKING + SNAPSHOT MARKS ---");
    const testB = await makeTest({
      title: `7C1 Negative Marks Test B ${Date.now()}`,
      randomizeOptions: true,
      negativeMarkingEnabled: true,
      negativeMarkRate: "0.25",
      sections: [
        { title: "Section 1", questions: [{ q: q3, order: 1 }, { q: q4, order: 2 }] },
      ],
    });
    const startB = await startOrResumeAttempt(testB.id, testStudent.id);
    // Q3 CORRECT (opt_1 = TCP, +4), Q4 INCORRECT (opt_2 = HTTP, -4*0.25 = -1)
    await saveAnswer(startB.attemptId, testStudent.id, q3.id, "opt_1", 10);
    await saveAnswer(startB.attemptId, testStudent.id, q4.id, "opt_2", 10);

    // Admin edits ONLY Q4's live marks to 2 (from 4) before submission
    await db
      .update(questions)
      .set({ marks: 2, question: "LIVE EDITED Q4" })
      .where(eq(questions.id, q4.id));

    await gradeAttempt(startB.attemptId, testStudent.id);
    const [gradedB] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, startB.attemptId));
    // Snapshot marks: (4 - 1) / 8 = 37.5 -> 38%
    // If live marks were used: (4 - 0.5) / 6 = 58%
    assert(
      Number(gradedB.score) === 38,
      `Negative marking uses snapshot marks: +4 - 1 = 3/8 -> 38% (got: ${gradedB.score})`
    );
    assert(
      Number(gradedB.accuracy) === 50,
      `Accuracy under negative marking unchanged: 50% (got: ${gradedB.accuracy})`
    );

    // ----------------------------------------------------
    // TEST SUITE 7: ALL FOUR RANDOMIZATION COMBINATIONS
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 7: ALL FOUR COMBINATIONS (Phase 7B + 7C) ---");
    const combos = [
      { qRand: false, optRand: false, name: "OFF / OFF" },
      { qRand: true, optRand: false, name: "ON / OFF" },
      { qRand: false, optRand: true, name: "OFF / ON" },
      { qRand: true, optRand: true, name: "ON / ON" },
    ];
    for (const combo of combos) {
      const comboTest = await makeTest({
        title: `7C1 Combo ${combo.name} ${Date.now()}`,
        randomizeQuestions: combo.qRand,
        randomizeOptions: combo.optRand,
        sections: [
          { title: "S1", questions: [{ q: q5, order: 1 }, { q: q6, order: 2 }] },
        ],
      });
      const cAtt = await startOrResumeAttempt(comboTest.id, testStudent.id);
      const cRows = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, cAtt.attemptId))
        .orderBy(asc(attemptQuestions.questionOrder));

      assert(
        cRows.length === 2,
        `Combination [${combo.name}] initialized 2 attempt_questions rows`
      );
      const snapshotsOk = cRows.every(
        (r) =>
          r.questionTextSnapshot !== null &&
          r.questionTypeSnapshot === "single_choice" &&
          r.marksSnapshot === 4 &&
          Array.isArray(r.optionsSnapshot) &&
          (r.optionsSnapshot as string[]).length === 4 &&
          r.correctAnswerSnapshot === "TCP" &&
          Array.isArray(r.optionOrder) &&
          (r.optionOrder as string[]).length === 4
      );
      assert(
        snapshotsOk,
        `Combination [${combo.name}] captures full snapshots (text/type/marks/options/answer/order)`
      );
      if (!combo.optRand) {
        assert(
          JSON.stringify(cRows[0].optionOrder) ===
            JSON.stringify(["opt_0", "opt_1", "opt_2", "opt_3"]),
          `Combination [${combo.name}] preserves canonical optionOrder`
        );
      }
      const comboState = await getAttemptExamState(cAtt.attemptId, testStudent.id);
      if (!comboState.isExpired) {
        assert(
          comboState.questions.every(
            (q) => q.question === qTexts[4] || q.question === qTexts[5]
          ),
          `Combination [${combo.name}] exam state serves snapshotted question text`
        );
      }
    }

    // ----------------------------------------------------
    // TEST SUITE 8: SECTIONS PRESERVED
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 8: SECTIONS PRESERVED ---");
    const testSec = await makeTest({
      title: `7C1 Sections Test ${Date.now()}`,
      randomizeQuestions: true,
      randomizeOptions: true,
      sections: [
        { title: "Aptitude", questions: [{ q: q5, order: 1 }] },
        { title: "CS", questions: [{ q: q6, order: 1 }] },
      ],
    });
    const secStart = await startOrResumeAttempt(testSec.id, testStudent.id);
    const secRows = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, secStart.attemptId))
      .orderBy(asc(attemptQuestions.questionOrder));
    assert(secRows.length === 2, "Sectioned attempt created 2 rows");
    assert(
      secRows[0].sectionId !== secRows[1].sectionId,
      "Rows retain their distinct sectionIds (Phase 6C architecture preserved)"
    );
    assert(
      secRows.every((r) => r.questionOrder > 0),
      "Global questionOrder assigned across sections"
    );
    const secState = await getAttemptExamState(secStart.attemptId, testStudent.id);
    if (!secState.isExpired) {
      const sectionIdsInState = new Set(secState.questions.map((q) => q.sectionId));
      assert(
        sectionIdsInState.size === 2,
        "Exam state preserves both section identities"
      );
      assert(
        secState.questions.every(
          (q) =>
            q.marks === 4 &&
            q.questionType === "single_choice" &&
            (q.question === qTexts[4] || q.question === qTexts[5])
        ),
        "Exam state serves snapshot content (text/type/marks) across sections"
      );
    }

    // ----------------------------------------------------
    // TEST SUITE 9: HISTORICAL ATTEMPT COMPATIBILITY
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 9: HISTORICAL ATTEMPT COMPATIBILITY ---");
    // 9a: Pre-7B legacy attempt with NO attempt_questions rows -> text matching against live data
    const testC = await makeTest({
      title: `7C1 Legacy Test C ${Date.now()}`,
      sections: [
        { title: "S1", questions: [{ q: q5, order: 1 }, { q: q6, order: 2 }] },
      ],
    });
    const [legacyAttempt] = await db
      .insert(attempts)
      .values({
        userId: testStudent.id,
        testId: testC.id,
        status: "in_progress",
        startedAt: new Date(),
        currentQuestion: 0,
        remainingTime: 1800,
      })
      .returning();
    await db.insert(answers).values({
      attemptId: legacyAttempt.id,
      questionId: q5.id,
      selectedAnswer: "TCP",
      timeSpent: 20,
    });
    await gradeAttempt(legacyAttempt.id, testStudent.id);
    const [gradedLegacy] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, legacyAttempt.id));
    assert(
      Number(gradedLegacy.score) === 50,
      `Pre-7B legacy attempt (no attempt_questions) graded with text answer: 50% (got: ${gradedLegacy.score})`
    );

    // 9b: 7C-era attempt with old snapshots but NULL new snapshot columns
    // -> must fall back to live question values without breaking
    const testD = await makeTest({
      title: `7C1 Historical-Null Test D ${Date.now()}`,
      randomizeOptions: true,
      sections: [
        { title: "S1", questions: [{ q: q5, order: 1 }, { q: q6, order: 2 }] },
      ],
    });
    const histStart = await startOrResumeAttempt(testD.id, testStudent.id);
    // Simulate a 7C-era row: optionOrder/optionsSnapshot/correctAnswerSnapshot present,
    // but the new 7C.1 snapshot columns are NULL
    await db
      .update(attemptQuestions)
      .set({
        questionTextSnapshot: null,
        questionTypeSnapshot: null,
        marksSnapshot: null,
      })
      .where(eq(attemptQuestions.attemptId, histStart.attemptId));

    // Admin edits Q5 live marks/text AFTER the attempt started
    await db
      .update(questions)
      .set({ marks: 2, question: "LIVE EDITED Q5" })
      .where(eq(questions.id, q5.id));

    const histState = await getAttemptExamState(histStart.attemptId, testStudent.id);
    if (!histState.isExpired) {
      const hQ5 = histState.questions.find((q) => q.id === q5.id)!;
      assert(
        hQ5.question === "LIVE EDITED Q5",
        "Historical NULL-snapshot attempt falls back to live question text (compat path)"
      );
      assert(
        hQ5.marks === 2,
        "Historical NULL-snapshot attempt falls back to live marks (compat path)"
      );
      const hTexts = (hQ5.options as { text: string }[]).map((o) => o.text);
      const sortedTexts = [...hTexts].sort();
      assert(
        sortedTexts.length === 4 &&
          JSON.stringify(sortedTexts) ===
            JSON.stringify(["DNS", "HTTP", "TCP", "UDP"]),
        "Historical attempt keeps 7C optionsSnapshot + optionOrder behavior (all 4 options present)"
      );
    }
    await saveAnswer(histStart.attemptId, testStudent.id, q5.id, "opt_1", 10);
    await gradeAttempt(histStart.attemptId, testStudent.id);
    const [gradedHist] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, histStart.attemptId));
    // Live marks: Q5=2, Q6=4 -> total 6; correct Q5 opt_1 (snapshot answer TCP) +2 -> 2/6 = 33%
    assert(
      Number(gradedHist.score) === 33,
      `Historical NULL-snapshot attempt grades with live marks fallback: 33% (got: ${gradedHist.score})`
    );

    // ----------------------------------------------------
    // TEST SUITE 10: SECURITY
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 10: SECURITY ---");
    const secPayload = await getAttemptExamState(secStart.attemptId, testStudent.id);
    if (!secPayload.isExpired) {
      const leaked = secPayload.questions.some(
        (q) => "correctAnswer" in q || "explanation" in q
      );
      assert(!leaked, "SECURITY: active payload strips correctAnswer and explanation");
    }

    let injectedRejected = false;
    try {
      await saveAnswer(secStart.attemptId, testStudent.id, q5.id, "opt_999", 5);
    } catch {
      injectedRejected = true;
    }
    assert(injectedRejected, "Arbitrary injected option identity rejected");

    let crossRejected = false;
    try {
      await saveAnswer(secStart.attemptId, testStudent.id, "00000000-0000-0000-0000-000000000000", "opt_0", 5);
    } catch {
      crossRejected = true;
    }
    assert(crossRejected, "Question not in attempt rejected");

    // Snapshot values cannot be injected: attempt_questions mutation requires server code,
    // and client saveAnswer only writes selectedAnswer/timeSpent
    const [clientWrite] = await db
      .select()
      .from(attemptQuestions)
      .where(
        and(
          eq(attemptQuestions.attemptId, secStart.attemptId),
          eq(attemptQuestions.questionId, q5.id)
        )
      );
    assert(
      clientWrite.questionTextSnapshot !== null &&
        clientWrite.questionTypeSnapshot !== null &&
        clientWrite.marksSnapshot !== null,
      "Snapshot columns remain server-authored (never nulled/overwritten by client writes)"
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

runPhase7C1QuestionSnapshotAudit().catch((err) => {
  console.error("Fatal test failure:", err);
  process.exit(1);
});