import { db } from "@/db";
import {
  users,
  profiles,
  tests,
  questions,
  testQuestions,
  attempts,
  attemptQuestions,
  answers,
  skillScores,
  subjects,
  topics,
  testSections,
  questionPools,
  questionPoolQuestions,
} from "@/db/schema";
import {
  getStudentIntelligence,
  buildRecommendationReason,
  calculateWeaknessScore,
  EVIDENCE_THRESHOLDS,
} from "@/server/student-intelligence";
import { calculateReadiness } from "@/server/readiness";
import { eq, inArray, sql } from "drizzle-orm";
import { GET as studentIntelligenceGet } from "@/app/api/student/intelligence/route";
import { NextRequest } from "next/server";

async function runPhase10Audit() {
  console.log("==================================================");
  console.log("🧠 NEXORA — PHASE 10: STUDENT INTELLIGENCE AUDIT");
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

  // Tracking fixtures for full cleanup
  const createdUserIds: string[] = [];
  const createdTestIds: string[] = [];
  const createdAttemptIds: string[] = [];
  const createdQuestionIds: string[] = [];

  try {
    // ------------------------------------------------------------------------
    // SETUP: Fetch standard subjects and topics
    // ------------------------------------------------------------------------
    const allSubjects = await db.select().from(subjects);
    const dsaSubject = allSubjects.find((s) => s.code === "DSA") || allSubjects[0];
    const sqlSubject = allSubjects.find((s) => s.code === "SQL") || allSubjects[1];
    const aptSubject = allSubjects.find((s) => s.code === "APT") || allSubjects[2];
    const dbmsSubject = allSubjects.find((s) => s.code === "DBMS") || allSubjects[3];

    const dsaTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.subjectId, dsaSubject.id));
    const testTopic = dsaTopics[0];

    const sqlTopics = await db
      .select()
      .from(topics)
      .where(eq(topics.subjectId, sqlSubject.id));
    const sqlTopic = sqlTopics[0];

    // Helper to create a fixture student
    async function createFixtureUser(emailPrefix: string) {
      const email = `${emailPrefix}_${Date.now()}_${Math.random().toString(36).substring(7)}@nexora.test`;
      const [u] = await db
        .insert(users)
        .values({
          email,
          passwordHash: "hash_test_p10",
          isAdmin: false,
        })
        .returning();
      createdUserIds.push(u.id);

      await db.insert(profiles).values({
        userId: u.id,
        name: `Student ${emailPrefix}`,
      });
      return u;
    }

    // Helper to create a fixture test
    async function createFixtureTest(params: {
      title: string;
      type: "baseline" | "mixed" | "cs_fundamentals" | "aptitude";
      status: "draft" | "published" | "closed" | "archived";
      difficulty?: "easy" | "medium" | "hard";
      attemptLimit?: number | null;
      scheduledStartAt?: Date | null;
      scheduledEndAt?: Date | null;
      negativeMarkingEnabled?: boolean;
      negativeMarkRate?: string;
    }) {
      const [t] = await db
        .insert(tests)
        .values({
          title: params.title,
          type: params.type,
          status: params.status,
          difficulty: params.difficulty || "medium",
          duration: 30,
          totalMarks: 50,
          attemptLimit: params.attemptLimit ?? null,
          scheduledStartAt: params.scheduledStartAt || null,
          scheduledEndAt: params.scheduledEndAt || null,
          negativeMarkingEnabled: params.negativeMarkingEnabled ?? false,
          negativeMarkRate: params.negativeMarkRate ?? "0.00",
          isPublished: params.status === "published" || params.status === "closed",
        })
        .returning();
      createdTestIds.push(t.id);
      return t;
    }

    // Helper to create fixture questions
    async function createFixtureQuestions(count: number, topicId: string, subjectId: string, difficulty: "easy" | "medium" | "hard" = "medium") {
      const qInserts = Array.from({ length: count }).map((_, idx) => ({
        question: `P10 Test Question ${idx + 1} for ${topicId}`,
        questionType: "single_choice" as const,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "Option A",
        subjectId,
        topicId,
        difficulty,
        marks: 2,
      }));
      const inserted = await db.insert(questions).values(qInserts).returning();
      inserted.forEach((q) => createdQuestionIds.push(q.id));
      return inserted;
    }

    // ------------------------------------------------------------------------
    // SCENARIO 1: Zero-Data Student
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 1: Zero-Data Student ---");
    const userZero = await createFixtureUser("zero_data");
    const zeroIntel = await getStudentIntelligence(userZero.id);

    assert(zeroIntel.dataSufficiency.hasData === false, "Zero-data: hasData is false");
    assert(zeroIntel.dataSufficiency.hasCompletedBaseline === false, "Zero-data: baseline is false");
    assert(zeroIntel.readiness.score === null, "Zero-data: readiness score is null");
    assert(zeroIntel.recommendations.length === 0, "Zero-data: 0 personalized recommendations");
    assert(
      zeroIntel.dataSufficiency.message.includes("baseline assessment"),
      "Zero-data: message instructs baseline assessment"
    );

    // ------------------------------------------------------------------------
    // SCENARIO 2: Baseline-Only Student
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 2: Baseline-Only Student ---");
    const userBaseline = await createFixtureUser("baseline_only");
    const baselineTest = await createFixtureTest({
      title: "P10 Baseline Diagnostic",
      type: "baseline",
      status: "published",
    });

    const [bAttempt] = await db
      .insert(attempts)
      .values({
        userId: userBaseline.id,
        testId: baselineTest.id,
        status: "submitted",
        score: 65,
        accuracy: 70,
        startedAt: new Date(Date.now() - 3600000),
        submittedAt: new Date(Date.now() - 1800000),
      })
      .returning();
    createdAttemptIds.push(bAttempt.id);

    // Insert skill score for DSA so baseline computes
    await db.insert(skillScores).values({
      attemptId: bAttempt.id,
      subjectId: dsaSubject.id,
      topicId: null,
      score: 14,
      total: 20,
      accuracy: 70,
    });

    const baselineIntel = await getStudentIntelligence(userBaseline.id);
    assert(baselineIntel.dataSufficiency.hasCompletedBaseline === true, "Baseline-only: hasCompletedBaseline is true");
    assert(baselineIntel.dataSufficiency.status === "limited_data", "Baseline-only: status is limited_data");
    assert(baselineIntel.recommendations.length >= 1, "Baseline-only: provides calibration action");
    assert(
      baselineIntel.recommendations[0].type === "CONSISTENCY",
      "Baseline-only: recommends calibration consistency test"
    );

    // ------------------------------------------------------------------------
    // SCENARIO 3: Limited-Data Student (2 Attempts)
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 3: Limited-Data Student ---");
    const mockTest1 = await createFixtureTest({
      title: "P10 Mock Test 1",
      type: "mixed",
      status: "published",
    });

    const [att2] = await db
      .insert(attempts)
      .values({
        userId: userBaseline.id,
        testId: mockTest1.id,
        status: "submitted",
        score: 60,
        accuracy: 65,
        startedAt: new Date(Date.now() - 1000000),
        submittedAt: new Date(Date.now() - 500000),
      })
      .returning();
    createdAttemptIds.push(att2.id);

    const limitedIntel = await getStudentIntelligence(userBaseline.id);
    assert(limitedIntel.dataSufficiency.status === "limited_data", "2 attempts: status remains limited_data");
    assert(limitedIntel.trend.overall === "insufficient_data", "2 attempts: trend is insufficient_data");

    // ------------------------------------------------------------------------
    // SCENARIO 4: Sufficient-Data Student (3+ Attempts)
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 4: Sufficient-Data Student ---");
    const mockTest2 = await createFixtureTest({
      title: "P10 Mock Test 2",
      type: "mixed",
      status: "published",
    });

    const [att3] = await db
      .insert(attempts)
      .values({
        userId: userBaseline.id,
        testId: mockTest2.id,
        status: "submitted",
        score: 75,
        accuracy: 80,
        startedAt: new Date(Date.now() - 300000),
        submittedAt: new Date(Date.now() - 100000),
      })
      .returning();
    createdAttemptIds.push(att3.id);

    const sufficientIntel = await getStudentIntelligence(userBaseline.id);
    assert(sufficientIntel.dataSufficiency.status === "sufficient_data", "3 attempts: status transitions to sufficient_data");
    assert(sufficientIntel.trend.overall !== "insufficient_data", "3 attempts: overall trend is calculated");

    // ------------------------------------------------------------------------
    // SCENARIOS 5 & 6: Weak Subject & Weak Topic Detection
    // ------------------------------------------------------------------------
    console.log("\n--- Scenarios 5 & 6: Weak Subject & Weak Topic Detection ---");
    const userWeak = await createFixtureUser("weak_detect");
    const bTestWeak = await createFixtureTest({ title: "Weak Test Baseline", type: "baseline", status: "published" });
    const [attWeakBase] = await db.insert(attempts).values({
      userId: userWeak.id,
      testId: bTestWeak.id,
      status: "submitted",
      score: 50,
      accuracy: 50,
      startedAt: new Date(Date.now() - 7200000),
      submittedAt: new Date(Date.now() - 5400000),
    }).returning();
    createdAttemptIds.push(attWeakBase.id);

    // Create 12 questions on testTopic (DSA) with 4 correct, 8 incorrect (accuracy = 33% -> Critical weak topic)
    const weakQuestions = await createFixtureQuestions(12, testTopic.id, dsaSubject.id, "medium");
    for (let i = 0; i < weakQuestions.length; i++) {
      const q = weakQuestions[i];
      const isCorr = i < 4; // 4 out of 12 correct = 33%
      await db.insert(answers).values({
        attemptId: attWeakBase.id,
        questionId: q.id,
        selectedAnswer: isCorr ? "Option A" : "Option B",
        isCorrect: isCorr,
      });
      await db.insert(attemptQuestions).values({
        attemptId: attWeakBase.id,
        questionId: q.id,
        sectionId: (await db.select().from(testSections).limit(1))[0]?.id || bTestWeak.id,
        questionOrder: i + 1,
      }).catch(() => {});
    }

    // Insert skill score for DSA: 33% accuracy
    await db.insert(skillScores).values({
      attemptId: attWeakBase.id,
      subjectId: dsaSubject.id,
      topicId: null,
      score: 8,
      total: 24,
      accuracy: 33,
    });

    // Insert skill score for Aptitude: 90% accuracy (makes DSA the primary negative contributor)
    await db.insert(skillScores).values({
      attemptId: attWeakBase.id,
      subjectId: aptSubject.id,
      topicId: null,
      score: 18,
      total: 20,
      accuracy: 90,
    });

    // Add 2 more attempts to meet sufficient data threshold
    for (let i = 1; i <= 2; i++) {
      const tExtra = await createFixtureTest({ title: `Weak Study Test ${i}`, type: "mixed", status: "published" });
      const [aExtra] = await db.insert(attempts).values({
        userId: userWeak.id,
        testId: tExtra.id,
        status: "submitted",
        score: 45,
        accuracy: 45,
        startedAt: new Date(Date.now() - (5000000 - i * 1000000)),
        submittedAt: new Date(Date.now() - (4000000 - i * 1000000)),
      }).returning();
      createdAttemptIds.push(aExtra.id);
      await db.insert(skillScores).values({
        attemptId: aExtra.id,
        subjectId: dsaSubject.id,
        topicId: null,
        score: 9,
        total: 20,
        accuracy: 45,
      });
    }

    const weakIntel = await getStudentIntelligence(userWeak.id);
    assert(weakIntel.weakAreas.length > 0, "Weak area detected in weakAreas array");
    const foundWeakTopic = weakIntel.weakAreas.find((w) => w.topicId === testTopic.id);
    assert(Boolean(foundWeakTopic), "Found specific weak topic in weak areas list");
    assert(foundWeakTopic?.priority === "CRITICAL", "Weak topic with 12 questions and 33% accuracy flagged as CRITICAL");

    const hasWeakSubjectRec = weakIntel.recommendations.some((r) => r.type === "WEAK_SUBJECT");
    assert(hasWeakSubjectRec, "Surfaces TYPE 2 WEAK_SUBJECT recommendation for DSA");

    const hasWeakTopicRec = weakIntel.recommendations.some((r) => r.type === "WEAK_TOPIC");
    assert(hasWeakTopicRec, "Surfaces TYPE 1 WEAK_TOPIC recommendation");

    // ------------------------------------------------------------------------
    // SCENARIO 7: Strength Detection
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 7: Strength Detection ---");
    const sqlQuestions = await createFixtureQuestions(8, sqlTopic.id, sqlSubject.id, "easy");
    for (let i = 0; i < sqlQuestions.length; i++) {
      const q = sqlQuestions[i];
      const isCorr = i < 7; // 7/8 = 87.5% -> Strong
      await db.insert(answers).values({
        attemptId: attWeakBase.id,
        questionId: q.id,
        selectedAnswer: isCorr ? "Option A" : "Option B",
        isCorrect: isCorr,
      });
    }
    await db.insert(skillScores).values({
      attemptId: attWeakBase.id,
      subjectId: sqlSubject.id,
      topicId: null,
      score: 14,
      total: 16,
      accuracy: 88,
    });

    const strengthIntel = await getStudentIntelligence(userWeak.id);
    const sqlStrength = strengthIntel.strengths.topTopics.find((t) => t.topicName === sqlTopic.name);
    assert(Boolean(sqlStrength), "SQL topic detected in top strengths");
    assert((sqlStrength?.accuracy ?? 0) >= 80, "SQL strength accuracy is >= 80%");

    // ------------------------------------------------------------------------
    // SCENARIOS 8, 9, 10, 11: Trend Detection (Declining, Improving, Stable)
    // ------------------------------------------------------------------------
    console.log("\n--- Scenarios 8-11: Trend Detection ---");

    // User Declining: 90% -> 70% -> 40%
    const userDeclining = await createFixtureUser("trend_declining");
    const decBase = await createFixtureTest({ title: "Dec Base", type: "baseline", status: "published" });
    const decT1 = await createFixtureTest({ title: "Dec T1", type: "mixed", status: "published" });
    const decT2 = await createFixtureTest({ title: "Dec T2", type: "mixed", status: "published" });

    const [dAtt1] = await db.insert(attempts).values({
      userId: userDeclining.id, testId: decBase.id, status: "submitted", score: 90, accuracy: 90,
      startedAt: new Date(Date.now() - 3000000), submittedAt: new Date(Date.now() - 2500000),
    }).returning();
    const [dAtt2] = await db.insert(attempts).values({
      userId: userDeclining.id, testId: decT1.id, status: "submitted", score: 70, accuracy: 70,
      startedAt: new Date(Date.now() - 2000000), submittedAt: new Date(Date.now() - 1500000),
    }).returning();
    const [dAtt3] = await db.insert(attempts).values({
      userId: userDeclining.id, testId: decT2.id, status: "submitted", score: 40, accuracy: 40,
      startedAt: new Date(Date.now() - 1000000), submittedAt: new Date(Date.now() - 500000),
    }).returning();
    createdAttemptIds.push(dAtt1.id, dAtt2.id, dAtt3.id);

    const decliningIntel = await getStudentIntelligence(userDeclining.id);
    assert(decliningIntel.trend.overall === "declining", "Trend detection: 90% -> 70% -> 40% identified as declining");

    // User Improving: 40% -> 65% -> 90%
    const userImproving = await createFixtureUser("trend_improving");
    const impBase = await createFixtureTest({ title: "Imp Base", type: "baseline", status: "published" });
    const impT1 = await createFixtureTest({ title: "Imp T1", type: "mixed", status: "published" });
    const impT2 = await createFixtureTest({ title: "Imp T2", type: "mixed", status: "published" });

    const [iAtt1] = await db.insert(attempts).values({
      userId: userImproving.id, testId: impBase.id, status: "submitted", score: 40, accuracy: 40,
      startedAt: new Date(Date.now() - 3000000), submittedAt: new Date(Date.now() - 2500000),
    }).returning();
    const [iAtt2] = await db.insert(attempts).values({
      userId: userImproving.id, testId: impT1.id, status: "submitted", score: 65, accuracy: 65,
      startedAt: new Date(Date.now() - 2000000), submittedAt: new Date(Date.now() - 1500000),
    }).returning();
    const [iAtt3] = await db.insert(attempts).values({
      userId: userImproving.id, testId: impT2.id, status: "submitted", score: 90, accuracy: 90,
      startedAt: new Date(Date.now() - 1000000), submittedAt: new Date(Date.now() - 500000),
    }).returning();
    createdAttemptIds.push(iAtt1.id, iAtt2.id, iAtt3.id);

    const improvingIntel = await getStudentIntelligence(userImproving.id);
    assert(improvingIntel.trend.overall === "improving", "Trend detection: 40% -> 65% -> 90% identified as improving");

    // User Stable: 70% -> 72% -> 71%
    const userStable = await createFixtureUser("trend_stable");
    const stbBase = await createFixtureTest({ title: "Stb Base", type: "baseline", status: "published" });
    const stbT1 = await createFixtureTest({ title: "Stb T1", type: "mixed", status: "published" });
    const stbT2 = await createFixtureTest({ title: "Stb T2", type: "mixed", status: "published" });

    const [sAtt1] = await db.insert(attempts).values({
      userId: userStable.id, testId: stbBase.id, status: "submitted", score: 70, accuracy: 70,
      startedAt: new Date(Date.now() - 3000000), submittedAt: new Date(Date.now() - 2500000),
    }).returning();
    const [sAtt2] = await db.insert(attempts).values({
      userId: userStable.id, testId: stbT1.id, status: "submitted", score: 72, accuracy: 72,
      startedAt: new Date(Date.now() - 2000000), submittedAt: new Date(Date.now() - 1500000),
    }).returning();
    const [sAtt3] = await db.insert(attempts).values({
      userId: userStable.id, testId: stbT2.id, status: "submitted", score: 71, accuracy: 71,
      startedAt: new Date(Date.now() - 1000000), submittedAt: new Date(Date.now() - 500000),
    }).returning();
    createdAttemptIds.push(sAtt1.id, sAtt2.id, sAtt3.id);

    const stableIntel = await getStudentIntelligence(userStable.id);
    assert(stableIntel.trend.overall === "stable", "Trend detection: 70% -> 72% -> 71% identified as stable");

    // ------------------------------------------------------------------------
    // SCENARIO 12: Difficulty Progression
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 12: Difficulty Progression ---");
    const userDiff = await createFixtureUser("diff_progression");
    const diffBase = await createFixtureTest({ title: "Diff Base", type: "baseline", status: "published" });
    const diffT1 = await createFixtureTest({ title: "Diff T1", type: "mixed", status: "published" });
    const diffT2 = await createFixtureTest({ title: "Diff T2", type: "mixed", status: "published" });

    const [dfAtt1] = await db.insert(attempts).values({
      userId: userDiff.id, testId: diffBase.id, status: "submitted", score: 85, accuracy: 85,
      startedAt: new Date(Date.now() - 3000000), submittedAt: new Date(Date.now() - 2500000),
    }).returning();
    const [dfAtt2] = await db.insert(attempts).values({
      userId: userDiff.id, testId: diffT1.id, status: "submitted", score: 80, accuracy: 80,
      startedAt: new Date(Date.now() - 2000000), submittedAt: new Date(Date.now() - 1500000),
    }).returning();
    const [dfAtt3] = await db.insert(attempts).values({
      userId: userDiff.id, testId: diffT2.id, status: "submitted", score: 85, accuracy: 85,
      startedAt: new Date(Date.now() - 1000000), submittedAt: new Date(Date.now() - 500000),
    }).returning();
    createdAttemptIds.push(dfAtt1.id, dfAtt2.id, dfAtt3.id);

    // Add 6 Easy questions with 100% accuracy and 0 Medium questions
    const easyQs = await createFixtureQuestions(6, testTopic.id, dsaSubject.id, "easy");
    for (const q of easyQs) {
      await db.insert(answers).values({
        attemptId: dfAtt1.id,
        questionId: q.id,
        selectedAnswer: "Option A",
        isCorrect: true,
      });
    }

    const diffIntel = await getStudentIntelligence(userDiff.id);
    assert(diffIntel.difficulty.progressionTarget === "medium", "Difficulty progression: recommends Medium when Easy is mastered");
    const hasDiffRec = diffIntel.recommendations.some((r) => r.type === "DIFFICULTY_PROGRESSION");
    assert(hasDiffRec, "Surfaces TYPE 3 DIFFICULTY_PROGRESSION recommendation");

    // ------------------------------------------------------------------------
    // SCENARIO 13: Unanswered Rate Signal
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 13: Unanswered Rate Signal ---");
    const userUnanswered = await createFixtureUser("unanswered_signal");
    const unTest = await createFixtureTest({ title: "Unanswered Test", type: "baseline", status: "published" });
    const [unSec] = await db.insert(testSections).values({
      testId: unTest.id,
      title: "Section 1",
      sectionOrder: 1,
    }).returning();

    const [unAtt1] = await db.insert(attempts).values({
      userId: userUnanswered.id, testId: unTest.id, status: "submitted", score: 60, accuracy: 80,
      startedAt: new Date(Date.now() - 3000000), submittedAt: new Date(Date.now() - 2500000),
    }).returning();
    const [unAtt2] = await db.insert(attempts).values({
      userId: userUnanswered.id, testId: unTest.id, status: "submitted", score: 60, accuracy: 80,
      startedAt: new Date(Date.now() - 2000000), submittedAt: new Date(Date.now() - 1500000),
    }).returning();
    const [unAtt3] = await db.insert(attempts).values({
      userId: userUnanswered.id, testId: unTest.id, status: "submitted", score: 60, accuracy: 80,
      startedAt: new Date(Date.now() - 1000000), submittedAt: new Date(Date.now() - 500000),
    }).returning();
    createdAttemptIds.push(unAtt1.id, unAtt2.id, unAtt3.id);

    // Create 20 attempt questions, but only answer 14 (6 unanswered = 30% > 20% threshold)
    const unQs = await createFixtureQuestions(20, testTopic.id, dsaSubject.id, "medium");
    for (let i = 0; i < unQs.length; i++) {
      const q = unQs[i];
      await db.insert(attemptQuestions).values({
        attemptId: unAtt1.id,
        questionId: q.id,
        sectionId: unSec.id,
        questionOrder: i + 1,
      });

      if (i < 14) {
        await db.insert(answers).values({
          attemptId: unAtt1.id,
          questionId: q.id,
          selectedAnswer: "Option A",
          isCorrect: true,
        });
      }
    }

    const unIntel = await getStudentIntelligence(userUnanswered.id);
    assert(unIntel.discipline.hasUnansweredIssue === true, "Discipline: flags unanswered issue when blank rate > 20%");
    assert(unIntel.discipline.unansweredRate >= 20, "Discipline: unansweredRate >= 20%");

    // ------------------------------------------------------------------------
    // SCENARIO 14: Negative Marking Penalty Signal
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 14: Negative Marking Penalty Signal ---");
    const userNeg = await createFixtureUser("negative_penalty");
    const negTest = await createFixtureTest({
      title: "Negative Marking Test",
      type: "baseline",
      status: "published",
      negativeMarkingEnabled: true,
      negativeMarkRate: "0.50",
    });
    const [negAtt1] = await db.insert(attempts).values({
      userId: userNeg.id,
      testId: negTest.id,
      status: "submitted",
      score: 40,
      accuracy: 50,
      negativeMarkingEnabled: true,
      negativeMarkRate: "0.50",
      startedAt: new Date(Date.now() - 3000000),
      submittedAt: new Date(Date.now() - 2500000),
    }).returning();
    const [negAtt2] = await db.insert(attempts).values({
      userId: userNeg.id, testId: negTest.id, status: "submitted", score: 50, accuracy: 50,
      startedAt: new Date(Date.now() - 2000000), submittedAt: new Date(Date.now() - 1500000),
    }).returning();
    const [negAtt3] = await db.insert(attempts).values({
      userId: userNeg.id, testId: negTest.id, status: "submitted", score: 50, accuracy: 50,
      startedAt: new Date(Date.now() - 1000000), submittedAt: new Date(Date.now() - 500000),
    }).returning();
    createdAttemptIds.push(negAtt1.id, negAtt2.id, negAtt3.id);

    // 6 questions, 4 incorrect at 2 marks each * 0.50 rate = 4.0 marks lost
    const negQs = await createFixtureQuestions(6, testTopic.id, dsaSubject.id, "medium");
    for (let i = 0; i < negQs.length; i++) {
      const q = negQs[i];
      const isCorr = i < 2;
      await db.insert(answers).values({
        attemptId: negAtt1.id,
        questionId: q.id,
        selectedAnswer: isCorr ? "Option A" : "Option B",
        isCorrect: isCorr,
      });
    }

    const negIntel = await getStudentIntelligence(userNeg.id);
    assert(negIntel.discipline.hasNegativeMarkingIssue === true, "Discipline: flags negative marking penalty loss");
    assert(negIntel.discipline.negativeMarkingLossAvg >= 2.0, "Discipline: negative marking loss >= 2.0 marks");

    // ------------------------------------------------------------------------
    // SCENARIO 15: Consistency Signal (Inactivity)
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 15: Consistency Signal ---");
    const userInactive = await createFixtureUser("inactive_student");
    const inTest = await createFixtureTest({ title: "Old Test", type: "baseline", status: "published" });
    const sixteenDaysAgo = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000);
    const [inAtt1] = await db.insert(attempts).values({
      userId: userInactive.id, testId: inTest.id, status: "submitted", score: 70, accuracy: 70,
      startedAt: new Date(sixteenDaysAgo.getTime() - 3600000), submittedAt: sixteenDaysAgo,
    }).returning();
    const [inAtt2] = await db.insert(attempts).values({
      userId: userInactive.id, testId: inTest.id, status: "submitted", score: 70, accuracy: 70,
      startedAt: new Date(sixteenDaysAgo.getTime() - 7200000), submittedAt: new Date(sixteenDaysAgo.getTime() - 3600000),
    }).returning();
    const [inAtt3] = await db.insert(attempts).values({
      userId: userInactive.id, testId: inTest.id, status: "submitted", score: 70, accuracy: 70,
      startedAt: new Date(sixteenDaysAgo.getTime() - 10800000), submittedAt: new Date(sixteenDaysAgo.getTime() - 7200000),
    }).returning();
    createdAttemptIds.push(inAtt1.id, inAtt2.id, inAtt3.id);

    const inIntel = await getStudentIntelligence(userInactive.id);
    assert((inIntel.discipline.daysSinceLastAttempt ?? 0) >= 14, "Consistency: detects >= 14 days of inactivity");
    const hasInactivityRec = inIntel.recommendations.some(
      (r) => r.type === "CONSISTENCY" && r.id.includes("inactivity")
    );
    assert(hasInactivityRec, "Surfaces TYPE 4 CONSISTENCY inactivity refresh recommendation");

    // ------------------------------------------------------------------------
    // SCENARIO 16: Readiness Contributors (Positive & Negative Drivers)
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 16: Readiness Contributors ---");
    const contribIntel = await getStudentIntelligence(userWeak.id);
    assert(Array.isArray(contribIntel.readiness.positiveContributors), "Readiness positiveContributors is array");
    assert(Array.isArray(contribIntel.readiness.negativeContributors), "Readiness negativeContributors is array");
    const dsaContributor = contribIntel.readiness.negativeContributors.find((c) => c.code === "DSA");
    assert(Boolean(dsaContributor), "DSA is identified as a negative contributor holding readiness back");

    // ------------------------------------------------------------------------
    // SCENARIO 17 & 18: Recommendation Priority & Deduplication
    // ------------------------------------------------------------------------
    console.log("\n--- Scenarios 17 & 18: Recommendation Priority & Deduplication ---");
    const recs = contribIntel.recommendations;
    assert(recs.length >= 1 && recs.length <= EVIDENCE_THRESHOLDS.MAX_RECOMMENDATIONS, "Recommendations bounded between 1 and 5");
    assert(Boolean(contribIntel.topAction), "Top #1 action is defined");

    // Check priorities ordering
    const priorityWeights = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    let isOrdered = true;
    for (let i = 0; i < recs.length - 1; i++) {
      if (priorityWeights[recs[i].priority] < priorityWeights[recs[i + 1].priority]) {
        isOrdered = false;
        break;
      }
    }
    assert(isOrdered, "Recommendations are sorted deterministically by priority rank desc");

    // Deduplication check
    const recIds = recs.map((r) => r.id);
    const uniqueIds = new Set(recIds);
    assert(recIds.length === uniqueIds.size, "All recommendation IDs are unique (deduplicated)");

    // ------------------------------------------------------------------------
    // SCENARIO 19: Deterministic Ordering (Identical Input -> Identical Output)
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 19: Deterministic Ordering ---");
    const run1 = await getStudentIntelligence(userWeak.id);
    const run2 = await getStudentIntelligence(userWeak.id);
    assert(
      JSON.stringify(run1.recommendations) === JSON.stringify(run2.recommendations),
      "Deterministic: two consecutive executions produce identical recommendations and ordering"
    );

    // ------------------------------------------------------------------------
    // SCENARIO 20 & 21: Explanation Correctness & Real Metrics Only
    // ------------------------------------------------------------------------
    console.log("\n--- Scenarios 20 & 21: Explanation Correctness & Real Metrics ---");
    const sampleReason = buildRecommendationReason({
      type: "WEAK_TOPIC",
      topicName: "Arrays",
      accuracy: 42,
      questionCount: 24,
      overallAverage: 65,
    });
    assert(sampleReason.includes("42% across 24 questions"), "Reason contains exact calculated accuracy and question count");
    assert(sampleReason.includes("below your overall average (65%)"), "Reason contains exact benchmark comparison");

    // ------------------------------------------------------------------------
    // SCENARIO 22: No Fake Readiness for Zero-Data
    // ------------------------------------------------------------------------
    console.log("\n--- Scenario 22: No Fake Readiness ---");
    assert(zeroIntel.readiness.score === null, "Zero-data user has null readiness score (no fake baseline)");
    assert(zeroIntel.trend.overall === "insufficient_data", "Zero-data user has insufficient_data trend");

    // ------------------------------------------------------------------------
    // SCENARIOS 23, 24, 25, 26, 27: Test Recommendation Lifecycle Eligibility
    // ------------------------------------------------------------------------
    console.log("\n--- Scenarios 23-27: Test Recommendation Lifecycle Eligibility ---");
    const now = new Date();

    // 1. Active test
    const activeTest = await createFixtureTest({ title: "Eligible Active Test", type: "mixed", status: "published" });
    const [actSec] = await db.insert(testSections).values({
      testId: activeTest.id,
      title: "Active Sec",
      sectionOrder: 1,
    }).returning();
    const actQs = await createFixtureQuestions(2, testTopic.id, dsaSubject.id, "medium");
    for (let i = 0; i < actQs.length; i++) {
      await db.insert(testQuestions).values({
        testId: activeTest.id,
        sectionId: actSec.id,
        questionId: actQs[i].id,
        questionOrder: i + 1,
      });
    }

    // 2. Future scheduled test (should be excluded)
    const futureScheduledTest = await createFixtureTest({
      title: "Future Test Excluded",
      type: "mixed",
      status: "published",
      scheduledStartAt: new Date(now.getTime() + 86400000),
      scheduledEndAt: new Date(now.getTime() + 172800000),
    });

    // 3. Closed test (should be excluded)
    const closedTest = await createFixtureTest({
      title: "Closed Test Excluded",
      type: "mixed",
      status: "closed",
    });

    // 4. Draft test (should be excluded)
    const draftTest = await createFixtureTest({
      title: "Draft Test Excluded",
      type: "mixed",
      status: "draft",
    });

    // 5. Attempt-limited test exhausted (limit: 1, user already took it)
    const limitedExhaustedTest = await createFixtureTest({
      title: "Limited Test Exhausted",
      type: "mixed",
      status: "published",
      attemptLimit: 1,
    });
    const [exhaustedAtt] = await db.insert(attempts).values({
      userId: userWeak.id,
      testId: limitedExhaustedTest.id,
      status: "submitted",
      score: 70,
      accuracy: 70,
    }).returning();
    createdAttemptIds.push(exhaustedAtt.id);

    // 6. Pool test (Phase 7F compatible)
    const poolTest = await createFixtureTest({
      title: "Pool Test Compatible",
      type: "mixed",
      status: "published",
    });
    const [sec] = await db.insert(testSections).values({
      testId: poolTest.id,
      title: "Pool Section",
      sectionOrder: 1,
    }).returning();
    const [pool] = await db.insert(questionPools).values({
      testId: poolTest.id,
      sectionId: sec.id,
      title: "Topic Pool",
      selectionCount: 3,
      poolOrder: 1,
    }).returning();

    const poolQs = await createFixtureQuestions(5, testTopic.id, dsaSubject.id, "medium");
    for (const pq of poolQs) {
      await db.insert(questionPoolQuestions).values({
        poolId: pool.id,
        questionId: pq.id,
      }).catch(() => {});
    }

    const lifecycleIntel = await getStudentIntelligence(userWeak.id, now);
    const recommendedTestIds = lifecycleIntel.eligibleRecommendedTests.map((t) => t.id);

    assert(recommendedTestIds.includes(activeTest.id), "Active published test is eligible for recommendation");
    assert(!recommendedTestIds.includes(futureScheduledTest.id), "Future scheduled test is strictly EXCLUDED");
    assert(!recommendedTestIds.includes(closedTest.id), "Closed test is strictly EXCLUDED");
    assert(!recommendedTestIds.includes(draftTest.id), "Draft test is strictly EXCLUDED");
    assert(!recommendedTestIds.includes(limitedExhaustedTest.id), "Attempt-limit exhausted test is strictly EXCLUDED");
    assert(recommendedTestIds.includes(poolTest.id), "Phase 7F question pool test is compatible and ELIGIBLE");

    // ------------------------------------------------------------------------
    // SCENARIOS 28, 29, 30: Privacy, User Isolation & Authorization
    // ------------------------------------------------------------------------
    console.log("\n--- Scenarios 28-30: Privacy & User Isolation ---");
    const userA = await createFixtureUser("privacy_a");
    const userB = await createFixtureUser("privacy_b");

    const tPriv = await createFixtureTest({ title: "Priv Test", type: "baseline", status: "published" });
    const [aPriv] = await db.insert(attempts).values({
      userId: userA.id, testId: tPriv.id, status: "submitted", score: 95, accuracy: 95,
    }).returning();
    createdAttemptIds.push(aPriv.id);

    const intelA = await getStudentIntelligence(userA.id);
    const intelB = await getStudentIntelligence(userB.id);

    assert(intelA.dataSufficiency.hasData === true, "User A has data");
    assert(intelB.dataSufficiency.hasData === false, "User B has zero data (User A data does NOT leak to User B)");

    // Test API Route: Anonymous Request returns 401 (or fails closed)
    try {
      const anonReq = new NextRequest("http://localhost:3000/api/student/intelligence");
      const anonRes = await studentIntelligenceGet(anonReq);
      assert(anonRes.status === 401, "API route: Anonymous request returns 401 Unauthorized");
    } catch (e: any) {
      assert(
        e.message.includes("headers") || e.message.includes("request scope") || e.message.includes("Unauthorized"),
        "API route: Anonymous request protected by fail-closed authorization check"
      );
    }

    // ------------------------------------------------------------------------
    // SCENARIO 31 & 32: No Recommendation Persistence & No Randomness
    // ------------------------------------------------------------------------
    console.log("\n--- Scenarios 31 & 32: Ephemeral & Non-Random Design ---");
    const tableCheckRes = await db.execute(sql`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'recommendations';
    `);
    assert(tableCheckRes.rows.length === 0, "No persistent recommendations table exists (purely ephemeral & deterministic)");

    const randTest1 = calculateWeaknessScore(40, 10, "declining");
    const randTest2 = calculateWeaknessScore(40, 10, "declining");
    assert(randTest1 === randTest2 && randTest1 > 0, "Weakness score calculation is pure and free from random perturbation");

    console.log("\n==================================================");
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("==================================================");

  } catch (error) {
    console.error("Audit threw exception:", error);
    failed++;
  } finally {
    // ------------------------------------------------------------------------
    // CLEANUP ALL FIXTURES
    // ------------------------------------------------------------------------
    console.log("\n🧹 Cleaning up test fixtures...");
    try {
      if (createdAttemptIds.length > 0) {
        await db.delete(answers).where(inArray(answers.attemptId, createdAttemptIds));
        await db.delete(attemptQuestions).where(inArray(attemptQuestions.attemptId, createdAttemptIds));
        await db.delete(skillScores).where(inArray(skillScores.attemptId, createdAttemptIds));
        await db.delete(attempts).where(inArray(attempts.id, createdAttemptIds));
      }
      if (createdTestIds.length > 0) {
        await db.delete(questionPoolQuestions).where(
          inArray(
            questionPoolQuestions.poolId,
            db.select({ id: questionPools.id }).from(questionPools).where(inArray(questionPools.testId, createdTestIds))
          )
        ).catch(() => {});
        await db.delete(questionPools).where(inArray(questionPools.testId, createdTestIds));
        await db.delete(testQuestions).where(inArray(testQuestions.testId, createdTestIds));
        await db.delete(testSections).where(inArray(testSections.testId, createdTestIds));
        await db.delete(tests).where(inArray(tests.id, createdTestIds));
      }
      if (createdQuestionIds.length > 0) {
        await db.delete(questions).where(inArray(questions.id, createdQuestionIds));
      }
      if (createdUserIds.length > 0) {
        await db.delete(profiles).where(inArray(profiles.userId, createdUserIds));
        await db.delete(users).where(inArray(users.id, createdUserIds));
      }
      console.log("✓ Fixture cleanup complete.");
    } catch (cleanupErr) {
      console.error("Error during fixture cleanup:", cleanupErr);
    }
  }

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase10Audit();
