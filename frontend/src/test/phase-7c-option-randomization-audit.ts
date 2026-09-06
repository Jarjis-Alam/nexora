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
  duplicateTest,
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

async function runPhase7COptionRandomizationAudit() {
  console.log("==================================================");
  console.log("🔀 NEXORA — PHASE 7C: OPTION RANDOMIZATION AUDIT");
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
        email: `student-phase7c-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    cleanupUserIds.push(testStudent.id);

    // Fetch existing subject and topic from repository
    const existingQuestions = await db
      .select({
        subjectId: questions.subjectId,
        topicId: questions.topicId,
      })
      .from(questions)
      .limit(1);

    const subjectId = existingQuestions[0].subjectId;
    const topicId = existingQuestions[0].topicId;

    // Create 4 Questions with distinct options and known correct answers
    const createdQuestions = [];
    for (let i = 1; i <= 4; i++) {
      const [q] = await db
        .insert(questions)
        .values({
          subjectId,
          topicId,
          question: `Question ${i}: Which protocol is connection-oriented?`,
          questionType: "single_choice",
          options: ["UDP", "TCP", "HTTP", "DNS"],
          correctAnswer: "TCP", // canonical index 1 -> opt_1
          explanation: "TCP establishes a reliable connection.",
          marks: 4,
          difficulty: "easy",
          expectedTime: 60,
        })
        .returning();
      createdQuestions.push(q);
      cleanupQuestionIds.push(q.id);
    }

    // ----------------------------------------------------
    // TEST SUITE 1: DATA MODEL & DEFAULT VALUES
    // ----------------------------------------------------
    console.log("--- TEST SUITE 1: DATA MODEL & DEFAULT VALUES ---");
    const [defaultTest] = await db
      .insert(tests)
      .values({
        title: `Default Test ${Date.now()}`,
        duration: 30,
        type: "mixed",
        difficulty: "easy",
        totalMarks: 16,
        isPublished: true,
      })
      .returning();
    cleanupTestIds.push(defaultTest.id);

    assert(
      defaultTest.randomizeOptions === false,
      "tests.randomizeOptions defaults to false"
    );
    assert(
      defaultTest.randomizeQuestions === false,
      "tests.randomizeQuestions defaults to false"
    );

    // ----------------------------------------------------
    // TEST SUITE 2: CANONICAL PRESERVATION (randomizeOptions = false)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 2: CANONICAL PRESERVATION (randomizeOptions = false) ---");
    const [sec1] = await db
      .insert(testSections)
      .values({
        testId: defaultTest.id,
        title: "Section 1",
        sectionOrder: 1,
      })
      .returning();

    await db.insert(testQuestions).values(
      createdQuestions.map((q, idx) => ({
        testId: defaultTest.id,
        sectionId: sec1.id,
        questionId: q.id,
        questionOrder: idx + 1,
      }))
    );

    const startResCanonical = await startOrResumeAttempt(defaultTest.id, testStudent.id);
    const attQsCanonical = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, startResCanonical.attemptId))
      .orderBy(asc(attemptQuestions.questionOrder));

    assert(attQsCanonical.length === 4, "4 attempt_questions generated");
    const firstQOptOrder = attQsCanonical[0].optionOrder as string[];
    assert(
      JSON.stringify(firstQOptOrder) === JSON.stringify(["opt_0", "opt_1", "opt_2", "opt_3"]),
      "randomizeOptions=false preserves canonical optionOrder: ['opt_0', 'opt_1', 'opt_2', 'opt_3']"
    );
    assert(
      Array.isArray(attQsCanonical[0].optionsSnapshot) &&
        (attQsCanonical[0].optionsSnapshot as string[]).length === 4,
      "optionsSnapshot correctly recorded"
    );
    assert(
      attQsCanonical[0].correctAnswerSnapshot === "TCP",
      "correctAnswerSnapshot correctly recorded"
    );

    // ----------------------------------------------------
    // TEST SUITE 3: OPTION RANDOMIZATION (randomizeOptions = true)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 3: OPTION RANDOMIZATION (randomizeOptions = true) ---");
    const [randomOptTest] = await db
      .insert(tests)
      .values({
        title: `Random Options Test ${Date.now()}`,
        duration: 30,
        type: "mixed",
        difficulty: "easy",
        totalMarks: 16,
        randomizeOptions: true,
        randomizeQuestions: false,
        isPublished: true,
      })
      .returning();
    cleanupTestIds.push(randomOptTest.id);

    const [secRand] = await db
      .insert(testSections)
      .values({
        testId: randomOptTest.id,
        title: "Section 1",
        sectionOrder: 1,
      })
      .returning();

    await db.insert(testQuestions).values(
      createdQuestions.map((q, idx) => ({
        testId: randomOptTest.id,
        sectionId: secRand.id,
        questionId: q.id,
        questionOrder: idx + 1,
      }))
    );

    const startResRandom = await startOrResumeAttempt(randomOptTest.id, testStudent.id);
    const attQsRandom = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, startResRandom.attemptId))
      .orderBy(asc(attemptQuestions.questionOrder));

    let allValidPermutations = true;
    for (const aq of attQsRandom) {
      const order = aq.optionOrder as string[];
      if (
        !Array.isArray(order) ||
        order.length !== 4 ||
        new Set(order).size !== 4 ||
        !["opt_0", "opt_1", "opt_2", "opt_3"].every((id) => order.includes(id))
      ) {
        allValidPermutations = false;
      }
    }
    assert(
      allValidPermutations,
      "Every randomized question has a valid, bijective 4-option permutation with no duplicates or omissions"
    );

    // ----------------------------------------------------
    // TEST SUITE 4: ACTIVE EXAM PAYLOAD & STABLE IDENTITY
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 4: ACTIVE EXAM PAYLOAD & STABLE IDENTITY ---");
    const examState = await getAttemptExamState(startResRandom.attemptId, testStudent.id);
    assert(!examState.isExpired, "Exam state is not expired");
    if (!examState.isExpired) {
      const examQ1 = examState.questions[0];
      assert(
        Array.isArray(examQ1.options) && examQ1.options.length === 4,
        "Exam state exposes exactly 4 options"
      );
      const firstOpt = examQ1.options[0] as { id: string; text: string };
      assert(
        typeof firstOpt === "object" && "id" in firstOpt && "text" in firstOpt,
        "Exam state options are structured as { id, text }"
      );
      assert(
        firstOpt.id.startsWith("opt_"),
        `Option identity is synthetic canonical ('${firstOpt.id}')`
      );
      assert(
        !("correctAnswer" in examQ1) && !("explanation" in examQ1),
        "SECURITY: correctAnswer and explanation are completely hidden from active exam payload"
      );
    }

    // ----------------------------------------------------
    // TEST SUITE 5: RESUME & REFRESH IMMUTABILITY
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 5: RESUME & REFRESH IMMUTABILITY ---");
    const resumeRes = await startOrResumeAttempt(randomOptTest.id, testStudent.id);
    assert(resumeRes.isResumed === true, "startOrResumeAttempt returns isResumed: true");
    assert(
      resumeRes.attemptId === startResRandom.attemptId,
      "Resume returns the same attemptId"
    );

    const examStateResumed = await getAttemptExamState(resumeRes.attemptId, testStudent.id);
    if (!examState.isExpired && !examStateResumed.isExpired) {
      const originalOptionsQ1 = examState.questions[0].options;
      const resumedOptionsQ1 = examStateResumed.questions[0].options;
      assert(
        JSON.stringify(originalOptionsQ1) === JSON.stringify(resumedOptionsQ1),
        "Option presentation order is identical and frozen across resumes/refreshes"
      );
    }

    // ----------------------------------------------------
    // TEST SUITE 6: ANSWER PERSISTENCE & GRADING INVARIANCE
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 6: ANSWER PERSISTENCE & GRADING INVARIANCE ---");
    // Canonical correct answer is "TCP" which is at index 1 -> "opt_1"
    const q1 = createdQuestions[0];
    const q2 = createdQuestions[1];

    // Student answers Q1 with opt_1 (CORRECT), Q2 with opt_0 ("UDP", INCORRECT)
    await saveAnswer(startResRandom.attemptId, testStudent.id, q1.id, "opt_1", 10);
    await saveAnswer(startResRandom.attemptId, testStudent.id, q2.id, "opt_0", 15);

    // Verify answers stored in DB
    const savedAnsRows = await db
      .select()
      .from(answers)
      .where(eq(answers.attemptId, startResRandom.attemptId));
    assert(
      savedAnsRows.some((a) => a.questionId === q1.id && a.selectedAnswer === "opt_1"),
      "Student selected answer persisted as stable canonical identity 'opt_1' (NOT display letter or display index)"
    );

    // Grade the attempt
    await gradeAttempt(startResRandom.attemptId, testStudent.id);

    const [gradedAttempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, startResRandom.attemptId));

    assert(gradedAttempt.status === "submitted", "Attempt successfully graded and marked submitted");
    // 1 correct (4 marks out of 16 total marks -> normalized score: 25)
    assert(
      Number(gradedAttempt.score) === 25,
      `Normalized score is exactly 25% (got: ${gradedAttempt.score})`
    );
    assert(
      Number(gradedAttempt.accuracy) === 50,
      `Accuracy is 50% (1/2 attempted correct, got: ${gradedAttempt.accuracy})`
    );

    // ----------------------------------------------------
    // TEST SUITE 7: IMMUTABILITY AGAINST ADMIN QUESTION BANK EDITS
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 7: IMMUTABILITY AGAINST ADMIN QUESTION BANK EDITS ---");
    // Admin mutates the Question Bank: changes question text, options, and correct answer
    await db
      .update(questions)
      .set({
        question: "MUTATED QUESTION TEXT",
        options: ["QUIC", "SCTP", "DCCP", "RSVP"],
        correctAnswer: "QUIC",
      })
      .where(eq(questions.id, q1.id));

    // Inspect attempt_questions for this attempt: optionsSnapshot & correctAnswerSnapshot should protect it
    const [q1AttemptRow] = await db
      .select()
      .from(attemptQuestions)
      .where(
        and(
          eq(attemptQuestions.attemptId, startResRandom.attemptId),
          eq(attemptQuestions.questionId, q1.id)
        )
      );

    assert(
      q1AttemptRow.correctAnswerSnapshot === "TCP",
      "Historical correctAnswerSnapshot remained 'TCP' despite Question Bank edit"
    );
    assert(
      JSON.stringify(q1AttemptRow.optionsSnapshot) === JSON.stringify(["UDP", "TCP", "HTTP", "DNS"]),
      "Historical optionsSnapshot remained ['UDP', 'TCP', 'HTTP', 'DNS'] despite Question Bank edit"
    );

    // ----------------------------------------------------
    // TEST SUITE 8: NEGATIVE MARKING INTERACTION (Phase 7A + Phase 7C)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 8: NEGATIVE MARKING INTERACTION (Phase 7A + Phase 7C) ---");
    const [negMarkTest] = await db
      .insert(tests)
      .values({
        title: `Negative Marking + Random Options Test ${Date.now()}`,
        duration: 30,
        type: "mixed",
        difficulty: "easy",
        totalMarks: 8,
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.25",
        randomizeOptions: true,
        randomizeQuestions: true,
        isPublished: true,
      })
      .returning();
    cleanupTestIds.push(negMarkTest.id);

    const [negSec] = await db
      .insert(testSections)
      .values({
        testId: negMarkTest.id,
        title: "Section 1",
        sectionOrder: 1,
      })
      .returning();

    // Use Q3 and Q4 (unmutated)
    await db.insert(testQuestions).values([
      { testId: negMarkTest.id, sectionId: negSec.id, questionId: createdQuestions[2].id, questionOrder: 1 },
      { testId: negMarkTest.id, sectionId: negSec.id, questionId: createdQuestions[3].id, questionOrder: 2 },
    ]);

    const negAttemptRes = await startOrResumeAttempt(negMarkTest.id, testStudent.id);
    // Student answers Q3 with opt_1 (CORRECT, +4 marks) and Q4 with opt_2 (INCORRECT, -1 mark: 4 * 0.25)
    await saveAnswer(negAttemptRes.attemptId, testStudent.id, createdQuestions[2].id, "opt_1", 10);
    await saveAnswer(negAttemptRes.attemptId, testStudent.id, createdQuestions[3].id, "opt_2", 10);

    await gradeAttempt(negAttemptRes.attemptId, testStudent.id);
    const [negGraded] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, negAttemptRes.attemptId));

    assert(
      Number(negGraded.score) === 38,
      `Negative marking score correctly calculated (+4 - 1 = 3.00 out of 8 total -> 38%, got: ${negGraded.score}%) with randomized options`
    );

    // ----------------------------------------------------
    // TEST SUITE 9: ALL FOUR COMBINATIONS (Phase 7B + 7C Independence)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 9: ALL FOUR COMBINATIONS (Phase 7B + 7C Independence) ---");
    const combos = [
      { qRand: false, optRand: false, name: "OFF / OFF" },
      { qRand: true, optRand: false, name: "ON / OFF" },
      { qRand: false, optRand: true, name: "OFF / ON" },
      { qRand: true, optRand: true, name: "ON / ON" },
    ];

    for (const combo of combos) {
      const [comboTest] = await db
        .insert(tests)
        .values({
          title: `Combo ${combo.name} ${Date.now()}`,
          duration: 30,
          type: "mixed",
          difficulty: "easy",
          totalMarks: 8,
          randomizeQuestions: combo.qRand,
          randomizeOptions: combo.optRand,
          isPublished: true,
        })
        .returning();
      cleanupTestIds.push(comboTest.id);

      const [cSec] = await db
        .insert(testSections)
        .values({ testId: comboTest.id, title: "S1", sectionOrder: 1 })
        .returning();

      await db.insert(testQuestions).values([
        { testId: comboTest.id, sectionId: cSec.id, questionId: createdQuestions[2].id, questionOrder: 1 },
        { testId: comboTest.id, sectionId: cSec.id, questionId: createdQuestions[3].id, questionOrder: 2 },
      ]);

      const cAtt = await startOrResumeAttempt(comboTest.id, testStudent.id);
      const cRows = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, cAtt.attemptId));

      assert(cRows.length === 2, `Combination [${combo.name}] successfully initialized 2 attempt questions`);
      if (!combo.optRand) {
        assert(
          JSON.stringify(cRows[0].optionOrder) === JSON.stringify(["opt_0", "opt_1", "opt_2", "opt_3"]),
          `Combination [${combo.name}] preserves canonical optionOrder`
        );
      }
    }

    // ----------------------------------------------------
    // TEST SUITE 10: HISTORICAL ATTEMPT COMPATIBILITY (Hybrid Resolver)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 10: HISTORICAL ATTEMPT COMPATIBILITY (Hybrid Resolver) ---");
    // Simulate legacy attempt with NO attempt_questions and text-based selectedAnswer
    const [legacyAttempt] = await db
      .insert(attempts)
      .values({
        userId: testStudent.id,
        testId: defaultTest.id,
        status: "in_progress",
        startedAt: new Date(),
        currentQuestion: 0,
        remainingTime: 1800,
      })
      .returning();

    // Student saved answer using legacy plain text "TCP"
    await db.insert(answers).values({
      attemptId: legacyAttempt.id,
      questionId: createdQuestions[2].id,
      selectedAnswer: "TCP",
      timeSpent: 20,
    });

    await gradeAttempt(legacyAttempt.id, testStudent.id);
    const [gradedLegacy] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, legacyAttempt.id));

    assert(
      Number(gradedLegacy.score) === 25,
      `Historical attempt with text answer graded correctly (score: ${gradedLegacy.score}%) without attempt_questions`
    );

    // ----------------------------------------------------
    // TEST SUITE 11: SECURITY (Option Tampering Rejection)
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 11: SECURITY (Option Tampering Rejection) ---");
    const secAttempt = await startOrResumeAttempt(randomOptTest.id, testStudent.id);

    // Rejection 1: Arbitrary injected option identity
    let injectedRejected = false;
    try {
      await saveAnswer(secAttempt.attemptId, testStudent.id, q2.id, "opt_999", 5);
    } catch {
      injectedRejected = true;
    }
    assert(injectedRejected, "Arbitrary injected option identity 'opt_999' rejected");

    // Rejection 2: Malformed option identity
    let malformedRejected = false;
    try {
      await saveAnswer(secAttempt.attemptId, testStudent.id, q2.id, "opt_malformed_xyz", 5);
    } catch {
      malformedRejected = true;
    }
    assert(malformedRejected, "Malformed option identity 'opt_malformed_xyz' rejected");

    // Rejection 3: Question from another test
    let crossQuestionRejected = false;
    try {
      await saveAnswer(secAttempt.attemptId, testStudent.id, "00000000-0000-0000-0000-000000000000", "opt_0", 5);
    } catch {
      crossQuestionRejected = true;
    }
    assert(crossQuestionRejected, "Question not in attempt rejected");

    // ----------------------------------------------------
    // TEST SUITE 12: DUPLICATE TEST PRESERVES randomizeOptions
    // ----------------------------------------------------
    console.log("\n--- TEST SUITE 12: DUPLICATE TEST PRESERVES randomizeOptions ---");
    const dupRes = await duplicateTest(randomOptTest.id);
    assert(dupRes.test.randomizeOptions === true, "duplicateTest copies randomizeOptions: true");
    assert(dupRes.test.isPublished === false, "duplicateTest sets isPublished: false (Draft)");
    cleanupTestIds.push(dupRes.test.id);

  } catch (error) {
    console.error("Audit encounter unexpected fatal error:", error);
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

runPhase7COptionRandomizationAudit().catch((err) => {
  console.error("Fatal test failure:", err);
  process.exit(1);
});
