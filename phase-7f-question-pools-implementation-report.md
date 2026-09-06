# NEXORA — PHASE 7F IMPLEMENTATION REPORT
## Question Pools

---

### 1. Executive Summary

Phase 7F completes the final planned sub-phase of Phase 7 for Nexora ("Your Operating System for Placements"). It introduces **Question Pools** — dynamic question sampling containers configured per section within tests. Instead of tests requiring purely fixed question sets, administrators can define pools containing $M$ candidate questions and specify a selection count $K$ ($1 \le K \le M$) with uniform marks per question. When a student initiates an attempt, the server deterministically samples exactly $K$ questions per pool, shuffles them per the test's question-randomization setting (Phase 7B), shuffles options per the option-randomization setting (Phase 7C), and snapshots the selected questions immutably into `attempt_questions` (Phase 7C.1).

Subsequent pool additions, removals, or edits never affect ongoing or historical attempts. Tests with pools integrate transparently with Phase 7A (Negative Marking), Phase 7B (Question Randomization), Phase 7C (Option Randomization), Phase 7C.1 (Snapshot Hardening), Phase 7D (Attempt Limits), and Phase 7E (Test Instructions).

**Verification**:
- Phase 7F Comprehensive Audit: **39/39 PASSED**
- All prior phase audits (7A, 7B, 7C, 7C.1, 7D, 7E): **100% GREEN**
- TypeScript compilation (`tsc --noEmit` & `npm run build`): **0 ERRORS, CLEAN PRODUCTION BUILD**

---

### 2. Files Changed & Created

| File | Status | Description |
|---|---|---|
| `frontend/src/db/migrations/0008_phase_7f_question_pools.sql` | **Created** | DDL migration creating `question_pools`, `question_pool_questions`, and adding `pool_id` to `attempt_questions` |
| `frontend/src/db/migrations/meta/_journal.json` | Modified | Registers migration index 8 |
| `frontend/src/db/schema.ts` | Modified | Drizzle schema definitions for `questionPools`, `questionPoolQuestions`, and relation mappings |
| `frontend/src/app/api/admin/tests/route.ts` | Modified | POST / PATCH transactionally stores and synchronizes test sections, fixed questions, and question pools with pool questions |
| `frontend/src/server/tests.ts` | Modified | Updated `startOrResumeAttempt`, `getTestDetails`, `getPublishedTests`, and `duplicateTest` to support question pools |
| `frontend/src/components/admin/test-builder.tsx` | Modified | Full admin test builder UI for section pool creation, configuration, target destination selector, and live capacity validation |
| `frontend/src/test/phase-7f-question-pools-audit.ts` | **Created** | 9 test suites / 39 assertions covering schema, sampling, immutability, metrics, duplication, and grading |
| `phase-7f-question-pools-audit.md` | **Created** | Preliminary audit & readiness inspection report |
| `phase-7f-question-pools-implementation-report.md` | **Created** | Final Phase 7F implementation report |

---

### 3. Data Model & Database Architecture

#### Migration `0008_phase_7f_question_pools.sql`
```sql
CREATE TABLE IF NOT EXISTS "question_pools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "test_id" uuid NOT NULL REFERENCES "tests"("id") ON DELETE CASCADE,
  "section_id" uuid NOT NULL REFERENCES "test_sections"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "description" text,
  "selection_count" integer NOT NULL,
  "pool_order" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "question_pools_selection_count_check" CHECK ("selection_count" > 0)
);

CREATE TABLE IF NOT EXISTS "question_pool_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pool_id" uuid NOT NULL REFERENCES "question_pools"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
  "question_order" integer NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "question_pool_questions_unique" UNIQUE("pool_id", "question_id")
);

ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "pool_id" uuid REFERENCES "question_pools"("id") ON DELETE SET NULL;
```

#### Key Design Properties
1. **Cascade Cleanup**: Deleting a test cascades to sections, pools, and pool question mappings cleanly.
2. **Nullable `attempt_questions.pool_id`**: Identifies whether a question in an attempt was sampled from a pool (`poolId != null`) or was a fixed question (`poolId == null`). If a pool is later deleted, historical attempts retain their questions with `pool_id` set to NULL.
3. **Database Integrity**: CHECK constraint ensures `selection_count > 0`, and a UNIQUE constraint prevents adding the same question multiple times to the same pool.

---

### 4. Admin Test Builder UI (`test-builder.tsx`)

