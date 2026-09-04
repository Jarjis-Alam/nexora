import { db } from "@/db";
import {
  users,
  profiles,
  tests,
  attempts,
  answers,
  skillScores,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
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

async function runRegressionTest() {
  console.log("==================================================");
  console.log("🧪 NEXORA — START TEST REGRESSION SUITE");
  console.log("==================================================\n");

  const testUserEmail = `reg_student_${Date.now()}@placementos.dev`;
  const hackerUserEmail = `reg_hacker_${Date.now()}@placementos.dev`;
  const password = "Password123!";
  const passwordHash = await bcrypt.hash(password, 10);

  let studentId = "";
  let hackerId = "";
  const baselineTestId = "0e989fa7-5fb9-4d55-b728-290dc9446e9a";
  let attemptId = "";

  try {
    // 0. Setup: Create legitimate student and secondary user
    const [student] = await db
      .insert(users)
      .values({ email: testUserEmail, passwordHash, isAdmin: false })
      .returning();
    studentId = student.id;

    await db.insert(profiles).values({
      userId: studentId,
      name: "Regression Test Student",
      college: "Institute of Technology",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    const [hacker] = await db
      .insert(users)
      .values({ email: hackerUserEmail, passwordHash, isAdmin: false })
      .returning();
    hackerId = hacker.id;

    // Verify baseline test exists in DB
    const [baselineTest] = await db
      .select()
      .from(tests)
      .where(eq(tests.id, baselineTestId));
    assert(!!baselineTest, `Target test ${baselineTestId} exists in database`);
    assert(baselineTest.isPublished === true, "Target test is published");
    assert(baselineTest.duration === 90, "Target test duration is 90 minutes");

    // ----------------------------------------------------
    // 1. Authenticated user starts published test
    // ----------------------------------------------------
    console.log("\n1. Testing Authenticated User Starts Published Test...");
    const startResult = await startOrResumeAttempt(baselineTestId, studentId);
    attemptId = startResult.attemptId;
    assert(!!attemptId, `startOrResumeAttempt succeeded, attemptId: ${attemptId.slice(0, 8)}`);
    assert(startResult.isResumed === false, "Fresh attempt created (isResumed === false)");

    // ----------------------------------------------------
    // 2. Attempt is created in database
    // ----------------------------------------------------
    console.log("\n2. Testing Attempt Record Created in Database...");
    const [attemptRecord] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    assert(!!attemptRecord, "Attempt record exists in database");

    // ----------------------------------------------------
    // 3. Attempt status = in_progress
    // ----------------------------------------------------
    console.log("\n3. Testing Attempt Status is 'in_progress'...");
    assert(attemptRecord.status === "in_progress", "Attempt status is 'in_progress'");

    // ----------------------------------------------------
    // 4. Attempt belongs to correct user
    // ----------------------------------------------------
    console.log("\n4. Testing Attempt Belongs to Correct User...");
    assert(attemptRecord.userId === studentId, "Attempt userId matches authenticated student ID");
    assert(attemptRecord.testId === baselineTestId, "Attempt testId matches target baseline test ID");

    // ----------------------------------------------------
    // 5. Remaining time is calculated correctly
    // ----------------------------------------------------
    console.log("\n5. Testing Remaining Time Calculation...");
    const expectedDurationSeconds = baselineTest.duration * 60; // 90 * 60 = 5400
    assert(
      attemptRecord.remainingTime === expectedDurationSeconds,
      `Attempt initial remaining time matches test duration (${attemptRecord.remainingTime}s == ${expectedDurationSeconds}s)`
    );

    // ----------------------------------------------------
    // 6. Returned attempt can load exam state
    // ----------------------------------------------------
    console.log("\n6. Testing Returned Attempt Can Load Exam State...");
    const examState = await getAttemptExamState(attemptId, studentId);
    assert(examState.status === "in_progress", "Exam state status is 'in_progress'");
    assert(examState.attemptId === attemptId, "Exam state attemptId matches created attempt");
    assert(examState.testTitle === baselineTest.title, "Exam state title matches test title");
    assert(
      !!examState.questions && examState.questions.length === 50,
      `Exam state loaded all 50 questions (count: ${examState.questions?.length})`
    );

    // ----------------------------------------------------
    // 7. Existing in-progress attempt resumes instead of creating duplicate
    // ----------------------------------------------------
    console.log("\n7. Testing Existing In-Progress Attempt Resumes Deterministically...");
    const resumeResult = await startOrResumeAttempt(baselineTestId, studentId);
    assert(resumeResult.isResumed === true, "Subsequent start returns isResumed === true");
    assert(resumeResult.attemptId === attemptId, "Resumed attemptId is identical to original attemptId");

    // Count attempts in DB for this user & test
    const userAttempts = await db
      .select()
      .from(attempts)
      .where(and(eq(attempts.testId, baselineTestId), eq(attempts.userId, studentId)));
    assert(userAttempts.length === 1, "Zero duplicate attempts created (exactly 1 attempt exists)");

    // ----------------------------------------------------
    // Security 1: correctAnswer is excluded from active exam state
    // ----------------------------------------------------
    console.log("\nSecurity 1. Verifying correctAnswer Exclusion...");
    let correctAnswerLeaked = false;
    for (const q of examState.questions!) {
      if ("correctAnswer" in q) correctAnswerLeaked = true;
    }
    assert(!correctAnswerLeaked, "correctAnswer is strictly excluded from active exam payload");

    // ----------------------------------------------------
    // Security 2: explanation is excluded from active exam state
    // ----------------------------------------------------
    console.log("\nSecurity 2. Verifying explanation Exclusion...");
    let explanationLeaked = false;
    for (const q of examState.questions!) {
      if ("explanation" in q) explanationLeaked = true;
    }
    assert(!explanationLeaked, "explanation is strictly excluded from active exam payload");

    // ----------------------------------------------------
    // Security 3: Another user cannot access the attempt
    // ----------------------------------------------------
    console.log("\nSecurity 3. Verifying Cross-User Isolation...");
    let crossUserAccessBlocked = false;
    try {
      await getAttemptExamState(attemptId, hackerId);
    } catch {
      crossUserAccessBlocked = true;
    }
    assert(crossUserAccessBlocked, "Another user is blocked from accessing this attempt");

    let crossUserSaveBlocked = false;
    try {
      await saveAnswer(attemptId, hackerId, examState.questions![0].id, "Malicious", 5);
    } catch {
      crossUserSaveBlocked = true;
    }
    assert(crossUserSaveBlocked, "Another user is blocked from saving answers to this attempt");

    // ----------------------------------------------------
    // Security 4: Submitted attempts remain immutable
    // ----------------------------------------------------
    console.log("\nSecurity 4. Verifying Submitted Attempts Remain Immutable...");
    // Submit the attempt
    await gradeAttempt(attemptId, studentId);
    const [submittedAttempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    assert(submittedAttempt.status === "submitted", "Attempt status transitioned to 'submitted'");

    let tamperBlocked = false;
    try {
      await saveAnswer(attemptId, studentId, examState.questions![0].id, "Late Option", 5);
    } catch {
      tamperBlocked = true;
    }
    assert(tamperBlocked, "Submitted attempt cannot be modified (saveAnswer throws on submitted attempt)");

    // Cleanup
    await db.delete(skillScores).where(eq(skillScores.attemptId, attemptId));
    await db.delete(answers).where(eq(answers.attemptId, attemptId));
    await db.delete(attempts).where(eq(attempts.id, attemptId));
    await db.delete(profiles).where(eq(profiles.userId, studentId));
    await db.delete(profiles).where(eq(profiles.userId, hackerId));
    await db.delete(users).where(eq(users.id, studentId));
    await db.delete(users).where(eq(users.id, hackerId));

    console.log("\n🧹 Regression test cleanup completed successfully.");
  } catch (err) {
    console.error("Regression test failure:", err);
    failed++;
  }

  console.log("\n==================================================");
  console.log(`REGRESSION RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runRegressionTest();
