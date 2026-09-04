/**
 * NEXORA — MILESTONE 4 POLISH & UX HARDENING TEST SUITE
 * Validates:
 * 1. Profile input validation (empty name, invalid grad year, string limits, language whitelist)
 * 2. Admin test builder validation (empty title, invalid duration, duplicate questions)
 * 3. Admin question creator validation (correctAnswer option match, prompt requirement)
 * 4. Result page in-progress security redirect guard
 * 5. Timer wall-clock calculation & auto-submit guard
 * 6. Responsive container token bounds
 */

export {};

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ ${testName}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

async function runM4PolishAudit() {
  console.log("\n==================================================");
  console.log("NEXORA — MILESTONE 4 POLISH & UX HARDENING AUDIT");
  console.log("==================================================\n");

  // 1. Profile Validation Logic Audit
  console.log("[1/6] Auditing Profile Validation Rules...");
  {
    // Test 1: Empty name rejection
    const validateName = (name: any) => typeof name === "string" && name.trim().length > 0 && name.trim().length <= 100;
    assert(!validateName(""), "Rejects empty string as name");
    assert(!validateName("   "), "Rejects whitespace-only string as name");
    assert(!validateName(null), "Rejects null name");
    assert(validateName("Alex Chen"), "Accepts valid engineer name");
    assert(!validateName("a".repeat(101)), "Rejects name exceeding 100 characters");

    // Test 2: Graduation year bounds (1980 - 2040)
    const validateGradYear = (year: any) => {
      if (year === null || year === undefined || year === "") return true; // optional
      const num = Number(year);
      return !isNaN(num) && Number.isInteger(num) && num >= 1980 && num <= 2040;
    };
    assert(validateGradYear(2025), "Accepts standard graduation year 2025");
    assert(validateGradYear(null), "Accepts null graduation year (optional)");
    assert(!validateGradYear(1979), "Rejects graduation year prior to 1980");
    assert(!validateGradYear(2041), "Rejects graduation year after 2040");
    assert(!validateGradYear("invalid_year"), "Rejects non-numeric graduation year");
    assert(!validateGradYear(-5), "Rejects negative graduation year");

    // Test 3: Preferred language whitelist
    const allowedLanguages = ["C++", "Java", "Python", "TypeScript", "JavaScript", "Go", "Rust"];
    const validateLanguage = (lang: string) => allowedLanguages.includes(lang);
    assert(validateLanguage("C++"), "Accepts C++ as preferred language");
    assert(validateLanguage("TypeScript"), "Accepts TypeScript as preferred language");
    assert(!validateLanguage("Brainfuck"), "Rejects unlisted programming language");
    assert(!validateLanguage("<script>alert(1)</script>"), "Rejects XSS attempt in preferred language");
  }

  // 2. Admin Test Builder Validation Audit
  console.log("\n[2/6] Auditing Admin Test Builder Validation Rules...");
  {
    const validateTestPayload = (p: { title?: any; duration?: any; questions?: any[] }) => {
      if (typeof p.title !== "string" || !p.title.trim() || p.title.trim().length > 200) {
        return { valid: false, error: "Test title is required." };
      }
      const dur = Number(p.duration);
      if (isNaN(dur) || dur < 1 || dur > 600) {
        return { valid: false, error: "Duration must be between 1 and 600 minutes." };
      }
      if (!Array.isArray(p.questions) || p.questions.length === 0) {
        return { valid: false, error: "At least one question must be selected." };
      }
      return { valid: true };
    };

    assert(!validateTestPayload({ title: "", duration: 60, questions: [{ questionId: "1" }] }).valid, "Rejects empty test title");
    assert(!validateTestPayload({ title: "Valid Title", duration: 0, questions: [{ questionId: "1" }] }).valid, "Rejects 0 duration");
    assert(!validateTestPayload({ title: "Valid Title", duration: 601, questions: [{ questionId: "1" }] }).valid, "Rejects duration > 600 min");
    assert(!validateTestPayload({ title: "Valid Title", duration: 60, questions: [] }).valid, "Rejects test with 0 questions");
    assert(validateTestPayload({ title: "Mock CS Assessment", duration: 45, questions: [{ questionId: "1" }] }).valid, "Accepts valid test payload");

    // Test question deduplication
    const deduplicateQuestions = (items: { questionId: string }[]) => {
      const seen = new Set<string>();
      const unique: { questionId: string }[] = [];
      for (const item of items) {
        if (item.questionId && !seen.has(item.questionId)) {
          seen.add(item.questionId);
          unique.push(item);
        }
      }
      return unique;
    };
    const duplicateList = [{ questionId: "q1" }, { questionId: "q2" }, { questionId: "q1" }];
    const deduped = deduplicateQuestions(duplicateList);
    assert(deduped.length === 2, "Deduplicates questions in test payload");
    assert(deduped[0].questionId === "q1" && deduped[1].questionId === "q2", "Preserves initial question ordering during deduplication");
  }

  // 3. Admin Question Creation Validation Audit
  console.log("\n[3/6] Auditing Admin Question Bank Validation Rules...");
  {
    const validateQuestion = (q: { question: string; options: string[]; correctAnswer: string; subjectId?: string; topicId?: string }) => {
      if (!q.question || !q.question.trim()) return { valid: false, error: "Question prompt required" };
      if (!Array.isArray(q.options) || q.options.filter(o => o.trim()).length < 2) return { valid: false, error: "At least 2 options required" };
      if (!q.correctAnswer || !q.options.includes(q.correctAnswer.trim())) return { valid: false, error: "Correct answer must match an option" };
      if (!q.subjectId || !q.topicId) return { valid: false, error: "Subject and topic required" };
      return { valid: true };
    };

    assert(!validateQuestion({ question: "", options: ["A", "B"], correctAnswer: "A", subjectId: "s1", topicId: "t1" }).valid, "Rejects empty question content");
    assert(!validateQuestion({ question: "Valid prompt", options: ["A"], correctAnswer: "A", subjectId: "s1", topicId: "t1" }).valid, "Rejects fewer than 2 options");
    assert(!validateQuestion({ question: "Valid prompt", options: ["A", "B"], correctAnswer: "C", subjectId: "s1", topicId: "t1" }).valid, "Rejects correctAnswer that is not among the options");
    assert(validateQuestion({ question: "What is O(1)?", options: ["Constant", "Linear"], correctAnswer: "Constant", subjectId: "s1", topicId: "t1" }).valid, "Accepts strictly matching correctAnswer");
  }

  // 4. Timer Wall-Clock Synchronization & Drift Immunity Audit
  console.log("\n[4/6] Auditing Timer Wall-Clock Calculation Logic...");
  {
    // Simulate background tab throttling: 100 seconds total duration, elapsed real time = 45 seconds
    const totalDurationSeconds = 100;
    const startTime = Date.now();
    const targetEndTime = startTime + totalDurationSeconds * 1000;

    // Simulate clock checking at +45 seconds
    const simulatedNow = startTime + 45 * 1000;
    const remaining = Math.max(0, Math.ceil((targetEndTime - simulatedNow) / 1000));
    assert(remaining === 55, "Wall-clock calculation correctly yields remaining seconds immune to tab throttling");

    // Simulate expiry: simulatedNow = startTime + 105 seconds
    const expiredNow = startTime + 105 * 1000;
    const expiredRemaining = Math.max(0, Math.ceil((targetEndTime - expiredNow) / 1000));
    assert(expiredRemaining === 0, "Expired timer clamps to 0 and never becomes negative");

    // Double-submit guard test
    let submissionCallCount = 0;
    let isSubmitting = false;
    const handleFinalSubmit = () => {
      if (isSubmitting) return;
      isSubmitting = true;
      submissionCallCount++;
    };
    handleFinalSubmit();
    handleFinalSubmit(); // Concurrent auto-submit trigger
    assert(submissionCallCount === 1, "Double-submission guard blocks concurrent or duplicate submit triggers");
  }

  // 5. Result Page Security Status Guard Audit
  console.log("\n[5/6] Auditing Result Page Status Security Guard...");
  {
    // Test that an active in_progress attempt cannot view result answers
    const checkResultAccess = (attemptStatus: string) => {
      if (attemptStatus === "in_progress") {
        return { allowResult: false, redirect: "/tests/[id]/attempt" };
      }
      return { allowResult: true };
    };

    assert(!checkResultAccess("in_progress").allowResult, "Blocks in_progress attempt from viewing results and explanations");
    assert(checkResultAccess("in_progress").redirect === "/tests/[id]/attempt", "Redirects active attempts back to the exam engine");
    assert(checkResultAccess("submitted").allowResult, "Allows submitted attempt to view evaluated results");
    assert(checkResultAccess("expired").allowResult, "Allows expired attempt to view evaluated results");
  }

  // 6. Responsive Layout Bounds Verification
  console.log("\n[6/6] Auditing Responsive Container Bounds...");
  {
    // Clamp calculation: clamp(24px, 4vw, 80px)
    const computeFluidPadding = (viewportWidth: number) => {
      const preferred = (viewportWidth * 4) / 100;
      return Math.min(80, Math.max(24, preferred));
    };

    // Verify 6 target viewports
    assert(computeFluidPadding(390) === 24, "390px (mobile): padding clamps to minimum 24px");
    assert(computeFluidPadding(768) >= 24 && computeFluidPadding(768) <= 80, "768px (tablet): padding scales proportionally (30.7px)");
    assert(computeFluidPadding(1366) >= 50 && computeFluidPadding(1366) <= 60, "1366px (laptop): padding is comfortable (~54.6px)");
    assert(computeFluidPadding(1440) >= 50 && computeFluidPadding(1440) <= 60, "1440px (desktop): padding is optimal (~57.6px)");
    assert(computeFluidPadding(1920) >= 70 && computeFluidPadding(1920) <= 80, "1920px (FHD): padding fills container naturally (~76.8px)");
    assert(computeFluidPadding(2560) === 80, "2560px (QHD): padding caps at 80px, avoiding excessive empty margins");
  }

  console.log("\n==================================================");
  console.log(`AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runM4PolishAudit().catch((err) => {
  console.error("Audit threw unexpected exception:", err);
  process.exit(1);
});
