/**
 * NEXORA — END-TO-END HTTP/API VERIFICATION
 * Performs full student and admin flow against live server at http://localhost:3000
 */

export {};

const BASE_URL = "http://localhost:3000";

import { db } from "@/db";
import { tests, testQuestions } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  clear() {
    this.cookies = {};
  }
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function runE2EHttpVerification() {
  console.log("\n==================================================");
  console.log("NEXORA — END-TO-END HTTP/API VERIFICATION");
  console.log("==================================================\n");

  const timestamp = Date.now();
  const testStudentEmail = `m4_student_${timestamp}@placementos.dev`;
  const testStudentPassword = "Password123!";

  // 1. Landing Page
  console.log("Step 1: Public Landing Page...");
  const homeRes = await fetch(`${BASE_URL}/`);
  assert(homeRes.status === 200, "Landing page returns 200 OK");
  const homeHtml = await homeRes.text();
  assert(homeHtml.includes("Nexora"), "Landing page contains Nexora branding");

  // 2. Student Registration
  console.log("\nStep 2: Student Registration...");
  const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Morgan Lee",
      email: testStudentEmail,
      password: testStudentPassword,
      college: "Stanford University",
      branch: "Computer Science",
      graduationYear: 2026,
    }),
  });
  assert(registerRes.status === 201, "Registration succeeds with 201 Created");

  // 3. Student Login
  console.log("\nStep 3: Student Login & Session Issuance...");
  const studentJar = new CookieJar();
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  studentJar.update(csrfRes);
  const { csrfToken } = await csrfRes.json();

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: studentJar.getHeader(),
    },
    body: new URLSearchParams({
      csrfToken,
      email: testStudentEmail,
      password: testStudentPassword,
      redirect: "false",
      json: "true",
    }),
    redirect: "manual",
  });
  studentJar.update(loginRes);
  assert(loginRes.status === 200 || loginRes.status === 302, "Student login authenticated");

  // 4. Student Accesses Dashboard
  console.log("\nStep 4: Authenticated Dashboard (Fresh User State A)...");
  const dashRes = await fetch(`${BASE_URL}/dashboard`, {
    headers: { Cookie: studentJar.getHeader() },
  });
  assert(dashRes.status === 200, "Dashboard returns 200 OK for authenticated student");
  const dashHtml = await dashRes.text();
  assert(dashHtml.includes("Morgan") || dashHtml.includes("Placement Readiness"), "Dashboard displays student greeting & readiness component");
  assert(dashHtml.includes("UNCALIBRATED") || dashHtml.includes("--%"), "Fresh student displays uncalibrated baseline status (Zero fake data)");

  // 5. Student Accesses Tests Catalog
  console.log("\nStep 5: Tests Catalog Access...");
  const testsRes = await fetch(`${BASE_URL}/tests`, {
    headers: { Cookie: studentJar.getHeader() },
  });
  assert(testsRes.status === 200, "Tests catalog returns 200 OK");
  const testsHtml = await testsRes.text();
  assert(testsHtml.includes("Baseline Assessment") || testsHtml.includes("Curated Assessment Catalog"), "Tests catalog contains published assessments");

  // 6. Student Accesses Analytics (Empty State)
  console.log("\nStep 6: Analytics Page (Fresh User Empty State)...");
  const analyticsRes = await fetch(`${BASE_URL}/analytics`, {
    headers: { Cookie: studentJar.getHeader() },
  });
  assert(analyticsRes.status === 200, "Analytics page returns 200 OK");
  const analyticsHtml = await analyticsRes.text();
  assert(analyticsHtml.includes("Your analytics will appear here"), "Analytics correctly presents designed empty state for fresh user");

  // 7. Student Profile Access & Editing
  console.log("\nStep 7: Student Profile & Validation...");
  const profileRes = await fetch(`${BASE_URL}/profile`, {
    headers: { Cookie: studentJar.getHeader() },
  });
  assert(profileRes.status === 200, "Profile page returns 200 OK");

  // Test Profile Validation (Empty Name Rejection)
  const invalidProfileRes = await fetch(`${BASE_URL}/api/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: studentJar.getHeader(),
    },
    body: JSON.stringify({
      name: "",
      college: "Stanford",
      branch: "CS",
      graduationYear: 2026,
      preferredLanguage: "C++",
    }),
  });
  assert(invalidProfileRes.status === 400, "API rejects empty name with 400 Bad Request");

  // Test Profile Valid Update
  const validProfileRes = await fetch(`${BASE_URL}/api/profile`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Cookie: studentJar.getHeader(),
    },
    body: JSON.stringify({
      name: "Morgan Lee",
      college: "Stanford School of Engineering",
      branch: "Computer Systems",
      graduationYear: 2026,
      preferredLanguage: "Python",
    }),
  });
  assert(validProfileRes.status === 200, "API accepts valid profile update with 200 OK");

  // 8. Admin Authentication & Role Enforcement
  console.log("\nStep 8: Admin Authentication & RBAC Enforcement...");
  // Student blocked from admin
  const studentAdminRes = await fetch(`${BASE_URL}/admin/questions`, {
    headers: { Cookie: studentJar.getHeader() },
    redirect: "manual",
  });
  assert(studentAdminRes.status === 307 || studentAdminRes.status === 302, "Student is blocked from /admin/questions and redirected");

  const studentDuplicateRes = await fetch(`${BASE_URL}/api/admin/tests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: studentJar.getHeader() },
    body: JSON.stringify({ action: "duplicate", id: "00000000-0000-0000-0000-000000000000" }),
  });
  assert(studentDuplicateRes.status === 403, "Student cannot invoke test duplication");

  const anonymousDuplicateRes = await fetch(`${BASE_URL}/api/admin/tests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "duplicate", id: "00000000-0000-0000-0000-000000000000" }),
    redirect: "manual",
  });
  assert(anonymousDuplicateRes.status === 403 || anonymousDuplicateRes.status === 307 || anonymousDuplicateRes.status === 302, "Anonymous user cannot invoke test duplication");

  const studentPreviewRes = await fetch(`${BASE_URL}/admin/tests/preview`, {
    headers: { Cookie: studentJar.getHeader() },
    redirect: "manual",
  });
  assert(studentPreviewRes.status === 307 || studentPreviewRes.status === 302, "Student is blocked from admin test preview and redirected");

  const anonymousPreviewRes = await fetch(`${BASE_URL}/admin/tests/preview`, {
    redirect: "manual",
  });
  assert(anonymousPreviewRes.status === 307 || anonymousPreviewRes.status === 302, "Anonymous user is blocked from admin test preview and redirected");

  // Login as Admin
  const adminJar = new CookieJar();
  const adminCsrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  adminJar.update(adminCsrfRes);
  const { csrfToken: adminCsrf } = await adminCsrfRes.json();

  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: adminJar.getHeader(),
    },
    body: new URLSearchParams({
      csrfToken: adminCsrf,
      email: "admin@placementos.dev",
      password: "admin123",
      redirect: "false",
      json: "true",
    }),
    redirect: "manual",
  });
  adminJar.update(adminLoginRes);
  assert(adminLoginRes.status === 200 || adminLoginRes.status === 302, "Admin login authenticated");

  const adminQuestionsRes = await fetch(`${BASE_URL}/admin/questions`, {
    headers: { Cookie: adminJar.getHeader() },
  });
  assert(adminQuestionsRes.status === 200, "Admin can access Question Bank (/admin/questions)");

  const adminPreviewRes = await fetch(`${BASE_URL}/admin/tests/preview`, {
    headers: { Cookie: adminJar.getHeader() },
  });
  assert(adminPreviewRes.status === 200, "Admin can access protected test preview route");
  const adminPreviewHtml = await adminPreviewRes.text();
  assert(adminPreviewHtml.includes("Preview is unavailable"), "Preview safely handles missing local builder state without server data");

  // 9. Admin Test Duplication
  console.log("\nStep 9: Admin Test Duplication...");
  const sourceTest = (await db.select().from(tests).where(eq(tests.type, "baseline")).limit(1))[0];
  const sourceLinks = sourceTest
    ? await db.select().from(testQuestions).where(eq(testQuestions.testId, sourceTest.id)).orderBy(testQuestions.questionOrder)
    : [];
  const duplicateRes = await fetch(`${BASE_URL}/api/admin/tests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminJar.getHeader(),
    },
    body: JSON.stringify({ action: "duplicate", id: sourceTest?.id }),
  });
  assert(duplicateRes.status === 200, "Admin can duplicate an existing test");
  const duplicatePayload = await duplicateRes.json();
  const duplicateId = duplicatePayload.test?.id as string | undefined;
  assert(Boolean(duplicateId && duplicateId !== sourceTest?.id), "Duplicate receives a new test ID");
  assert(duplicatePayload.test?.isPublished === false, "Published source becomes draft duplicate");
  assert(duplicatePayload.questionCount === sourceLinks.length, "Duplicate preserves question count");
  const duplicateLinks = duplicateId
    ? await db.select().from(testQuestions).where(eq(testQuestions.testId, duplicateId)).orderBy(testQuestions.questionOrder)
    : [];
  assert(duplicateLinks.every((link, index) => link.questionId === sourceLinks[index]?.questionId && link.questionOrder === sourceLinks[index]?.questionOrder), "Duplicate preserves question references and ordering");
  assert(sourceTest?.title !== duplicatePayload.test?.title || !sourceTest, "Duplicate uses a collision-safe title");
  if (duplicateId) {
    await db.delete(tests).where(eq(tests.id, duplicateId));
  }

  // 10. Admin Question Creation Validation
  console.log("\nStep 10: Admin Question Creation Validation...");
  const invalidQRes = await fetch(`${BASE_URL}/api/admin/questions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminJar.getHeader(),
    },
    body: JSON.stringify({
      question: "",
      options: ["A", "B"],
      correctAnswer: "A",
    }),
  });
  assert(invalidQRes.status === 400, "Admin question creation rejects empty question with 400 Bad Request");

  // 11. Admin Test Builder Validation
  console.log("\nStep 11: Admin Test Builder Validation...");
  const invalidTestRes = await fetch(`${BASE_URL}/api/admin/tests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: adminJar.getHeader(),
    },
    body: JSON.stringify({
      title: "",
      duration: 60,
      questions: [],
    }),
  });
  assert(invalidTestRes.status === 400, "Admin test creation rejects invalid payload with 400 Bad Request");

  console.log("\n==================================================");
  console.log(`HTTP E2E RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

runE2EHttpVerification().catch((err) => {
  console.error("HTTP verification failed:", err);
  process.exit(1);
});
