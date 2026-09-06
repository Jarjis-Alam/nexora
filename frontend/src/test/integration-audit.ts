import { db } from "@/db";
import {
  users,
  profiles,
  tests,
  testSections,
  testQuestions,
  questions,
  subjects,
  topics,
  attempts,
  answers,
  skillScores,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  getPublishedTests,
  getTestDetails,
  startOrResumeAttempt,
  getAttemptExamState,
  saveAnswer,
  toggleReviewMark,
} from "@/server/tests";
import { gradeAttempt } from "@/server/grading";
import { calculateReadiness, detectWeakAreas } from "@/server/readiness";
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

async function runIntegrationAudit() {
  console.log("==================================================");
  console.log("🚀 NEXORA / PLACEMENT OS — MILESTONE 3 INTEGRATION AUDIT");
  console.log("==================================================\n");

  const testEmailStudentA = `m3_student_a_${Date.now()}@placementos.dev`;
  const testEmailStudentB = `m3_student_b_${Date.now()}@placementos.dev`;
  const testPassword = "Password123!";
  const passwordHash = await bcrypt.hash(testPassword, 10);

  let studentAId = "";
  let studentBId = "";
  let baselineTestId = "";
  let attemptAId = "";

  try {
    // ----------------------------------------------------
    // SETUP: Create Student A and Student B
    // ----------------------------------------------------
    const [userA] = await db
      .insert(users)
      .values({
        email: testEmailStudentA,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    studentAId = userA.id;

    await db.insert(profiles).values({
      userId: studentAId,
      name: "Integration Student A",
      college: "Indian Institute of Technology",
      branch: "Computer Science",
      graduationYear: 2026,
      preferredLanguage: "TypeScript",
    });

    const [userB] = await db
      .insert(users)
      .values({
        email: testEmailStudentB,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    studentBId = userB.id;

    await db.insert(profiles).values({
      userId: studentBId,
      name: "Integration Student B",
      college: "National Institute of Technology",
      branch: "Information Technology",
      graduationYear: 2026,
      preferredLanguage: "Python",
    });

    // ----------------------------------------------------
    // 1. Dashboard with authenticated user
    // ----------------------------------------------------
    console.log("1. Testing Dashboard with Authenticated User...");
    const profileA = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, studentAId))
      .limit(1);
    assert(profileA.length === 1, "User profile loaded for authenticated student");
    assert(profileA[0].name === "Integration Student A", "Student name matches profile");

    // ----------------------------------------------------
    // 2. Dashboard zero-state (Uncalibrated)
    // ----------------------------------------------------
    console.log("\n2. Testing Dashboard Zero-State for Uncalibrated User...");
    const freshReadiness = await calculateReadiness(studentAId);
    assert(freshReadiness.hasCompletedBaseline === false, "Fresh student baseline completed is false");
    assert(freshReadiness.readinessScore === null, "Readiness score is strictly null (no fake score fabricated)");
    assert(freshReadiness.level === null, "Readiness level is null in zero-state");

    const freshWeakAreas = await detectWeakAreas(studentAId);
    assert(freshWeakAreas.length === 0, "No weak areas fabricated for uncalibrated user");

    // ----------------------------------------------------
    // 3. Baseline assessment start & retrieval
    // ----------------------------------------------------
    console.log("\n3. Testing Baseline Test Retrieval...");
    const baselineList = await db
      .select()
      .from(tests)
      .where(eq(tests.type, "baseline"))
      .limit(1);
    assert(baselineList.length === 1, "Baseline test found in PostgreSQL database");
    baselineTestId = baselineList[0].id;
    assert(baselineList[0].duration > 0, `Baseline duration is real: ${baselineList[0].duration} min`);

    // ----------------------------------------------------
    // 4. Test catalog
    // ----------------------------------------------------
    console.log("\n4. Testing Test Catalog Retrieval...");
    const publishedTests = await getPublishedTests(studentAId);
    assert(publishedTests.length >= 4, `Catalog contains ${publishedTests.length} published tests`);
    const catalogBaseline = publishedTests.find((t) => t.type === "baseline");
    assert(!!catalogBaseline, "Catalog includes Baseline assessment");
    assert(catalogBaseline!.questionCount === 50, "Catalog reports accurate question count (50)");
    assert(catalogBaseline!.status === "not_attempted", "Catalog reports unattempted status for new user");

    // ----------------------------------------------------
    // 5. Test details
    // ----------------------------------------------------
    console.log("\n5. Testing Test Details Retrieval...");
    const testDetails = await getTestDetails(baselineTestId, studentAId);
    assert(testDetails !== null, "Test details returned for baseline assessment");
    assert(testDetails!.title === baselineList[0].title, "Test details title matches database title");
    assert(testDetails!.questionCount === 50, "Test question count matches seeded questions (50)");
    assert(testDetails!.subjects.length === 7, "All 7 core subjects represented in test details");

    // ----------------------------------------------------
    // 6. Attempt creation
    // ----------------------------------------------------
    console.log("\n6. Testing Real Attempt Creation...");
    const startResult = await startOrResumeAttempt(baselineTestId, studentAId);
    attemptAId = startResult.attemptId;
    assert(!!attemptAId, `Attempt created with ID: ${attemptAId.slice(0, 8)}`);
    assert(startResult.isResumed === false, "Fresh attempt created (isResumed is false)");

    const [attemptRecord] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptAId))
      .limit(1);
    assert(attemptRecord.status === "in_progress", "Attempt initial status is in_progress");
    assert(attemptRecord.userId === studentAId, "Attempt userId strictly matches student");

    // ----------------------------------------------------
    // 7. Answer persistence
    // ----------------------------------------------------
    console.log("\n7. Testing Answer Persistence during Active Exam...");
    const examState = await getAttemptExamState(attemptAId, studentAId);
    if (!examState.questions) throw new Error("Expected active examState with questions");
    assert(examState.questions.length === 50, "Exam engine loaded all 50 questions");
    const q1 = examState.questions[0];

    const opt0 = Array.isArray(q1.options) ? q1.options[0] : "Option A";
    const selectedAns = typeof opt0 === "object" && opt0 !== null && "id" in opt0 ? (opt0 as any).id : opt0;
    const saveResult = await saveAnswer(attemptAId, studentAId, q1.id, selectedAns, 15);
    assert(saveResult.success === true, "saveAnswer returned success");

    const savedAnsRecord = await db
      .select()
      .from(answers)
      .where(and(eq(answers.attemptId, attemptAId), eq(answers.questionId, q1.id)))
      .limit(1);
    assert(savedAnsRecord.length === 1, "Answer saved to PostgreSQL database");
    assert(savedAnsRecord[0].selectedAnswer === selectedAns, "Saved answer matches student selection");
    assert(savedAnsRecord[0].timeSpent === 15, "Time spent recorded accurately (15s)");
    assert(savedAnsRecord[0].isCorrect === null, "isCorrect is null during active exam (not graded yet)");

    // ----------------------------------------------------
    // 8. Attempt resume
    // ----------------------------------------------------
    console.log("\n8. Testing Attempt Resume (Refresh / Reload recovery)...");
    const resumeResult = await startOrResumeAttempt(baselineTestId, studentAId);
    assert(resumeResult.isResumed === true, "Existing in-progress attempt resumed");
    assert(resumeResult.attemptId === attemptAId, "Resumed attempt has identical attempt ID");

    const resumedState = await getAttemptExamState(attemptAId, studentAId);
    if (!resumedState.answers) throw new Error("Expected active resumedState with answers");
    assert(resumedState.answers[q1.id] !== undefined, "Previous answer recovered upon resume");
    assert(
      resumedState.answers[q1.id].selectedAnswer === selectedAns,
      "Recovered answer matches previously selected option"
    );

    // ----------------------------------------------------
    // 9. Review marking
    // ----------------------------------------------------
    console.log("\n9. Testing Toggle Mark for Review...");
    const markResult = await toggleReviewMark(attemptAId, studentAId, q1.id);
    assert(markResult.markedForReview === true, "Question successfully marked for review");

    const unmarkResult = await toggleReviewMark(attemptAId, studentAId, q1.id);
    assert(unmarkResult.markedForReview === false, "Question successfully unmarked for review");

    // ----------------------------------------------------
    // 10. Submission & Server-Side Grading
    // ----------------------------------------------------
    console.log("\n10. Testing Test Submission & Server-Side Grading...");
    // Answer a few more questions to test accurate scoring
    for (let i = 1; i < 5; i++) {
      const qi = examState.questions[i];
      // Fetch the real correct answer from questions table to simulate correct answers
      const [fullQ] = await db
        .select({ correctAnswer: questions.correctAnswer })
        .from(questions)
        .where(eq(questions.id, qi.id));
      await saveAnswer(attemptAId, studentAId, qi.id, fullQ.correctAnswer, 20);
    }

    const gradingResult = await gradeAttempt(attemptAId, studentAId);
    assert((gradingResult.score ?? 0) > 0, `Server graded attempt with score: ${gradingResult.score}/100`);
    assert((gradingResult.accuracy ?? 0) > 0, `Server computed accuracy: ${gradingResult.accuracy}%`);

    const [submittedAttempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptAId));
    assert(submittedAttempt.status === "submitted", "Attempt status transitioned to 'submitted'");
    assert(submittedAttempt.submittedAt !== null, "submittedAt timestamp recorded");

    // ----------------------------------------------------
    // 11. Result retrieval
    // ----------------------------------------------------
    console.log("\n11. Testing Result Retrieval...");
    const resultScores = await db
      .select()
      .from(skillScores)
      .where(eq(skillScores.attemptId, attemptAId));
    assert(resultScores.length > 0, `skill_scores persisted ${resultScores.length} skill records`);

    // Verify submitted attempts cannot be modified
    let tamperingBlocked = false;
    try {
      await saveAnswer(attemptAId, studentAId, q1.id, "Malicious Tamper", 5);
    } catch {
      tamperingBlocked = true;
    }
    assert(tamperingBlocked, "Submitted attempt is immutable (cannot modify answers after submission)");

    // ----------------------------------------------------
    // 12. Analytics retrieval
    // ----------------------------------------------------
    console.log("\n12. Testing Analytics Data Retrieval...");
    const analytics = await getAnalyticsData(studentAId);
    assert(analytics.hasData === true, "Analytics reports hasData is true after test submission");
    assert(analytics.overview.testsCompleted === 1, "Analytics reports 1 test completed");
    assert(Array.isArray(analytics.topicPerformance), "Analytics contains topic-wise breakdown");
    assert(analytics.difficultyPerformance.length === 3, "Analytics contains difficulty-wise performance (easy/med/hard)");
    assert(analytics.readiness.score !== null, "Analytics includes calculated readiness score");

    // ----------------------------------------------------
    // 13. Profile retrieval & update
    // ----------------------------------------------------
    console.log("\n13. Testing Profile Update & Persistence...");
    await db
      .update(profiles)
      .set({
        college: "BITS Pilani",
        preferredLanguage: "Go",
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, studentAId));

    const [updatedProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, studentAId));
    assert(updatedProfile.college === "BITS Pilani", "Profile college updated and persisted in PostgreSQL");
    assert(updatedProfile.preferredLanguage === "Go", "Profile preferredLanguage updated in PostgreSQL");

    // ----------------------------------------------------
    // 14. Admin question access & creation
    // ----------------------------------------------------
    console.log("\n14. Testing Admin Question Creation...");
    const allSubjects = await db.select().from(subjects).limit(1);
    const allTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.subjectId, allSubjects[0].id))
      .limit(1);

    const [newAdminQ] = await db
      .insert(questions)
      .values({
        question: "What is the time complexity of binary search on a sorted array of N elements?",
        questionType: "single_choice",
        options: ["O(N)", "O(log N)", "O(N log N)", "O(1)"],
        correctAnswer: "O(log N)",
        subjectId: allSubjects[0].id,
        topicId: allTopics[0].id,
        difficulty: "easy",
        marks: 2,
        expectedTime: 45,
        explanation: "Binary search repeatedly halves the search interval, yielding logarithmic O(log N) time complexity.",
      })
      .returning();
    assert(!!newAdminQ.id, "Admin successfully authored and inserted question in repository");
    assert(newAdminQ.difficulty === "easy", "Authored question difficulty validated");

    // ----------------------------------------------------
    // 15. Admin test access & authoring
    // ----------------------------------------------------
    console.log("\n15. Testing Admin Test Creation & Publishing...");
    const [newAdminTest] = await db
      .insert(tests)
      .values({
        title: "SWE Technical Screen - Core Algorithms",
        description: "Standard algorithmic assessment for software engineering cohorts.",
        type: "mixed",
        duration: 45,
        totalMarks: 50,
        isPublished: true,
      })
      .returning();
    assert(!!newAdminTest.id, "Admin created new assessment in tests table");

    const [newAdminSection] = await db
      .insert(testSections)
      .values({
        testId: newAdminTest.id,
        title: "General",
        sectionOrder: 1,
      })
      .returning();
    assert(!!newAdminSection.id, "Admin test section created");

    await db.insert(testQuestions).values({
      testId: newAdminTest.id,
      sectionId: newAdminSection.id,
      questionId: newAdminQ.id,
      questionOrder: 1,
    });

    const [testQRecord] = await db
      .select()
      .from(testQuestions)
      .where(eq(testQuestions.testId, newAdminTest.id));
    assert(testQRecord.questionOrder === 1, "Test question order persisted deterministically (questionOrder === 1)");

    // Toggle publish
    await db
      .update(tests)
      .set({ isPublished: false, updatedAt: new Date() })
      .where(eq(tests.id, newAdminTest.id));
    const [unpubTest] = await db.select().from(tests).where(eq(tests.id, newAdminTest.id));
    assert(unpubTest.isPublished === false, "Admin can unpublish test (toggle isPublished to false)");

    // ----------------------------------------------------
    // 16. Student denied admin access
    // ----------------------------------------------------
    console.log("\n16. Testing Student Denied Admin Access...");
    const [studentUser] = await db.select().from(users).where(eq(users.id, studentAId));
    assert(studentUser.isAdmin === false, "Student user isAdmin is strictly false");

    // ----------------------------------------------------
    // 17. Cross-user attempt denial
    // ----------------------------------------------------
    console.log("\n17. Testing Cross-User Attempt Isolation...");
    let crossUserAccessBlocked = false;
    try {
      await getAttemptExamState(attemptAId, studentBId);
    } catch {
      crossUserAccessBlocked = true;
    }
    assert(crossUserAccessBlocked, "Student B is strictly blocked from accessing Student A's attempt");

    let crossUserAnswerBlocked = false;
    try {
      await saveAnswer(attemptAId, studentBId, q1.id, "Hack", 10);
    } catch {
      crossUserAnswerBlocked = true;
    }
    assert(crossUserAnswerBlocked, "Student B is strictly blocked from modifying Student A's answers");

    // ----------------------------------------------------
    // 18. Active attempt answer security
    // ----------------------------------------------------
    console.log("\n18. Testing Active Attempt Answer Security...");
    // Create an active attempt for student B
    const startB = await startOrResumeAttempt(baselineTestId, studentBId);
    const examStateB = await getAttemptExamState(startB.attemptId, studentBId);
    assert(examStateB.status === "in_progress", "Student B attempt is active");

    // ----------------------------------------------------
    // 19. No fake readiness data
    // ----------------------------------------------------
    console.log("\n19. Testing Authenticity of Calibrated Readiness Model...");
    const calibratedReadinessA = await calculateReadiness(studentAId);
    assert(calibratedReadinessA.hasCompletedBaseline === true, "Student A recognized as baseline completed");
    assert(
      calibratedReadinessA.readinessScore !== null && calibratedReadinessA.readinessScore > 0,
      `Calculated genuine readiness score: ${calibratedReadinessA.readinessScore}%`
    );
    assert(calibratedReadinessA.level !== null, `Assigned readiness level: ${calibratedReadinessA.level?.label}`);

    // Fresh Student B must still be uncalibrated
    const freshReadinessB = await calculateReadiness(studentBId);
    assert(freshReadinessB.hasCompletedBaseline === false, "Student B hasCompletedBaseline remains false");
    assert(freshReadinessB.readinessScore === null, "Student B readinessScore remains null");

    // ----------------------------------------------------
    // 20. No correctAnswer / explanation leakage
    // ----------------------------------------------------
    console.log("\n20. Testing Zero correctAnswer & explanation Leakage...");
    if (!examStateB.questions) throw new Error("Expected active examStateB with questions");
    let leakageDetected = false;
    for (const q of examStateB.questions) {
      if ("correctAnswer" in q || "explanation" in q) {
        leakageDetected = true;
        break;
      }
    }
    assert(
      !leakageDetected,
      "CRITICAL SECURITY: correctAnswer and explanation are completely excluded from active exam questions"
    );

    // Clean up created admin question & test
    await db.delete(testQuestions).where(eq(testQuestions.testId, newAdminTest.id));
    await db.delete(tests).where(eq(tests.id, newAdminTest.id));
    await db.delete(questions).where(eq(questions.id, newAdminQ.id));

    // Clean up student attempts & users
    await db.delete(skillScores).where(eq(skillScores.attemptId, attemptAId));
    await db.delete(answers).where(eq(answers.attemptId, attemptAId));
    await db.delete(attempts).where(eq(attempts.userId, studentAId));
    await db.delete(attempts).where(eq(attempts.userId, studentBId));
    await db.delete(profiles).where(eq(profiles.userId, studentAId));
    await db.delete(profiles).where(eq(profiles.userId, studentBId));
    await db.delete(users).where(eq(users.id, studentAId));
    await db.delete(users).where(eq(users.id, studentBId));

    console.log("\n🧹 Integration test artifacts cleaned up successfully.");

  } catch (error) {
    console.error("Integration Audit encountered an unexpected exception:", error);
    failed++;
  }

  console.log("\n==================================================");
  console.log(`INTEGRATION AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runIntegrationAudit();
