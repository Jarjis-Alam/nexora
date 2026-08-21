import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  users,
  profiles,
  subjects,
  topics,
  questions,
  tests,
  testQuestions,
  attempts,
  answers,
  skillScores,
} from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { gradeAttempt } from "../server/grading";
import { calculateReadiness, detectWeakAreas } from "../server/readiness";
import { getAttemptExamState } from "../server/tests";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres@localhost:5432/placement_os";

async function runTests() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  console.log("🧪 Running Placement OS Test Suite...\n");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✓ ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAILED: ${msg}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: User Registration & Profile Creation
    // ----------------------------------------------------
    console.log("1. Testing User Registration & Profile Creation...");
    const testEmail = `test_student_${Date.now()}@example.com`;
    const passwordHash = await bcrypt.hash("securepassword", 10);

    const testUser = await db
      .insert(users)
      .values({ email: testEmail, passwordHash })
      .returning();

    assert(testUser.length === 1, "User record created");

    const testProfile = await db
      .insert(profiles)
      .values({
        userId: testUser[0].id,
        name: "Test Candidate",
        college: "NIT Silchar",
        branch: "Computer Science",
        graduationYear: 2025,
      })
      .returning();

    assert(testProfile.length === 1, "Profile record created with academic metadata");

    // ----------------------------------------------------
    // TEST 2: Question Security (Answer key inaccessible during active test)
    // ----------------------------------------------------
    console.log("\n2. Testing Question Security during Active Test...");
    const baselineTestList = await db
      .select()
      .from(tests)
      .where(eq(tests.type, "baseline"))
      .limit(1);

    const baselineTest = baselineTestList[0];
    assert(!!baselineTest, "Baseline test exists in DB");

    // Create an in-progress attempt
    const activeAttempt = await db
      .insert(attempts)
      .values({
        userId: testUser[0].id,
        testId: baselineTest.id,
        status: "in_progress",
        startedAt: new Date(),
        currentQuestion: 0,
      })
      .returning();

    // Call getAttemptExamState
    const examState = await getAttemptExamState(
      activeAttempt[0].id,
      testUser[0].id
    );

    const examQuestions = examState.questions || [];
    assert(
      examQuestions.length > 0,
      `Loaded ${examQuestions.length} questions for exam`
    );

    // Verify none of the questions contain correctAnswer or explanation
    const leakedAnswer = examQuestions.some(
      (q: any) => q.correctAnswer !== undefined || q.explanation !== undefined
    );
    assert(
      !leakedAnswer,
      "SECURITY VERIFIED: correctAnswer and explanation are completely stripped from active exam payload"
    );

    // ----------------------------------------------------
    // TEST 3: Answer Saving & Progress Recovery
    // ----------------------------------------------------
    console.log("\n3. Testing Answer Persistence & Recovery...");
    const firstQ = examQuestions[0];

    // Look up real question from DB to know what the correct answer is
    const realQ = await db
      .select()
      .from(questions)
      .where(eq(questions.id, firstQ.id))
      .limit(1);

    const chosenOption = realQ[0].correctAnswer;

    // Save answer
    await db.insert(answers).values({
      attemptId: activeAttempt[0].id,
      questionId: firstQ.id,
      selectedAnswer: chosenOption,
      markedForReview: true,
      timeSpent: 25,
    });

    // Re-fetch exam state (simulating refresh)
    const refreshedState = await getAttemptExamState(
      activeAttempt[0].id,
      testUser[0].id
    );

    const savedAns = refreshedState.answers ? refreshedState.answers[firstQ.id] : null;
    assert(!!savedAns, "Answer recovered after refresh");
    assert(
      JSON.stringify(savedAns?.selectedAnswer) === JSON.stringify(chosenOption),
      "Correct selected answer recovered"
    );
    assert(savedAns?.markedForReview === true, "Marked for review status preserved");

    // ----------------------------------------------------
    // TEST 4: Server-Side Deterministic Grading
    // ----------------------------------------------------
    console.log("\n4. Testing Server-Side Grading...");
    const gradeResult = await gradeAttempt(
      activeAttempt[0].id,
      testUser[0].id
    );

    assert(gradeResult.success === true, "Grading executed successfully");
    assert(
      (gradeResult.correctCount ?? 0) >= 1,
      "Correct answers recognized and scored"
    );

    // Verify attempt is marked as submitted and immutable
    const updatedAttempt = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, activeAttempt[0].id))
      .limit(1);

    assert(
      updatedAttempt[0].status === "submitted",
      "Attempt status transitioned to 'submitted'"
    );
    assert(
      updatedAttempt[0].score !== null,
      `Calculated score: ${updatedAttempt[0].score}/100`
    );

    // Verify skill scores were generated
    const generatedSkillScores = await db
      .select()
      .from(skillScores)
      .where(eq(skillScores.attemptId, activeAttempt[0].id));

    assert(
      generatedSkillScores.length > 0,
      `Generated ${generatedSkillScores.length} subject and topic skill scores`
    );

    // ----------------------------------------------------
    // TEST 5: Placement Readiness Calculation
    // ----------------------------------------------------
    console.log("\n5. Testing Placement Readiness Model...");
    const readiness = await calculateReadiness(testUser[0].id);

    assert(
      readiness.hasCompletedBaseline === true,
      "Recognized completed baseline assessment"
    );
    assert(
      readiness.readinessScore !== null && readiness.readinessScore >= 0,
      `Readiness score calculated: ${readiness.readinessScore}%`
    );
    assert(!!readiness.level, `Readiness Level: ${readiness.level?.label}`);
    assert(
      readiness.subjectScores.length === 7,
      "Evaluated all 7 Phase 1 core subjects"
    );

    // ----------------------------------------------------
    // TEST 6: Uncalibrated Readiness for New User
    // ----------------------------------------------------
    console.log("\n6. Testing Zero/Uncalibrated State for Fresh User...");
    const freshUser = await db
      .insert(users)
      .values({
        email: `fresh_${Date.now()}@example.com`,
        passwordHash: "hash",
      })
      .returning();

    const freshReadiness = await calculateReadiness(freshUser[0].id);
    assert(
      freshReadiness.hasCompletedBaseline === false,
      "Fresh user hasCompletedBaseline is false"
    );
    assert(
      freshReadiness.readinessScore === null,
      "Readiness score is null (no fake data)"
    );

    // ----------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------
    await db.delete(users).where(eq(users.id, testUser[0].id));
    await db.delete(users).where(eq(users.id, freshUser[0].id));
    console.log("\n🧹 Test user cleanup completed.");

  } catch (error) {
    console.error("\n❌ Test execution error:", error);
    failed++;
  } finally {
    await pool.end();
  }

  console.log(`\n========================================`);
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
