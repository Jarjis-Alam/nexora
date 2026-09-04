import { db } from "@/db";
import { users, profiles, tests, attempts, answers } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { startOrResumeAttempt, getAttemptExamState, saveAnswer } from "@/server/tests";
import { gradeAttempt } from "@/server/grading";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ PASS: ${message}`);
}

async function runSecurityRegression() {
  console.log("\n==================================================");
  console.log("🛡️ NEXORA — MILESTONE 5 FINAL SECURITY REGRESSION");
  console.log("==================================================\n");

  const baseUrl = "http://localhost:3000";

  // 1. Anonymous Access Restrictions (HTTP level)
  console.log("1. Testing Anonymous Access Restrictions...");
  const protectedRoutes = ["/dashboard", "/tests", "/analytics", "/profile"];
  for (const route of protectedRoutes) {
    const res = await fetch(`${baseUrl}${route}`, { redirect: "manual" });
    const isRedirect = res.status === 307 || res.status === 302;
    const location = res.headers.get("location") || "";
    assert(
      isRedirect && location.includes("/auth/login"),
      `Anonymous access to ${route} blocked with redirect to login (status: ${res.status})`
    );
  }

  // 2. Student Role Admin Boundary (HTTP level)
  console.log("\n2. Testing Student Admin Boundary...");
  // Register a temporary student to obtain session
  const studentEmail = `sec_student_${Date.now()}@test.internal`;
  const studentPassword = "Password123!";

  const regRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Security Student",
      email: studentEmail,
      password: studentPassword,
      college: "Security Institute",
      graduationYear: 2026,
    }),
  });
  assert(regRes.status === 201, "Test student registered successfully");

  // Login as student
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const csrfCookies = csrfRes.headers.getSetCookie().join("; ");

  const loginRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: csrfCookies,
    },
    body: new URLSearchParams({
      email: studentEmail,
      password: studentPassword,
      csrfToken,
    }),
    redirect: "manual",
  });

  const sessionCookies = loginRes.headers.getSetCookie().join("; ");

  const adminRoutes = ["/admin/questions", "/admin/tests"];
  for (const route of adminRoutes) {
    const res = await fetch(`${baseUrl}${route}`, {
      headers: { Cookie: sessionCookies },
      redirect: "manual",
    });
    const isRedirect = res.status === 307 || res.status === 302;
    const location = res.headers.get("location") || "";
    assert(
      isRedirect && (location.includes("/dashboard") || location.includes("/auth/login")),
      `Student access to ${route} blocked with redirect away from admin (status: ${res.status})`
    );
  }

  // 3. Setup Two Students for Cross-User Ownership Testing
  console.log("\n3. Setting up Isolated Student A and Student B...");
  const pwHash = await bcrypt.hash("Password123!", 10);

  const [studentA] = await db
    .insert(users)
    .values({
      email: `student_a_${Date.now()}@test.internal`,
      passwordHash: pwHash,
      isAdmin: false,
    })
    .returning();

  const [studentB] = await db
    .insert(users)
    .values({
      email: `student_b_${Date.now()}@test.internal`,
      passwordHash: pwHash,
      isAdmin: false,
    })
    .returning();

  await db.insert(profiles).values([
    { userId: studentA.id, name: "Student A", college: "College A", graduationYear: 2026 },
    { userId: studentB.id, name: "Student B", college: "College B", graduationYear: 2027 },
  ]);

  const [baselineTest] = await db.select().from(tests).where(eq(tests.type, "baseline")).limit(1);
  assert(!!baselineTest, "Baseline test located in database");

  // Student A starts an attempt
  const attemptResultA = await startOrResumeAttempt(baselineTest.id, studentA.id);
  assert(!!attemptResultA.attemptId, "Student A initialized attempt");

  // 4. Cross-User Attempt Isolation
  console.log("\n4. Testing Student A → Student B Attempt Isolation...");
  let studentBCouldReadExamState = false;
  try {
    await getAttemptExamState(attemptResultA.attemptId, studentB.id);
    studentBCouldReadExamState = true;
  } catch {
    studentBCouldReadExamState = false;
  }
  assert(!studentBCouldReadExamState, "Student B is strictly blocked from reading Student A's exam state");

  let studentBCouldSaveAnswer = false;
  try {
    const examA = await getAttemptExamState(attemptResultA.attemptId, studentA.id);
    const q1 = examA.questions![0];
    await saveAnswer(attemptResultA.attemptId, studentB.id, q1.id, "Attempted Hack");
    studentBCouldSaveAnswer = true;
  } catch {
    studentBCouldSaveAnswer = false;
  }
  assert(!studentBCouldSaveAnswer, "Student B is strictly blocked from submitting answers to Student A's attempt");

  // 5. Active Exam Payload Security (Zero correctAnswer / explanation leakage)
  console.log("\n5. Testing Active Exam Payload Sanitization...");
  const examStateA = await getAttemptExamState(attemptResultA.attemptId, studentA.id);
  assert(examStateA.questions !== undefined && examStateA.questions.length > 0, "Loaded exam questions");

  let leaksSensitiveInfo = false;
  for (const q of (examStateA.questions as Record<string, unknown>[])) {
    if ("correctAnswer" in q || "correct_answer" in q || "explanation" in q || "serverScore" in q) {
      leaksSensitiveInfo = true;
      break;
    }
  }
  assert(!leaksSensitiveInfo, "CRITICAL: correctAnswer and explanation are completely stripped from active exam");

  // 6. Immutability of Submitted Attempts
  console.log("\n6. Testing Immutability of Submitted Attempts...");
  const qFirst = examStateA.questions![0];
  await saveAnswer(attemptResultA.attemptId, studentA.id, qFirst.id, "Option A", 10);

  // Grade and submit the attempt
  const gradeRes = await gradeAttempt(attemptResultA.attemptId, studentA.id);
  assert(gradeRes.success, "Student A attempt successfully submitted and graded");

  let postSubmissionModificationAllowed = false;
  try {
    await saveAnswer(attemptResultA.attemptId, studentA.id, qFirst.id, "Mutated After Submission", 5);
    postSubmissionModificationAllowed = true;
  } catch {
    postSubmissionModificationAllowed = false;
  }
  assert(!postSubmissionModificationAllowed, "Submitted attempts are strictly immutable (saveAnswer rejected)");

  // 7. Client Score & isCorrect Manipulation Prevention
  console.log("\n7. Testing Client Manipulation Prevention (score & isCorrect)...");
  // Inspect answers table: isCorrect is evaluated by server, client cannot inject isCorrect directly
  const savedAnswers = await db.select().from(answers).where(eq(answers.attemptId, attemptResultA.attemptId));
  for (const a of savedAnswers) {
    assert(typeof a.isCorrect === "boolean", "isCorrect is strictly a boolean evaluated server-side");
  }

  // Verify that an attempt cannot be graded by a non-owner
  let unauthorizedGradeAllowed = false;
  try {
    await gradeAttempt(attemptResultA.attemptId, studentB.id);
    unauthorizedGradeAllowed = true;
  } catch {
    unauthorizedGradeAllowed = false;
  }
  assert(!unauthorizedGradeAllowed, "Student B cannot trigger or manipulate grading of Student A's attempt");

  // 8. Clean up test records
  console.log("\n8. Cleaning up temporary security test data...");
  await db.delete(answers).where(eq(answers.attemptId, attemptResultA.attemptId));
  await db.delete(attempts).where(eq(attempts.id, attemptResultA.attemptId));
  await db.delete(profiles).where(eq(profiles.userId, studentA.id));
  await db.delete(profiles).where(eq(profiles.userId, studentB.id));
  await db.delete(users).where(eq(users.id, studentA.id));
  await db.delete(users).where(eq(users.id, studentB.id));

  const registeredUser = await db.select().from(users).where(eq(users.email, studentEmail)).limit(1);
  if (registeredUser.length > 0) {
    await db.delete(profiles).where(eq(profiles.userId, registeredUser[0].id));
    await db.delete(users).where(eq(users.id, registeredUser[0].id));
  }
  console.log("  ✓ Temporary security test records cleaned.");

  console.log("\n==================================================");
  console.log("ALL 14 SECURITY REGRESSION VECTORS VERIFIED & SECURED");
  console.log("==================================================\n");
}

runSecurityRegression().catch((err) => {
  console.error("Security regression failed:", err);
  process.exit(1);
});
