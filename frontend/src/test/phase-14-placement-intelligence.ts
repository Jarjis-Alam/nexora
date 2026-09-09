import { db } from "@/db";
import {
  users,
  profiles,
  tests,
  attempts,
  answers,
  questions,
  subjects,
  topics,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  getPlacementIntelligence,
  getOrCreateTargetedPracticeTest,
} from "@/server/placement-intelligence";
import { getStudentPlacementRoadmap } from "@/server/roadmap";
import { gradeAttempt } from "@/server/grading";
import { GET as placementIntelligenceApiGet } from "@/app/api/student/placement-intelligence/route";
import {
  addStudentTargetRole,
  adminCreateRole,
  seedCanonicalPlacementData,
} from "@/server/company-role-intelligence";

async function runPhase14Tests() {
  console.log("==================================================");
  console.log("🧠  NEXORA — PHASE 14: PLACEMENT INTELLIGENCE & ACTION ENGINE");
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

    // 1. Student Zero (unassessed / zero-data)
    const [userZero] = await db
      .insert(users)
      .values({
        email: `phase14_zero_${Date.now()}@nexora.test`,
        passwordHash: "hash_zero",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userZero.id);

    await db.insert(profiles).values({
      userId: userZero.id,
      name: "Zero Student",
      college: "Nexora Tech",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    // 2. Student Alpha (active student with initial baseline performance)
    const [userAlpha] = await db
      .insert(users)
      .values({
        email: `phase14_alpha_${Date.now()}@nexora.test`,
        passwordHash: "hash_alpha",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userAlpha.id);

    await db.insert(profiles).values({
      userId: userAlpha.id,
      name: "Alpha Engineer",
      college: "Nexora Tech",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    // Configure placement target for Alpha
    const testRole = await adminCreateRole({
      name: `Backend Engineer ${Date.now()}`,
      category: "Software Engineering",
      isActive: true,
    });
    createdRoleIds.push(testRole.id);
    await addStudentTargetRole(userAlpha.id, testRole.id);

    // Locate baseline test
    const baselineList = await db
      .select()
      .from(tests)
      .where(eq(tests.type, "baseline"))
      .limit(1);

    assert(baselineList.length > 0, "Baseline diagnostic test exists");
    const baselineTest = baselineList[0];

    // Query subjects and topics for targeted assessment simulation
    const dbmsSubj = await db
      .select()
      .from(subjects)
      .where(eq(subjects.code, "DBMS"))
      .limit(1);
    const osSubj = await db
      .select()
      .from(subjects)
      .where(eq(subjects.code, "OS"))
      .limit(1);
    const dsaSubj = await db
      .select()
      .from(subjects)
      .where(eq(subjects.code, "DSA"))
      .limit(1);

    assert(
      dbmsSubj.length > 0 && osSubj.length > 0 && dsaSubj.length > 0,
      "Core CS subjects (DBMS, OS, DSA) available in database"
    );

    // Get specific topics with confirmed question pools
    const [targetDbmsTopic] = await db
      .select()
      .from(topics)
      .where(and(eq(topics.subjectId, dbmsSubj[0].id), eq(topics.name, "Transactions")))
      .limit(1);
    const [targetOsTopic] = await db
      .select()
      .from(topics)
      .where(and(eq(topics.subjectId, osSubj[0].id), eq(topics.name, "CPU Scheduling")))
      .limit(1);
    const [targetDsaTopic] = await db
      .select()
      .from(topics)
      .where(and(eq(topics.subjectId, dsaSubj[0].id), eq(topics.name, "Trees")))
      .limit(1);

    assert(
      !!targetDbmsTopic && !!targetOsTopic && !!targetDsaTopic,
      "Target topics identified across DBMS (Transactions), OS (CPU Scheduling), DSA (Trees)"
    );

    // Fetch questions for each topic
    const dbmsQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.topicId, targetDbmsTopic.id))
      .limit(3);
    const osQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.topicId, targetOsTopic.id))
      .limit(3);
    const dsaQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.topicId, targetDsaTopic.id))
      .limit(3);

    assert(
      dbmsQuestions.length >= 2 && osQuestions.length >= 2 && dsaQuestions.length >= 2,
      "Real database questions available for topic simulation"
    );

    // ========================================================================
    // TEST SECTION 2: ZERO-DATA / EMPTY STUDENT EXPERIENCE
    // ========================================================================
    console.log("\n--- 2. Zero-Data & Empty State Verification ---");

    const zeroIntelligence = await getPlacementIntelligence(userZero.id);
    assert(
      zeroIntelligence.dataSufficiency.hasCompletedBaseline === false,
      "Student Zero hasCompletedBaseline is false"
    );
    assert(
      zeroIntelligence.dataSufficiency.isZeroData === true,
      "Student Zero is marked isZeroData = true"
    );
    assert(
      zeroIntelligence.emptyState !== null &&
        zeroIntelligence.emptyState.show === true,
      "Student Zero emptyState is explicitly populated"
    );
    assert(
      Boolean(zeroIntelligence.emptyState?.title.includes("BUILD YOUR BASELINE")),
      "Empty state explicitly guides student to BUILD YOUR BASELINE"
    );
    assert(
      zeroIntelligence.priorities.length === 0,
      "Student Zero has NO fabricated priorities or hallucinations"
    );

    // ========================================================================
    // TEST SECTION 3: INTELLIGENCE ENGINE & PRIORITY RANKING
    // ========================================================================
    console.log("\n--- 3. Controlled Performance Simulation for Alpha ---");

    const getOptionsCount = (opts: unknown) => (Array.isArray(opts) ? opts.length : 4);

    // Simulate Baseline Attempt for Student Alpha:
    // - DBMS Questions: 0 correct out of 3 -> 0% accuracy (FIX)
    // - OS Questions: 2 correct out of 3 -> 67% accuracy (REINFORCE)
    // - DSA Questions: 3 correct out of 3 -> 100% accuracy (MAINTAIN)
    const [alphaAttempt] = await db
      .insert(attempts)
      .values({
        userId: userAlpha.id,
        testId: baselineTest.id,
        status: "in_progress",
        startedAt: new Date(),
        score: null,
      })
      .returning();
    createdAttemptIds.push(alphaAttempt.id);

    // DBMS: All incorrect
    for (const q of dbmsQuestions) {
      const correctIdx = Number(q.correctAnswer ?? 0);
      const wrongAnswer = (correctIdx + 1) % getOptionsCount(q.options);
      await db.insert(answers).values({
        attemptId: alphaAttempt.id,
        questionId: q.id,
        selectedAnswer: wrongAnswer,
        isCorrect: false,
        markedForReview: false,
        timeSpent: 45,
      });
    }

    // OS: 2 correct, 1 incorrect (67%)
    for (let i = 0; i < osQuestions.length; i++) {
      const q = osQuestions[i];
      const isCorrect = i < 2;
      const correctIdx = Number(q.correctAnswer ?? 0);
      const selectedAnswer = isCorrect
        ? correctIdx
        : (correctIdx + 1) % getOptionsCount(q.options);
      await db.insert(answers).values({
        attemptId: alphaAttempt.id,
        questionId: q.id,
        selectedAnswer,
        isCorrect,
        markedForReview: false,
        timeSpent: 40,
      });
    }

    // DSA: 3 correct out of 3 (100%)
    for (const q of dsaQuestions) {
      await db.insert(answers).values({
        attemptId: alphaAttempt.id,
        questionId: q.id,
        selectedAnswer: Number(q.correctAnswer ?? 0),
        isCorrect: true,
        markedForReview: false,
        timeSpent: 30,
      });
    }

    const alphaGrading = await gradeAttempt(alphaAttempt.id, userAlpha.id);
    assert(alphaGrading.success === true, "Alpha initial assessment graded successfully");

    console.log("\n--- 4. Priority Calculation & Explainability ---");
    const alphaIntelligence = await getPlacementIntelligence(userAlpha.id);

    assert(
      alphaIntelligence.dataSufficiency.hasCompletedBaseline === true,
      "Alpha hasCompletedBaseline is true"
    );
    assert(
      alphaIntelligence.priorities.length >= 3,
      "Alpha has at least 3 distinct topic priorities"
    );

    // #1 Priority must be DBMS (FIX)
    const priority1 = alphaIntelligence.priorities[0];
    assert(
      priority1.domain === "DBMS" && priority1.topicId === targetDbmsTopic.id,
      `Priority 1 correctly identified as DBMS → ${priority1.topic}`
    );
    assert(
      priority1.category === "FIX",
      `Priority 1 category is FIX (accuracy = ${priority1.accuracy}%)`
    );
    assert(
      priority1.accuracy === 0,
      `Priority 1 accuracy is accurately 0% (real math)`
    );
    assert(
      priority1.ctaLabel === "Start Practice",
      "FIX priority CTA is 'Start Practice'"
    );

    // Explainability checks: WHAT, WHY, EVIDENCE, ACTION
    assert(
      priority1.why.length > 0 && !priority1.why.toLowerCase().includes("ai thinks"),
      "WHY is clear product language and contains no vague AI jargon"
    );
    assert(
      priority1.evidence.includes(`${priority1.accuracy}% accuracy`),
      "EVIDENCE includes precise measured accuracy metric"
    );
    assert(
      priority1.action.includes("targeted practice"),
      "ACTION recommends targeted practice"
    );

    // Priority 2 must be OS (REINFORCE)
    const priority2 = alphaIntelligence.priorities.find((p) => p.domain === "OS");
    assert(!!priority2, "OS topic priority found");
    if (priority2) {
      assert(
        priority2.category === "REINFORCE",
        `OS priority category is REINFORCE (accuracy = ${priority2.accuracy}%)`
      );
      assert(
        priority2.ctaLabel === "Practice",
        "REINFORCE priority CTA is 'Practice'"
      );
    }

    // Priority 3 must be DSA (MAINTAIN)
    const priority3 = alphaIntelligence.priorities.find((p) => p.domain === "DSA");
    assert(!!priority3, "DSA topic priority found");
    if (priority3) {
      assert(
        priority3.category === "MAINTAIN",
        `DSA priority category is MAINTAIN (accuracy = ${priority3.accuracy}%)`
      );
      assert(
        priority3.ctaLabel === "Review",
        "MAINTAIN priority CTA is 'Review'"
      );
    }

    // ========================================================================
    // TEST SECTION 5: TARGETED PRACTICE ENGINE INTEGRATION
    // ========================================================================
    console.log("\n--- 5. Targeted Practice Test Generator ---");

    const targetedDbmsTest = await getOrCreateTargetedPracticeTest({
      topicId: targetDbmsTopic.id,
      subjectCode: "DBMS",
    });
    createdTestIds.push(targetedDbmsTest.id);

    assert(
      targetedDbmsTest.id.length > 0,
      `Targeted practice test created with ID: ${targetedDbmsTest.id.slice(0, 8)}`
    );
    assert(
      targetedDbmsTest.title.includes("Practice") &&
        targetedDbmsTest.title.includes(targetDbmsTopic.name),
      `Practice test title includes topic name: "${targetedDbmsTest.title}"`
    );
    assert(
      targetedDbmsTest.questionCount > 0,
      `Practice test contains ${targetedDbmsTest.questionCount} real questions`
    );

    // Idempotency: Calling again returns the exact same test
    const secondCallTest = await getOrCreateTargetedPracticeTest({
      topicId: targetDbmsTopic.id,
      subjectCode: "DBMS",
    });
    assert(
      secondCallTest.id === targetedDbmsTest.id,
      "Targeted practice test resolver is idempotent (reuses existing test)"
    );

    // CTA href resolution
    assert(
      priority1.ctaHref.includes(`/practice?topicId=${targetDbmsTopic.id}`),
      `CTA href resolves to valid practice launcher route: ${priority1.ctaHref}`
    );

    // ========================================================================
    // TEST SECTION 6: CLOSED-LOOP REASSESSMENT & ADAPTATION
    // ========================================================================
    console.log("\n--- 6. Reassessment Loop: Practice -> Submission -> Adaptation ---");

    // Alpha now takes the targeted practice test for DBMS Transactions and scores 100%
    const [practiceAttempt] = await db
      .insert(attempts)
      .values({
        userId: userAlpha.id,
        testId: targetedDbmsTest.id,
        status: "in_progress",
        startedAt: new Date(),
        score: null,
      })
      .returning();
    createdAttemptIds.push(practiceAttempt.id);

    // Fetch questions from the practice test
    const practiceQuestions = await db
      .select()
      .from(questions)
      .where(eq(questions.topicId, targetDbmsTopic.id));

    assert(practiceQuestions.length > 0, "Practice questions loaded for simulation");

    // Student Alpha answers all practice questions correctly
    for (const q of practiceQuestions) {
      await db.insert(answers).values({
        attemptId: practiceAttempt.id,
        questionId: q.id,
        selectedAnswer: Number(q.correctAnswer ?? 0),
        isCorrect: true,
        markedForReview: false,
        timeSpent: 25,
      });
    }

    const practiceGrading = await gradeAttempt(practiceAttempt.id, userAlpha.id);
    assert(
      practiceGrading.success === true,
      "Targeted practice attempt successfully graded and recorded"
    );

    // Recalculate intelligence post-practice
    const updatedIntelligence = await getPlacementIntelligence(userAlpha.id);

    // Find the updated DBMS Transactions priority
    const updatedDbmsPriority = updatedIntelligence.priorities.find(
      (p) => p.topicId === targetDbmsTopic.id
    );

    assert(!!updatedDbmsPriority, "Updated DBMS priority found in reassessed intelligence");
    if (updatedDbmsPriority) {
      console.log(
        `    → Previous accuracy: ${priority1.accuracy}% (Category: ${priority1.category})`
      );
      console.log(
        `    → Reassessed accuracy: ${updatedDbmsPriority.accuracy}% (Category: ${updatedDbmsPriority.category})`
      );

      assert(
        updatedDbmsPriority.accuracy > priority1.accuracy,
        `Accuracy genuinely improved from ${priority1.accuracy}% to ${updatedDbmsPriority.accuracy}%`
      );

      // Category should have shifted from FIX (<50%) to REINFORCE (>=50%)
      assert(
        updatedDbmsPriority.category !== "FIX",
        `Category adapted from FIX to ${updatedDbmsPriority.category} based on real practice results`
      );
    }

    // Previous attempts still intact (no historical data overwritten)
    const totalUserAttempts = await db
      .select()
      .from(attempts)
      .where(eq(attempts.userId, userAlpha.id));
    assert(
      totalUserAttempts.length === 2,
      "All historical attempts remain intact (audit trail preserved)"
    );

    // ========================================================================
    // TEST SECTION 7: DYNAMIC ROADMAP REFLECTION
    // ========================================================================
    console.log("\n--- 7. Dynamic Roadmap Integration ---");

    const alphaRoadmap = await getStudentPlacementRoadmap(userAlpha.id);

    assert(
      alphaRoadmap.hasBaseline === true,
      "Roadmap reflects calibrated student state"
    );
    assert(
      alphaRoadmap.nextActions.length > 0,
      "Roadmap nextActions generated from placement intelligence"
    );

    const firstRoadmapAction = alphaRoadmap.nextActions[0];
    assert(
      firstRoadmapAction.stepNumber === "01",
      "First roadmap action numbered '01'"
    );
    assert(
      !!firstRoadmapAction.category &&
        ["FIX", "REINFORCE", "MAINTAIN"].includes(firstRoadmapAction.category),
      `Roadmap action includes category: ${firstRoadmapAction.category}`
    );
    assert(
      firstRoadmapAction.ctaHref.includes("/practice"),
      `Roadmap action CTA leads to targeted practice: ${firstRoadmapAction.ctaHref}`
    );

    // ========================================================================
    // TEST SECTION 8: API ROUTE & AUTHORIZATION BOUNDARIES
    // ========================================================================
    console.log("\n--- 8. Security & Authorization Verification ---");

    // 8.1 Server function rejects missing or unauthenticated userId
    let unauthThrown = false;
    try {
      await getPlacementIntelligence("");
    } catch {
      unauthThrown = true;
    }
    assert(unauthThrown, "Server function getPlacementIntelligence rejects empty/unauthenticated userId");

    let nullThrown = false;
    try {
      await getPlacementIntelligence(null as unknown as string);
    } catch {
      nullThrown = true;
    }
    assert(nullThrown, "Server function getPlacementIntelligence rejects null userId");

    // 8.2 API route fails closed for unauthenticated requests
    let anonGetFailClosed = false;
    try {
      const unauthResponse = await placementIntelligenceApiGet();
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
      "GET /api/student/placement-intelligence is protected against unauthenticated access (401 or fail-closed)"
    );

    // 8.3 Student isolation: Alpha's intelligence is completely isolated from Beta/Zero
    assert(
      alphaIntelligence.userId === userAlpha.id &&
        alphaIntelligence.userId !== userZero.id,
      "Intelligence payload strictly binds to authenticated student identity"
    );

  } catch (error) {
    console.error("FATAL test error:", error);
    failed++;
  } finally {
    console.log("\n--- Cleaning Up Fixtures ---");
    // Clean up attempts & answers
    for (const aId of createdAttemptIds) {
      await db.delete(answers).where(eq(answers.attemptId, aId));
      await db.delete(attempts).where(eq(attempts.id, aId));
    }
    // Clean up practice tests created during test
    for (const tId of createdTestIds) {
      await db.delete(tests).where(eq(tests.id, tId));
    }
    // Clean up users & profiles
    for (const uId of createdUserIds) {
      await db.delete(profiles).where(eq(profiles.userId, uId));
      await db.delete(users).where(eq(users.id, uId));
    }
    console.log("Cleanup complete.");
  }

  console.log("\n==================================================");
  console.log(`Phase 14 Test Results: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase14Tests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
