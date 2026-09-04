import pg from "pg";
import { db } from "@/db";
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
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
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

const BASE_URL = "http://localhost:3000";

async function runDatabaseAudit() {
  console.log("==================================================");
  console.log("💾 NEXORA / PLACEMENT OS — DATABASE AUDIT SUITE");
  console.log("==================================================\n");

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

  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5432/placement_os",
  });

  // ----------------------------------------------------
  // 1. Profile Creation & Update
  // ----------------------------------------------------
  console.log("1. Testing Profile Creation & Schema Conformance...");
  const testStudentEmail = `db_student_${Date.now()}@placementos.dev`;
  const passwordHash = await bcrypt.hash("StudentPass123!", 10);
  const userRes = await db
    .insert(users)
    .values({
      email: testStudentEmail,
      passwordHash,
      isAdmin: false,
    })
    .returning();
  const testUserId = userRes[0].id;

  const profileRes = await db
    .insert(profiles)
    .values({
      userId: testUserId,
      name: "Database Audit Student",
      avatarUrl: "https://avatar.dev/student.png",
      college: "Audit Engineering Institute",
      branch: "Computer Science",
      graduationYear: 2026,
      preferredLanguage: "TypeScript",
    })
    .returning();

  assert(profileRes.length === 1, "Profile created successfully");
  const studentProfile = profileRes[0];
  assert(studentProfile.userId === testUserId, "Profile user_id links to user record");
  assert(studentProfile.college === "Audit Engineering Institute", "Profile contains valid college");
  assert(studentProfile.graduationYear === 2026, "Profile contains valid graduation year");
  assert(studentProfile.createdAt !== null && studentProfile.updatedAt !== null, "Profile contains timestamps");

  // ----------------------------------------------------
  // 2. Subject Retrieval
  // ----------------------------------------------------
  console.log("\n2. Testing Subject Retrieval & Stable Codes...");
  const allSubjects = await db.select().from(subjects).orderBy(asc(subjects.displayOrder));
  assert(allSubjects.length === 7, "Exactly 7 Phase 1 core subjects exist");

  const requiredCodes = ["APT", "DSA", "DBMS", "OS", "CN", "OOP", "SQL"];
  const subjectCodes = allSubjects.map((s) => s.code);
  const hasAllCodes = requiredCodes.every((c) => subjectCodes.includes(c));
  assert(hasAllCodes, `All 7 required subject codes exist: ${requiredCodes.join(", ")}`);

  // Verify stable IDs format
  const hasValidUUIDs = allSubjects.every((s) => s.id && s.id.length === 36);
  assert(hasValidUUIDs, "All subjects have valid stable UUID identifiers");

  // ----------------------------------------------------
  // 3. Topic Retrieval
  // ----------------------------------------------------
  console.log("\n3. Testing Topic Retrieval (8-12 Topics per Subject)...");
  const allTopics = await db.select().from(topics);
  assert(allTopics.length >= 56, `Topics created: ${allTopics.length} (target: 8-12 per subject)`);

  let topicsWithinRange = true;
  for (const s of allSubjects) {
    const sTopics = allTopics.filter((t) => t.subjectId === s.id);
    if (sTopics.length < 8 || sTopics.length > 12) {
      topicsWithinRange = false;
      console.error(`    Subject ${s.code} has ${sTopics.length} topics (outside 8-12 range)`);
    }
  }
  assert(topicsWithinRange, "Every subject has between 8 and 12 granular topics");

  // ----------------------------------------------------
  // 4. Question Retrieval
  // ----------------------------------------------------
  console.log("\n4. Testing Question Bank Retrieval (150+ Questions)...");
  const allQuestions = await db.select().from(questions);
  assert(allQuestions.length >= 150, `Question bank has ${allQuestions.length} questions (>= 150 required)`);

  // Verify question integrity
  let validQuestions = true;
  for (const q of allQuestions) {
    if (!q.question || !q.options || !Array.isArray(q.options) || q.options.length < 2) {
      validQuestions = false;
    }
    if (!q.correctAnswer || !q.explanation || !q.marks || !q.expectedTime) {
      validQuestions = false;
    }
    if (!["easy", "medium", "hard"].includes(q.difficulty)) {
      validQuestions = false;
    }
  }
  assert(validQuestions, "All questions possess valid options, answer, difficulty, marks, explanation, and expected time");

  // ----------------------------------------------------
  // 5. Student-Safe Question Payload
  // ----------------------------------------------------
  console.log("\n5. Testing Question Security during Active Attempts...");
  const baselineTests = await db
    .select()
    .from(tests)
    .where(eq(tests.type, "baseline"))
    .limit(1);
  assert(baselineTests.length === 1, "Baseline test exists in catalog");
  const baselineTest = baselineTests[0];

  const attemptResult = await startOrResumeAttempt(baselineTest.id, testUserId);
  const examState = await getAttemptExamState(attemptResult.attemptId, testUserId);

  assert(examState.questions !== undefined && examState.questions.length > 0, "Active exam questions loaded for student");
  
  let leaksSensitiveData = false;
  for (const q of (examState.questions as Record<string, unknown>[])) {
    if ("correctAnswer" in q || "correct_answer" in q || "explanation" in q) {
      leaksSensitiveData = true;
      break;
    }
  }
  assert(!leaksSensitiveData, "SECURITY VERIFIED: correctAnswer and explanation are completely stripped from active exam payload");

  // ----------------------------------------------------
  // 6. Test Catalog & Details Retrieval
  // ----------------------------------------------------
  console.log("\n6. Testing Test Catalog & Details Retrieval...");
  const publishedTests = await getPublishedTests(testUserId);
  assert(publishedTests.length >= 4, `Catalog returns ${publishedTests.length} published tests`);
  assert(publishedTests.some((t) => t.type === "baseline"), "Catalog includes Baseline Assessment");
  assert(publishedTests.some((t) => t.type === "aptitude"), "Catalog includes Aptitude Assessment");
  assert(publishedTests.some((t) => t.type === "cs_fundamentals"), "Catalog includes CS Fundamentals");
  assert(publishedTests.some((t) => t.type === "mixed"), "Catalog includes Mixed Placement Test");

  const testDetails = await getTestDetails(baselineTest.id, testUserId);
  assert(testDetails !== null && testDetails.questionCount === 50, "Test details report accurate question count (50)");

  // ----------------------------------------------------
  // 7. Deterministic Question Ordering
  // ----------------------------------------------------
  console.log("\n7. Testing Deterministic Question Ordering...");
  const orderedQuestions = await db
    .select({ order: testQuestions.questionOrder })
    .from(testQuestions)
    .where(eq(testQuestions.testId, baselineTest.id))
    .orderBy(asc(testQuestions.questionOrder));

  let isSequential = true;
  for (let i = 0; i < orderedQuestions.length; i++) {
    if (orderedQuestions[i].order !== i + 1) {
      isSequential = false;
      break;
    }
  }
  assert(isSequential, "Test questions are ordered deterministically 1..N with no gaps");

  // ----------------------------------------------------
  // 8. Attempt Lifecycle & Persistence
  // ----------------------------------------------------
  console.log("\n8. Testing Attempt Lifecycle & Persistence...");
  const attemptRow = await db
    .select()
    .from(attempts)
    .where(eq(attempts.id, attemptResult.attemptId))
    .limit(1);

  assert(attemptRow.length === 1, "Attempt record stored in database");
  assert(attemptRow[0].status === "in_progress", "Attempt initial status is in_progress");
  assert(attemptRow[0].userId === testUserId, "Attempt user_id correctly matches student");

  // ----------------------------------------------------
  // 9. Answer Persistence & Server-Side Evaluation
  // ----------------------------------------------------
  console.log("\n9. Testing Answer Persistence & Server-Side Evaluation...");
  const firstQuestion = examState.questions![0];
  const selectedOption = "Test Option A";
  await saveAnswer(attemptResult.attemptId, testUserId, firstQuestion.id, selectedOption, 12);
  await toggleReviewMark(attemptResult.attemptId, testUserId, firstQuestion.id);

  const savedAnswerRow = await db
    .select()
    .from(answers)
    .where(
      and(
        eq(answers.attemptId, attemptResult.attemptId),
        eq(answers.questionId, firstQuestion.id)
      )
    )
    .limit(1);

  assert(savedAnswerRow.length === 1, "Answer saved to database");
  assert(savedAnswerRow[0].selectedAnswer === selectedOption, "Saved selectedAnswer matches student selection");
  assert(savedAnswerRow[0].timeSpent === 12, "Time spent recorded correctly");
  assert(savedAnswerRow[0].markedForReview === true, "Marked for review persisted");
  assert(savedAnswerRow[0].isCorrect === null, "is_correct remains null during active attempt (client cannot set correctness)");

  // ----------------------------------------------------
  // 10. Student Authorization & Data Isolation
  // ----------------------------------------------------
  console.log("\n10. Testing Student Authorization & Data Isolation...");
  // Create another student B
  const userBRes = await db
    .insert(users)
    .values({
      email: `student_b_${Date.now()}@nexora.dev`,
      passwordHash: await bcrypt.hash("test1234", 10),
      isAdmin: false,
    })
    .returning();
  const studentBId = userBRes[0].id;

  // Student B tries to access Student A's exam state
  let bAccessBlocked = false;
  try {
    await getAttemptExamState(attemptResult.attemptId, studentBId);
  } catch (err: unknown) {
    const msg = (err as Error).message;
    bAccessBlocked = msg.includes("access denied") || msg.includes("not found");
  }
  assert(bAccessBlocked, "Student B is blocked from reading Student A's active exam state");

  // Student B tries to save answer to Student A's attempt
  let bSaveBlocked = false;
  try {
    await saveAnswer(attemptResult.attemptId, studentBId, firstQuestion.id, "Hack", 10);
  } catch (err: unknown) {
    const msg = (err as Error).message;
    bSaveBlocked = msg.includes("not editable") || msg.includes("not found");
  }
  assert(bSaveBlocked, "Student B is blocked from modifying Student A's attempt answers");

  // Student A grades/submits attempt
  const gradeRes = await gradeAttempt(attemptResult.attemptId, testUserId);
  assert(gradeRes.success === true, "Student A submitted attempt and graded server-side");

  // Attempt is now submitted — Student A can no longer edit it
  let submitEditBlocked = false;
  try {
    await saveAnswer(attemptResult.attemptId, testUserId, firstQuestion.id, "New Answer", 5);
  } catch (err: unknown) {
    const msg = (err as Error).message;
    submitEditBlocked = msg.includes("not editable");
  }
  assert(submitEditBlocked, "Submitted attempts are strictly immutable (cannot be modified after submission)");

  // ----------------------------------------------------
  // 11. Admin Question Access
  // ----------------------------------------------------
  console.log("\n11. Testing Admin Question API Authorization...");
  const unauthAdminQ = await fetch(`${BASE_URL}/api/admin/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "Unauthorized Question?" }),
    redirect: "manual",
  });
  assert(
    unauthAdminQ.status === 307 || unauthAdminQ.status === 401 || unauthAdminQ.status === 403,
    `Unauthenticated user blocked from POST /api/admin/questions (status: ${unauthAdminQ.status})`
  );

  // ----------------------------------------------------
  // 12. Admin Test Access
  // ----------------------------------------------------
  console.log("\n12. Testing Admin Test API Authorization...");
  const unauthAdminT = await fetch(`${BASE_URL}/api/admin/tests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Unauthorized Test" }),
    redirect: "manual",
  });
  assert(
    unauthAdminT.status === 307 || unauthAdminT.status === 401 || unauthAdminT.status === 403,
    `Unauthenticated user blocked from POST /api/admin/tests (status: ${unauthAdminT.status})`
  );

  // ----------------------------------------------------
  // 13. Seed Integrity & Zero Orphans
  // ----------------------------------------------------
  console.log("\n13. Testing Seed Integrity & Relational Consistency...");
  const orphanQ = await pool.query(
    "SELECT count(*) FROM questions q WHERE q.subject_id NOT IN (SELECT id FROM subjects) OR q.topic_id NOT IN (SELECT id FROM topics)"
  );
  assert(Number(orphanQ.rows[0].count) === 0, "Zero orphaned questions (all reference valid subjects and topics)");

  const orphanTQ = await pool.query(
    "SELECT count(*) FROM test_questions tq WHERE tq.test_id NOT IN (SELECT id FROM tests) OR tq.question_id NOT IN (SELECT id FROM questions)"
  );
  assert(Number(orphanTQ.rows[0].count) === 0, "Zero orphaned test_questions (all reference valid tests and questions)");

  const orphanAnswers = await pool.query(
    "SELECT count(*) FROM answers a WHERE a.attempt_id NOT IN (SELECT id FROM attempts) OR a.question_id NOT IN (SELECT id FROM questions)"
  );
  assert(Number(orphanAnswers.rows[0].count) === 0, "Zero orphaned answers");

  const orphanScores = await pool.query(
    "SELECT count(*) FROM skill_scores ss WHERE ss.attempt_id NOT IN (SELECT id FROM attempts) OR ss.subject_id NOT IN (SELECT id FROM subjects)"
  );
  assert(Number(orphanScores.rows[0].count) === 0, "Zero orphaned skill scores");

  // Cleanup test users
  await pool.query("DELETE FROM users WHERE id IN ($1, $2)", [testUserId, studentBId]);
  await pool.end();

  console.log("\n==================================================");
  console.log(`DATABASE AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runDatabaseAudit().catch((err) => {
  console.error("Database audit failed with error:", err);
  process.exit(1);
});
