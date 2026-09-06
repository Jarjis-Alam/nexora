# NEXORA — PHASE 7B IMPLEMENTATION REPORT
## Server-Side Per-Attempt Question Randomization

---

### Executive Summary

Phase 7B (Question Randomization) has been successfully implemented and verified across the Nexora assessment platform in strict accordance with the approved architecture specification (`phase-7b-question-randomization-plan.md`).

Question randomization is configured at the test level, generated strictly server-side using a cryptographically secure Fisher-Yates shuffle (`crypto.randomInt`), and persisted immutably in a dedicated `attempt_questions` relational table upon attempt initiation. Shuffling occurs strictly within section boundaries, preserving section order and section groupings. A hybrid resolver guarantees 100% backward compatibility for pre-existing tests and historical attempts without requiring disruptive historical data migrations.

---

### 1. Files Changed & Added

| File | Status | Description |
|---|---|---|
| `frontend/src/db/migrations/0003_phase_7b_question_randomization.sql` | Created | SQL migration adding `tests.randomize_questions` column and creating the `attempt_questions` table with cascade foreign keys and unique constraints |
| `frontend/src/db/migrations/meta/_journal.json` | Modified | Registered entry 3 for migration `0003_phase_7b_question_randomization` |
| `frontend/src/db/schema.ts` | Modified | Added `randomizeQuestions` boolean field to `tests` schema and defined the `attemptQuestions` table schema with indexes and unique constraints |
| `frontend/src/lib/random.ts` | Created | Cryptographically secure server-side Fisher-Yates array shuffle utilizing Node.js `crypto.randomInt` |
| `frontend/src/server/tests.ts` | Modified | Updated `startOrResumeAttempt` to generate and persist randomized attempt sequences, updated `getAttemptExamState` with hybrid resolver, and updated `duplicateTest` to clone `randomizeQuestions` |
| `frontend/src/server/grading.ts` | Modified | Updated question loading in `gradeAttempt` to use the hybrid resolver (future-compatible for sampled pool attempts) |
| `frontend/src/app/api/admin/tests/route.ts` | Modified | Support `randomizeQuestions` in admin test creation (`POST`) and update (`PATCH`) endpoints |
| `frontend/src/components/admin/test-builder.tsx` | Modified | Added minimal Randomize Questions toggle (`[ OFF / ON ]`) with helper text under Assessment Parameters |
| `frontend/src/components/admin/admin-test-preview.tsx` | Modified | Added `randomizeQuestions` to `PreviewDraft`, in-memory preview shuffling per section, and badge indicator |
| `frontend/src/app/(protected)/tests/[id]/result/page.tsx` | Modified | Implemented hybrid resolver so `DetailedReviewTable` displays questions in the student's actual attempt sequence |
| `frontend/src/db/seed.ts` | Modified | Added `attemptQuestions` schema import and clean deletion in cleanup routine |
| `frontend/src/test/phase-7b-question-randomization-audit.ts` | Created | Comprehensive automated test suite covering all 11 test suites and 41 test assertions |

---

### 2. Database Migration & Schema

#### Migration: `0003_phase_7b_question_randomization.sql`
- Added column `randomize_questions` to `tests`:
  ```sql
  ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "randomize_questions" boolean DEFAULT false NOT NULL;
  ```
- Created dedicated relational table `attempt_questions`:
  ```sql
  CREATE TABLE IF NOT EXISTS "attempt_questions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "attempt_id" uuid NOT NULL REFERENCES "attempts"("id") ON DELETE CASCADE,
    "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
    "section_id" uuid NOT NULL REFERENCES "test_sections"("id") ON DELETE CASCADE,
    "question_order" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS "attempt_questions_attempt_question_unique"
    ON "attempt_questions" ("attempt_id", "question_id");

  CREATE UNIQUE INDEX IF NOT EXISTS "attempt_questions_attempt_order_unique"
    ON "attempt_questions" ("attempt_id", "question_order");
  ```

#### Schema Invariants:
- `randomize_questions` is non-null and defaults to `false`.
- Foreign key cascading ensures that when an attempt, question, or section is deleted, associated `attempt_questions` records are cleanly purged.
- Unique constraints prevent duplicate question assignments within an attempt and enforce strictly sequential `question_order` values.

---

### 3. Randomization Algorithm & Server-Side Execution

- **Algorithm**: In-place Fisher-Yates shuffle implementation in `src/lib/random.ts`.
- **Entropy Source**: Node.js standard library `crypto.randomInt(0, i + 1)`.
- **Prohibited Patterns**: Strictly no `Math.random()`, no client-side randomization, no render-time randomization, and no re-randomization on subsequent requests.
- **Timing**: Shuffling occurs **once** when a new attempt is instantiated inside a transactional database boundary in `startOrResumeAttempt`.

---

### 4. Attempt Persistence & Section Integrity

When a student starts an assessment:
1. Canonical section hierarchy is loaded (`ORDER BY section_order ASC`).
2. Canonical test questions are loaded (`ORDER BY question_order ASC`).
3. Questions are partitioned by `sectionId`.
4. If `test.randomizeQuestions` is enabled, each section's questions are shuffled independently using `shuffleArray()`. If disabled, canonical ordering is preserved.
5. Questions are assigned contiguous 1-based global sequence orders (`1..N`) across the sections and batch-inserted into `attempt_questions`.
6. **Section Boundaries**: Section order is strictly preserved (`Section 1` precedes `Section 2`). Questions never cross section boundaries. Within each section, questions occupy contiguous position intervals.

---

### 5. Hybrid Resolver Architecture

