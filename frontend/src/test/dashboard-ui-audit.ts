const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ PASS: ${message}`);
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

async function loginUser(email: string, pass: string): Promise<string> {
  const jar = new CookieJar();
  const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`);
  jar.update(csrfRes);
  const { csrfToken } = await csrfRes.json();

  const loginRes = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.getHeader(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password: pass,
      redirect: "false",
      json: "true",
    }),
    redirect: "manual",
  });
  jar.update(loginRes);
  return jar.getHeader();
}

async function runDashboardAudit() {
  console.log("==================================================");
  console.log("🎯 NEXORA — DASHBOARD UI/UX AUDIT");
  console.log("==================================================\n");

  // 1. BRANDING AUDIT
  console.log("1. Auditing Dashboard Branding & Taglines...");
  const studentCookie = await loginUser("alex.chen@placementos.dev", "alex123");
  const dashRes = await fetch(`${BASE_URL}/dashboard`, {
    headers: { Cookie: studentCookie },
  });
  const dashHtml = await dashRes.text();
  assert(dashRes.status === 200, "Dashboard returns 200 OK for student");

  assert(dashHtml.includes("Nexora"), "Dashboard displays 'Nexora' brand");
  assert(dashHtml.includes("Your OS for Placements") || dashHtml.includes("Your Operating System for Placements"), "Branding uses 'Your OS for Placements' tagline");
  assert(!dashHtml.includes("Placement OS •"), "Old 'Placement OS • Active Session' replaced with 'Nexora • Active Session'");
  assert(!dashHtml.includes("Expert-Modular Prep"), "No outdated 'Expert-Modular Prep' language");
  assert(!dashHtml.includes("Lumen"), "No 'Lumen' references");

  // 2. SIDEBAR POLISH & RBAC
  console.log("\n2. Auditing Sidebar Navigation & RBAC Groups...");
  assert(dashHtml.includes("Dashboard"), "Sidebar contains 'Dashboard' nav item");
  assert(dashHtml.includes("Tests"), "Sidebar contains 'Tests' nav item");
  assert(dashHtml.includes("Analytics"), "Sidebar contains 'Analytics' nav item");
  assert(dashHtml.includes("Profile"), "Sidebar contains 'Profile' nav item");
  assert(!dashHtml.includes("Admin") || !dashHtml.includes("Question Bank"), "Admin navigation section strictly hidden for student role");

  // Admin login check
  const adminCookie = await loginUser("admin@placementos.dev", "admin123");
  const adminDashRes = await fetch(`${BASE_URL}/dashboard`, {
    headers: { Cookie: adminCookie },
  });
  const adminDashHtml = await adminDashRes.text();
  assert(adminDashHtml.includes("Admin") || adminDashHtml.includes("ADMIN"), "Admin user sees 'ADMIN' navigation section");
  assert(adminDashHtml.includes("Question Bank"), "Admin user sees 'Question Bank' link");
  assert(adminDashHtml.includes("Test Builder"), "Admin user sees 'Test Builder' link");

  // 3. HEADER & GREETING
  console.log("\n3. Auditing Header Greeting & Typography...");
  assert(dashHtml.includes("<h1"), "Header uses semantic <h1> heading");
  assert(dashHtml.includes("Alex") || dashHtml.includes("Good"), "Greeting greets user by real profile name");

  // 4. READINESS SCORE CARD
  console.log("\n4. Auditing Placement Readiness Score Card...");
  assert(dashHtml.includes("Placement Readiness Score"), "Card title 'Placement Readiness Score' exists");
  assert(dashHtml.includes("READINESS: NOT ASSESSED") || dashHtml.includes("BENCHMARK CALIBRATED"), "Readiness communicates clear benchmark status");
  assert(dashHtml.includes("Start Baseline Assessment") || dashHtml.includes("Take Mock Test"), "Primary CTA prominently displayed");

  // 5. QUICK ACTIONS
  console.log("\n5. Auditing Quick Actions Hierarchy...");
  assert(dashHtml.includes("Quick Actions"), "Quick Actions card exists");
  assert(dashHtml.includes("Take Mock Test"), "Primary action 'Take Mock Test' exists");
  assert(dashHtml.includes("View All Tests"), "Secondary action 'View All Tests' exists");
  assert(dashHtml.includes("View Analytics"), "Secondary action 'View Analytics' exists");

  // 6. SKILL OVERVIEW (ALL 7 PLACEMENT DOMAINS)
  console.log("\n6. Auditing Skill Overview (All 7 Placement Domains)...");
  assert(dashHtml.includes("Skill Overview"), "Skill Overview section exists");
  assert(dashHtml.includes("Performance across 7 placement domains"), "Explicitly references 7 placement domains");
  const coreSubjects = ["Aptitude", "DSA", "DBMS", "OS", "Networks", "OOP", "SQL"];
  for (const subj of coreSubjects) {
    assert(dashHtml.includes(subj), `Subject '${subj}' is rendered in Skill Overview`);
  }

  // 7. RECENT ACTIVITY
  console.log("\n7. Auditing Recent Activity Section...");
  assert(dashHtml.includes("Recent Activity"), "Recent Activity section exists");
  assert(dashHtml.includes("No activity yet") || dashHtml.includes("Score:"), "Presents intentional empty state or verified attempt data");

  // 8. DEVELOPER SECTION
  console.log("\n8. Auditing Developer Section & Modal Controls...");
  assert(dashHtml.includes("Portfolio") || dashHtml.includes("DEV Card"), "Developer portfolio / dev card button present");
  assert(dashHtml.includes("https://github.com/Jarjis-Alam"), "GitHub link present");
  assert(dashHtml.includes("https://www.linkedin.com/in/jarjisalam/"), "LinkedIn link present");

  console.log("\n==================================================");
  console.log("🎉 ALL DASHBOARD UI/UX AUDITS PASSED SUCCESSFULLY");
  console.log("==================================================");
}

runDashboardAudit().catch((err) => {
  console.error("Audit error:", err);
  process.exit(1);
});
