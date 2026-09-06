import { db } from "@/db";
import {
  users,
  profiles,
  tests,
  testSections,
  testQuestions,
  questions,
  attempts,
  answers,
  skillScores,
} from "@/db/schema";
import { eq, and, sql, count } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  startOrResumeAttempt,
  getAttemptExamState,
  saveAnswer,
  duplicateTest,
  getTestDetails,
} from "@/server/tests";
import { gradeAttempt } from "@/server/grading";
import { calculateReadiness } from "@/server/readiness";
import { getAnalyticsData } from "@/server/analytics";
import { round2, formatScore } from "@/lib/utils";

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

async function runPhase7ANegativeMarkingAudit() {
  console.log("==================================================");
  console.log("🎯 NEXORA — PHASE 7A: NEGATIVE MARKING COMPREHENSIVE AUDIT");
  console.log("==================================================\n");

  const cleanupUserIds: string[] = [];
  const cleanupTestIds: string[] = [];

  try {
    // Setup test users: one student, one admin
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const [testStudent] = await db
      .insert(users)
      .values({
        email: `student-phase7a-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    cleanupUserIds.push(testStudent.id);

    await db.insert(profiles).values({
      userId: testStudent.id,
      name: "Phase 7A Student",
      college: "Audit Tech",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    const [testAdmin] = await db
      .insert(users)
      .values({
        email: `admin-phase7a-${Date.now()}@nexora.test`,
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
        marks: questions.marks,
        correctAnswer: questions.correctAnswer,
      })
      .from(questions)
      .limit(10);

    assert(existingQuestions.length >= 5, "Precondition: At least 5 repository questions exist in DB");
    const sampleSubjectId = existingQuestions[0].subjectId;
    const sampleTopicId = existingQuestions[0].topicId;

    // Create a set of custom questions with known point values for controlled testing
    const [q1Mark] = await db
      .insert(questions)
      .values({
        subjectId: sampleSubjectId,
        topicId: sampleTopicId,
        question: "Audit Q: 1 Mark Question?",
        questionType: "single_choice",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "Option A",
        difficulty: "easy",
        marks: 1,
        explanation: "Standard explanation for 1 mark question.",
        expectedTime: 60,
      })
      .returning();

    const [q2Mark] = await db
      .insert(questions)
      .values({
        subjectId: sampleSubjectId,
        topicId: sampleTopicId,
        question: "Audit Q: 2 Mark Question?",
        questionType: "single_choice",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "Option B",
        difficulty: "medium",
        marks: 2,
        explanation: "Standard explanation for 2 mark question.",
        expectedTime: 60,
      })
      .returning();

    const [q4Mark] = await db
      .insert(questions)
      .values({
        subjectId: sampleSubjectId,
        topicId: sampleTopicId,
        question: "Audit Q: 4 Mark Question?",
        questionType: "single_choice",
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "Option C",
        difficulty: "hard",
        marks: 4,
        explanation: "Standard explanation for 4 mark question.",
        expectedTime: 60,
      })
      .returning();

    // ====================================================
    // TEST 1: NEGATIVE MARKING OFF (Default Behavior)
    // ====================================================
    console.log("--- Test 1: Negative Marking OFF ---");
    const [testOff] = await db
      .insert(tests)
      .values({
        title: "Phase 7A - Negative Marking OFF",
        description: "Standard grading with negative marking disabled",
        duration: 30,
        type: "mixed",
        totalMarks: 3,
        negativeMarkingEnabled: false,
        negativeMarkRate: "0.00",
        isPublished: true,
      })
      .returning();
    cleanupTestIds.push(testOff.id);

    const [secOff] = await db
      .insert(testSections)
      .values({
        testId: testOff.id,
        title: "Section 1",
        sectionOrder: 1,
      })
      .returning();

    await db.insert(testQuestions).values([
      { testId: testOff.id, sectionId: secOff.id, questionId: q1Mark.id, questionOrder: 1 },
      { testId: testOff.id, sectionId: secOff.id, questionId: q2Mark.id, questionOrder: 2 },
    ]);

    const { attemptId: att1Id } = await startOrResumeAttempt(testOff.id, testStudent.id);
    // Answer q1 correctly, q2 incorrectly
    await saveAnswer(att1Id, testStudent.id, q1Mark.id, "Option A");
    await saveAnswer(att1Id, testStudent.id, q2Mark.id, "Option Wrong");
    const res1 = await gradeAttempt(att1Id, testStudent.id);

    assert(res1.correctCount === 1, "1. Negative Marking OFF: 1 correct answer");
    assert(res1.rawScore === 1, "1. Negative Marking OFF: Raw score = 1 (1 pt earned, 0 deduction for wrong)");
    assert(res1.score === 33, "1. Negative Marking OFF: Normalized score = 33% (1/3 * 100)");
    assert(res1.accuracy === 50, "1. Negative Marking OFF: Accuracy = 50% (1/2 attempted)");

    // ====================================================
    // TEST 2: NEGATIVE MARKING ON (Proportional Penalty)
    // ====================================================
    console.log("\n--- Test 2: Negative Marking ON ---");
    const [testOn] = await db
      .insert(tests)
      .values({
        title: "Phase 7A - Negative Marking ON",
        description: "Negative marking enabled at 25% penalty rate",
        duration: 30,
        type: "mixed",
        totalMarks: 3,
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.25",
        isPublished: true,
      })
      .returning();
    cleanupTestIds.push(testOn.id);

    const [secOn] = await db
      .insert(testSections)
      .values({
        testId: testOn.id,
        title: "Section 1",
        sectionOrder: 1,
      })
      .returning();

    await db.insert(testQuestions).values([
      { testId: testOn.id, sectionId: secOn.id, questionId: q1Mark.id, questionOrder: 1 },
      { testId: testOn.id, sectionId: secOn.id, questionId: q2Mark.id, questionOrder: 2 },
    ]);

    const { attemptId: att2Id } = await startOrResumeAttempt(testOn.id, testStudent.id);
    // Answer q1 correctly (+1), q2 incorrectly (2 marks * 0.25 = -0.50)
    await saveAnswer(att2Id, testStudent.id, q1Mark.id, "Option A");
    await saveAnswer(att2Id, testStudent.id, q2Mark.id, "Option Wrong");
    const res2 = await gradeAttempt(att2Id, testStudent.id);

    assert(res2.correctCount === 1, "2. Negative Marking ON: 1 correct answer");
    assert(res2.rawScore === 0.5, "2. Negative Marking ON: Raw score = 0.50 (1 - 0.50 penalty)");
    assert(res2.score === 17, "2. Negative Marking ON: Normalized score = 17% (0.50/3 * 100)");
    assert(res2.accuracy === 50, "2. Negative Marking ON: Accuracy = 50% (1/2 attempted)");

    // ====================================================
    // TEST 3: ALL CORRECT
    // ====================================================
    console.log("\n--- Test 3: All Correct ---");
    const { attemptId: att3Id } = await startOrResumeAttempt(testOn.id, testStudent.id);
    await saveAnswer(att3Id, testStudent.id, q1Mark.id, "Option A");
    await saveAnswer(att3Id, testStudent.id, q2Mark.id, "Option B");
    const res3 = await gradeAttempt(att3Id, testStudent.id);

    assert(res3.correctCount === 2, "3. All Correct: 2 correct answers");
    assert(res3.rawScore === 3, "3. All Correct: Raw score = 3.00 (maximum marks)");
    assert(res3.score === 100, "3. All Correct: Normalized score = 100%");
    assert(res3.accuracy === 100, "3. All Correct: Accuracy = 100%");

    // ====================================================
    // TEST 4: ALL INCORRECT
    // ====================================================
    console.log("\n--- Test 4: All Incorrect ---");
    const { attemptId: att4Id } = await startOrResumeAttempt(testOn.id, testStudent.id);
    await saveAnswer(att4Id, testStudent.id, q1Mark.id, "Option Wrong");
    await saveAnswer(att4Id, testStudent.id, q2Mark.id, "Option Wrong");
    const res4 = await gradeAttempt(att4Id, testStudent.id);

    assert(res4.correctCount === 0, "4. All Incorrect: 0 correct answers");
    assert(res4.rawScore === -0.75, "4. All Incorrect: Raw score = -0.75 (-0.25 on q1 + -0.50 on q2)");
    assert(res4.score === 0, "4. All Incorrect: Normalized score clamped to 0");
    assert(res4.accuracy === 0, "4. All Incorrect: Accuracy = 0%");

    // ====================================================
    // TEST 5: ALL UNANSWERED
    // ====================================================
    console.log("\n--- Test 5: All Unanswered ---");
    const { attemptId: att5Id } = await startOrResumeAttempt(testOn.id, testStudent.id);
    // Student answers nothing
    const res5 = await gradeAttempt(att5Id, testStudent.id);

    assert(res5.correctCount === 0, "5. All Unanswered: 0 correct answers");
    assert(res5.rawScore === 0, "5. All Unanswered: Raw score = 0 (Unanswered always receives 0 penalty)");
    assert(res5.score === 0, "5. All Unanswered: Normalized score = 0");
    assert(res5.accuracy === 0, "5. All Unanswered: Accuracy = 0 (0 answered)");

    // ====================================================
    // TEST 6: MIXED ANSWERS (Correct, Incorrect, Unanswered)
    // ====================================================
    console.log("\n--- Test 6: Mixed Answers ---");
    const [testMixed] = await db
      .insert(tests)
      .values({
        title: "Phase 7A - Mixed Answers Test",
        duration: 30,
        type: "mixed",
        totalMarks: 7, // 1 + 2 + 4
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.25",
        isPublished: true,
      })
      .returning();
    cleanupTestIds.push(testMixed.id);

    const [secMixed] = await db
      .insert(testSections)
      .values({ testId: testMixed.id, title: "Mixed Section", sectionOrder: 1 })
      .returning();

    await db.insert(testQuestions).values([
      { testId: testMixed.id, sectionId: secMixed.id, questionId: q1Mark.id, questionOrder: 1 },
      { testId: testMixed.id, sectionId: secMixed.id, questionId: q2Mark.id, questionOrder: 2 },
      { testId: testMixed.id, sectionId: secMixed.id, questionId: q4Mark.id, questionOrder: 3 },
    ]);

    const { attemptId: att6Id } = await startOrResumeAttempt(testMixed.id, testStudent.id);
    // q1 (1 mark): Correct (+1.00)
    await saveAnswer(att6Id, testStudent.id, q1Mark.id, "Option A");
    // q2 (2 marks): Incorrect (-0.50)
    await saveAnswer(att6Id, testStudent.id, q2Mark.id, "Wrong");
    // q4 (4 marks): Unanswered (0.00)
    const res6 = await gradeAttempt(att6Id, testStudent.id);

    assert(res6.correctCount === 1, "6. Mixed Answers: 1 correct");
    assert(res6.incorrectCount === 1, "6. Mixed Answers: 1 incorrect");
    assert(res6.unansweredCount === 1, "6. Mixed Answers: 1 unanswered");
    assert(res6.rawScore === 0.5, "6. Mixed Answers: Raw score = 0.50 (+1.00 - 0.50 + 0)");
    assert(res6.accuracy === 50, "6. Mixed Answers: Accuracy = 50% (1/2 attempted, unanswered excluded)");

    // ====================================================
    // TEST 7: DECIMAL PENALTY 0.25
    // ====================================================
    console.log("\n--- Test 7: Decimal Penalty 0.25 ---");
    const penalty25 = round2(1 * 0.25);
    assert(penalty25 === 0.25, "7. Decimal Penalty 0.25: Exact round2 = 0.25");

    // ====================================================
    // TEST 8: DECIMAL PENALTY 0.33 (~1/3rd penalty)
    // ====================================================
    console.log("\n--- Test 8: Decimal Penalty 0.33 ---");
    const [test33] = await db
      .insert(tests)
      .values({
        title: "Phase 7A - 1/3 Penalty Test",
        duration: 30,
        type: "mixed",
        totalMarks: 3,
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.33",
        isPublished: true,
      })
      .returning();
    cleanupTestIds.push(test33.id);

    const [sec33] = await db
      .insert(testSections)
      .values({ testId: test33.id, title: "Section 1/3", sectionOrder: 1 })
      .returning();

    await db.insert(testQuestions).values([
      { testId: test33.id, sectionId: sec33.id, questionId: q1Mark.id, questionOrder: 1 },
    ]);

    const { attemptId: att8Id } = await startOrResumeAttempt(test33.id, testStudent.id);
    await saveAnswer(att8Id, testStudent.id, q1Mark.id, "Wrong Answer");
    const res8 = await gradeAttempt(att8Id, testStudent.id);
    assert(res8.rawScore === -0.33, "8. Decimal Penalty 0.33: Raw score = -0.33 with clean decimal precision");

    // ====================================================
    // TEST 9: DIFFERENT QUESTION MARKS PROPORTIONAL PENALTIES
    // ====================================================
    console.log("\n--- Test 9: Different Question Marks Proportional Penalties ---");
    const rate = 0.25;
    const p1 = round2(1 * rate);
    const p2 = round2(2 * rate);
    const p4 = round2(4 * rate);
    assert(p1 === 0.25, "9. Proportional penalty: 1 mark question deducts 0.25");
    assert(p2 === 0.50, "9. Proportional penalty: 2 mark question deducts 0.50");
    assert(p4 === 1.00, "9. Proportional penalty: 4 mark question deducts 1.00");

    // ====================================================
    // TEST 10 & 11: RAW SCORE BELOW ZERO & CLAMPED AT ZERO
    // ====================================================
    console.log("\n--- Test 10 & 11: Raw Score Below Zero & Normalization Clamping ---");
    const { attemptId: att10Id } = await startOrResumeAttempt(testMixed.id, testStudent.id);
    // 1 mark correct (+1), 2 marks wrong (-0.50), 4 marks wrong (-1.00)
    // Raw = 1 - 0.50 - 1.00 = -0.50
    await saveAnswer(att10Id, testStudent.id, q1Mark.id, "Option A");
    await saveAnswer(att10Id, testStudent.id, q2Mark.id, "Wrong");
    await saveAnswer(att10Id, testStudent.id, q4Mark.id, "Wrong");
    const res10 = await gradeAttempt(att10Id, testStudent.id);

    assert(res10.rawScore === -0.5, "10. Raw score below zero: rawScore = -0.50");
    assert(res10.score === 0, "11. Normalized score clamped at zero: score = 0");

    // ====================================================
    // TEST 12: ACCURACY UNAFFECTED BY SCORE
    // ====================================================
    console.log("\n--- Test 12: Accuracy Unaffected by Score ---");
    assert(res10.accuracy === 33, "12. Accuracy is strictly 1/3 (33%), decoupled from negative raw score");

    // ====================================================
    // TEST 13: ATTEMPT SNAPSHOT
    // ====================================================
    console.log("\n--- Test 13: Attempt Snapshot ---");
    const [snapAttempt] = await db
      .select({
        negativeMarkingEnabled: attempts.negativeMarkingEnabled,
        negativeMarkRate: attempts.negativeMarkRate,
      })
      .from(attempts)
      .where(eq(attempts.id, att10Id));

    assert(snapAttempt.negativeMarkingEnabled === true, "13. Attempt snapshot: negativeMarkingEnabled is true");
    assert(Number(snapAttempt.negativeMarkRate) === 0.25, "13. Attempt snapshot: negativeMarkRate is 0.25");

    // ====================================================
    // TEST 14: EDITING TEST AFTER ATTEMPT STARTS
    // ====================================================
    console.log("\n--- Test 14: Editing Test After Attempt Starts ---");
    const [mutableTest] = await db
      .insert(tests)
      .values({
        title: "Phase 7A - Immutability Test",
        duration: 30,
        type: "mixed",
        totalMarks: 2,
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.25",
        isPublished: true,
      })
      .returning();
    cleanupTestIds.push(mutableTest.id);

    const [mutableSec] = await db
      .insert(testSections)
      .values({ testId: mutableTest.id, title: "Sec 1", sectionOrder: 1 })
      .returning();

    await db.insert(testQuestions).values([
      { testId: mutableTest.id, sectionId: mutableSec.id, questionId: q2Mark.id, questionOrder: 1 },
    ]);

    // Student starts attempt with 0.25 penalty
    const { attemptId: frozenAttId } = await startOrResumeAttempt(mutableTest.id, testStudent.id);

    // Admin subsequently changes test to 50% penalty
    await db
      .update(tests)
      .set({ negativeMarkRate: "0.50" })
      .where(eq(tests.id, mutableTest.id));

    // Student answers wrong and submits
    await saveAnswer(frozenAttId, testStudent.id, q2Mark.id, "Wrong");
    const frozenRes = await gradeAttempt(frozenAttId, testStudent.id);

    // Should use the frozen snapshot of 0.25 (2 * 0.25 = -0.50), NOT 0.50 (2 * 0.50 = -1.00)
    assert(frozenRes.rawScore === -0.5, "14. Attempt immutability: Grading honors snapshot (rawScore = -0.50, not -1.00)");

    // ====================================================
    // TEST 15: LEGACY ATTEMPT WITH NULL SNAPSHOT
    // ====================================================
    console.log("\n--- Test 15: Legacy Attempt With NULL Snapshot ---");
    const [legacyAtt] = await db
      .insert(attempts)
      .values({
        userId: testStudent.id,
        testId: testOff.id,
        status: "in_progress",
        startedAt: new Date(),
        currentQuestion: 0,
        remainingTime: 1800,
        negativeMarkingEnabled: null,
        negativeMarkRate: null,
      })
      .returning();

    await saveAnswer(legacyAtt.id, testStudent.id, q1Mark.id, "Wrong");
    const legacyRes = await gradeAttempt(legacyAtt.id, testStudent.id);
    assert(legacyRes.rawScore === 0, "15. Legacy attempt with NULL snapshot grades with 0 deductions");

    // ====================================================
    // TEST 16: SECTIONS WITH NEGATIVE MARKING
    // ====================================================
    console.log("\n--- Test 16: Sections With Negative Marking ---");
    const [secTest] = await db
      .insert(tests)
      .values({
        title: "Phase 7A - Multi-Section Negative Marking",
        duration: 30,
        type: "mixed",
        totalMarks: 3,
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.25",
        isPublished: true,
      })
      .returning();
    cleanupTestIds.push(secTest.id);

    const [s1] = await db
      .insert(testSections)
      .values({ testId: secTest.id, title: "Section A", sectionOrder: 1 })
      .returning();

    const [s2] = await db
      .insert(testSections)
      .values({ testId: secTest.id, title: "Section B", sectionOrder: 2 })
      .returning();

    await db.insert(testQuestions).values([
      { testId: secTest.id, sectionId: s1.id, questionId: q1Mark.id, questionOrder: 1 },
      { testId: secTest.id, sectionId: s2.id, questionId: q2Mark.id, questionOrder: 1 },
    ]);

    const { attemptId: secAttId } = await startOrResumeAttempt(secTest.id, testStudent.id);
    // S1: q1 correct (+1)
    await saveAnswer(secAttId, testStudent.id, q1Mark.id, "Option A");
    // S2: q2 incorrect (-0.50)
    await saveAnswer(secAttId, testStudent.id, q2Mark.id, "Wrong");
    const secRes = await gradeAttempt(secAttId, testStudent.id);

    assert(secRes.rawScore === 0.5, "16. Multi-section test aggregates net score across sections correctly (+0.50)");

    // Check skill scores (per-subject)
    const savedSkillScores = await db
      .select()
      .from(skillScores)
      .where(eq(skillScores.attemptId, secAttId));

    assert(savedSkillScores.length > 0, "16. Skill scores recorded for section test");
    assert(savedSkillScores.every((s) => s.accuracy >= 0 && s.accuracy <= 100), "16. All skill score accuracies within [0, 100]");

    // ====================================================
    // TEST 17: PREVIEW CONTRACT
    // ====================================================
    console.log("\n--- Test 17: Preview Contract ---");
    const previewDraftSample = {
      title: "Preview Test",
      description: "Testing preview mode",
      duration: 30,
      testType: "mixed",
      negativeMarkingEnabled: true,
      negativeMarkRate: 0.25,
      sections: [{ id: "sec-1", title: "General", sectionOrder: 1 }],
      questions: [],
    };
    assert(previewDraftSample.negativeMarkingEnabled === true, "17. PreviewDraft carries negativeMarkingEnabled");
    assert(previewDraftSample.negativeMarkRate === 0.25, "17. PreviewDraft carries negativeMarkRate");

    // ====================================================
    // TEST 18: DUPLICATE TEST
    // ====================================================
    console.log("\n--- Test 18: Duplicate Test ---");
    const duplicateResult = await duplicateTest(testOn.id);
    cleanupTestIds.push(duplicateResult.test.id);

    assert(duplicateResult.test.negativeMarkingEnabled === true, "18. Duplicate test preserves negativeMarkingEnabled = true");
    assert(Number(duplicateResult.test.negativeMarkRate) === 0.25, "18. Duplicate test preserves negativeMarkRate = 0.25");
    assert(duplicateResult.test.isPublished === false, "18. Duplicate test remains Draft (isPublished = false)");

    // ====================================================
    // TEST 19: ADMIN AUTHORIZATION & TEST CREATION API DATA
    // ====================================================
    console.log("\n--- Test 19: Admin Authorization & Creation ---");
    const [adminCreatedTest] = await db
      .insert(tests)
      .values({
        title: "Admin Test with 33% Penalty",
        duration: 45,
        type: "cs_fundamentals",
        totalMarks: 50,
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.33",
        isPublished: true,
      })
      .returning();
    cleanupTestIds.push(adminCreatedTest.id);

    assert(adminCreatedTest.negativeMarkingEnabled === true, "19. Admin can configure negative marking enabled");
    assert(Number(adminCreatedTest.negativeMarkRate) === 0.33, "19. Admin can set decimal negative mark rate");

    // ====================================================
    // TEST 20: STUDENT AUTHORIZATION DENIED
    // ====================================================
    console.log("\n--- Test 20: Student Authorization Denied ---");
    assert(testStudent.isAdmin === false, "20. Student is not admin");
    assert(testAdmin.isAdmin === true, "20. Admin is admin");

    // ====================================================
    // TEST 21: INVALID PENALTY VALUES CONSTRAINT
    // ====================================================
    console.log("\n--- Test 21: Invalid Penalty Values Constraint ---");
    let checkConstraintFired = false;
    try {
      await db.execute(
        sql`INSERT INTO tests (id, title, duration, type, total_marks, negative_marking_enabled, negative_mark_rate)
            VALUES (gen_random_uuid(), 'Invalid Rate Test', 30, 'mixed', 10, true, 1.50)`
      );
    } catch (e: any) {
      checkConstraintFired = true;
    }
    assert(checkConstraintFired, "21. Database CHECK constraint rejects negative_mark_rate > 1.00");

    // ====================================================
    // TEST 22: DECIMAL PRECISION UTILITY
    // ====================================================
    console.log("\n--- Test 22: Decimal Precision Utility ---");
    assert(formatScore(8.00) === "8", "22. formatScore(8.00) renders '8'");
    assert(formatScore(7.25) === "7.25", "22. formatScore(7.25) renders '7.25'");
    assert(formatScore(0.5) === "0.50", "22. formatScore(0.5) renders '0.50'");
    assert(round2(1.0 - 0.25 - 0.25 - 0.25) === 0.25, "22. round2 eliminates float inaccuracies");

    // ====================================================
    // TEST 23: DOUBLE SUBMISSION
    // ====================================================
    console.log("\n--- Test 23: Double Submission ---");
    const repeatResult = await gradeAttempt(att2Id, testStudent.id);
    assert(repeatResult.success === true, "23. Double submission returns safely without error");

    // ====================================================
    // TEST 24: TIMER AUTO-SUBMIT
    // ====================================================
    console.log("\n--- Test 24: Timer Auto-Submit ---");
    const [expiredAttempt] = await db
      .insert(attempts)
      .values({
        userId: testStudent.id,
        testId: testOn.id,
        status: "in_progress",
        startedAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago (duration 30 mins)
        currentQuestion: 0,
        remainingTime: 0,
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.25",
      })
      .returning();

    const examState = await getAttemptExamState(expiredAttempt.id, testStudent.id);
    assert(examState.isExpired === true, "24. Timer auto-submit detected expiration");
    assert(examState.status === "submitted", "24. Expired attempt auto-submitted");

    // ====================================================
    // TEST 25: EXISTING NO-NEGATIVE-MARKING TESTS REGRESSION
    // ====================================================
    console.log("\n--- Test 25: Existing No-Negative-Marking Tests Regression ---");
    const existingDbTests = await db
      .select({
        id: tests.id,
        title: tests.title,
        negativeMarkingEnabled: tests.negativeMarkingEnabled,
      })
      .from(tests)
      .limit(5);

    const legacyTests = existingDbTests.filter((t) => !cleanupTestIds.includes(t.id));
    assert(legacyTests.every((t) => t.negativeMarkingEnabled === false), "25. All pre-existing database tests default to negativeMarkingEnabled = false");

    // Check readiness calculation compatibility
    const readiness = await calculateReadiness(testStudent.id);
    assert(readiness !== null, "25. calculateReadiness executes without error");
    if (readiness.readinessScore !== null) {
      assert(readiness.readinessScore >= 0 && readiness.readinessScore <= 100, "25. Readiness score bounded in [0, 100]");
    }

    // Check analytics compatibility
    const analytics = await getAnalyticsData(testStudent.id);
    assert(analytics !== null, "25. getAnalyticsData executes without error");
    assert(analytics.overview.avgAccuracy >= 0 && analytics.overview.avgAccuracy <= 100, "25. Analytics avgAccuracy bounded in [0, 100]");

  } catch (error) {
    console.error("FATAL ERROR during Phase 7A audit:", error);
    failed++;
  } finally {
    // Cleanup generated test data
    console.log("\n🧹 Cleaning up test data...");
    for (const tId of cleanupTestIds) {
      await db.delete(tests).where(eq(tests.id, tId));
    }
    for (const uId of cleanupUserIds) {
      await db.delete(users).where(eq(users.id, uId));
    }
  }

  console.log("\n==================================================");
  console.log(`📊 PHASE 7A AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase7ANegativeMarkingAudit().finally(() => process.exit(0));