To ensure 100% backward compatibility with legacy attempts created prior to Phase 7B:
- Both `getAttemptExamState` and the post-submission Result page (`/tests/[id]/result`) inspect `attempt_questions` count for the target attempt.
- If `attempt_questions` rows exist:
  - Questions are fetched by joining `attempt_questions` ordered by `attempt_questions.question_order ASC`.
- If no `attempt_questions` exist (legacy attempts):
  - Fall back seamlessly to `test_questions` ordered by `test_sections.section_order ASC, test_questions.question_order ASC`.
- No historical attempts needed to be backfilled or altered.

---

### 6. Answer Persistence & Grading Invariant

- **Answer Keying**: Student answers are keyed strictly by `(attemptId, questionId)`. Answers are completely decoupled from display indices or UI ordering.
- **Exam Engine**: UI display indices (`Question 1`, `Question 2`, etc.) correspond to array indices in the student's randomized sequence. Navigating, marking for review, and answering correctly route to the genuine `questionId`.
- **Grading Invariant**: Scoring in `gradeAttempt` matches student answers by `questionId`. Correctness evaluation, marks earned, Phase 7A proportional negative penalties, accuracy percentages, and readiness ratings are mathematically identical regardless of presentation order.

---

### 7. Refresh, Resume & Lifecycle Immutability

- **Refresh / Reload**: When a student refreshes or resumes an in-progress attempt, `getAttemptExamState` queries the persisted `attempt_questions` table, guaranteeing the exact same question order.
- **Answer Restoration**: Saved answers are loaded and mapped into the exam engine by `questionId`, ensuring answers remain on their corresponding questions across reloads.
- **Timer Expiry & Auto-Submit**: Timer countdown calculates elapsed time based on server wall-clock timestamps. When time expires, auto-submit triggers cleanly without altering ordering or answer associations.

---

### 8. Admin Builder & Preview Integration

- **Admin Builder**: Added minimal toggle in Assessment Parameters:
  - Label: `Randomize Questions [ OFF / ON ]`
  - Helper text: `"Questions are shuffled independently for each attempt."`
  - Default: `OFF`
- **Duplicate Test**: `duplicateTest()` copies `randomizeQuestions` directly to the new draft test. In accordance with isolation requirements, `attempt_questions` are never cloned.
- **Admin Test Preview**: Updated `PreviewDraft` to carry `randomizeQuestions`. When previewing a draft with randomization enabled, questions are shuffled intra-section in memory using client cryptographic entropy (`window.crypto.getRandomValues`). The preview remains strictly local and creates zero database attempts.

---

### 9. Security & Boundary Enforcement

- **Server Authority**: The question sequence is generated and persisted solely by the server. Students cannot specify, modify, or inject question orders.
- **Exclusion of Sensitive Keys**: `getAttemptExamState` strictly projects only candidate-facing fields (`id`, `question`, `questionType`, `options`, `difficulty`, `marks`, `expectedTime`, `subjectName`, `topicName`, `sectionId`, `sectionTitle`, `sectionOrder`, `questionOrder`). Correct answers and explanations are omitted until after submission.
- **Access Control & Mutation Guard**: Cross-student attempts are blocked. Submitted attempts cannot be edited.

---

### 10. Verification & Quality Gates

#### Automated Test Execution

1. **Phase 7B Audit Suite (`src/test/phase-7b-question-randomization-audit.ts`)**:
   - **Status**: ALL PASS (41/41 assertions passed, 0 failed)
   - Covered: Randomization OFF canonical order, Randomization ON shuffling, Single-question edge case, Multi-section boundary integrity, Independent attempt permutations, Refresh/resume immutability, Answer persistence by `questionId`, Grading and negative marking invariant, Duplicate test copying, Legacy attempt fallback, Security/boundary isolation, Timer auto-submit, and Double-submit guard.

2. **Phase 7A Negative Marking Audit (`src/test/phase-7a-negative-marking-audit.ts`)**:
   - **Status**: ALL PASS (62/62 passed, 0 failed)

3. **Phase 6C Sections Audit (`src/test/phase-6c-sections-audit.ts`)**:
   - **Status**: ALL PASS (52/52 passed, 0 failed)

4. **Phase 6B Duplicate Test Audit (`src/test/duplicate-test-audit.ts`)**:
   - **Status**: ALL PASS (41/41 passed, 0 failed)

5. **Start Test Regression (`src/test/start-test-regression.ts`)**:
   - **Status**: ALL PASS (23/23 passed, 0 failed)

6. **Full System Integration Audit (`src/test/integration-audit.ts`)**:
   - **Status**: ALL PASS (61/61 passed, 0 failed)

#### Code Quality Gates

- **TypeScript Type Check (`npx tsc --noEmit`)**:
  - `0 errors`
- **ESLint (`npm run lint`)**:
  - `0 errors` (46 existing warnings in legacy files/UI hooks, 0 errors)
- **Production Build (`npm run build`)**:
  - `PASS` (All 20 static and dynamic routes compiled and generated successfully)

---

### 11. Known Limitations & Future Scope

- **Option Randomization (Phase 7C)**: Question options currently remain in their canonical stored order. Option-level shuffling will be implemented in Phase 7C.
- **Question Pools (Phase 7F)**: All canonical questions assigned to the test are included in each attempt. Dynamic subset sampling from question pools will be supported in Phase 7F using the existing `attempt_questions` relational structure.

---

PHASE 7B IMPLEMENTATION COMPLETE — SERVER-SIDE PER-ATTEMPT QUESTION RANDOMIZATION ENABLED.
