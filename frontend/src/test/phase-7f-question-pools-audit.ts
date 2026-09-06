import { db } from "@/db";
import {
  users,
  tests,
  testSections,
  testQuestions,
  attempts,
  attemptQuestions,
  questions,
  questionPools,
  questionPoolQuestions,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  startOrResumeAttempt,
  getAttemptExamState,
  getTestDetails,
  getPublishedTests,
  duplicateTest,
  saveAnswer,
} from "@/server/tests";
import { gradeAttempt } from "@/server/grading";
import { calculateReadiness } from "@/server/readiness";

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

async function runPhase7FQuestionPoolsAudit() {
  console.log("==================================================");
  console.log("🏊 NEXORA — PHASE 7F: QUESTION POOLS AUDIT");
  console.log("==================================================\n");

  const cleanupUserIds: string[] = [];
  const cleanupTestIds: string[] = [];
  const cleanupQuestionIds: string[] = [];

  try {
    const passwordHash = await bcrypt.hash("Password123!", 10);
    const [studentA] = await db
      .insert(users)
      .values({
        email: `student7fA-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    const [studentB] = await db
      .insert(users)
      .values({
        email: `student7fB-${Date.now()}@nexora.test`,
        passwordHash,
        isAdmin: false,
      })
      .returning();
    cleanupUserIds.push(studentA.id, studentB.id);

    const existing = await db
      .select({ subjectId: questions.subjectId, topicId: questions.topicId })
      .from(questions)
      .limit(1);
    const subjectId = existing[0].subjectId;
    const topicId = existing[0].topicId;

    // Create 8 repository questions for testing
    const createdQuestions: any[] = [];
    for (let i = 1; i <= 8; i++) {
      const [q] = await db
        .insert(questions)
        .values({
          subjectId,
          topicId,
          question: `7F Q${i}: Question content ${i} for pool verification?`,
          questionType: "single_choice",
          options: ["Alpha", "Beta", "Gamma", "Delta"],
          correctAnswer: "Alpha",
          marks: i <= 6 ? 2 : 5, // Q1-Q6: 2 marks; Q7-Q8: 5 marks
          difficulty: i % 2 === 0 ? "easy" : "medium",
        })
        .returning();
      createdQuestions.push(q);
      cleanupQuestionIds.push(q.id);
    }

    // Helper to create test with pools and sections
    async function makeTestWithPools(opts: {
      title: string;
      totalMarks?: number;
      fixedQuestionIds?: string[];
      pools?: {
        title: string;
        selectionCount: number;
        questionIds: string[];
      }[];
      negativeMarkingEnabled?: boolean;
      negativeMarkRate?: string;
      randomizeQuestions?: boolean;
      randomizeOptions?: boolean;
      isPublished?: boolean;
    }) {
      const [t] = await db
        .insert(tests)
        .values({
          title: opts.title,
          type: "mixed",
          duration: 30,
          totalMarks: opts.totalMarks ?? 20,
          negativeMarkingEnabled: opts.negativeMarkingEnabled ?? false,
          negativeMarkRate: opts.negativeMarkRate ?? "0.00",
          randomizeQuestions: opts.randomizeQuestions ?? false,
          randomizeOptions: opts.randomizeOptions ?? false,
          isPublished: opts.isPublished ?? true,
        })
        .returning();
      cleanupTestIds.push(t.id);

      const [sec] = await db
        .insert(testSections)
        .values({
          testId: t.id,
          title: "Section 1",
          sectionOrder: 1,
        })
        .returning();

      if (opts.fixedQuestionIds && opts.fixedQuestionIds.length > 0) {
        for (let i = 0; i < opts.fixedQuestionIds.length; i++) {
          await db.insert(testQuestions).values({
            testId: t.id,
            sectionId: sec.id,
            questionId: opts.fixedQuestionIds[i],
            questionOrder: i + 1,
          });
        }
      }

      if (opts.pools && opts.pools.length > 0) {
        for (let pIdx = 0; pIdx < opts.pools.length; pIdx++) {
          const poolData = opts.pools[pIdx];
          const [pool] = await db
            .insert(questionPools)
            .values({
              testId: t.id,
              sectionId: sec.id,
              title: poolData.title,
              selectionCount: poolData.selectionCount,
              poolOrder: pIdx + 1,
            })
            .returning();

          for (let qIdx = 0; qIdx < poolData.questionIds.length; qIdx++) {
            await db.insert(questionPoolQuestions).values({
              poolId: pool.id,
              questionId: poolData.questionIds[qIdx],
              questionOrder: qIdx + 1,
            });
          }
        }
      }

      return { test: t, section: sec };
    }

    // -----------------------------------------------------------------------
    // TEST SUITE 1: SCHEMA & NULLABLE BEHAVIOR
    // -----------------------------------------------------------------------
    console.log("\n--- TEST SUITE 1: SCHEMA & NULLABLE BEHAVIOR ---");
    {
      const poolCheck = await db.select().from(questionPools).limit(1);
      assert(Array.isArray(poolCheck), "questionPools table exists and queries successfully");

      const poolQCheck = await db.select().from(questionPoolQuestions).limit(1);
      assert(Array.isArray(poolQCheck), "questionPoolQuestions table exists and queries successfully");

      // Verify attemptQuestions.poolId column is present and nullable
      const [t] = await db
        .insert(tests)
        .values({
          title: "Schema Check Test",
          type: "mixed",
          duration: 30,
          totalMarks: 2,
          isPublished: true,
        })
        .returning();
      cleanupTestIds.push(t.id);

      const [sec] = await db
        .insert(testSections)
        .values({ testId: t.id, title: "S1", sectionOrder: 1 })
        .returning();

      await db.insert(testQuestions).values({
        testId: t.id,
        sectionId: sec.id,
        questionId: createdQuestions[0].id,
        questionOrder: 1,
      });

      const attemptResult = await startOrResumeAttempt(t.id, studentA.id);
      const rows = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, attemptResult.attemptId));

      assert(rows.length === 1, "Attempt created with 1 question");
      assert(rows[0].poolId === null, "Fixed question in attemptQuestions has poolId === null");
    }

    // -----------------------------------------------------------------------
    // TEST SUITE 2: POOL SAMPLING & SIZING
    // -----------------------------------------------------------------------
    console.log("\n--- TEST SUITE 2: POOL SAMPLING & SIZING ---");
    {
      // Test setup: 1 fixed question (Q1) + 1 pool of 4 questions (Q2, Q3, Q4, Q5) with selectionCount = 2
      const { test } = await makeTestWithPools({
        title: "Sampling Test 1",
        fixedQuestionIds: [createdQuestions[0].id],
        pools: [
          {
            title: "Core Aptitude Pool",
            selectionCount: 2,
            questionIds: [
              createdQuestions[1].id,
              createdQuestions[2].id,
              createdQuestions[3].id,
              createdQuestions[4].id,
            ],
          },
        ],
      });

      const attemptResult = await startOrResumeAttempt(test.id, studentA.id);
      assert(attemptResult.isResumed === false, "New attempt started");

      const attemptQRows = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, attemptResult.attemptId));

      assert(
        attemptQRows.length === 3,
        `Total attempt questions = 3 (1 fixed + 2 sampled from pool, got ${attemptQRows.length})`
      );

      const fixedRow = attemptQRows.find((r) => r.questionId === createdQuestions[0].id);
      assert(!!fixedRow && fixedRow.poolId === null, "Fixed question included with null poolId");

      const pooledRows = attemptQRows.filter((r) => r.poolId !== null);
      assert(pooledRows.length === 2, "Exactly 2 questions sampled from the pool");

      const poolQuestionIds = new Set([
        createdQuestions[1].id,
        createdQuestions[2].id,
        createdQuestions[3].id,
        createdQuestions[4].id,
      ]);
      const allSampledFromPool = pooledRows.every((r) => poolQuestionIds.has(r.questionId));
      assert(allSampledFromPool, "All sampled pool questions belong to the specified pool");

      // Verify no duplicate question IDs in attempt
      const distinctQIds = new Set(attemptQRows.map((r) => r.questionId));
      assert(
        distinctQIds.size === attemptQRows.length,
        "No duplicate questions sampled in the attempt"
      );
    }

    // -----------------------------------------------------------------------
    // TEST SUITE 3: MULTIPLE STUDENTS RECEIVE INDEPENDENT SAMPLING
    // -----------------------------------------------------------------------
    console.log("\n--- TEST SUITE 3: MULTIPLE STUDENTS RECEIVE INDEPENDENT SAMPLING ---");
    {
      // Pool of 4 questions, pick 2. Multiple attempts should demonstrate sampling randomness.
      const { test } = await makeTestWithPools({
        title: "Random Sampling Comparison Test",
        pools: [
          {
            title: "Algorithms Pool",
            selectionCount: 2,
            questionIds: [
              createdQuestions[0].id,
              createdQuestions[1].id,
              createdQuestions[2].id,
              createdQuestions[3].id,
            ],
          },
        ],
      });

      const sampledSets: string[] = [];
      // Test with studentA and studentB
      const attemptA = await startOrResumeAttempt(test.id, studentA.id);
      const rowsA = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, attemptA.attemptId));
      const setAKey = rowsA.map((r) => r.questionId).sort().join(",");
      sampledSets.push(setAKey);

      const attemptB = await startOrResumeAttempt(test.id, studentB.id);
      const rowsB = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, attemptB.attemptId));
      const setBKey = rowsB.map((r) => r.questionId).sort().join(",");
      sampledSets.push(setBKey);

      assert(
        rowsA.length === 2 && rowsB.length === 2,
        "Both student attempts have exactly 2 sampled questions"
      );
      assert(
        rowsA.every((r) => r.poolId !== null) && rowsB.every((r) => r.poolId !== null),
        "Both attempts have valid poolId on all rows"
      );
    }

    // -----------------------------------------------------------------------
    // TEST SUITE 4: SNAPSHOT IMMUTABILITY
    // -----------------------------------------------------------------------
    console.log("\n--- TEST SUITE 4: SNAPSHOT IMMUTABILITY ---");
    {
      // Create a test with a pool of 3 questions (pick 2)
      const { test, section } = await makeTestWithPools({
        title: "Snapshot Immutability Test",
        pools: [
          {
            title: "Immutability Pool",
            selectionCount: 2,
            questionIds: [
              createdQuestions[0].id,
              createdQuestions[1].id,
              createdQuestions[2].id,
            ],
          },
        ],
      });

      // Student A starts attempt
      const attemptRes = await startOrResumeAttempt(test.id, studentA.id);
      const initialAttemptQuestions = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, attemptRes.attemptId));

      const initialQIds = initialAttemptQuestions.map((q) => q.questionId).sort();
      assert(initialQIds.length === 2, "Initial attempt contains 2 sampled questions");

      // Admin modifies the pool in the database:
      // 1. Adds a 4th question to the pool
      // 2. Removes the first question from the pool
      const [pool] = await db
        .select()
        .from(questionPools)
        .where(eq(questionPools.sectionId, section.id));

      await db.insert(questionPoolQuestions).values({
        poolId: pool.id,
        questionId: createdQuestions[3].id,
        questionOrder: 4,
      });

      await db
        .delete(questionPoolQuestions)
        .where(
          and(
            eq(questionPoolQuestions.poolId, pool.id),
            eq(questionPoolQuestions.questionId, createdQuestions[0].id)
          )
        );

      // Student A resumes the attempt
      const resumedAttempt = await startOrResumeAttempt(test.id, studentA.id);
      assert(resumedAttempt.isResumed === true, "Resume returns existing attempt");

      const postMutationQuestions = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, attemptRes.attemptId));

      const postMutationQIds = postMutationQuestions.map((q) => q.questionId).sort();

      assert(
        JSON.stringify(initialQIds) === JSON.stringify(postMutationQIds),
        "Historical attempt snapshot is strictly immutable; pool membership changes do not alter active attempt"
      );

      // Resume via getAttemptExamState returns exact snapshot questions
      const examState = await getAttemptExamState(attemptRes.attemptId, studentA.id);
      const examQIds = (examState as any).questions.map((q: any) => q.id).sort();
      assert(
        JSON.stringify(initialQIds) === JSON.stringify(examQIds),
        "Exam state displays the exact immutable snapshotted questions"
      );
    }

    // -----------------------------------------------------------------------
    // TEST SUITE 5: SUFFICIENCY VALIDATION
    // -----------------------------------------------------------------------
    console.log("\n--- TEST SUITE 5: SUFFICIENCY VALIDATION ---");
    {
      // Create a test where pool has 2 questions, but selectionCount = 3 (insufficient!)
      const [t] = await db
        .insert(tests)
        .values({
          title: "Insufficient Pool Test",
          type: "mixed",
          duration: 30,
          totalMarks: 10,
          isPublished: true,
        })
        .returning();
      cleanupTestIds.push(t.id);

      const [sec] = await db
        .insert(testSections)
        .values({ testId: t.id, title: "Section Insufficient", sectionOrder: 1 })
        .returning();

      const [pool] = await db
        .insert(questionPools)
        .values({
          testId: t.id,
          sectionId: sec.id,
          title: "Under-capacity Pool",
          selectionCount: 3, // Requires 3
          poolOrder: 1,
        })
        .returning();

      // Only insert 2 questions
      await db.insert(questionPoolQuestions).values({
        poolId: pool.id,
        questionId: createdQuestions[0].id,
        questionOrder: 1,
      });
      await db.insert(questionPoolQuestions).values({
        poolId: pool.id,
        questionId: createdQuestions[1].id,
        questionOrder: 2,
      });

      // Starting an attempt should throw an insufficiency error
      let errorThrown = false;
      let errorMsg = "";
      try {
        await startOrResumeAttempt(t.id, studentA.id);
      } catch (err: any) {
        errorThrown = true;
        errorMsg = err.message;
      }

      assert(errorThrown, "startOrResumeAttempt threw error on insufficient pool");
      assert(
        errorMsg.includes("insufficient"),
        `Error message accurately identifies insufficiency: "${errorMsg}"`
      );
    }

    // -----------------------------------------------------------------------
    // TEST SUITE 6: GETPUBLISHEDTESTS & GETTESTDETAILS METRICS
    // -----------------------------------------------------------------------
    console.log("\n--- TEST SUITE 6: GETPUBLISHEDTESTS & GETTESTDETAILS METRICS ---");
    {
      // Test with 2 fixed questions (2 marks each = 4 marks) + 1 pool (pick 2 from 3, questions have 2 marks each = 4 marks)
      // Total questions = 4, Total marks = 8
      const { test } = await makeTestWithPools({
        title: "Metrics Test with Pools",
        totalMarks: 8,
        fixedQuestionIds: [createdQuestions[0].id, createdQuestions[1].id],
        pools: [
          {
            title: "Math Pool",
            selectionCount: 2,
            questionIds: [
              createdQuestions[2].id,
              createdQuestions[3].id,
              createdQuestions[4].id,
            ],
          },
        ],
      });

      const publishedTests = await getPublishedTests(studentA.id);
      const foundPublished = publishedTests.find((t) => t.id === test.id);
      assert(!!foundPublished, "Test with pools appears in getPublishedTests");
      assert(
        foundPublished?.questionCount === 4,
        `getPublishedTests questionCount reflects fixed + pool selectionCount (expected 4, got ${foundPublished?.questionCount})`
      );
      assert(
        foundPublished?.totalMarks === 8,
        `getPublishedTests totalMarks reflects fixed + sampled pool marks (expected 8, got ${foundPublished?.totalMarks})`
      );

      const details = await getTestDetails(test.id, studentA.id);
      assert(!!details, "getTestDetails returns test details");
      assert(
        details?.questionCount === 4,
        `getTestDetails questionCount is 4 (got ${details?.questionCount})`
      );
      assert(
        details?.totalMarks === 8,
        `getTestDetails totalMarks is 8 (got ${details?.totalMarks})`
      );
    }

    // -----------------------------------------------------------------------
    // TEST SUITE 7: DUPLICATE TEST COMPATIBILITY
    // -----------------------------------------------------------------------
    console.log("\n--- TEST SUITE 7: DUPLICATE TEST COMPATIBILITY ---");
    {
      const { test, section } = await makeTestWithPools({
        title: "Test to Duplicate with Pools",
        fixedQuestionIds: [createdQuestions[0].id],
        pools: [
          {
            title: "Duplicated Pool A",
            selectionCount: 2,
            questionIds: [createdQuestions[1].id, createdQuestions[2].id, createdQuestions[3].id],
          },
        ],
      });

      const dupResult = await duplicateTest(test.id);
      assert(!!dupResult && !!dupResult.test, "Test duplicated successfully");
      const duplicated = dupResult.test;
      cleanupTestIds.push(duplicated.id);

      assert(
        duplicated.title.includes("Copy"),
        "Duplicated test title is formatted with Copy suffix"
      );
      assert(
        dupResult.questionCount === 3,
        `Duplicated test reports correct questionCount (expected 3, got ${dupResult.questionCount})`
      );

      // Verify sections copied
      const dupSections = await db
        .select()
        .from(testSections)
        .where(eq(testSections.testId, duplicated.id));
      assert(dupSections.length === 1, "Duplicated test has 1 section");

      // Verify fixed questions copied
      const dupFixedQ = await db
        .select()
        .from(testQuestions)
        .where(eq(testQuestions.testId, duplicated.id));
      assert(dupFixedQ.length === 1, "Duplicated test copied fixed question");

      // Verify pools copied
      const dupPools = await db
        .select()
        .from(questionPools)
        .where(eq(questionPools.sectionId, dupSections[0].id));
      assert(dupPools.length === 1, "Duplicated test copied question pool");
      assert(
        dupPools[0].title === "Duplicated Pool A" && dupPools[0].selectionCount === 2,
        "Duplicated pool retains title and selectionCount"
      );

      // Verify pool questions copied
      const dupPoolQ = await db
        .select()
        .from(questionPoolQuestions)
        .where(eq(questionPoolQuestions.poolId, dupPools[0].id));
      assert(dupPoolQ.length === 3, "Duplicated pool retains all 3 pool question memberships");

      // Publish duplicated test so it can be attempted
      await db.update(tests).set({ isPublished: true }).where(eq(tests.id, duplicated.id));

      // Start attempt on duplicated test to verify sampling works on copy
      const dupAttempt = await startOrResumeAttempt(duplicated.id, studentA.id);
      const dupAttemptQ = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, dupAttempt.attemptId));
      assert(
        dupAttemptQ.length === 3,
        `Duplicated test can be attempted and samples correctly (expected 3 questions, got ${dupAttemptQ.length})`
      );
    }

    // -----------------------------------------------------------------------
    // TEST SUITE 8: GRADING & NEGATIVE MARKING INTEGRATION
    // -----------------------------------------------------------------------
    console.log("\n--- TEST SUITE 8: GRADING & NEGATIVE MARKING INTEGRATION ---");
    {
      // Test with negative marking enabled (rate: 0.25)
      // Pool of 2 questions, pick 2. Correct answer is "Alpha".
      const { test } = await makeTestWithPools({
        title: "Grading Integration Test",
        negativeMarkingEnabled: true,
        negativeMarkRate: "0.25",
        pools: [
          {
            title: "Grading Pool",
            selectionCount: 2,
            questionIds: [createdQuestions[0].id, createdQuestions[1].id],
          },
        ],
      });

      const attemptRes = await startOrResumeAttempt(test.id, studentA.id);
      const attemptQ = await db
        .select()
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, attemptRes.attemptId))
        .orderBy(attemptQuestions.questionOrder);

      // Student answers Q1 correctly ("Alpha"), Q2 incorrectly ("Beta")
      // Marks: Q1 = 2 (correct = +2), Q2 = 2 (incorrect = -0.5)
      // Net score = 1.5
      await saveAnswer(attemptRes.attemptId, studentA.id, attemptQ[0].questionId, "Alpha");
      await saveAnswer(attemptRes.attemptId, studentA.id, attemptQ[1].questionId, "Beta");

      const gradingResult = await gradeAttempt(attemptRes.attemptId, studentA.id);

      assert(gradingResult.rawScore === 1.5, `Grade rawScore computed accurately: expected 1.5, got ${gradingResult.rawScore}`);
      assert(gradingResult.accuracy === 50, `Accuracy computed accurately: expected 50%, got ${gradingResult.accuracy}%`);

      // Verify attempt marked submitted
      const [updatedAttempt] = await db
        .select()
        .from(attempts)
        .where(eq(attempts.id, attemptRes.attemptId));
      assert(updatedAttempt.status === "submitted", "Attempt status updated to submitted");

      // Verify readiness score calculation
      const readiness = await calculateReadiness(studentA.id);
      assert(readiness !== null && typeof readiness.hasCompletedBaseline === "boolean", "calculateReadiness runs cleanly with pooled attempts");
    }

    // -----------------------------------------------------------------------
    // TEST SUITE 9: RANDOMIZATION INTERACTIONS (7B & 7C)
    // -----------------------------------------------------------------------
    console.log("\n--- TEST SUITE 9: RANDOMIZATION INTERACTIONS (7B & 7C) ---");
    {
      const { test } = await makeTestWithPools({
        title: "Randomization Integration Test",
        randomizeQuestions: true,
        randomizeOptions: true,
        fixedQuestionIds: [createdQuestions[0].id],
        pools: [
          {
            title: "Shuffled Pool",
            selectionCount: 2,
            questionIds: [createdQuestions[1].id, createdQuestions[2].id, createdQuestions[3].id],
          },
        ],
      });

      const attemptRes = await startOrResumeAttempt(test.id, studentA.id);
      const examState = await getAttemptExamState(attemptRes.attemptId, studentA.id);

      assert(
        (examState as any).questions.length === 3,
        "Exam state returns all 3 questions under full randomization"
      );
      assert(
        (examState as any).questions.every((q: any) => q.options.length === 4),
        "Options are populated on all pooled questions"
      );
    }

  } catch (err: any) {
    console.error("❌ UNCAUGHT EXCEPTION DURING AUDIT:", err);
    failed++;
  } finally {
    console.log("\n--- CLEANUP ---");
    try {
      if (cleanupTestIds.length > 0) {
        // Cascade cleanup handles pools, attempts, sections, testQuestions
        await db.delete(tests).where(inArray(tests.id, cleanupTestIds));
      }
      if (cleanupQuestionIds.length > 0) {
        await db.delete(questions).where(inArray(questions.id, cleanupQuestionIds));
      }
      if (cleanupUserIds.length > 0) {
        await db.delete(users).where(inArray(users.id, cleanupUserIds));
      }
      console.log("Cleanup completed.");
    } catch (cleanupErr) {
      console.error("Cleanup error:", cleanupErr);
    }
  }

  console.log("\n==================================================");
  console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runPhase7FQuestionPoolsAudit();
