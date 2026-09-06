import { db } from "@/db";
import {
  users,
  profiles,
  tests,
  testSections,
  testQuestions,
  attemptQuestions,
  questions,
  attempts,
  answers,
  skillScores,
} from "@/db/schema";
import { eq, and, sql, count, asc, inArray } from "drizzle-orm";
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

async function runPhase7BQuestionRandomizationAudit() {
  console.log("==================================================");
  console.log("🎲 NEXORA — PHASE 7B: QUESTION RANDOMIZATION AUDIT");
  console.log("==================================================\n");

  const cleanupUserIds: string[] = [];
  const cleanupTestIds: string[] = [];
  const cleanupQuestionIds: string[] = [];

  try {
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const [testStudent1] = await db
      .insert(users)
      .values({
        email: `student1-phase7b-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    cleanupUserIds.push(testStudent1.id);

    const [testStudent2] = await db
      .insert(users)
      .values({
        email: `student2-phase7b-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    cleanupUserIds.push(testStudent2.id);

    const [testAdmin] = await db
      .insert(users)
      .values({
        email: `admin-phase7b-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: true,
      })
      .returning();
    cleanupUserIds.push(testAdmin.id);

    // Fetch existing subject and topic
    const existingQuestions = await db
      .select({
        id: questions.id,
        subjectId: questions.subjectId,
        topicId: questions.topicId,
      })
      .from(questions)
      .limit(1);

    assert(existingQuestions.length > 0, "Precondition: Repository questions exist");
    const sampleSubjectId = existingQuestions[0].subjectId;
    const sampleTopicId = existingQuestions[0].topicId;

    // Create 10 custom questions for controlled test fixtures
    const createdQuestions = await db
      .insert(questions)
      .values(
        Array.from({ length: 10 }, (_, i) => ({
          subjectId: sampleSubjectId,
          topicId: sampleTopicId,
          question: `Phase 7B Test Question ${i + 1} - ${Date.now()}`,
          questionType: "single_choice" as const,
          options: ["Option A", "Option B", "Option C", "Option D"],
          correctAnswer: "Option A",
          explanation: `Explanation for Q${i + 1}`,
          marks: 2,
          difficulty: "easy" as const,
        }))
      )
      .returning();

    const qIds = createdQuestions.map((q) => q.id);
    cleanupQuestionIds.push(...qIds);

    // ==========================================
    // TEST SUITE 1: RANDOMIZATION OFF BEHAVIOR
    // ==========================================
    console.log("\n--- TEST SUITE 1: RANDOMIZATION OFF (CANONICAL ORDER) ---");
    const [testRandOff] = await db
      .insert(tests)
      .values({
        title: `Phase 7B Rand OFF Test ${Date.now()}`,
        duration: 30,
        type: "mixed",
        totalMarks: 8,
        isPublished: true,
        randomizeQuestions: false,
      })
      .returning();
    cleanupTestIds.push(testRandOff.id);

    const [secOff1] = await db
      .insert(testSections)
      .values({
        testId: testRandOff.id,
        title: "Section 1",
        sectionOrder: 1,
      })
      .returning();

    await db.insert(testQuestions).values([
      { testId: testRandOff.id, sectionId: secOff1.id, questionId: qIds[0], questionOrder: 1 },
      { testId: testRandOff.id, sectionId: secOff1.id, questionId: qIds[1], questionOrder: 2 },
      { testId: testRandOff.id, sectionId: secOff1.id, questionId: qIds[2], questionOrder: 3 },
      { testId: testRandOff.id, sectionId: secOff1.id, questionId: qIds[3], questionOrder: 4 },
    ]);

    const attemptOff = await startOrResumeAttempt(testRandOff.id, testStudent1.id);
    assert(!attemptOff.isResumed, "Attempt 1 started as fresh attempt");

    const offAttemptQuestions = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, attemptOff.attemptId))
      .orderBy(asc(attemptQuestions.questionOrder));

    assert(offAttemptQuestions.length === 4, "4 attempt_questions rows inserted for rand-off test");
    assert(
      offAttemptQuestions[0].questionId === qIds[0] &&
      offAttemptQuestions[1].questionId === qIds[1] &&
      offAttemptQuestions[2].questionId === qIds[2] &&
      offAttemptQuestions[3].questionId === qIds[3],
      "Randomization OFF preserves canonical question order exactly (Q1, Q2, Q3, Q4)"
    );

    const examStateOff = await getAttemptExamState(attemptOff.attemptId, testStudent1.id);
    if (!examStateOff.isExpired) {
      assert(
        examStateOff.questions.map((q) => q.id).join(",") === [qIds[0], qIds[1], qIds[2], qIds[3]].join(","),
        "getAttemptExamState returns canonical sequence when randomizeQuestions=false"
      );
    } else {
      assert(false, "examStateOff should not be expired");
    }

    // ==========================================
    // TEST SUITE 2: ONE-QUESTION TEST EDGE CASE
    // ==========================================
    console.log("\n--- TEST SUITE 2: ONE-QUESTION TEST ---");
    const [testOneQ] = await db
      .insert(tests)
      .values({
        title: `Phase 7B One-Question Test ${Date.now()}`,
        duration: 10,
        type: "mixed",
        totalMarks: 2,
        isPublished: true,
        randomizeQuestions: true,
      })
      .returning();
    cleanupTestIds.push(testOneQ.id);

    const [secOne] = await db
      .insert(testSections)
      .values({
        testId: testOneQ.id,
        title: "Single Section",
        sectionOrder: 1,
      })
      .returning();

    await db.insert(testQuestions).values([
      { testId: testOneQ.id, sectionId: secOne.id, questionId: qIds[0], questionOrder: 1 },
    ]);

    const attemptOneQ = await startOrResumeAttempt(testOneQ.id, testStudent1.id);
    const oneQRows = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, attemptOneQ.attemptId));

    assert(oneQRows.length === 1, "Single question test successfully creates 1 attempt_questions row");
    assert(oneQRows[0].questionId === qIds[0] && oneQRows[0].questionOrder === 1, "Question order is 1");

    // ==========================================
    // TEST SUITE 3: MULTIPLE SECTIONS & BOUNDARIES
    // ==========================================
    console.log("\n--- TEST SUITE 3: MULTIPLE SECTIONS & SECTION BOUNDARIES ---");
    const [testMultiSec] = await db
      .insert(tests)
      .values({
        title: `Phase 7B Multi-Section Rand Test ${Date.now()}`,
        duration: 45,
        type: "mixed",
        totalMarks: 16,
        isPublished: true,
        randomizeQuestions: true,
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.25",
      })
      .returning();
    cleanupTestIds.push(testMultiSec.id);

    const [secA] = await db
      .insert(testSections)
      .values({
        testId: testMultiSec.id,
        title: "Section A - Aptitude",
        sectionOrder: 1,
      })
      .returning();

    const [secB] = await db
      .insert(testSections)
      .values({
        testId: testMultiSec.id,
        title: "Section B - Core CS",
        sectionOrder: 2,
      })
      .returning();

    const secAQuestionIds = [qIds[0], qIds[1], qIds[2], qIds[3]];
    const secBQuestionIds = [qIds[4], qIds[5], qIds[6], qIds[7]];

    await db.insert(testQuestions).values([
      ...secAQuestionIds.map((qId, i) => ({
        testId: testMultiSec.id,
        sectionId: secA.id,
        questionId: qId,
        questionOrder: i + 1,
      })),
      ...secBQuestionIds.map((qId, i) => ({
        testId: testMultiSec.id,
        sectionId: secB.id,
        questionId: qId,
        questionOrder: i + 1,
      })),
    ]);

    // Student 1 attempt
    const att1 = await startOrResumeAttempt(testMultiSec.id, testStudent1.id);
    const att1Rows = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, att1.attemptId))
      .orderBy(asc(attemptQuestions.questionOrder));

    assert(att1Rows.length === 8, "Attempt 1 has all 8 questions persisted");

    // Check section boundaries
    const att1Sec1Questions = att1Rows.slice(0, 4);
    const att1Sec2Questions = att1Rows.slice(4, 8);

    assert(
      att1Sec1Questions.every((q) => q.sectionId === secA.id),
      "Questions 1-4 belong exclusively to Section A (indices 1..4)"
    );
    assert(
      att1Sec2Questions.every((q) => q.sectionId === secB.id),
      "Questions 5-8 belong exclusively to Section B (indices 5..8)"
    );

    const att1Sec1Ids = new Set(att1Sec1Questions.map((q) => q.questionId));
    const att1Sec2Ids = new Set(att1Sec2Questions.map((q) => q.questionId));

    assert(
      secAQuestionIds.every((id) => att1Sec1Ids.has(id)),
      "Section A questions are a permutation of Section A canonical set (no questions lost/added)"
    );
    assert(
      secBQuestionIds.every((id) => att1Sec2Ids.has(id)),
      "Section B questions are a permutation of Section B canonical set (no questions lost/added)"
    );

    // ==========================================
    // TEST SUITE 4: INDEPENDENT ATTEMPT ORDERINGS
    // ==========================================
    console.log("\n--- TEST SUITE 4: INDEPENDENT ATTEMPT ORDERING ---");
    // Student 2 attempt
    const att2 = await startOrResumeAttempt(testMultiSec.id, testStudent2.id);
    const att2Rows = await db
      .select()
      .from(attemptQuestions)
      .where(eq(attemptQuestions.attemptId, att2.attemptId))
      .orderBy(asc(attemptQuestions.questionOrder));

    assert(att2Rows.length === 8, "Attempt 2 has all 8 questions persisted");

    // Across 5 new attempts, verify shuffling is happening and independent
    const sampleAttempts: string[][] = [];
    for (let k = 0; k < 5; k++) {
      const [tempUser] = await db
        .insert(users)
        .values({
          email: `temp-student-${k}-${Date.now()}@nexora.test`,
          passwordHash,
          isAdmin: false,
        })
        .returning();
      cleanupUserIds.push(tempUser.id);

      const tempAtt = await startOrResumeAttempt(testMultiSec.id, tempUser.id);
      const rows = await db
        .select({ qId: attemptQuestions.questionId })
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, tempAtt.attemptId))
        .orderBy(asc(attemptQuestions.questionOrder));
      sampleAttempts.push(rows.map((r) => r.qId));
    }

    // At least some of the 5 attempts should have different permutations (prob. of all 5 identical on 4!*4!=576 is < 10^-10)
    const distinctOrders = new Set(sampleAttempts.map((order) => order.join(",")));
    assert(
      distinctOrders.size > 1,
      `Independent attempts produce randomized permutations (${distinctOrders.size} distinct orders across sample)`
    );

    // ==========================================
    // TEST SUITE 5: REFRESH / RESUME RETENTION
    // ==========================================
    console.log("\n--- TEST SUITE 5: REFRESH / RESUME QUESTION ORDER IMMUTABILITY ---");
    const resumeCall = await startOrResumeAttempt(testMultiSec.id, testStudent1.id);
    assert(resumeCall.isResumed === true, "startOrResumeAttempt reports isResumed: true for active attempt");
    assert(resumeCall.attemptId === att1.attemptId, "Returned same attemptId");

    const state1 = await getAttemptExamState(att1.attemptId, testStudent1.id);
    const state2 = await getAttemptExamState(att1.attemptId, testStudent1.id);

    if (!state1.isExpired && !state2.isExpired) {
      const order1 = state1.questions.map((q) => q.id).join(",");
      const order2 = state2.questions.map((q) => q.id).join(",");
      assert(order1 === order2, "getAttemptExamState returns identical question sequence across repeated requests");
      assert(
        order1 === att1Rows.map((r) => r.questionId).join(","),
        "Returned sequence matches attempt_questions table order exactly"
      );
    } else {
      assert(false, "States should not be expired");
    }

    // ==========================================
    // TEST SUITE 6: ANSWER PERSISTENCE BY QUESTION ID
    // ==========================================
    console.log("\n--- TEST SUITE 6: ANSWER PERSISTENCE BY QUESTION ID ---");
    // Answer the first question in att1's randomized order
    const firstQInAtt1 = att1Rows[0].questionId;
    await saveAnswer(att1.attemptId, testStudent1.id, firstQInAtt1, "Option A", 15);

    const savedAns1 = await db
      .select()
      .from(answers)
      .where(and(eq(answers.attemptId, att1.attemptId), eq(answers.questionId, firstQInAtt1)));

    assert(savedAns1.length === 1, "Answer saved keyed by questionId");
    assert(savedAns1[0].selectedAnswer === "Option A", "Stored selectedAnswer is correct");

    // Answer the last question in att1's randomized order
    const lastQInAtt1 = att1Rows[7].questionId;
    await saveAnswer(att1.attemptId, testStudent1.id, lastQInAtt1, "Option B", 20);

    const savedAnsLast = await db
      .select()
      .from(answers)
      .where(and(eq(answers.attemptId, att1.attemptId), eq(answers.questionId, lastQInAtt1)));

    assert(savedAnsLast.length === 1, "Second answer saved keyed by its own questionId");
    assert(savedAnsLast[0].selectedAnswer === "Option B", "Stored selectedAnswer is correct");

    // Refresh state and check answers dictionary
    const stateAfterAnswers = await getAttemptExamState(att1.attemptId, testStudent1.id);
    if (!stateAfterAnswers.isExpired) {
      assert(
        stateAfterAnswers.answers[firstQInAtt1]?.selectedAnswer === "Option A",
        "Answers map in exam state returns correct answer for first randomized question"
      );
      assert(
        stateAfterAnswers.answers[lastQInAtt1]?.selectedAnswer === "Option B",
        "Answers map in exam state returns correct answer for last randomized question"
      );
    }

    // ==========================================
    // TEST SUITE 7: GRADING INVARIANT & NEGATIVE MARKING
    // ==========================================
    console.log("\n--- TEST SUITE 7: GRADING & NEGATIVE MARKING INVARIANT ---");
    // Submit att1:
    // firstQInAtt1 answered with "Option A" (Correct -> +2 marks)
    // lastQInAtt1 answered with "Option B" (Incorrect -> penalty 25% of 2 marks = -0.50 marks)
    // other 6 questions unanswered -> 0 marks
    // Expected raw score: 2.0 - 0.50 = 1.50 marks.
    // Expected accuracy: 1 correct / 2 attempted = 50.0%
    const gradeResult = await gradeAttempt(att1.attemptId, testStudent1.id);
    assert(gradeResult.success === true, "gradeAttempt completes successfully");

    const [gradedAttempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, att1.attemptId));

    assert(gradedAttempt.status === "submitted", "Attempt status changed to submitted");
    assert(gradeResult.rawScore === 1.5, `Raw score is accurately computed as 1.50 (got ${gradeResult.rawScore})`);
    assert(gradedAttempt.score === 9, `Normalized score is accurately computed as 9% (1.5/16*100) (got ${gradedAttempt.score})`);
    assert(gradedAttempt.accuracy === 50, `Accuracy is accurately computed as 50% (got ${gradedAttempt.accuracy}%)`);

    // ==========================================
    // TEST SUITE 8: DUPLICATE TEST PRESERVES randomizeQuestions
    // ==========================================
    console.log("\n--- TEST SUITE 8: DUPLICATE TEST ---");
    const dupResult = await duplicateTest(testMultiSec.id);
    assert(dupResult.test.randomizeQuestions === true, "Duplicated test inherits randomizeQuestions=true");
    assert(dupResult.test.isPublished === false, "Duplicated test is in Draft mode");
    assert(dupResult.test.id !== testMultiSec.id, "Duplicated test receives fresh UUID");
    cleanupTestIds.push(dupResult.test.id);

    // Verify attempt_questions are NOT duplicated
    const dupAttemptQs = await db
      .select({ count: count() })
      .from(attemptQuestions)
      .innerJoin(attempts, eq(attemptQuestions.attemptId, attempts.id))
      .where(eq(attempts.testId, dupResult.test.id));

    assert(Number(dupAttemptQs[0]?.count || 0) === 0, "No attempt_questions exist for newly duplicated test");

    // ==========================================
    // TEST SUITE 9: LEGACY ATTEMPTS HYBRID RESOLVER FALLBACK
    // ==========================================
    console.log("\n--- TEST SUITE 9: LEGACY ATTEMPTS FALLBACK ---");
    // Create an attempt manually without attempt_questions
    const [legacyAttempt] = await db
      .insert(attempts)
      .values({
        userId: testStudent2.id,
        testId: testRandOff.id,
        status: "in_progress",
        startedAt: new Date(),
        currentQuestion: 0,
        remainingTime: 1800,
      })
      .returning();

    const legacyState = await getAttemptExamState(legacyAttempt.id, testStudent2.id);
    if (!legacyState.isExpired) {
      assert(legacyState.questions.length === 4, "Legacy attempt loads 4 questions via fallback to test_questions");
      assert(
        legacyState.questions[0].id === qIds[0] &&
        legacyState.questions[1].id === qIds[1] &&
        legacyState.questions[2].id === qIds[2] &&
        legacyState.questions[3].id === qIds[3],
        "Legacy attempt preserves canonical test_questions order"
      );
    } else {
      assert(false, "legacyState should not be expired");
    }

    // ==========================================
    // TEST SUITE 10: SECURITY & BOUNDARY GUARDS
    // ==========================================
    console.log("\n--- TEST SUITE 10: SECURITY & BOUNDARY GUARDS ---");
    // Student 2 cannot read Student 1's attempt
    let accessDenied = false;
    try {
      await getAttemptExamState(att1.attemptId, testStudent2.id);
    } catch {
      accessDenied = true;
    }
    assert(accessDenied, "Access denied when user requests another user's attempt state");

    // Student 1 cannot edit submitted attempt
    let editSubmittedDenied = false;
    try {
      await saveAnswer(att1.attemptId, testStudent1.id, firstQInAtt1, "Option C", 10);
    } catch {
      editSubmittedDenied = true;
    }
    assert(editSubmittedDenied, "Cannot save answers to an already submitted attempt");

    // Verify answers never expose correctAnswer in getAttemptExamState
    const studentState = await getAttemptExamState(legacyAttempt.id, testStudent2.id);
    if (!studentState.isExpired) {
      const exposesAnswer = studentState.questions.some((q: Record<string, unknown>) => "correctAnswer" in q || "explanation" in q);
      assert(!exposesAnswer, "Exam state strictly strips correctAnswer and explanation");
    }

    // ==========================================
    // TEST SUITE 11: AUTO-SUBMIT ON EXPIRED TIMER & DOUBLE-SUBMIT
    // ==========================================
    console.log("\n--- TEST SUITE 11: AUTO-SUBMIT & DOUBLE SUBMIT ---");
    // Simulate expired attempt
    const [expiredAttempt] = await db
      .insert(attempts)
      .values({
        userId: testStudent2.id,
        testId: testOneQ.id,
        status: "in_progress",
        startedAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago (duration is 10 mins)
        currentQuestion: 0,
        remainingTime: 0,
      })
      .returning();

    const expiredState = await getAttemptExamState(expiredAttempt.id, testStudent2.id);
    assert(expiredState.isExpired === true, "getAttemptExamState detects expired timer");
    assert(expiredState.status === "submitted", "Expired attempt auto-submits");

    // Double submit guard
    const doubleGradeResult = await gradeAttempt(expiredAttempt.id, testStudent2.id);
    assert(doubleGradeResult.status === "submitted", "Double grade attempt returns gracefully without error");

  } finally {
    // Teardown test records
    console.log("\n🧹 Cleaning up Phase 7B audit test fixtures...");
    for (const tId of cleanupTestIds) {
      await db.delete(attemptQuestions).where(
        sql`${attemptQuestions.attemptId} IN (SELECT id FROM ${attempts} WHERE ${attempts.testId} = ${tId})`
      );
      await db.delete(answers).where(
        sql`${answers.attemptId} IN (SELECT id FROM ${attempts} WHERE ${attempts.testId} = ${tId})`
      );
      await db.delete(skillScores).where(
        sql`${skillScores.attemptId} IN (SELECT id FROM ${attempts} WHERE ${attempts.testId} = ${tId})`
      );
      await db.delete(attempts).where(eq(attempts.testId, tId));
      await db.delete(testQuestions).where(eq(testQuestions.testId, tId));
      await db.delete(testSections).where(eq(testSections.testId, tId));
      await db.delete(tests).where(eq(tests.id, tId));
    }

    if (cleanupQuestionIds.length > 0) {
      await db.delete(questions).where(inArray(questions.id, cleanupQuestionIds));
    }

    for (const uId of cleanupUserIds) {
      await db.delete(profiles).where(eq(profiles.userId, uId));
      await db.delete(users).where(eq(users.id, uId));
    }
  }

  console.log("\n==================================================");
  console.log(`Phase 7B Audit Summary: ${passed} Passed, ${failed} Failed`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase7BQuestionRandomizationAudit().catch((err) => {
  console.error("Phase 7B audit threw unexpected error:", err);
  process.exit(1);
});