1. **Target Destination Selector**: When adding questions from the Question Bank drawer, admins can assign selected questions to:
   - Fixed section questions (`{ type: "section", sectionId }`)
   - Specific question pools (`{ type: "pool", sectionId, poolId }`)
2. **Pool Management Card**:
   - Title, Description, and Selection Count ($K$) input fields.
   - Live question count vs. selection count validation badge:
     - Amber alert if $M < K$: *"Pool under capacity ($M$ of $K$ required)"*
     - Green badge if $M \ge K$: *"Valid ($M$ available, $K$ selected)"*
   - Uniform Marks Enforcement: Visual indicator that all questions within a pool share identical mark weighting.
   - Question list inside pool with individual remove actions.
3. **Section Summary**: Badges at section header compute dynamic totals:
   - Fixed questions: $N_{\text{fixed}}$
   - Pool sampled questions: $\sum K_i$
   - Total attempted questions: $N_{\text{fixed}} + \sum K_i$
   - Total pool candidate bank: $\sum M_i$

---

### 5. Attempt Sampling & Immutability Lifecycle

#### Sampling in `startOrResumeAttempt` (`frontend/src/server/tests.ts`)
1. **Sufficiency Check**: Before creating an attempt, the server inspects all pools in all sections. If any pool has $M < K$, attempt start is aborted with an informative error:
   `"Unable to start assessment: Pool \"...\" has insufficient eligible questions (M available, K required). Please contact test administrator."`
2. **Deterministic Sampling**:
   - For each section, retrieves fixed questions ($N_{\text{fixed}}$) and pools ($P_1, P_2, \dots$).
   - For each pool, performs a Fisher-Yates shuffle of its eligible question pool and slices the first $K$ questions.
   - Merges section fixed questions with section sampled pool questions.
   - If `randomizeQuestions` is enabled, shuffles all questions within each section boundary (Phase 7B).
3. **Immutable Snapshot Creation**:
   - Each chosen question (whether fixed or pooled) is inserted into `attempt_questions`.
   - Snapshots `questionTextSnapshot`, `questionTypeSnapshot`, `marksSnapshot`, `optionsSnapshot`, and `correctAnswerSnapshot` (Phase 7C.1).
   - Records `poolId` for pooled questions.
4. **Resume Flow**:
   - `getAttemptExamState` reads strictly from `attempt_questions`.
   - Modifying, adding, or deleting questions in pools after an attempt is active has zero impact on active or submitted attempts.

---

### 6. Metric Aggregation & Test Details

- **`getPublishedTests`**:
  Calculates student-facing question count dynamically as:
  $$\text{questionCount} = \text{count}(\text{test\_questions}) + \sum \text{question\_pools.selection\_count}$$
- **`getTestDetails`**:
  Aggregates total section-by-section counts and subject tags across both fixed questions and all question pool candidate questions.

---

### 7. Duplicate Test Integration (`duplicateTest`)

When an administrator duplicates a test:
1. All sections are cloned with new IDs.
2. All fixed questions are duplicated into the new sections.
3. All `question_pools` are cloned into the corresponding duplicated sections with identical `selectionCount`, `title`, and `description`.
4. All `question_pool_questions` mappings are cloned into the new pools.
5. Duplicated tests default to `isPublished: false` (Draft) and include the `" — Copy"` suffix.
6. The calculated question count correctly reflects fixed questions + pool selection counts.

---

### 8. Verification & Audit Results

Running `npx tsx src/test/phase-7f-question-pools-audit.ts` verifies 9 dedicated test suites:

