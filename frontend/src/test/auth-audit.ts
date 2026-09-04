import pg from "pg";
import bcrypt from "bcryptjs";

const BASE_URL = "http://localhost:3000";

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

async function runAuthAudit() {
  console.log("==================================================");
  console.log("🔐 NEXORA / PLACEMENT OS — AUTHENTICATION AUDIT");
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

  // 1. Landing page check
  console.log("1. Public Routes Access...");
  const resLanding = await fetch(`${BASE_URL}/`, { redirect: "manual" });
  assert(resLanding.status === 200, "Landing page (/) returns 200 OK");

  const resLogin = await fetch(`${BASE_URL}/auth/login`, { redirect: "manual" });
  assert(resLogin.status === 200, "Login page (/auth/login) returns 200 OK");

  const resRegister = await fetch(`${BASE_URL}/auth/register`, { redirect: "manual" });
  assert(resRegister.status === 200, "Register page (/auth/register) returns 200 OK");

  // 2. Protected Routes without Auth
  console.log("\n2. Protected Routes (Unauthenticated Blocking)...");
  const protectedPaths = ["/dashboard", "/analytics", "/profile", "/tests", "/admin/questions"];
  for (const path of protectedPaths) {
    const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
    const location = res.headers.get("location");
    const isBlocked = Boolean(
      (res.status === 307 || res.status === 302 || res.status === 308) &&
      location?.includes("/auth/login")
    );
    assert(isBlocked, `Unauthenticated ${path} redirected to /auth/login (status: ${res.status})`);
  }

  // 3. User Registration
  console.log("\n3. Registration Flow Validation...");
  const testEmail = `audit_student_${Date.now()}@placementos.dev`;
  const testPassword = "AuditPassword123!";

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Audit Test Student",
      email: testEmail,
      password: testPassword,
      college: "Audit Engineering Institute",
      branch: "Computer Science",
      graduationYear: 2026,
    }),
  });

  const regData = await regRes.json();
  assert(regRes.status === 201 && regData.message === "Account created successfully", "New student registered successfully (201)");

  // Verify DB record & password hash
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/placement_os",
  });

  const userQuery = await pool.query("SELECT * FROM users WHERE email = $1", [testEmail.toLowerCase()]);
  assert(userQuery.rows.length === 1, "User record found in database");
  const dbUser = userQuery.rows[0];
  assert(dbUser.password_hash !== testPassword, "Password is NOT stored in plaintext");
  const isHashValid = await bcrypt.compare(testPassword, dbUser.password_hash);
  assert(isHashValid, "Password hash is valid bcrypt hash");
  assert(dbUser.is_admin === false, "Registered user is default student (is_admin = false)");

  const profileQuery = await pool.query("SELECT * FROM profiles WHERE user_id = $1", [dbUser.id]);
  assert(profileQuery.rows.length === 1, "Profile record created with academic metadata");
  assert(profileQuery.rows[0].college === "Audit Engineering Institute", "Profile contains correct college");

  // Duplicate registration test
  const dupRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Duplicate Student",
      email: testEmail,
      password: testPassword,
    }),
  });
  assert(dupRes.status === 409, "Duplicate registration rejected with 409 Conflict");

  // 4. Invalid Credentials Test
  console.log("\n4. Invalid Credentials Handling...");
  const invalidJar = new CookieJar();
  const csrfRes1 = await fetch(`${BASE_URL}/api/auth/csrf`);
  invalidJar.update(csrfRes1);
  const { csrfToken: csrf1 } = await csrfRes1.json();

  const invalidLoginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: invalidJar.getHeader(),
    },
    body: new URLSearchParams({
      csrfToken: csrf1,
      email: testEmail,
      password: "WrongPassword999!",
    }).toString(),
    redirect: "manual",
  });

  const invalidLoc = invalidLoginRes.headers.get("location");
  assert(
    invalidLoc?.includes("error=CredentialsSignin") || invalidLoginRes.status === 401,
    `Invalid credentials rejected with error redirect (status: ${invalidLoginRes.status})`
  );

  // 5. Valid Student Login & Session Verification
  console.log("\n5. Valid Student Login & Session Verification...");
  const studentJar = new CookieJar();
  const csrfRes2 = await fetch(`${BASE_URL}/api/auth/csrf`);
  studentJar.update(csrfRes2);
  const { csrfToken: csrf2 } = await csrfRes2.json();

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: studentJar.getHeader(),
    },
    body: new URLSearchParams({
      csrfToken: csrf2,
      email: testEmail,
      password: testPassword,
    }).toString(),
    redirect: "manual",
  });

  studentJar.update(loginRes);
  assert(studentJar.cookies["authjs.session-token"] !== undefined, "Session token cookie issued upon successful credentials login");

  // 6. Verify Session Endpoint
  const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: studentJar.getHeader() },
  });
  const sessionData = await sessionRes.json();
  assert(sessionData?.user?.id === dbUser.id, "Session user ID matches authenticated user ID");
  assert(sessionData?.user?.email === testEmail.toLowerCase(), "Session user email matches registered email");
  assert(sessionData?.user?.isAdmin === false, "Session user isAdmin is false for student");

  // 7. Authenticated Protected Route Access (Student)
  console.log("\n6. Student Authenticated Access to Protected Routes...");
  const dashRes = await fetch(`${BASE_URL}/dashboard`, {
    headers: { Cookie: studentJar.getHeader() },
    redirect: "manual",
  });
  assert(dashRes.status === 200, "Student can access /dashboard (200 OK)");

  const analyticsRes = await fetch(`${BASE_URL}/analytics`, {
    headers: { Cookie: studentJar.getHeader() },
    redirect: "manual",
  });
  assert(analyticsRes.status === 200, "Student can access /analytics (200 OK)");

  const profileRes = await fetch(`${BASE_URL}/profile`, {
    headers: { Cookie: studentJar.getHeader() },
    redirect: "manual",
  });
  assert(profileRes.status === 200, "Student can access /profile (200 OK)");

  // 8. Student blocked from Admin routes
  console.log("\n7. Student Role Boundary Verification (Blocked from Admin)...");
  const studentAdminRes = await fetch(`${BASE_URL}/admin/questions`, {
    headers: { Cookie: studentJar.getHeader() },
    redirect: "manual",
  });
  const adminRedirect = studentAdminRes.headers.get("location");
  assert(
    adminRedirect?.includes("/dashboard") || studentAdminRes.status === 403,
    `Student is blocked from /admin/questions and redirected to /dashboard (status: ${studentAdminRes.status})`
  );

  // 9. Admin Login & Privileged Route Access
  console.log("\n8. Admin Login & Privileged Route Access...");
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
    }).toString(),
    redirect: "manual",
  });

  adminJar.update(adminLoginRes);
  assert(adminJar.cookies["authjs.session-token"] !== undefined, "Admin session token cookie issued");

  const adminSessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: adminJar.getHeader() },
  });
  const adminSessionData = await adminSessionRes.json();
  assert(adminSessionData?.user?.isAdmin === true, "Admin session has isAdmin === true");

  const adminQuestionsRes = await fetch(`${BASE_URL}/admin/questions`, {
    headers: { Cookie: adminJar.getHeader() },
    redirect: "manual",
  });
  assert(adminQuestionsRes.status === 200, "Admin can access /admin/questions (200 OK)");

  // 10. Logout Verification
  console.log("\n9. Logout Verification...");
  const logoutJar = new CookieJar();
  logoutJar.cookies["authjs.session-token"] = studentJar.cookies["authjs.session-token"];
  const logoutCsrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  logoutJar.update(logoutCsrfRes);
  const { csrfToken: logoutCsrf } = await logoutCsrfRes.json();

  const signoutRes = await fetch(`${BASE_URL}/api/auth/signout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: logoutJar.getHeader(),
    },
    body: new URLSearchParams({ csrfToken: logoutCsrf }).toString(),
    redirect: "manual",
  });
  logoutJar.update(signoutRes);

  const postLogoutSession = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { Cookie: logoutJar.getHeader() },
  });
  const postLogoutData = await postLogoutSession.json();
  assert(!postLogoutData?.user, "Session is completely terminated after logout");

  const postLogoutDash = await fetch(`${BASE_URL}/dashboard`, {
    headers: { Cookie: logoutJar.getHeader() },
    redirect: "manual",
  });
  assert(
    Boolean(
      (postLogoutDash.status === 307 || postLogoutDash.status === 302) &&
      postLogoutDash.headers.get("location")?.includes("/auth/login")
    ),
    "Post-logout request to /dashboard redirects to /auth/login"
  );

  // Cleanup test user
  await pool.query("DELETE FROM users WHERE id = $1", [dbUser.id]);
  await pool.end();

  console.log("\n==================================================");
  console.log(`AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthAudit().catch((err) => {
  console.error("Audit script failed with error:", err);
  process.exit(1);
});
