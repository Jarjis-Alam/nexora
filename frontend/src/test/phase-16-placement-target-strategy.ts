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
  testQuestions,
  studentTargetRoles,
  studentTargetCompanies,
  roles,
  companies,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPlacementTargetStrategy } from "@/server/placement-target-strategy";
import { getStudentPlacementRoadmap } from "@/server/roadmap";
import { getDailyExecutionPlan } from "@/server/placement-execution";
import { gradeAttempt } from "@/server/grading";
import { GET as targetStrategyApiGet } from "@/app/api/student/target-strategy/route";
import {
  seedCanonicalPlacementData,
  addStudentTargetRole,
  addStudentTargetCompany,
  adminCreateRole,
} from "@/server/company-role-intelligence";

async function runPhase16Tests() {
  console.log("==================================================");
  console.log("🎯  NEXORA — PHASE 16: PLACEMENT TARGET STRATEGY");
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

  try {
    console.log("\n--- 1. Setting up Isolated Test Fixtures ---");
    await seedCanonicalPlacementData();

    // 1. Student Zero: Fresh, unassessed, no targets
    const [userZero] = await db
      .insert(users)
      .values({
        email: `phase16_zero_${Date.now()}@nexora.test`,
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

    // 2. Student TargetOnly: Unassessed, but has target role
    const [userTargetOnly] = await db
      .insert(users)
      .values({
        email: `phase16_targetonly_${Date.now()}@nexora.test`,
        passwordHash: "hash_targetonly",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userTargetOnly.id);

    await db.insert(profiles).values({
      userId: userTargetOnly.id,
      name: "Target Only Student",
      college: "Nexora Institute",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    // 3. Student Alpha: Assessed, has targets
    const [userAlpha] = await db
      .insert(users)
      .values({
        email: `phase16_alpha_${Date.now()}@nexora.test`,
        passwordHash: "hash_alpha",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userAlpha.id);

    await db.insert(profiles).values({
      userId: userAlpha.id,
      name: "Alpha Strategist",
      college: "Nexora Tech",
      branch: "Computer Science",
      graduationYear: 2026,
    });

    // Locate canonical roles & companies
    const sweRole = await db
      .select()
      .from(roles)
      .where(eq(roles.slug, "software-engineer"))
      .limit(1);
    assert(sweRole.length > 0, "Software Engineer canonical role exists");
    const sweRoleId = sweRole[0].id;

    const googleCompany = await db
      .select()
      .from(companies)
      .where(eq(companies.slug, "google"))
      .limit(1);
    assert(googleCompany.length > 0, "Google canonical company exists");
    const googleCompId = googleCompany[0].id;

    // Locate published baseline test
    const baselineRows = await db
      .select({ id: tests.id })
      .from(tests)
      .where(eq(tests.type, "baseline"))
      .limit(1);
    assert(baselineRows.length > 0, "Baseline diagnostic test exists");
    const baselineTestId = baselineRows[0].id;

    // Fetch baseline questions assigned via testQuestions
    const baselineQuestions = await db
      .select({
        id: questions.id,
        subjectId: questions.subjectId,
        topicId: questions.topicId,
        subjectCode: subjects.code,
        topicName: topics.name,
        correctAnswer: questions.correctAnswer,
        options: questions.options,
      })
      .from(testQuestions)
      .innerJoin(questions, eq(testQuestions.questionId, questions.id))
      .innerJoin(subjects, eq(questions.subjectId, subjects.id))
      .innerJoin(topics, eq(questions.topicId, topics.id))
      .where(eq(testQuestions.testId, baselineTestId));

    assert(baselineQuestions.length > 0, "Baseline test questions loaded");

    // Simulate baseline attempt for User Alpha
    const [alphaBaselineAttempt] = await db
      .insert(attempts)
      .values({
        testId: baselineTestId,
        userId: userAlpha.id,
        status: "in_progress",
      })
      .returning();
    createdAttemptIds.push(alphaBaselineAttempt.id);

    // Controlled answers:
    // Strong in DSA: 100% correct
    // Weak in DBMS: 0% correct
    // Moderate in OS: 50%
    for (let i = 0; i < baselineQuestions.length; i++) {
      const q = baselineQuestions[i];
      const correctVal = String(q.correctAnswer ?? "");
      const wrongVal = `${String(q.correctAnswer ?? "")}_wrong_choice`;

      let isCorrect = false;
      let selectedAnswer = wrongVal;

      if (q.subjectCode === "DSA") {
        isCorrect = true;
        selectedAnswer = correctVal;
      } else if (q.subjectCode === "OS") {
        isCorrect = i % 2 === 0;
        selectedAnswer = isCorrect ? correctVal : wrongVal;
      } else if (q.subjectCode === "DBMS") {
        isCorrect = false;
        selectedAnswer = wrongVal;
      } else {
        isCorrect = i % 2 === 0;
        selectedAnswer = isCorrect ? correctVal : wrongVal;
      }

      await db.insert(answers).values({
        attemptId: alphaBaselineAttempt.id,
        questionId: q.id,
        selectedAnswer,
        isCorrect,
      });
    }

    await gradeAttempt(alphaBaselineAttempt.id, userAlpha.id);

    console.log("\n--- 2. Testing Target Resolution & Empty States ---");
    // Case 2A: Student Zero has no targets
    const zeroStrategy = await getPlacementTargetStrategy(userZero.id);
    assert(zeroStrategy.hasTarget === false, "Student Zero hasTarget is false");
    assert(zeroStrategy.hasBaseline === false, "Student Zero hasBaseline is false");
    assert(zeroStrategy.readiness.targetScore === null, "Student Zero targetScore is null (no fake data)");
    assert(zeroStrategy.emptyState !== null, "Student Zero emptyState is present");
    assert(zeroStrategy.emptyState?.type === "no_target", "Student Zero emptyState is 'no_target'");
    assert(zeroStrategy.emptyState?.title === "SET YOUR PLACEMENT TARGET", "Student Zero title matches 'SET YOUR PLACEMENT TARGET'");
    assert(zeroStrategy.emptyState?.ctaHref === "/profile", "Student Zero CTA points to /profile");

    // Case 2B: Student TargetOnly has target but no baseline
    await addStudentTargetRole(userTargetOnly.id, sweRoleId);
    await addStudentTargetCompany(userTargetOnly.id, googleCompId);

    const targetOnlyStrategy = await getPlacementTargetStrategy(userTargetOnly.id);
    assert(targetOnlyStrategy.hasTarget === true, "TargetOnly student hasTarget is true");
    assert(targetOnlyStrategy.hasBaseline === false, "TargetOnly student hasBaseline is false");
    assert(targetOnlyStrategy.target.primaryRole?.name === "Software Engineer", "TargetOnly primaryRole is Software Engineer");
    assert(targetOnlyStrategy.target.primaryCompany?.name === "Google", "TargetOnly primaryCompany is Google");
    assert(targetOnlyStrategy.readiness.targetScore === null, "TargetOnly targetScore is null (no fake readiness without baseline)");
    assert(targetOnlyStrategy.emptyState !== null, "TargetOnly emptyState is present");
    assert(targetOnlyStrategy.emptyState?.type === "no_baseline", "TargetOnly emptyState is 'no_baseline'");
    assert(targetOnlyStrategy.emptyState?.title === "TARGET SELECTED", "TargetOnly title matches 'TARGET SELECTED'");
    assert(Boolean(targetOnlyStrategy.emptyState?.message.includes("Software Engineer")), "TargetOnly message mentions Software Engineer");
    assert(targetOnlyStrategy.emptyState?.ctaLabel === "Start Assessment", "TargetOnly CTA label is 'Start Assessment'");

    console.log("\n--- 3. Testing Authoritative Requirements for Target Role ---");
    // Assign SWE and Google to User Alpha
    await addStudentTargetRole(userAlpha.id, sweRoleId);
    await addStudentTargetCompany(userAlpha.id, googleCompId);

    const alphaStrategy = await getPlacementTargetStrategy(userAlpha.id);
    assert(alphaStrategy.hasTarget === true, "Alpha hasTarget is true");
    assert(alphaStrategy.hasBaseline === true, "Alpha hasBaseline is true");
    assert(alphaStrategy.requirements.hasAuthoritativeData === true, "Alpha hasAuthoritativeData is true for SWE");
    assert(alphaStrategy.requirements.domains.length > 0, "Alpha has domain requirements list");

    const sweDomainNeeds = new Map(alphaStrategy.requirements.domains.map((d) => [d.domain, d.targetNeed]));
    assert(sweDomainNeeds.get("DSA") === "HIGH", "Software Engineer requires HIGH DSA");
    assert(sweDomainNeeds.get("DBMS") === "HIGH", "Software Engineer requires HIGH DBMS");
    assert(sweDomainNeeds.get("OS") === "HIGH", "Software Engineer requires HIGH OS");
    assert(sweDomainNeeds.get("OOP") === "HIGH", "Software Engineer requires HIGH OOP");
    assert(sweDomainNeeds.get("SQL") === "MEDIUM", "Software Engineer requires MEDIUM SQL");
    assert(sweDomainNeeds.get("APT") === "STANDARD", "Software Engineer requires STANDARD APT");

    console.log("\n--- 4. Testing Unsupported / Custom Role Requirements Fallback ---");
    // Create a custom unmapped role
    const customRole = await adminCreateRole({
      name: `Specialized Niche Role ${Date.now()}`,
      category: "Specialty",
      description: "Non-standard role without predefined curriculum mapping",
    });
    createdRoleIds.push(customRole.id);

    // Temporarily test custom role target
    const [userCustom] = await db
      .insert(users)
      .values({
        email: `phase16_custom_${Date.now()}@nexora.test`,
        passwordHash: "hash_custom",
        isAdmin: false,
      })
      .returning();
    createdUserIds.push(userCustom.id);
    await db.insert(profiles).values({
      userId: userCustom.id,
      name: "Custom Student",
      college: "Nexora",
      graduationYear: 2026,
    });
    await addStudentTargetRole(userCustom.id, customRole.id);

    const customStrategy = await getPlacementTargetStrategy(userCustom.id);
    assert(customStrategy.requirements.hasAuthoritativeData === false, "Custom role hasAuthoritativeData is false");
    assert(customStrategy.requirements.note.includes("Requirement data unavailable"), "Custom role explicitly notes requirement data unavailable");

    console.log("\n--- 5. Testing Target Readiness vs Overall Readiness ---");
    assert(alphaStrategy.readiness.overallScore !== null, "Alpha overallScore is calculated");
    assert(alphaStrategy.readiness.targetScore !== null, "Alpha targetScore is calculated");
    assert(typeof alphaStrategy.readiness.targetScore === "number", "Alpha targetScore is a number");
    assert(alphaStrategy.readiness.targetScore! >= 0 && alphaStrategy.readiness.targetScore! <= 100, "Alpha targetScore is bounded 0–100");
    assert(alphaStrategy.readiness.targetLevel !== null, "Alpha targetLevel is assigned");
    assert(
      ["TARGET READY", "ON TRACK", "DEVELOPING", "NEEDS WORK"].includes(alphaStrategy.readiness.targetLevel!),
      `Target level is valid enum (${alphaStrategy.readiness.targetLevel})`
    );
    assert(alphaStrategy.readiness.summary.includes(alphaStrategy.target.primaryRole!.name), "Summary references target role name");

    console.log("\n--- 6. Testing Requirement → Performance Matrix ---");
    assert(alphaStrategy.matrix.length === 7, "Matrix contains exactly all 7 curriculum subjects");
    const dsaMatrix = alphaStrategy.matrix.find((m) => m.domain === "DSA");
    assert(dsaMatrix !== undefined, "DSA present in matrix");
    assert(dsaMatrix?.targetNeed === "HIGH", "DSA targetNeed is HIGH");
    assert(dsaMatrix?.studentState === "STRONG", "DSA studentState is STRONG (simulated 100%)");
    assert(dsaMatrix?.benchmark === 75, "DSA benchmark is 75%");

    const dbmsMatrix = alphaStrategy.matrix.find((m) => m.domain === "DBMS");
    assert(dbmsMatrix !== undefined, "DBMS present in matrix");
    assert(dbmsMatrix?.targetNeed === "HIGH", "DBMS targetNeed is HIGH");
    assert(dbmsMatrix?.studentState === "WEAK", "DBMS studentState is WEAK (simulated 0%)");

    console.log("\n--- 7. Testing Gap Detection & Explainability ---");
    assert(alphaStrategy.gaps.length > 0, "Alpha has identified target gaps");
    const topGap = alphaStrategy.gaps[0];
    assert(topGap.orderNumber === "01", "Top gap has two-digit orderNumber '01'");
    assert(Boolean(topGap.domain), "Gap has domain");
    assert(Boolean(topGap.topic), "Gap has topic");
    assert(topGap.targetRelevance === "HIGH", "Top gap has HIGH target relevance");
    assert(topGap.priority === "CRITICAL" || topGap.priority === "HIGH", "Gap has CRITICAL or HIGH priority");
    assert(Boolean(topGap.evidence), "Gap has empirical evidence");
    assert(Boolean(topGap.why), "Gap has explainable rationale (Why)");
    assert(topGap.why.includes(alphaStrategy.target.primaryRole!.name), "Why rationale connects to target role");
    assert(Boolean(topGap.action), "Gap has prescriptive action directive");
    assert(topGap.ctaHref.startsWith("/practice?"), "Gap CTA links to targeted practice");

    console.log("\n--- 8. Testing Target Advantages / Strengths ---");
    assert(alphaStrategy.advantages.length > 0, "Alpha has identified target advantages");
    const topAdv = alphaStrategy.advantages[0];
    assert(Boolean(topAdv.domain), "Advantage has domain");
    assert(Boolean(topAdv.topic), "Advantage has topic");
    assert(topAdv.accuracy >= 75, "Advantage accuracy meets or exceeds 75% benchmark");
    assert(Boolean(topAdv.why), "Advantage has explainable rationale");

    console.log("\n--- 9. Testing Preparation Strategy Directives ---");
    assert(Boolean(alphaStrategy.preparationStrategy.summary), "Strategy has executive summary");
    assert(alphaStrategy.preparationStrategy.topPriority !== null, "Strategy identifies top priority gap");
    assert(alphaStrategy.preparationStrategy.roadmapHref === "/roadmap", "Strategy links to /roadmap");
    assert(Boolean(alphaStrategy.preparationStrategy.practiceHref), "Strategy provides direct practice link");

    console.log("\n--- 10. Testing Integration with Roadmap ---");
    const alphaRoadmap = await getStudentPlacementRoadmap(userAlpha.id);
    assert(alphaRoadmap.targets.configured === true, "Roadmap reflects configured targets");
    assert(alphaRoadmap.targets.primaryRole?.name === "Software Engineer", "Roadmap reflects target role");
    assert(alphaRoadmap.nextActions.length > 0, "Roadmap has nextActions");
    const targetPriorityAction = alphaRoadmap.nextActions.find((a) => a.isTargetPriority === true);
    assert(targetPriorityAction !== undefined, "Roadmap nextAction successfully tags isTargetPriority === true");

    console.log("\n--- 11. Testing Integration with Execution OS ---");
    const alphaExecution = await getDailyExecutionPlan(userAlpha.id);
    assert(alphaExecution.actions.length > 0, "Daily execution plan generated actions");
    const targetFocusAction = alphaExecution.actions.find((a) => a.targetFocus === true || a.isTargetPriority === true);
    assert(targetFocusAction !== undefined, "Execution OS action successfully marks targetFocus / isTargetPriority");

    console.log("\n--- 12. Testing Security & Cross-Student Isolation ---");
    // A. API Route authentication
    let anonGetFailClosed = false;
    try {
      const unauthResponse = await targetStrategyApiGet();
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
      "GET /api/student/target-strategy is protected against unauthenticated access (401 or fail-closed)"
    );

    // B. Service function validates input
    let errorCaught = false;
    try {
      await getPlacementTargetStrategy("");
    } catch {
      errorCaught = true;
    }
    assert(errorCaught, "getPlacementTargetStrategy rejects empty userId");

    // C. Cross-student data isolation
    assert(zeroStrategy.readiness.targetScore === null, "User Zero has no target readiness leaked from Alpha");
    assert(zeroStrategy.gaps.length === 0, "User Zero has 0 gaps leaked from Alpha");
    assert(zeroStrategy.matrix.length === 0, "User Zero matrix is empty");

    console.log("==================================================");
    console.log(`📊 PHASE 16 TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
    console.log("==================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Unexpected error during Phase 16 testing:", error);
    process.exit(1);
  } finally {
    console.log("\nCleaning up test artifacts...");
    try {
      for (const attId of createdAttemptIds) {
        await db.delete(answers).where(eq(answers.attemptId, attId));
        await db.delete(attempts).where(eq(attempts.id, attId));
      }
      for (const uId of createdUserIds) {
        await db.delete(studentTargetCompanies).where(eq(studentTargetCompanies.userId, uId));
        await db.delete(studentTargetRoles).where(eq(studentTargetRoles.userId, uId));
        await db.delete(profiles).where(eq(profiles.userId, uId));
        await db.delete(users).where(eq(users.id, uId));
      }
      for (const rId of createdRoleIds) {
        await db.delete(roles).where(eq(roles.id, rId));
      }
      console.log("Cleanup complete.");
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }
  }
}

runPhase16Tests();
