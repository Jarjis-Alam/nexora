import { db } from "@/db";
import { tests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { startOrResumeAttempt, getAttemptExamState, saveAnswer } from "@/server/tests";
import { gradeAttempt } from "@/server/grading";

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ PASS: ${msg}`);
}

class CookieJar {
  cookies: Record<string, string> = {};

  update(res: Response) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      if (idx !== -1) {
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        this.cookies[key] = val;
      }
    }
  }

  getHeader(): string {
    return Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

async function runProductionSmokeTest() {
  console.log("\n==================================================");
  console.log("🚀 NEXORA — FULL PRODUCTION SMOKE TEST FLOW");
  console.log("==================================================");

  const baseUrl = "http://localhost:3000";

  // 1. Landing Page
  console.log("\nStep 1: Landing Page...");
  const landingRes = await fetch(`${baseUrl}/`);
  assert(landingRes.status === 200, "Landing page returns 200 OK");
  const landingHtml = await landingRes.text();
  assert(landingHtml.includes("Nexora") || landingHtml.includes("Placement"), "Landing page renders Nexora branding");

  // 2. Login Page
  console.log("\nStep 2: Login Page...");
  const loginPageRes = await fetch(`${baseUrl}/auth/login`);
  assert(loginPageRes.status === 200, "Login page returns 200 OK");

  // 3. Student Login
  console.log("\nStep 3: Student Login (alex.chen@placementos.dev)...");
  const studentJar = new CookieJar();
  const csrfRes = await fetch(`${baseUrl}/api/auth/csrf`);
  studentJar.update(csrfRes);
  const { csrfToken } = await csrfRes.json();

  const studentLoginRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: studentJar.getHeader(),
    },
    body: new URLSearchParams({
      email: "alex.chen@placementos.dev",
      password: "alex123",
      csrfToken,
    }),
    redirect: "manual",
  });
  assert(studentLoginRes.status === 302, "Student login authenticated (status: 302 redirect)");
  studentJar.update(studentLoginRes);

  // 4. Student Dashboard
  console.log("\nStep 4: Student Dashboard...");
  const dashRes = await fetch(`${baseUrl}/dashboard`, {
    headers: { Cookie: studentJar.getHeader() },
  });
  assert(dashRes.status === 200, "Dashboard returns 200 OK for authenticated student");
  const dashHtml = await dashRes.text();
  assert(dashHtml.includes("Alex") || dashHtml.includes("Readiness"), "Dashboard renders personalized student greeting / modules");

  // 5. Test Catalog
  console.log("\nStep 5: Test Catalog (/tests)...");
  const testsRes = await fetch(`${baseUrl}/tests`, {
    headers: { Cookie: studentJar.getHeader() },
  });
  assert(testsRes.status === 200, "Test catalog returns 200 OK");
  const testsHtml = await testsRes.text();
  assert(testsHtml.includes("Baseline Assessment"), "Test catalog displays Baseline Assessment");

  // 6. Test Details Page
  console.log("\nStep 6: Test Details (/tests/[baselineId])...");
  const [baseline] = await db.select().from(tests).where(eq(tests.type, "baseline")).limit(1);
  assert(!!baseline, "Baseline assessment found in database");
  const testDetailRes = await fetch(`${baseUrl}/tests/${baseline.id}`, {
    headers: { Cookie: studentJar.getHeader() },
  });
  assert(testDetailRes.status === 200, "Test details page returns 200 OK");
  const detailHtml = await testDetailRes.text();
  assert(detailHtml.includes("90"), "Test details display duration");

  // 7. Exam Attempt Lifecycle (Start, Answer, Refresh/Resume, Submit)
  console.log("\nStep 7: Exam Engine Flow (Start, Answer, Resume, Submit)...");
  const studentId = "00000000-0000-0000-0000-000000000002"; // alex.chen UUID
  const attemptRes = await startOrResumeAttempt(baseline.id, studentId);
  assert(!!attemptRes.attemptId, "Exam session initialized with attempt ID");

  const examState = await getAttemptExamState(attemptRes.attemptId, studentId);
  assert(examState.questions!.length === 50, "Exam questions loaded (50 questions)");
  const q1 = examState.questions![0];

  // Save an answer
  const saveRes = await saveAnswer(attemptRes.attemptId, studentId, q1.id, "Test Option A", 20);
  assert(saveRes.success, "Answer persisted successfully");

  // Verify recovery after simulated refresh
  const resumedExamState = await getAttemptExamState(attemptRes.attemptId, studentId);
  assert(
    resumedExamState.answers![q1.id]?.selectedAnswer === "Test Option A",
    "Student answer recovered after refresh"
  );

  // Submit and grade the attempt
  const gradeRes = await gradeAttempt(attemptRes.attemptId, studentId);
  assert(gradeRes.success, "Exam submitted and graded successfully");

  // 8. Results Page
  console.log("\nStep 8: Results Page (/tests/[id]/result)...");
  const resultRes = await fetch(`${baseUrl}/tests/${baseline.id}/result?attemptId=${attemptRes.attemptId}`, {
    headers: { Cookie: studentJar.getHeader() },
  });
  assert(resultRes.status === 200, "Result page returns 200 OK for evaluated attempt");

  // 9. Analytics Page
  console.log("\nStep 9: Analytics Page (/analytics)...");
  const analyticsRes = await fetch(`${baseUrl}/analytics`, {
    headers: { Cookie: studentJar.getHeader() },
  });
  assert(analyticsRes.status === 200, "Analytics page returns 200 OK");

  // 10. Profile Page
  console.log("\nStep 10: Profile Page (/profile)...");
  const profileRes = await fetch(`${baseUrl}/profile`, {
    headers: { Cookie: studentJar.getHeader() },
  });
  assert(profileRes.status === 200, "Profile page returns 200 OK");

  // 11. Admin Login & Suite
  console.log("\nStep 11: Admin Suite (/admin/questions, /admin/questions/new, /admin/tests/new)...");
  const adminJar = new CookieJar();
  const adminCsrfRes = await fetch(`${baseUrl}/api/auth/csrf`);
  adminJar.update(adminCsrfRes);
  const { csrfToken: adminCsrfToken } = await adminCsrfRes.json();

  const adminLoginRes = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: adminJar.getHeader(),
    },
    body: new URLSearchParams({
      email: "admin@placementos.dev",
      password: "admin123",
      csrfToken: adminCsrfToken,
    }),
    redirect: "manual",
  });
  assert(adminLoginRes.status === 302, "Admin login authenticated (status: 302 redirect)");
  adminJar.update(adminLoginRes);

  const adminQuestionsRes = await fetch(`${baseUrl}/admin/questions`, {
    headers: { Cookie: adminJar.getHeader() },
  });
  assert(adminQuestionsRes.status === 200, "Admin Question Bank returns 200 OK");

  const adminNewQuestionRes = await fetch(`${baseUrl}/admin/questions/new`, {
    headers: { Cookie: adminJar.getHeader() },
  });
  assert(adminNewQuestionRes.status === 200, "Admin New Question form returns 200 OK");

  const adminNewTestRes = await fetch(`${baseUrl}/admin/tests/new`, {
    headers: { Cookie: adminJar.getHeader() },
  });
  assert(adminNewTestRes.status === 200, "Admin Test Builder returns 200 OK");

  // 12. Anonymous Access Restrictions
  console.log("\nStep 12: Anonymous Access Restrictions...");
  const anonDashRes = await fetch(`${baseUrl}/dashboard`, { redirect: "manual" });
  assert(anonDashRes.status === 307 || anonDashRes.status === 302, "Anonymous access to /dashboard is blocked");

  console.log("\n==================================================");
  console.log("SMOKE TEST COMPLETE: ALL PRODUCTION FLOWS VERIFIED");
  console.log("==================================================\n");
}

runProductionSmokeTest().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
