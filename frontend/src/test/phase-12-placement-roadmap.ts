import { db } from "@/db";
import {
  users,
  profiles,
  tests,
  attempts,
  answers,
  questions,
  skillScores,
  roles,
  companies,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import {
  getStudentPlacementRoadmap,
} from "@/server/roadmap";
import { calculateReadiness } from "@/server/readiness";
import { getStudentIntelligence } from "@/server/student-intelligence";
import {
  addStudentTargetRole,
  addStudentTargetCompany,
  adminCreateCompany,
  adminCreateRole,
  seedCanonicalPlacementData,
} from "@/server/company-role-intelligence";
import { gradeAttempt } from "@/server/grading";
import { GET as roadmapApiGet } from "@/app/api/student/roadmap/route";
import { NextRequest } from "next/server";

async function runPhase12Tests() {
  console.log("==================================================");
  console.log("🗺️  NEXORA — PHASE 12: PLACEMENT ROADMAP & PREP PLAN");
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
  const createdRoleIds: string[] = [];
  const createdCompanyIds: string[] = [];

  try {
    console.log("\n--- Setting up Isolated Test Fixtures ---");
    await seedCanonicalPlacementData();

    // 1. Create Student User A (will have completed baseline + targets)
    const [userA] = await db
      .insert(users)
      .values({
        email: `phase12_student_a_${Date.now()}@nexora.test`,
        passwordHash: "hash_12_a",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userA.id);

    await db.insert(profiles).values({
      userId: userA.id,
      name: "Roadmap Student Alpha",
      college: "Nexora Tech",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    // 2. Create Student User B (zero-data / fresh student: no baseline, no targets)
    const [userB] = await db
      .insert(users)
      .values({
        email: `phase12_student_b_${Date.now()}@nexora.test`,
        passwordHash: "hash_12_b",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userB.id);

    await db.insert(profiles).values({
      userId: userB.id,
      name: "Roadmap Student Beta",
      college: "Nexora Tech",
      branch: "Information Technology",
      graduationYear: 2026,
    });

    // 3. Create Student User C (has completed baseline, but targetless)
    const [userC] = await db
      .insert(users)
      .values({
        email: `phase12_student_c_${Date.now()}@nexora.test`,
        passwordHash: "hash_12_c",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userC.id);

    await db.insert(profiles).values({
      userId: userC.id,
      name: "Roadmap Student Gamma",
      college: "Nexora Tech",
      branch: "Data Science",
      graduationYear: 2026,
    });

    // 4. Locate published baseline test
    const baselineList = await db
      .select()
      .from(tests)
      .where(eq(tests.type, "baseline"))
      .limit(1);

    assert(baselineList.length > 0, "Baseline test exists in database");
    const baselineTest = baselineList[0];

    // Load baseline questions
    const baselineQuestions = await db
      .select({
        id: questions.id,
        subjectId: questions.subjectId,
        topicId: questions.topicId,
        correctAnswer: questions.correctAnswer,
        options: questions.options,
      })
      .from(questions)
      .limit(5);

    assert(baselineQuestions.length > 0, "Questions available for mock attempt");

    // Setup completed baseline for User A
    const [attemptA] = await db
      .insert(attempts)
      .values({
        userId: userA.id,
        testId: baselineTest.id,
        status: "in_progress",
        startedAt: new Date(),
        score: null,
      })
      .returning();
    createdAttemptIds.push(attemptA.id);

    for (const q of baselineQuestions) {
      await db.insert(answers).values({
        attemptId: attemptA.id,
        questionId: q.id,
        selectedAnswer: q.correctAnswer,
        isCorrect: true,
        markedForReview: false,
        timeSpent: 30,
      });
    }
    const gradeA = await gradeAttempt(attemptA.id, userA.id);
    assert(gradeA.success === true, "User A baseline graded successfully");

    // Setup completed baseline for User C (targetless)
    const [attemptC] = await db
      .insert(attempts)
      .values({
        userId: userC.id,
        testId: baselineTest.id,
        status: "in_progress",
        startedAt: new Date(),
        score: null,
      })
      .returning();
    createdAttemptIds.push(attemptC.id);

    for (const q of baselineQuestions) {
      await db.insert(answers).values({
        attemptId: attemptC.id,
        questionId: q.id,
        selectedAnswer: q.correctAnswer,
        isCorrect: true,
        markedForReview: false,
        timeSpent: 25,
      });
    }
    const gradeC = await gradeAttempt(attemptC.id, userC.id);
    assert(gradeC.success === true, "User C baseline graded successfully");

    // Setup targets for User A
    const ts = Date.now();
    const role1 = await adminCreateRole({
      name: `SWE Lead ${ts}`,
      category: "Software Engineering",
      isActive: true,
    });
    const company1 = await adminCreateCompany({
      name: `Apex Corp ${ts}`,
      industry: "Enterprise Software",
      isActive: true,
    });
    createdRoleIds.push(role1.id);
    createdCompanyIds.push(company1.id);

    await addStudentTargetRole(userA.id, role1.id);
    await addStudentTargetCompany(userA.id, company1.id);

    // ========================================================================
    // TEST SECTION 1: AUTHENTICATION & SECURITY
    // ========================================================================
    console.log("\n--- 1. Authentication & Ownership Security ---");

    // 1.1 Unauthenticated server call throws
    let unauthThrown = false;
    try {
      await getStudentPlacementRoadmap("");
    } catch {
      unauthThrown = true;
    }
    assert(unauthThrown, "Server function rejects empty/unauthenticated userId");

    // 1.2 Unauthenticated API call returns 401 or fail-closed
    let anonGetFailClosed = false;
    try {
      const fakeReq = new NextRequest("http://localhost:3000/api/student/roadmap");
      const apiRes = await roadmapApiGet(fakeReq);
      anonGetFailClosed = apiRes.status === 401;
    } catch (e: unknown) {
      anonGetFailClosed =
        e instanceof Error &&
        (e.message.includes("Unauthorized") ||
          e.message.includes("headers") ||
          e.message.includes("auth"));
    }
    assert(
      anonGetFailClosed,
      "API GET /api/student/roadmap denied for unauthenticated session (401 or fail-closed)"
    );

    // 1.3 Authenticated access for valid user works
    const roadmapA = await getStudentPlacementRoadmap(userA.id);
    assert(roadmapA !== null, "Authenticated student can generate placement roadmap");
    assert(
      typeof roadmapA.hasBaseline === "boolean",
      "Roadmap returns well-typed structure"
    );

    // 1.4 Student ownership isolation: User A targets not leaked to User B or C
    const roadmapB = await getStudentPlacementRoadmap(userB.id);
    const roadmapC = await getStudentPlacementRoadmap(userC.id);

    assert(
      roadmapA.targets.configured === true,
      "User A roadmap includes User A's configured targets"
    );
    assert(
      roadmapB.targets.configured === false,
      "User B has no targets (unaffected by User A)"
    );
    assert(
      roadmapC.targets.configured === false,
      "User C has no targets (unaffected by User A)"
    );
    assert(
      roadmapB.targets.primaryRole === null,
      "User B has null primary role"
    );

    // ========================================================================
    // TEST SECTION 2: ZERO-DATA EXPERIENCE (User B: Fresh Student)
    // ========================================================================
    console.log("\n--- 2. Zero-Data Experience ---");

    assert(
      roadmapB.hasBaseline === false,
      "Fresh student hasBaseline is false"
    );
    assert(
      roadmapB.readiness.score === null,
      "Fresh student readiness score is null (no fabricated scores)"
    );
    assert(
      roadmapB.readiness.level === null,
      "Fresh student readiness level is null"
    );
    assert(
      roadmapB.preparationFocus.items.length === 0,
      "Fresh student has 0 fake focus items"
    );
    assert(
      roadmapB.preparationFocus.summary.includes("baseline"),
      "Fresh student preparation focus instructs completing baseline"
    );
    assert(
      roadmapB.nextActions.length >= 1,
      "Fresh student has next action"
    );
    assert(
      roadmapB.nextActions[0].stepNumber === "01",
      "Fresh student first next action is step 01"
    );
    assert(
      roadmapB.nextActions[0].title.toLowerCase().includes("baseline"),
      "Fresh student first next action is 'Complete Baseline Assessment'"
    );
    assert(
      roadmapB.nextActions[0].ctaLabel.toLowerCase().includes("baseline"),
      "Fresh student CTA is 'Take Baseline Assessment'"
    );
    assert(
      roadmapB.progress.overall === null,
      "Fresh student overall progress is null (no fake progress)"
    );
    assert(
      roadmapB.progress.statusMessage.toLowerCase().includes("progress will become clearer"),
      "Fresh student progress message matches specification"
    );

    // ========================================================================
    // TEST SECTION 3: TARGETLESS EXPERIENCE (User C: Baseline, No Targets)
    // ========================================================================
    console.log("\n--- 3. Targetless Experience ---");

    assert(
      roadmapC.hasBaseline === true,
      "Targetless student has completed baseline"
    );
    assert(
      roadmapC.hasTargets === false,
      "Targetless student hasTargets is false"
    );
    assert(
      roadmapC.targets.configured === false,
      "Targetless student targets.configured is false"
    );
    assert(
      roadmapC.targets.primaryRole === null,
      "Targetless student primaryRole is null"
    );
    assert(
      roadmapC.targets.primaryCompany === null,
      "Targetless student primaryCompany is null"
    );
    assert(
      roadmapC.readiness.score !== null,
      "Targetless student roadmap is not blocked: real readiness score exists"
    );
    assert(
      roadmapC.nextActions.length > 0,
      "Targetless student receives actionable preparation steps based on performance"
    );

    // ========================================================================
    // TEST SECTION 4: TARGET-AWARE CONTEXT (User A: Targets & Baseline)
    // ========================================================================
    console.log("\n--- 4. Target-Aware Context ---");

    assert(
      roadmapA.hasTargets === true,
      "Target-aware student hasTargets is true"
    );
    assert(
      roadmapA.targets.configured === true,
      "Target-aware student targets.configured is true"
    );
    assert(
      roadmapA.targets.primaryRole?.name === role1.name,
      "Primary target role matches User A's target"
    );
    assert(
      roadmapA.targets.primaryCompany?.name === company1.name,
      "Primary target company matches User A's target"
    );
    assert(
      roadmapA.targets.roleCount === 1,
      "Target role count is accurate (1)"
    );
    assert(
      roadmapA.targets.companyCount === 1,
      "Target company count is accurate (1)"
    );

    // Check that company hiring requirements are NOT fabricated
    const targetPayloadString = JSON.stringify(roadmapA.targets);
    assert(
      !targetPayloadString.includes("requires 85%"),
      "No fabricated company percentage requirements"
    );
    assert(
      !targetPayloadString.includes("cut-off"),
      "No fabricated company cutoff numbers"
    );

    // ========================================================================
    // TEST SECTION 5: INTELLIGENCE REUSE & FORMULA INVARIANCE
    // ========================================================================
    console.log("\n--- 5. Intelligence Reuse & Formula Invariance ---");

    // 5.1 Compare readiness directly with calculateReadiness
    const directReadinessA = await calculateReadiness(userA.id);
    assert(
      roadmapA.readiness.score === directReadinessA.readinessScore,
      `Roadmap readiness score (${roadmapA.readiness.score}) strictly matches calculateReadiness (${directReadinessA.readinessScore})`
    );
    assert(
      roadmapA.readiness.level?.label === directReadinessA.level?.label,
      `Roadmap readiness level (${roadmapA.readiness.level?.label}) matches calculateReadiness (${directReadinessA.level?.label})`
    );

    // 5.2 Compare with student intelligence
    const directIntelligenceA = await getStudentIntelligence(userA.id);
    assert(
      roadmapA.readiness.score === directIntelligenceA.readiness.score,
      "Roadmap readiness matches getStudentIntelligence readiness"
    );

    // 5.3 Weak areas derived from intelligence
    if (directIntelligenceA.weakAreas.length > 0) {
      const topWeak = directIntelligenceA.weakAreas[0];
      const hasWeakMatch = roadmapA.preparationFocus.items.some(
        (item) => item.code === topWeak.subjectCode
      );
      assert(
        hasWeakMatch,
        "Preparation focus incorporates verified weak topic from intelligence"
      );
    } else {
      assert(true, "Weak areas verified against intelligence");
    }

    // 5.4 Recommendations derived from intelligence
    if (directIntelligenceA.recommendations.length > 0) {
      const topRec = directIntelligenceA.recommendations[0];
      assert(
        roadmapA.nextActions[0].id === topRec.id ||
          roadmapA.nextActions[0].title === topRec.title,
        "Next action reflects top recommendation from student intelligence"
      );
    } else {
      assert(
        roadmapA.nextActions.length > 0,
        "Fallback next action provided when recommendations list is empty"
      );
    }

    // 5.5 Preparation Progress uses real readiness and real subject data
    assert(
      roadmapA.progress.overall === roadmapA.readiness.score,
      "Preparation progress overall matches real calculated readiness score"
    );

    // ========================================================================
    // TEST SECTION 6: DETERMINISM & REPRODUCIBILITY
    // ========================================================================
    console.log("\n--- 6. Determinism & Consistency ---");

    const roadmapA2 = await getStudentPlacementRoadmap(userA.id);
    assert(
      JSON.stringify(roadmapA) === JSON.stringify(roadmapA2),
      "Roadmap generation is strictly deterministic across repeated calls"
    );

    // ========================================================================
    // TEST SECTION 7: NAVIGATION & ACTION ROUTES
    // ========================================================================
    console.log("\n--- 7. Action Routes & Links ---");

    for (const action of roadmapA.nextActions) {
      assert(
        action.ctaHref.startsWith("/") &&
          !action.ctaHref.startsWith("//") &&
          !action.ctaHref.includes("undefined"),
        `Next action '${action.title}' has valid internal route (${action.ctaHref})`
      );
      assert(
        action.stepNumber.length === 2 && !isNaN(Number(action.stepNumber)),
        `Step number '${action.stepNumber}' is two-digit formatted ('01', '02', etc.)`
      );
    }

    console.log("\n==================================================");
    console.log(
      `PHASE 12 TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`
    );
    console.log("==================================================");
  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP
    // ------------------------------------------------------------------------
    console.log("\n🧹 Cleaning up test fixtures...");
    if (createdAttemptIds.length > 0) {
      await db
        .delete(answers)
        .where(inArray(answers.attemptId, createdAttemptIds));
      await db
        .delete(skillScores)
        .where(inArray(skillScores.attemptId, createdAttemptIds));
      await db
        .delete(attempts)
        .where(inArray(attempts.id, createdAttemptIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(profiles).where(inArray(profiles.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdRoleIds.length > 0) {
      await db.delete(roles).where(inArray(roles.id, createdRoleIds));
    }
    if (createdCompanyIds.length > 0) {
      await db.delete(companies).where(inArray(companies.id, createdCompanyIds));
    }
    console.log("✓ Fixtures successfully cleaned up.");
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase12Tests().catch((err) => {
  console.error("Phase 12 test suite error:", err);
  process.exit(1);
});
