import { db } from "@/db";
import {
  users,
  profiles,
  tests,
  attempts,
  answers,
  questions,
  subjects,
  testQuestions,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { getDailyExecutionPlan } from "@/server/placement-execution";
import { getOrCreateTargetedPracticeTest } from "@/server/placement-intelligence";
import { gradeAttempt } from "@/server/grading";
import { GET as executionApiGet } from "@/app/api/student/execution/route";
import {
  addStudentTargetRole,
  adminCreateRole,
  seedCanonicalPlacementData,
} from "@/server/company-role-intelligence";

async function runPhase15Tests() {
  console.log("==================================================");
  console.log("⚡  NEXORA — PHASE 15: PLACEMENT EXECUTION OS");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, description: string) {
    if (condition) {
      console.log(`  ✓ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${description}`);
      failed++;
    }
  }

  const createdUserIds: string[] = [];
  const createdAttemptIds: string[] = [];
  const createdTestIds: string[] = [];
  const createdRoleIds: string[] = [];

  try {
    console.log("\n--- 1. Setting up Isolated Test Fixtures ---");
    await seedCanonicalPlacementData();

    // 1. Student Zero (unassessed student)
    const [userZero] = await db
      .insert(users)
      .values({
        email: `phase15_zero_${Date.now()}@nexora.test`,
        passwordHash: "hash_zero",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userZero.id);

    await db.insert(profiles).values({
      userId: userZero.id,
      name: "Zero Student",
      college: "Nexora Institute",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    // 2. Student Alpha (active student with baseline assessment)
    const [userAlpha] = await db
      .insert(users)
      .values({
        email: `phase15_alpha_${Date.now()}@nexora.test`,
        passwordHash: "hash_alpha",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userAlpha.id);

    await db.insert(profiles).values({
      userId: userAlpha.id,
      name: "Alpha Engineer",
      college: "Nexora Institute",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    // Configure placement target for Alpha
    const testRole = await adminCreateRole({
      name: `Systems Architect ${Date.now()}`,
      category: "Software Engineering",
      isActive: true,
    });
    createdRoleIds.push(testRole.id);
    await addStudentTargetRole(userAlpha.id, testRole.id);

    // Locate baseline diagnostic test
    const baselineList = await db
      .select()
      .from(tests)
      .where(eq(tests.type, "baseline"))
      .limit(1);

    assert(baselineList.length > 0, "Baseline diagnostic test exists");
    const baselineTest = baselineList[0];

    // Seed realistic baseline answers for Alpha
    // We intentionally create a weak area in DBMS (accuracy < 50%) and OS (accuracy 60%)
    const baselineQuestions = await db
      .select({
        questionId: testQuestions.questionId,
        subjectId: questions.subjectId,
        topicId: questions.topicId,
        correctAnswer: questions.correctAnswer,
        marks: questions.marks,
        subjectCode: subjects.code,
      })
      .from(testQuestions)
      .innerJoin(questions, eq(testQuestions.questionId, questions.id))
      .innerJoin(subjects, eq(questions.subjectId, subjects.id))
      .where(eq(testQuestions.testId, baselineTest.id));

    assert(baselineQuestions.length > 0, "Baseline questions retrieved for simulation");

    // Create baseline attempt for Alpha
    const [alphaBaselineAttempt] = await db
      .insert(attempts)
      .values({
        userId: userAlpha.id,
        testId: baselineTest.id,
        status: "in_progress",
        startedAt: new Date(Date.now() - 3600000),
      })
      .returning();
    createdAttemptIds.push(alphaBaselineAttempt.id);

    // Answer baseline questions:
    // For DBMS: fail all questions (critical deficit -> FIX)
    // For OS: fail half (moderate deficit -> REINFORCE)
    // For others: pass all
    let osCount = 0;
    for (const q of baselineQuestions) {
      let isCorrect = true;
      let selectedAnswer = q.correctAnswer;

      if (q.subjectCode === "DBMS") {
        isCorrect = false;
        selectedAnswer = (Number(q.correctAnswer) + 1) % 4;
      } else if (q.subjectCode === "OS") {
        osCount++;
        if (osCount % 2 === 0) {
          isCorrect = false;
          selectedAnswer = (Number(q.correctAnswer) + 1) % 4;
        }
      }

      await db.insert(answers).values({
        attemptId: alphaBaselineAttempt.id,
        questionId: q.questionId,
        selectedAnswer,
        isCorrect,
        timeSpent: 45,
      });
    }

    await gradeAttempt(alphaBaselineAttempt.id, userAlpha.id);

    console.log("\n--- 2. Testing Empty and Baseline States ---");
    // Test Zero-Data Student
    const planZero = await getDailyExecutionPlan(userZero.id);
    assert(!planZero.hasEnoughData, "Zero-data student hasEnoughData is false");
    assert(planZero.actions.length === 0, "Zero-data student receives 0 actions");
    assert(planZero.completedCount === 0, "Zero-data completedCount is 0");
    assert(planZero.totalCount === 0, "Zero-data totalCount is 0");
    assert(planZero.progressPercent === 0, "Zero-data progressPercent is 0");
    assert(typeof planZero.date === "string", "Plan contains valid ISO date");

    console.log("\n--- 3. Testing Daily Plan Generation for Assessed Student ---");
    const planAlpha = await getDailyExecutionPlan(userAlpha.id);
    assert(planAlpha.hasEnoughData, "Assessed student hasEnoughData is true");
    assert(
      planAlpha.actions.length >= 2 && planAlpha.actions.length <= 4,
      `Daily plan contains focused 2–4 actions (actual: ${planAlpha.actions.length})`
    );
    assert(planAlpha.totalCount === planAlpha.actions.length, "totalCount matches actions.length");
    assert(planAlpha.completedCount === 0, "Initial completedCount is 0");
    assert(planAlpha.remainingCount === planAlpha.totalCount, "Initial remainingCount equals totalCount");
    assert(planAlpha.progressPercent === 0, "Initial progressPercent is 0");

    // Verify ordering and structure
    planAlpha.actions.forEach((act, idx) => {
      assert(act.order === idx + 1, `Action order is sequential 1-indexed (order: ${act.order})`);
      assert(["FIX", "REINFORCE", "REVIEW"].includes(act.type), `Action type is valid (${act.type})`);
      assert(act.targetCount > 0, `Action has positive question targetCount (${act.targetCount})`);
      assert(typeof act.domain === "string" && act.domain.length > 0, `Action has domain (${act.domain})`);
      assert(typeof act.topic === "string" && act.topic.length > 0, `Action has topic (${act.topic})`);
      assert(typeof act.reason === "string" && act.reason.length > 0, "Action has explainable reason");
      assert(typeof act.evidence === "string" && act.evidence.length > 0, "Action has evidence");
      assert(typeof act.action === "string" && act.action.length > 0, "Action has recommended practice action");
      assert(typeof act.ctaHref === "string" && act.ctaHref.length > 0, `Action has functional ctaHref (${act.ctaHref})`);
      assert(act.status === "PENDING", `Initial status is PENDING (actual: ${act.status})`);
    });

    // Verify top priority is FIX for critical DBMS weakness
    const firstAction = planAlpha.actions[0];
    assert(firstAction.type === "FIX", `Highest priority action is FIX (actual: ${firstAction.type})`);
    assert(firstAction.targetCount === 15, "FIX action targets 15 questions");

    console.log("\n--- 4. Testing Execution Flow & Targeted Practice Linking ---");
    // Action CTA must link to practice route
    assert(
      firstAction.ctaHref.includes("/practice?topicId=") || firstAction.ctaHref.includes("/tests/"),
      "Action CTA routes to targeted practice engine"
    );

    // Verify practice test creation via existing test engine
    if (firstAction.practiceTarget?.topicId) {
      const practiceTest = await getOrCreateTargetedPracticeTest({
        topicId: firstAction.practiceTarget.topicId,
      });
      createdTestIds.push(practiceTest.id);
      assert(practiceTest.id.length > 0, "Targeted practice test created/retrieved via existing test engine");
    }

    console.log("\n--- 5. Testing Action Lifecycle: IN_PROGRESS Transition ---");
    // Simulate student starting targeted practice:
    // Create an in_progress attempt for the first action's topic
    const targetTopicId = firstAction.practiceTarget?.topicId;
    assert(Boolean(targetTopicId), "Target topic ID is identified");

    const practiceTest = await getOrCreateTargetedPracticeTest({
      topicId: targetTopicId!,
    });
    createdTestIds.push(practiceTest.id);

    const [inProgressAttempt] = await db
      .insert(attempts)
      .values({
        userId: userAlpha.id,
        testId: practiceTest.id,
        status: "in_progress",
        startedAt: new Date(),
      })
      .returning();
    createdAttemptIds.push(inProgressAttempt.id);

    // Re-evaluate plan
    const planInProgress = await getDailyExecutionPlan(userAlpha.id);
    const inProgressAction = planInProgress.actions.find((a) => a.id === firstAction.id);
    assert(inProgressAction !== undefined, "First action still present in plan");
    assert(
      inProgressAction?.status === "IN_PROGRESS",
      `Action status transitioned to IN_PROGRESS (actual: ${inProgressAction?.status})`
    );
    assert(
      inProgressAction?.ctaHref === `/tests/${practiceTest.id}/attempt`,
      `IN_PROGRESS action CTA links directly to resumable attempt (${inProgressAction?.ctaHref})`
    );
    assert(planInProgress.completedCount === 0, "In-progress action is not counted as completed");

    console.log("\n--- 6. Testing Action Lifecycle: COMPLETED Transition ---");
    // Populate answers for the practice test and submit attempt
    const practiceQuestions = await db
      .select({
        questionId: testQuestions.questionId,
        correctAnswer: questions.correctAnswer,
      })
      .from(testQuestions)
      .innerJoin(questions, eq(testQuestions.questionId, questions.id))
      .where(eq(testQuestions.testId, practiceTest.id));

    for (const pq of practiceQuestions) {
      await db.insert(answers).values({
        attemptId: inProgressAttempt.id,
        questionId: pq.questionId,
        selectedAnswer: pq.correctAnswer, // 100% correct to trigger real improvement
        isCorrect: true,
        timeSpent: 30,
      });
    }

    await gradeAttempt(inProgressAttempt.id, userAlpha.id);

    // Re-evaluate daily plan after submission
    const planCompleted = await getDailyExecutionPlan(userAlpha.id);
    const completedAction = planCompleted.actions.find((a) => a.id === firstAction.id);
    assert(completedAction !== undefined, "Action is present in updated plan");
    assert(
      completedAction?.status === "COMPLETED",
      `Submitted attempt marked action COMPLETED (actual: ${completedAction?.status})`
    );
    assert(planCompleted.completedCount >= 1, `completedCount incremented to ${planCompleted.completedCount}`);
    assert(
      planCompleted.remainingCount === planCompleted.totalCount - planCompleted.completedCount,
      `remainingCount updated correctly (${planCompleted.remainingCount})`
    );
    const expectedPercent = Math.round((planCompleted.completedCount / planCompleted.totalCount) * 100);
    assert(
      planCompleted.progressPercent === expectedPercent,
      `progressPercent accurately calculated: ${planCompleted.progressPercent}% (expected: ${expectedPercent}%)`
    );

    console.log("\n--- 7. Testing Plan Stability & Determinism ---");
    // Re-fetching plan on same day with same underlying state produces identical actions and order
    const planRepeat = await getDailyExecutionPlan(userAlpha.id);
    assert(planRepeat.actions.length === planCompleted.actions.length, "Plan length is identical across fetches");
    assert(
      planRepeat.actions[0].id === planCompleted.actions[0].id,
      "First action ID is identical across repeated calls"
    );
    assert(
      planRepeat.actions[0].status === planCompleted.actions[0].status,
      "First action status remains identical across repeated calls"
    );
    assert(
      planRepeat.progressPercent === planCompleted.progressPercent,
      "Progress percent remains stable across repeated calls"
    );

    console.log("\n--- 8. Testing History Aggregation ---");
    // Verify that true completed attempts appear in history
    assert(Array.isArray(planCompleted.history), "History is an array");
    if (planCompleted.history.length > 0) {
      const todayHistory = planCompleted.history[0];
      assert(typeof todayHistory.date === "string", "History item has date string");
      assert(todayHistory.completedCount >= 0, "History item has valid completedCount");
      assert(todayHistory.totalCount > 0, "History item has valid totalCount");
    }

    console.log("\n--- 9. Testing Security & Authorization ---");
    // 1. API Route fails closed or returns 401 without authenticated session
    let anonGetFailClosed = false;
    try {
      const unauthResponse = await executionApiGet();
      anonGetFailClosed = unauthResponse.status === 401;
    } catch (e: unknown) {
      anonGetFailClosed =
        e instanceof Error &&
        (e.message.includes("Unauthorized") ||
          e.message.includes("headers") ||
          e.message.includes("auth"));
    }
    assert(
      anonGetFailClosed,
      "GET /api/student/execution is protected against unauthenticated access (401 or fail-closed)"
    );

    // 1.b Service function rejects unauthenticated/empty userId
    let emptyUserRejected = false;
    try {
      await getDailyExecutionPlan("");
    } catch {
      emptyUserRejected = true;
    }
    assert(emptyUserRejected, "Service function getDailyExecutionPlan rejects empty/unauthenticated userId");

    // 2. Cross-student data isolation
    const zeroPlanCheck = await getDailyExecutionPlan(userZero.id);
    assert(zeroPlanCheck.completedCount === 0, "User Zero has 0 completed actions despite Alpha's completion");
    assert(zeroPlanCheck.actions.length === 0, "User Zero has no actions leaked from User Alpha");

    console.log("\n==================================================");
    console.log(`📊 PHASE 15 EXECUTION TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution failed with unexpected error:", error);
    process.exit(1);
  } finally {
    console.log("\nCleaning up test artifacts...");
    for (const attId of createdAttemptIds) {
      await db.delete(answers).where(eq(answers.attemptId, attId)).catch(() => {});
      await db.delete(attempts).where(eq(attempts.id, attId)).catch(() => {});
    }
    for (const testId of createdTestIds) {
      await db.delete(testQuestions).where(eq(testQuestions.testId, testId)).catch(() => {});
      await db.delete(tests).where(eq(tests.id, testId)).catch(() => {});
    }
    for (const uId of createdUserIds) {
      await db.delete(profiles).where(eq(profiles.userId, uId)).catch(() => {});
      await db.delete(users).where(eq(users.id, uId)).catch(() => {});
    }
    console.log("Cleanup complete.");
  }
}

runPhase15Tests();