```text
==================================================
🏊 NEXORA — PHASE 7F: QUESTION POOLS AUDIT
==================================================

--- TEST SUITE 1: SCHEMA & NULLABLE BEHAVIOR ---
  ✓ PASS: questionPools table exists and queries successfully
  ✓ PASS: questionPoolQuestions table exists and queries successfully
  ✓ PASS: Attempt created with 1 question
  ✓ PASS: Fixed question in attemptQuestions has poolId === null

--- TEST SUITE 2: POOL SAMPLING & SIZING ---
  ✓ PASS: New attempt started
  ✓ PASS: Total attempt questions = 3 (1 fixed + 2 sampled from pool, got 3)
  ✓ PASS: Fixed question included with null poolId
  ✓ PASS: Exactly 2 questions sampled from the pool
  ✓ PASS: All sampled pool questions belong to the specified pool
  ✓ PASS: No duplicate questions sampled in the attempt

--- TEST SUITE 3: MULTIPLE STUDENTS RECEIVE INDEPENDENT SAMPLING ---
  ✓ PASS: Both student attempts have exactly 2 sampled questions
  ✓ PASS: Both attempts have valid poolId on all rows

--- TEST SUITE 4: SNAPSHOT IMMUTABILITY ---
  ✓ PASS: Initial attempt contains 2 sampled questions
  ✓ PASS: Resume returns existing attempt
  ✓ PASS: Historical attempt snapshot is strictly immutable; pool membership changes do not alter active attempt
  ✓ PASS: Exam state displays the exact immutable snapshotted questions

--- TEST SUITE 5: SUFFICIENCY VALIDATION ---
  ✓ PASS: startOrResumeAttempt threw error on insufficient pool
  ✓ PASS: Error message accurately identifies insufficiency

--- TEST SUITE 6: GETPUBLISHEDTESTS & GETTESTDETAILS METRICS ---
  ✓ PASS: Test with pools appears in getPublishedTests
  ✓ PASS: getPublishedTests questionCount reflects fixed + pool selectionCount (expected 4, got 4)
  ✓ PASS: getPublishedTests totalMarks reflects fixed + sampled pool marks (expected 8, got 8)
  ✓ PASS: getTestDetails returns test details
  ✓ PASS: getTestDetails questionCount is 4 (got 4)
  ✓ PASS: getTestDetails totalMarks is 8 (got 8)

--- TEST SUITE 7: DUPLICATE TEST COMPATIBILITY ---
  ✓ PASS: Test duplicated successfully
  ✓ PASS: Duplicated test title is formatted with Copy suffix
  ✓ PASS: Duplicated test reports correct questionCount (expected 3, got 3)
  ✓ PASS: Duplicated test has 1 section
  ✓ PASS: Duplicated test copied fixed question
  ✓ PASS: Duplicated test copied question pool
  ✓ PASS: Duplicated pool retains title and selectionCount
  ✓ PASS: Duplicated pool retains all 3 pool question memberships
  ✓ PASS: Duplicated test can be attempted and samples correctly (expected 3 questions, got 3)

--- TEST SUITE 8: GRADING & NEGATIVE MARKING INTEGRATION ---
  ✓ PASS: Grade rawScore computed accurately: expected 1.5, got 1.5
  ✓ PASS: Accuracy computed accurately: expected 50%, got 50%
  ✓ PASS: Attempt status updated to submitted
  ✓ PASS: calculateReadiness runs cleanly with pooled attempts

--- TEST SUITE 9: RANDOMIZATION INTERACTIONS (7B & 7C) ---
  ✓ PASS: Exam state returns all 3 questions under full randomization
  ✓ PASS: Options are populated on all pooled questions

--- CLEANUP ---
Cleanup completed.

==================================================
AUDIT RESULTS: 39 PASSED, 0 FAILED
==================================================
```

#### Regression Summary across Phase 7
| Phase | Feature | Audit Script | Results |
|---|---|---|---|
| **7A** | Negative Marking | `phase-7a-negative-marking-audit.ts` | **62 / 62 PASSED** |
| **7B** | Question Randomization | `phase-7b-question-randomization-audit.ts` | **41 / 41 PASSED** |
| **7C** | Option Randomization | `phase-7c-option-randomization-audit.ts` | **34 / 34 PASSED** |
| **7C.1**| Snapshot Immutability Hardening | `phase-7c1-question-snapshot-audit.ts` | **63 / 63 PASSED** |
| **7D** | Attempt Limits | `phase-7d-attempt-limits-audit.ts` | **66 / 66 PASSED** |
| **7E** | Test Instructions | `phase-7e-test-instructions-audit.ts` | **38 / 38 PASSED** |
| **7F** | Question Pools | `phase-7f-question-pools-audit.ts` | **39 / 39 PASSED** |
| **TOTAL**| **Phase 7 Assessment Engine** | **7 Suites** | **343 / 343 PASSED** |

---

### 9. Conclusion

Phase 7F completes the entire Phase 7 roadmap for Nexora. The assessment engine now delivers:
- Precise decimal negative marking (Phase 7A)
- Per-section question randomization (Phase 7B)
- Synthetic option-identity randomization (Phase 7C)
- Hardened immutable attempt snapshots (Phase 7C.1)
- Strict attempt allowances with race-condition prevention (Phase 7D)
- Rich plain-text instructions with client acknowledgement gating (Phase 7E)
- Dynamic question pool sampling with capacity guards (Phase 7F)

Nexora's assessment infrastructure is robust, fully audited, backwards compatible, and ready for production deployment.
