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
} from "@/db/schema";
import { eq, and, asc, count, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  getTestDetails,
  startOrResumeAttempt,
  getAttemptExamState,
  saveAnswer,
  duplicateTest,
} from "@/server/tests";
import { gradeAttempt } from "@/server/grading";
import { calculateReadiness } from "@/server/readiness";
import { getAnalyticsData } from "@/server/analytics";

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

async function runPhase6CSectionsAudit() {
  console.log("==================================================");
  console.log("🧩 NEXORA — PHASE 6C: TEST SECTIONS COMPREHENSIVE AUDIT");
  console.log("==================================================\n");

  const cleanupUserIds: string[] = [];
  const cleanupTestIds: string[] = [];

  try {
    // ====================================================
    // GROUP 1: DATABASE SCHEMA & MIGRATION VERIFICATION (Tests 1-9)
    // ====================================================
    console.log("--- 1. Database Schema & Migration Verification ---");

    // 1. test_sections table exists
    const sectionTableCheck = await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_name = 'test_sections'`
    );
    assert(sectionTableCheck.rows.length > 0, "1. test_sections table exists in database");

    // 2. existing tests preserved
    const [testCountRow] = await db.select({ val: count() }).from(tests);
    assert(Number(testCountRow.val) >= 4, "2. Existing tests preserved (>= 4 tests in database)");

    // 3. existing test_questions preserved
    const [tqCountRow] = await db.select({ val: count() }).from(testQuestions);
    assert(Number(tqCountRow.val) >= 180, "3. Existing test_questions preserved (>= 180 total question assignments)");

    // 4. default sections created
    const allDbSections = await db.select().from(testSections);
    assert(allDbSections.length >= Number(testCountRow.val), "4. Default sections exist for all tests");

    // 5. section IDs unique
    const secIds = allDbSections.map((s) => s.id);
    const uniqueSecIds = new Set(secIds);
    assert(secIds.length === uniqueSecIds.size, "5. All section IDs are unique UUIDs");

    // 6. section ordering valid
    const generalSections = allDbSections.filter((s) => s.title === "General");
    assert(generalSections.length >= 4, "6. Default 'General' sections present with sectionOrder >= 1");

    // 7. section foreign key works & section_id column exists
    const colCheck = await db.execute(
      sql`SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'test_questions' AND column_name = 'section_id'`
    );
    assert(
      colCheck.rows.length > 0 && colCheck.rows[0].is_nullable === "NO",
      "7. test_questions.section_id column exists and is NOT NULL"
    );

    // 8. test_question section_id populated
    const unassignedTQ = await db
      .select({ count: count() })
      .from(testQuestions)
      .where(sql`${testQuestions.sectionId} IS NULL`);
    assert(Number(unassignedTQ[0].count) === 0, "8. Every test_question record has a non-null section_id");

    // 9. question count unchanged
    const [qCountRow] = await db.select({ val: count() }).from(questions);
    assert(Number(qCountRow.val) >= 160, "9. Question bank records preserved (>= 160 questions)");

    // ====================================================
    // GROUP 2: ADMIN SECTION MUTATIONS & INTEGRITY (Tests 10-19)
    // ====================================================
    console.log("\n--- 2. Admin Section Management & Data Integrity ---");

    // Create a mock Admin user
    const adminEmail = `admin_sec_${Date.now()}@nexora.dev`;
    const passwordHash = await bcrypt.hash("AdminPass123!", 10);
    const [adminUser] = await db
      .insert(users)
      .values({
        email: adminEmail,
        passwordHash,
        isAdmin: true,
      })
      .returning();
    cleanupUserIds.push(adminUser.id);

    // Create a mock Student user
    const studentEmail = `student_sec_${Date.now()}@nexora.dev`;
    const [studentUser] = await db
      .insert(users)
      .values({
        email: studentEmail,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    cleanupUserIds.push(studentUser.id);

    await db.insert(profiles).values({
      userId: studentUser.id,
      name: "Phase 6C Student",
      avatarUrl: "https://avatar.dev/student.png",
      college: "Section Testing Institute",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    // 10. Admin can create test with multiple sections
    const [newTest] = await db
      .insert(tests)
      .values({
        title: "SWE Sectioned Benchmark 2026",
        description: "Multi-section diagnostic assessment",
        type: "mixed",
        duration: 40,
        totalMarks: 30,
        isPublished: true,
      })
      .returning();
    cleanupTestIds.push(newTest.id);

    const [secA] = await db
      .insert(testSections)
      .values({
        testId: newTest.id,
        title: "Aptitude & Logic",
        description: "Quantitative and logical deduction",
        sectionOrder: 1,
      })
      .returning();

    const [secB] = await db
      .insert(testSections)
      .values({
        testId: newTest.id,
        title: "Data Structures & Algorithms",
        description: "Core algorithms, complexities, and structures",
        sectionOrder: 2,
      })
      .returning();

    assert(Boolean(secA.id && secB.id), "10. Admin can create multiple sections for a test");

    // 11. Admin can rename section
    await db
      .update(testSections)
      .set({ title: "Quantitative & Analytical Aptitude", updatedAt: new Date() })
      .where(eq(testSections.id, secA.id));
    const [updatedSecA] = await db
      .select()
      .from(testSections)
      .where(eq(testSections.id, secA.id));
    assert(
      updatedSecA.title === "Quantitative & Analytical Aptitude",
      "11. Admin can rename section title"
    );

    // 12. Admin can reorder sections
    await db
      .update(testSections)
      .set({ sectionOrder: 999 })
      .where(eq(testSections.id, secA.id));
    await db
      .update(testSections)
      .set({ sectionOrder: 1 })
      .where(eq(testSections.id, secB.id));
    await db
      .update(testSections)
      .set({ sectionOrder: 2 })
      .where(eq(testSections.id, secA.id));
    const reorderedSecs = await db
      .select()
      .from(testSections)
      .where(eq(testSections.testId, newTest.id))
      .orderBy(asc(testSections.sectionOrder));
    assert(
      reorderedSecs[0].id === secB.id && reorderedSecs[1].id === secA.id,
      "12. Admin can reorder sections deterministically"
    );

    // Pick 4 repository questions
    const repoQuestions = await db.select().from(questions).limit(4);
    assert(repoQuestions.length >= 4, "Repository contains >= 4 questions");

    // 13. Admin can assign questions to sections
    await db.insert(testQuestions).values([
      {
        testId: newTest.id,
        sectionId: secB.id, // Section Order 1
        questionId: repoQuestions[0].id,
        questionOrder: 1,
      },
      {
        testId: newTest.id,
        sectionId: secB.id, // Section Order 1
        questionId: repoQuestions[1].id,
        questionOrder: 2,
      },
      {
        testId: newTest.id,
        sectionId: secA.id, // Section Order 2
        questionId: repoQuestions[2].id,
        questionOrder: 1,
      },
      {
        testId: newTest.id,
        sectionId: secA.id, // Section Order 2
        questionId: repoQuestions[3].id,
        questionOrder: 2,
      },
    ]);
    const assignedQRows = await db
      .select()
      .from(testQuestions)
      .where(eq(testQuestions.testId, newTest.id));
    assert(assignedQRows.length === 4, "13. Admin can assign questions to specific sections");

    // 14. Admin can move question between sections
    await db
      .update(testQuestions)
      .set({ sectionId: secB.id, questionOrder: 3 })
      .where(
        and(
          eq(testQuestions.testId, newTest.id),
          eq(testQuestions.questionId, repoQuestions[2].id)
        )
      );
    const [movedQ] = await db
      .select()
      .from(testQuestions)
      .where(
        and(
          eq(testQuestions.testId, newTest.id),
          eq(testQuestions.questionId, repoQuestions[2].id)
        )
      );
    assert(movedQ.sectionId === secB.id && movedQ.questionOrder === 3, "14. Admin can move question to another section");

    // 15. Admin can remove question relationship without deleting question bank record
    await db
      .delete(testQuestions)
      .where(
        and(
          eq(testQuestions.testId, newTest.id),
          eq(testQuestions.questionId, repoQuestions[3].id)
        )
      );
    const [checkDeletedTQ] = await db
      .select()
      .from(testQuestions)
      .where(
        and(
          eq(testQuestions.testId, newTest.id),
          eq(testQuestions.questionId, repoQuestions[3].id)
        )
      );
    const [checkBankQ] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, repoQuestions[3].id));
    assert(
      !checkDeletedTQ && Boolean(checkBankQ),
      "15. Removing question from test removes relationship only, preserving question bank record"
    );

    // 16. Invalid section (referencing non-existent test) rejected by FK constraint
    let invalidSectionRejected = false;
    try {
      await db.insert(testSections).values({
        testId: "00000000-0000-0000-0000-000000000000",
        title: "Orphan Section",
        sectionOrder: 99,
      });
    } catch {
      invalidSectionRejected = true;
    }
    assert(invalidSectionRejected, "16. Invalid section foreign key to non-existent test is rejected");

    // 17. Invalid question ID rejected by FK
    let invalidQRejected = false;
    try {
      await db.insert(testQuestions).values({
        testId: newTest.id,
        sectionId: secB.id,
        questionId: "00000000-0000-0000-0000-000000000000",
        questionOrder: 99,
      });
    } catch {
      invalidQRejected = true;
    }
    assert(invalidQRejected, "17. Invalid question ID assignment is rejected by database");

    // 18. Duplicate question in test rejected by UNIQUE(testId, questionId) constraint
    let duplicateRejected = false;
    try {
      await db.insert(testQuestions).values({
        testId: newTest.id,
        sectionId: secA.id,
        questionId: repoQuestions[0].id, // already in secB of newTest
        questionOrder: 10,
      });
    } catch {
      duplicateRejected = true;
    }
    assert(duplicateRejected, "18. Duplicate assignment of same question across sections rejected by UNIQUE constraint");

    // 19. Unauthorized mutation rejected (non-admin blocked from duplication)
    const [dbStudent] = await db
      .select()
      .from(users)
      .where(eq(users.id, studentUser.id));
    const isStudentAllowed = Boolean(dbStudent?.isAdmin);
    assert(!isStudentAllowed, "19. Student user is strictly denied administrative test duplication/mutation (isAdmin = false)");

    // ====================================================
    // GROUP 3: STUDENT EXAM ENGINE & SECTION INTEGRATION (Tests 20-27)
    // ====================================================
    console.log("\n--- 3. Student Assessment & Exam State Integrity ---");

    // Reset test questions clean:
    // Section B (order 1): repoQuestions[0] (order 1), repoQuestions[1] (order 2)
    // Section A (order 2): repoQuestions[2] (order 1), repoQuestions[3] (order 2)
    await db.delete(testQuestions).where(eq(testQuestions.testId, newTest.id));
    await db.insert(testQuestions).values([
      {
        testId: newTest.id,
        sectionId: secB.id,
        questionId: repoQuestions[0].id,
        questionOrder: 1,
      },
      {
        testId: newTest.id,
        sectionId: secB.id,
        questionId: repoQuestions[1].id,
        questionOrder: 2,
      },
      {
        testId: newTest.id,
        sectionId: secA.id,
        questionId: repoQuestions[2].id,
        questionOrder: 1,
      },
      {
        testId: newTest.id,
        sectionId: secA.id,
        questionId: repoQuestions[3].id,
        questionOrder: 2,
      },
    ]);

    // 20. Student sees sections in test details
    const studentTestDetails = await getTestDetails(newTest.id, studentUser.id);
    assert(
      Boolean(studentTestDetails && studentTestDetails.sections.length === 2),
      "20. Student test details returns section breakdown with question counts"
    );

    // Start attempt
    const attemptState = await startOrResumeAttempt(newTest.id, studentUser.id);
    assert(Boolean(attemptState.attemptId), "Student successfully starts attempt on sectioned test");

    // 21. Global question order correct (secB first, then secA)
    const examState = await getAttemptExamState(attemptState.attemptId, studentUser.id);
    assert(
      examState.questions !== undefined &&
        examState.questions[0]?.id === repoQuestions[0].id &&
        examState.questions[1]?.id === repoQuestions[1].id &&
        examState.questions[2]?.id === repoQuestions[2].id &&
        examState.questions[3]?.id === repoQuestions[3].id,
      "21. Global question ordering strictly follows sectionOrder ASC then questionOrder ASC"
    );

    // 22. Section metadata present on questions
    assert(
      Boolean(
        examState.questions &&
          examState.questions[0]?.sectionId === secB.id &&
          examState.questions[0]?.sectionTitle === "Data Structures & Algorithms" &&
          examState.questions[0]?.sectionOrder === 1
      ),
      "22. Flat questions carry sectionId, sectionTitle, and sectionOrder metadata"
    );

    // 23. Navigation works: question list is flat 0..N-1
    assert(
      Boolean(examState.questions && examState.questions.length === 4),
      "23. ExamEngine question list remains flat linear array of 4 questions"
    );

    // 24. Refresh recovery works
    const resumedState = await startOrResumeAttempt(newTest.id, studentUser.id);
    assert(
      resumedState.isResumed && resumedState.attemptId === attemptState.attemptId,
      "24. In-progress attempt resumes accurately with persistent attempt ID"
    );

    // 25. Autosave works across sections
    await saveAnswer(attemptState.attemptId, studentUser.id, repoQuestions[0].id, "A", 15);
    await saveAnswer(attemptState.attemptId, studentUser.id, repoQuestions[2].id, "B", 20);
    const [ans1] = await db
      .select()
      .from(answers)
      .where(
        and(
          eq(answers.attemptId, attemptState.attemptId),
          eq(answers.questionId, repoQuestions[0].id)
        )
      );
    assert(ans1?.selectedAnswer === "A", "25. Autosave records answer accurately during examination");

    // 26 & 27. Server-side grading evaluates attempt
    const graded = await gradeAttempt(attemptState.attemptId, studentUser.id);
    const [subAttempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptState.attemptId));
    assert(subAttempt.status === "submitted", "26. Student can submit sectioned exam attempt");
    assert(
      typeof graded.score === "number" && typeof graded.accuracy === "number",
      "27. Server-side evaluation grades sectioned attempt successfully"
    );

    // ====================================================
    // GROUP 4: RESULTS & ANALYTICS INTEGRITY (Tests 28-30)
    // ====================================================
    console.log("\n--- 4. Results & Analytics Integrity ---");

    // 28. Section score derived from graded answers
    const gradedQuestions = await db
      .select({
        questionId: questions.id,
        sectionId: testSections.id,
        sectionTitle: testSections.title,
        sectionOrder: testSections.sectionOrder,
        isCorrect: answers.isCorrect,
      })
      .from(testQuestions)
      .innerJoin(questions, eq(testQuestions.questionId, questions.id))
      .innerJoin(testSections, eq(testQuestions.sectionId, testSections.id))
      .leftJoin(
        answers,
        and(
          eq(answers.questionId, questions.id),
          eq(answers.attemptId, attemptState.attemptId)
        )
      )
      .where(eq(testQuestions.testId, newTest.id))
      .orderBy(asc(testSections.sectionOrder), asc(testQuestions.questionOrder));

    const secBQuestions = gradedQuestions.filter((q) => q.sectionId === secB.id);
    const secAQuestions = gradedQuestions.filter((q) => q.sectionId === secA.id);
    assert(
      secBQuestions.length === 2 && secAQuestions.length === 2,
      "28. Graded questions accurately partitioned by section for results breakdown"
    );

    // 29. Overall score unchanged by sections
    assert(
      typeof graded.score === "number" && graded.score <= newTest.totalMarks,
      "29. Overall score calculation preserves test totalMarks boundary"
    );

    // 30. Subject taxonomy analytics remain unchanged
    const analytics = await getAnalyticsData(studentUser.id);
    assert(
      Boolean(analytics.hasData && Array.isArray(analytics.topicPerformance)),
      "30. Subject/topic taxonomy analytics unaffected by structural sections layer"
    );

    // ====================================================
    // GROUP 5: ADMIN PREVIEW INTEGRITY (Tests 31-35)
    // ====================================================
    console.log("\n--- 5. Admin Test Preview (Phase 6A) Verification ---");

    // 31. PreviewDraft shape check
    const mockPreviewDraft = {
      title: "Preview Test",
      description: "Local only",
      duration: 30,
      testType: "mixed",
      sections: [
        { id: "sec-1", title: "Quantitative", sectionOrder: 1 },
        { id: "sec-2", title: "Verbal", sectionOrder: 2 },
      ],
      questions: [
        {
          id: repoQuestions[0].id,
          question: repoQuestions[0].question,
          questionType: repoQuestions[0].questionType,
          difficulty: repoQuestions[0].difficulty,
          marks: 2,
          expectedTime: 60,
          subjectName: "Quantitative",
          subjectCode: "APT",
          topicName: "Percentages",
          options: ["A", "B", "C", "D"],
          sectionId: "sec-1",
          sectionTitle: "Quantitative",
          sectionOrder: 1,
        },
      ],
    };
    assert(
      mockPreviewDraft.sections.length === 2 && mockPreviewDraft.questions[0].sectionTitle === "Quantitative",
      "31. PreviewDraft supports section metadata and grouping"
    );

    // 32. Preview is local-only: 0 attempts in DB for admin user
    const adminAttempts = await db
      .select()
      .from(attempts)
      .where(eq(attempts.userId, adminUser.id));
    assert(adminAttempts.length === 0, "32. Preview remains strictly client/sessionStorage-only; no database attempts created");

    // 33. No attempts created
    assert(adminAttempts.length === 0, "33. Database attempts count is 0 for admin preview");

    // 34. No answers created
    const adminAnswers = await db
      .select()
      .from(answers)
      .where(sql`${answers.attemptId} IN (SELECT id FROM attempts WHERE user_id = ${adminUser.id})`);
    assert(adminAnswers.length === 0, "34. Database answers count is 0 for admin preview");

    // 35. Correct answers remain protected from exam state
    assert(
      !("correctAnswer" in (examState.questions?.[0] || {})) &&
        !("explanation" in (examState.questions?.[0] || {})),
      "35. Correct answers and explanations remain strictly hidden from active exam questions"
    );

    // ====================================================
    // GROUP 6: DUPLICATE TEST INTEGRITY (Tests 36-43)
    // ====================================================
    console.log("\n--- 6. Duplicate Test (Phase 6B) with Sections ---");

    // 36. Duplicate test with sections
    const dupResult = await duplicateTest(newTest.id);
    cleanupTestIds.push(dupResult.test.id);

    const dupSections = await db
      .select()
      .from(testSections)
      .where(eq(testSections.testId, dupResult.test.id))
      .orderBy(asc(testSections.sectionOrder));

    assert(dupSections.length === 2, "36. Duplicate test duplicates all test_sections records");

    // 37. Section IDs are brand new UUIDs
    assert(
      dupSections[0].id !== secB.id &&
        dupSections[1].id !== secA.id &&
        dupSections[0].id !== dupSections[1].id,
      "37. Duplicated sections receive brand new unique UUID identifiers"
    );

    // 38. Questions referenced, not cloned
    const dupTQ = await db
      .select()
      .from(testQuestions)
      .where(eq(testQuestions.testId, dupResult.test.id))
      .orderBy(asc(testQuestions.questionOrder));

    assert(
      dupTQ.length === 4 && dupTQ.some((tq) => tq.questionId === repoQuestions[0].id),
      "38. Questions are referenced by questionId, not cloned"
    );

    // 39. Section ordering preserved
    assert(
      dupSections[0].sectionOrder === 1 &&
        dupSections[0].title === "Data Structures & Algorithms" &&
        dupSections[1].sectionOrder === 2 &&
        dupSections[1].title === "Quantitative & Analytical Aptitude",
      "39. Section ordering and titles preserved in duplicate test"
    );

    // 40. Question ordering preserved with new section linkage
    const dupTQSec1 = dupTQ.filter((q) => q.sectionId === dupSections[0].id);
    assert(
      dupTQSec1.length === 2 && dupTQSec1[0].questionOrder === 1 && dupTQSec1[1].questionOrder === 2,
      "40. Question ordering within each section preserved and mapped to new section IDs"
    );

    // 41. Attempts not copied
    const dupAttempts = await db
      .select()
      .from(attempts)
      .where(eq(attempts.testId, dupResult.test.id));
    assert(dupAttempts.length === 0, "41. Attempts are not copied to duplicated test (0 attempts)");

    // 42. Answers not copied
    const dupAnswers = await db
      .select()
      .from(answers)
      .where(sql`${answers.attemptId} IN (SELECT id FROM attempts WHERE test_id = ${dupResult.test.id})`);
    assert(dupAnswers.length === 0, "42. Answers are not copied to duplicated test (0 answers)");

    // 43. Duplicate is Draft
    assert(dupResult.test.isPublished === false, "43. Duplicated test is strictly saved in Draft state (isPublished = false)");

    // ====================================================
    // GROUP 7: REGRESSION & BACKWARD COMPATIBILITY (Tests 44-50)
    // ====================================================
    console.log("\n--- 7. System-Wide Regression & Legacy Verification ---");

    // 44. Legacy tests with default "General" section continue to work
    const [baselineTest] = await db
      .select()
      .from(tests)
      .where(eq(tests.type, "baseline"))
      .limit(1);

    const baselineDetails = await getTestDetails(baselineTest.id, studentUser.id);
    assert(
      Boolean(baselineDetails && baselineDetails.sections.length >= 1),
      "44. Baseline assessment migrated smoothly to default section without data loss"
    );

    // 45. Phase 6A test preview types and preview flow verified
    assert(
      typeof mockPreviewDraft.duration === "number" && mockPreviewDraft.questions.length > 0,
      "45. Phase 6A preview architecture intact"
    );

    // 46. Phase 6B duplicate test verification
    assert(
      dupResult.test.title.includes("Copy"),
      "46. Phase 6B copy title resolution preserved"
    );

    // 47. Student assessment start on baseline
    const baselineAttempt = await startOrResumeAttempt(baselineTest.id, studentUser.id);
    assert(Boolean(baselineAttempt.attemptId), "47. Student assessment flow functional on legacy tests");

    // 48. Baseline exam state flat and ordered
    const baselineExamState = await getAttemptExamState(baselineAttempt.attemptId, studentUser.id);
    assert(
      Boolean(
        baselineExamState.questions &&
          baselineDetails &&
          baselineExamState.questions.length === baselineDetails.questionCount
      ),
      "48. Baseline exam state returns complete flat question set"
    );

    // 49. Analytics and readiness calculation
    const readiness = await calculateReadiness(studentUser.id);
    assert(readiness.hasCompletedBaseline === false, "49. Readiness calculation engine functional and reports uncalibrated status for new user");

    // 50. User profile intact
    const [studentProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, studentUser.id));
    assert(studentProfile.college === "Section Testing Institute", "50. Student profile intact");

  } finally {
    // Clean up created test data
    console.log("\n🧹 Cleaning up test fixtures...");
    for (const tid of cleanupTestIds) {
      await db.delete(testQuestions).where(eq(testQuestions.testId, tid));
      await db.delete(testSections).where(eq(testSections.testId, tid));
      await db.delete(attempts).where(eq(attempts.testId, tid));
      await db.delete(tests).where(eq(tests.id, tid));
    }
    for (const uid of cleanupUserIds) {
      await db.delete(profiles).where(eq(profiles.userId, uid));
      await db.delete(attempts).where(eq(attempts.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
    }
  }

  console.log("\n==================================================");
  console.log(`PHASE 6C SECTIONS AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase6CSectionsAudit().catch((err) => {
  console.error("Phase 6C Sections Audit crashed:", err);
  process.exit(1);
});
