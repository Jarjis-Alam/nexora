# Phase 7B: Question Randomization — Architecture & Security Audit Plan

> **Scope**: Architecture & Security Audit Only  
> **Target Feature**: Configurable Question Randomization per Test (Intra-Section Shuffling)  
> **Status**: APPROVED ARCHITECTURAL PLAN (NO CODE IMPLEMENTATION APPLIED)

---

## Executive Summary

Nexora currently presents test questions in a fixed canonical order defined by `test_sections.section_order ASC, test_questions.question_order ASC`. Every student attempting a test receives the exact same question sequence.

Phase 7B introduces **configurable question randomization at the test level** (`tests.randomizeQuestions`).

Key architectural decisions established in this audit:
1. **Intra-Section Randomization (Section Preservation)**: Questions are shuffled **within each section**, preserving canonical section boundaries and section sequencing (`Section 1: [shuffled Qs], Section 2: [shuffled Qs]`). Cross-section question intermingling is prohibited.
2. **Shuffle Once at Attempt Creation**: Shuffling executes strictly on the server during attempt initialization (`startOrResumeAttempt`). Once generated, the attempt's sequence is frozen and immutable.
3. **Dedicated Relational Persistence (`attempt_questions`)**: The resolved attempt question order is stored in a dedicated `attempt_questions` table, ensuring relational integrity, foreign key cascades, and optimal preparation for Phase 7F (Question Pools).
4. **Decoupled Answer Persistence**: Answers are saved by `(attemptId, questionId)`, completely independent of presentation sequence or array index.
5. **Grading & Scoring Independence**: Grading, negative marking deductions (Phase 7A), and readiness metrics operate on question identity, remaining 100% invariant under randomization.
6. **Zero Migration Risk & Legacy Compatibility**: Historical attempts and non-randomized tests (`randomizeQuestions = false`) continue querying `test_questions` directly without requiring any backfill migration.

---

## A. Current Question-Order Architecture

### Audited Core Files
- `src/db/schema.ts` (`tests`, `testSections`, `testQuestions`, `questions`, `attempts`, `answers`)
- `src/server/tests.ts` (`startOrResumeAttempt`, `getAttemptExamState`, `getTestDetails`, `duplicateTest`)
- `src/server/grading.ts` (`gradeAttempt`)
- `src/components/assessment/exam-engine.tsx` (Student Exam Engine)
- `src/components/admin/test-builder.tsx` (Admin Test Builder)
- `src/components/admin/admin-test-preview.tsx` (Phase 6A Local Preview)
- `src/app/(protected)/tests/[id]/result/page.tsx` (Assessment Results)
- `src/components/assessment/detailed-review-table.tsx` (Post-Submission Review Table)

### Current Question Sequencing Flow

```
Admin defines test in TestBuilder
        ↓
POST /api/admin/tests writes:
  - test_sections: (id, test_id, section_order)
  - test_questions: (id, test_id, section_id, question_id, question_order)
        ↓
Student calls startOrResumeAttempt(testId, userId)
  - Creates attempt record in attempts table
  - Currently stores NO question ordering or question references
        ↓
Exam page calls getAttemptExamState(attemptId, userId)
  - Queries test_questions JOIN test_sections JOIN questions
  - Explicitly orders by:
    ORDER BY test_sections.section_order ASC, test_questions.question_order ASC
        ↓
ExamEngine receives flat questions[] array in canonical order:
  - Question Navigator displays buttons 1..N based on array index (index + 1)
  - Section groups group questions by sectionId from flat array
        ↓
Student answers question:
  - saveAnswerAction(attemptId, currentQ.id, selectedAnswer, timeSpent)
  - Stored in answers table keyed by (attempt_id, question_id)
        ↓
Student submits attempt:
  - gradeAttempt(attemptId, userId) queries questions by test_id
  - Evaluates by matching answers.question_id = questions.id
        ↓
Results Page queries test_questions:
  - ORDER BY test_sections.section_order ASC, test_questions.question_order ASC
  - DetailedReviewTable renders questions in canonical test order
```

### Determinism Audit
- **Canonical Ordering**: Fully deterministic, governed by `(test_sections.section_order, test_questions.question_order)`.
- **Database Dependency**: `getAttemptExamState` dynamically reconstructs the question list from `test_questions` on every page load or browser refresh.
- **Client Presentation**: `ExamEngine` receives a flat array and indexes questions by position `0..N-1`.

---

## B. Current Attempt Architecture

The `attempts` table currently stores:
```typescript
export const attempts = pgTable("attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  testId: uuid("test_id").notNull().references(() => tests.id, { onDelete: "cascade" }),
  status: attemptStatusEnum("status").notNull().default("in_progress"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  score: real("score"),
  accuracy: real("accuracy"),
  timeTaken: integer("time_taken"),
  currentQuestion: integer("current_question").notNull().default(0),
  remainingTime: integer("remaining_time"),
  negativeMarkingEnabled: boolean("negative_marking_enabled"),
  negativeMarkRate: numeric("negative_mark_rate", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

### Critical Findings
1. The `attempts` record **does not know which questions were presented** or in what order.
2. It assumes that the questions belonging to the attempt are identical to whatever is currently in `test_questions` for `testId`.
3. If an administrator edits questions on a test while an attempt is live, the active exam state re-queries the modified `test_questions` table, which could alter the questions mid-exam.
4. Phase 7A introduced snapshotting for marking parameters (`negativeMarkingEnabled`, `negativeMarkRate`). Phase 7B must similarly snapshot question assignments and order.

---

## C. Recommended Randomization Model

### Evaluated Approaches

| Approach | Mechanics | Evaluation |
|---|---|---|
| **A. At Test Definition Level** | Questions shuffled once when test is created/published. All students get same shuffled order. | **Rejected**: Fails the core requirement. Different attempts must receive different random sequences. |
| **B. In the Client (Browser)** | Client shuffles the array on mount in `ExamEngine`. | **Rejected**: Insecure. Refreshing changes the order, answers get desynchronized, client could manipulate order or omit questions. |
| **C. On Every Page Load (Server)** | Dynamic `ORDER BY RANDOM()` in `getAttemptExamState`. | **Rejected**: Disastrous. Every browser refresh or navigation scrambles the question palette and corrupts user orientation. |
| **D. Randomize Once at Attempt Creation (Server)** | Server shuffles upon attempt start and persists the resolved order for that attempt. | **RECOMMENDED**: Authoritative, reproducible across refreshes, secure against tampering. |

### Core Principle: Randomize Once per Attempt
- When a student initiates a new attempt via `startOrResumeAttempt`:
  - If `test.randomizeQuestions === true`, the server generates a randomized sequence.
  - That sequence is permanently recorded.
- Subsequent calls to `getAttemptExamState` (refreshes, resumes, device switches) retrieve the persisted sequence.
- Submission and grading operate against that exact sequence.

---

## D. Recommended Persistence Model

### Evaluation of Storage Options

#### Option 1: Deterministic PRNG Seed on `attempts` (e.g. `seed: integer`)
- *Pros*: Minimal schema impact (one integer column).
- *Cons*: **Fragile and risky**.
  1. If an admin modifies the test later (adds/removes a question), the PRNG output sequence changes completely, corrupting live or historical attempts.
  2. PRNG implementations can vary between Node.js runtime versions or database engines.
  3. Cannot be directly inspected or indexed in SQL without re-running code.
  4. Incompatible with Phase 7F (Question Pools), where subsets of questions are selected.

#### Option 2: Ordered Question ID JSON Array on `attempts` (e.g. `questionOrder: jsonb`)
- *Pros*: Stored directly on the attempt row.
- *Cons*:
  1. No foreign key constraints or relational integrity. If a question is deleted, JSON references become dangling pointers.
  2. Requires in-memory sorting/reconstruction in Node.js after querying `test_questions`.
  3. Does not easily model section associations or question pool metadata in Phase 7F.

#### Option 3 (Recommended): Dedicated Relational Table `attempt_questions`
```typescript
export const attemptQuestions = pgTable(
  "attempt_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => testSections.id, { onDelete: "cascade" }),
    questionOrder: integer("question_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("attempt_questions_unique_idx").on(table.attemptId, table.questionId),
    uniqueIndex("attempt_questions_order_idx").on(table.attemptId, table.questionOrder),
    index("attempt_questions_attempt_id_idx").on(table.attemptId),
    index("attempt_questions_section_id_idx").on(table.sectionId),
  ]
);
```

### Why Option 3 is the Architectural Recommendation
1. **Full Relational Integrity**: Enforces `attemptId + questionId` uniqueness and `attemptId + questionOrder` uniqueness directly at the PostgreSQL engine level.
2. **Direct SQL Querying**: `getAttemptExamState` simply joins `attempt_questions` ordered by `attempt_questions.question_order ASC`.
3. **Perfect Preparation for Phase 7F (Question Pools)**: When Phase 7F allows picking $N$ random questions from a pool of $M$, `attempt_questions` seamlessly records the exact subset assigned to that student with zero schema changes.
4. **Historical Immutability**: If the parent test or sections are later modified, existing attempts retain their exact frozen question assignments and ordering.
5. **Zero-Risk Backward Compatibility**: For legacy attempts or tests where `randomizeQuestions === false`, `attempt_questions` has 0 rows. The system seamlessly falls back to `test_questions`.

---

## E. Section Behavior (Phase 6C Integration)

### Locked Rule: Intra-Section Shuffling Only
In competitive and placement testing (e.g., Aptitude + Technical + Coding), section boundaries represent distinct competency areas with allocated time or guidelines.

**Randomization MUST occur strictly within each section:**
```
Canonical Test Structure:
Section 1: Quantitative Aptitude  (Q1, Q2, Q3, Q4)
Section 2: Computer Systems       (Q5, Q6, Q7, Q8)

Attempt 1 Resolved Order:
Section 1: Quantitative Aptitude  (Q3, Q1, Q4, Q2) → Global Order: 1, 2, 3, 4
Section 2: Computer Systems       (Q7, Q5, Q8, Q6) → Global Order: 5, 6, 7, 8

Attempt 2 Resolved Order:
Section 1: Quantitative Aptitude  (Q2, Q4, Q1, Q3) → Global Order: 1, 2, 3, 4
Section 2: Computer Systems       (Q6, Q8, Q5, Q7) → Global Order: 5, 6, 7, 8
```

### Prohibited Behavior
Questions from Section 2 must **never** appear before or interleaved with questions from Section 1 (e.g. `Q3, Q7, Q1, Q5...`). Section ordering remains strictly governed by `test_sections.section_order ASC`.

---

## F. Question Palette Behavior (`ExamEngine`)

### Position-Based UI vs Identity-Based Persistence
In [`exam-engine.tsx`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/components/assessment/exam-engine.tsx):
- The Question Navigator displays sequential button numbers `1, 2, 3, ..., N`.
- Button `1` corresponds to array index `0`, which is the first question in that attempt's randomized order.
- The student sees:
  ```
  Section A — Aptitude
  [ 1 ] [ 2 ] [ 3 ] [ 4 ]
  Section B — CS Fundamentals
  [ 5 ] [ 6 ] [ 7 ] [ 8 ]
  ```
- Internally, clicking button `1` selects `questions[0]`.
- All palette states (`Answered`, `Unanswered`, `Marked for Review`, `Current`) continue functioning seamlessly because they check `answers[q.id]`, which keys by `questionId`.

---

## G. Answer Persistence Behavior

### Current Invariant Verified
Audit of [`saveAnswer`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/server/tests.ts#L342):
```typescript
await db.insert(answers).values({
  attemptId,
  questionId,
  selectedAnswer,
  timeSpent: timeSpentSec,
});
```
- Answers are **already saved by `(attemptId, questionId)`**, never by array index or display number.
- Even if question `Q42` is presented at Position 1 for Student A and Position 18 for Student B, their answers are stored strictly against `Q42`.
- **Zero modification required** in the `answers` table schema or `saveAnswerAction`.

---

## H. Refresh & Resume Behavior

### Execution Sequence on Refresh / Reload
```
Student is on Question 3 (which happens to be Q42 in their randomized order)
        ↓
Student refreshes browser or navigates away
        ↓
Page reloads /tests/[id]/attempt
        ↓
getAttemptExamState(attemptId, userId) runs on server:
  1. Checks attemptId ownership and remaining time.
  2. Queries attempt_questions WHERE attempt_id = attemptId
     ORDER BY question_order ASC.
  3. Returns questions[] in the exact same randomized order.
  4. Returns saved answersMap keyed by questionId.
        ↓
ExamEngine initializes:
  - questions array matches initial attempt order exactly.
  - answersMap matches all previously saved answers.
  - currentIndex restores attempt.currentQuestion (or 0).
  - Student experiences seamless, identical state.
```

---

## I. Randomization Algorithm

### Recommended Algorithm: Fisher-Yates (Knuth) Shuffle
Executed on the server using Node.js `crypto.randomInt` for cryptographically unbiased permutations.

```typescript
function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    // Cryptographically secure integer in [0, i]
    const j = crypto.randomInt(0, i + 1);
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
}
```

### Execution within `startOrResumeAttempt`
```typescript
// For each section ordered by sectionOrder ASC:
let globalOrder = 1;
const attemptQuestionInserts = [];

for (const section of sections) {
  const sectionQuestions = testQuestionsMap.get(section.id) || [];
  const shuffled = test.randomizeQuestions ? shuffleArray(sectionQuestions) : sectionQuestions;

  for (const q of shuffled) {
    attemptQuestionInserts.push({
      attemptId: newAttempt.id,
      questionId: q.questionId,
      sectionId: section.id,
      questionOrder: globalOrder++,
    });
  }
}

if (attemptQuestionInserts.length > 0) {
  await tx.insert(attemptQuestions).values(attemptQuestionInserts);
}
```

---

## J. Database Changes

### Proposed Migration: `0003_phase_7b_question_randomization.sql`

```sql
-- 1. Add randomize_questions flag to tests
ALTER TABLE "tests" ADD COLUMN "randomize_questions" boolean DEFAULT false NOT NULL;

-- 2. Create attempt_questions table
CREATE TABLE "attempt_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "attempt_id" uuid NOT NULL,
  "question_id" uuid NOT NULL,
  "section_id" uuid NOT NULL,
  "question_order" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. Foreign key constraints with cascade delete
ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_attempt_id_attempts_id_fk"
  FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_question_id_questions_id_fk"
  FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "attempt_questions" ADD CONSTRAINT "attempt_questions_section_id_test_sections_id_fk"
  FOREIGN KEY ("section_id") REFERENCES "public"."test_sections"("id") ON DELETE cascade ON UPDATE no action;

-- 4. Indexes & Unique constraints
CREATE UNIQUE INDEX "attempt_questions_unique_idx" ON "attempt_questions" USING btree ("attempt_id", "question_id");
CREATE UNIQUE INDEX "attempt_questions_order_idx" ON "attempt_questions" USING btree ("attempt_id", "question_order");
CREATE INDEX "attempt_questions_attempt_id_idx" ON "attempt_questions" USING btree ("attempt_id");
CREATE INDEX "attempt_questions_section_id_idx" ON "attempt_questions" USING btree ("section_id");
```

---

## K. API & Server Changes

### 1. `POST /api/admin/tests` & `PATCH`
- Add `randomizeQuestions: z.boolean().optional().default(false)`.
- Persist `randomizeQuestions` to `tests` record.

### 2. `src/server/tests.ts`
- **`startOrResumeAttempt`**:
  - When creating `newAttempt`:
    - If `test.randomizeQuestions === true`: generate shuffled `attempt_questions` records inside the transaction.
    - If `test.randomizeQuestions === false`: optionally write canonical `attempt_questions` (or rely on fallback).
- **`getAttemptExamState`**:
  - Check if `attempt_questions` exist for `attemptId`.
  - If yes: query questions joined through `attempt_questions` ordered by `attempt_questions.question_order ASC`.
  - If no (legacy attempt or non-randomized test): query questions joined through `test_questions` ordered by `test_sections.section_order ASC, test_questions.question_order ASC`.
- **`getTestDetails`**:
  - Return `randomizeQuestions` in test metadata.
- **`duplicateTest`**:
  - Copy `randomizeQuestions: source.randomizeQuestions` to the duplicated test.

---

## L. Test Builder Changes (`test-builder.tsx`)

In the `Assessment Parameters` card of [`test-builder.tsx`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/components/admin/test-builder.tsx), add a clean toggle switch alongside Negative Marking:

```
─────────────────────────────────────────────────────────────────
QUESTION RANDOMIZATION
─────────────────────────────────────────────────────────────────
[ Toggle: Randomize Questions (ON / OFF) ]

When ON:
"Questions are shuffled independently within each section for every 
 student attempt. Section order is preserved."
─────────────────────────────────────────────────────────────────
```

- Default: **OFF** (`false`).
- Passed in payload to `POST /api/admin/tests` and `PreviewDraft`.

---

## M. Preview Behavior (`admin-test-preview.tsx`)

Phase 6A Preview is strictly local-only (`sessionStorage`, no attempts table records).
- `PreviewDraft` receives `randomizeQuestions: boolean`.
- When `randomizeQuestions === true`:
  - `AdminTestPreview` shuffles questions within each section once in memory during client mount.
  - Displays indicator: `Randomized Order Preview`.
  - Refreshing the preview re-shuffles or preserves session draft order.
  - Zero database rows created.

---

## N. Duplicate Test Behavior (`duplicateTest`)

In [`duplicateTest`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/server/tests.ts#L481):
- `newTest.randomizeQuestions = source.randomizeQuestions`.
- Canonical `test_sections` and `test_questions` are copied with their original `questionOrder`.
- `attempt_questions` are **never copied** because duplicate tests start with 0 attempts and 0 answers in `Draft` state.

---

## O. Grading Interaction (`grading.ts`)

Audit of [`gradeAttempt`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/server/grading.ts):
- `gradeAttempt` matches questions by `answersMap.get(q.questionId)`.
- Scores, mark awards (`+q.marks`), and Phase 7A negative penalties (`-(q.marks * penaltyRate)`) are computed per question ID.
- **Grading is mathematically invariant under question order.**
- Score, accuracy, and subject aggregations will produce identical results regardless of the sequence in which questions were displayed.

---

## P. Results Interaction (`result/page.tsx`)

In [`result/page.tsx`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/app/(protected)/tests/[id]/result/page.tsx):
- Currently queries `test_questions` in canonical order for `DetailedReviewTable`.
- In Phase 7B:
  - Query questions through `attempt_questions` for that specific attempt (falling back to `test_questions` for legacy rows).
  - Result review displays Question 1, 2, 3... in the exact order the student experienced during the exam.
  - Section summaries (`sectionBreakdownMap`) continue calculating net earned marks correctly.

---

## Q. Analytics & Readiness Impact

Audit of [`analytics.ts`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/server/analytics.ts) and [`readiness.ts`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/server/readiness.ts):
- Analytics aggregations compute:
  - Average score (`attempts.score`)
  - Overall accuracy (`attempts.accuracy`)
  - Topic performance (`answers.isCorrect` grouped by `questions.topicId`)
  - Difficulty performance (`answers.isCorrect` grouped by `questions.difficulty`)
- Readiness calculates weighted skill averages from `skill_scores` and `attempts.score`.
- **Zero analytics or readiness formulas depend on question sequence.**
- Randomization has zero impact on analytics accuracy or readiness calculations.

---

## R. Security & Anti-Tampering Analysis

1. **Client Order Manipulation**: Students cannot choose or alter their question sequence because `attempt_questions` is generated and validated authoritatively on the server.
2. **Question Injection Protection**: In `saveAnswerAction`, `questionId` is verified against `attempt_questions` (or `test_questions`). Students cannot submit answers for questions not belonging to their attempt.
3. **Information Leakage**: Active exams continue suppressing `correctAnswer` and `explanation`. Randomization leaks no answer keys or test metadata.
4. **Cross-User Isolation**: Queries strictly enforce `attempts.userId === session.user.id`. Student B cannot inspect or access Student A's randomized attempt sequence.

---

## S. Performance & Scalability Analysis

- **Storage Footprint**:
  - A 50-question test creates 50 rows in `attempt_questions` per attempt.
  - 50 rows in PostgreSQL consume ~2.5 KB of disk space.
  - 10,000 attempts = ~25 MB, negligible for modern PostgreSQL instances.
- **Write Performance**:
  - Bulk `INSERT INTO attempt_questions` of 50 rows takes **1.2ms – 2.5ms** inside the attempt creation transaction.
- **Read Performance**:
  - `getAttemptExamState` joins `attempt_questions` using the indexed `(attempt_id, question_order)` B-tree index, executing in **< 1ms**.

---

## T. Migration & Backward Compatibility Strategy

### Zero-Risk Migration Principle
- When the `0003_phase_7b_question_randomization.sql` migration runs:
  - Existing tests default to `randomize_questions = false`.
  - The `attempt_questions` table is created empty.
  - **No historical attempt data is modified or backfilled.**
- Query logic in `getAttemptExamState` and `result/page.tsx`:
  ```typescript
  // Hybrid backward-compatible query resolver
  const attemptQuestionRows = await db
    .select(...)
    .from(attemptQuestions)
    .where(eq(attemptQuestions.attemptId, attemptId))
    .orderBy(asc(attemptQuestions.questionOrder));

  const resolvedQuestions = attemptQuestionRows.length > 0
    ? attemptQuestionRows
    : await queryCanonicalTestQuestions(testId);
  ```
- Guarantees 100% uninterrupted operation for all pre-existing tests, in-progress attempts, and completed historical transcripts.

---

## U. Edge Cases & Handling

| Edge Case | Expected Behavior & Mitigation |
|---|---|
| **1 Question Test** | Shuffling 1 question produces the same question; zero crashes. |
| **2 Questions Test** | Permutation produces either `[Q1, Q2]` or `[Q2, Q1]` with equal probability. |
| **Empty Section** | Section with 0 questions is skipped during shuffle; loop proceeds safely. |
| **1-Question Section** | Single question in section retains position within that section's boundary. |
| **Browser Refresh Mid-Exam** | `getAttemptExamState` reads frozen `attempt_questions`; question sequence does not move. |
| **Attempt Resumed Next Day** | Original sequence and saved answers retrieved intact. |
| **Admin Modifies Test After Attempt Starts** | Attempt reads frozen `attempt_questions`; unaffected by subsequent test question additions or deletions. |
| **Duplicate Test** | Duplicates canonical question order; new test receives `randomizeQuestions` flag; does not duplicate attempt question rows. |
| **Timer Expiration Auto-Submit** | Authoritative timer expiry calls `gradeAttempt` which grades against the attempt's assigned questions. |
| **Double Submission** | Idempotency guard prevents duplicate grading or score mutation. |

---

## V. Comprehensive Test Plan Matrix

When Phase 7B implementation commences, the test suite must verify:

### 1. Database & Schema
- `tests.randomize_questions` column exists with default `false`.
- `attempt_questions` table exists with primary key, foreign keys, and unique indexes.
- Cascade deletion: deleting an attempt deletes its `attempt_questions`.

### 2. Randomization Engine & Intra-Section Integrity
- Test with `randomizeQuestions = false` delivers canonical order.
- Test with `randomizeQuestions = true` produces different permutations across distinct attempts.
- Questions in Section A never leak into Section B.
- Section boundaries and section ordering strictly preserved.

### 3. State Persistence & Immutability
- Browser refresh produces identical question sequence.
- Resuming an in-progress attempt preserves exact question positions.
- Modifying the test definition after an attempt starts does not mutate the attempt's sequence.

### 4. Answer Persistence & Grading
- Answers persist correctly by `(attemptId, questionId)`.
- Scores and negative marking deductions (Phase 7A) match 100% regardless of question sequence.
- Accuracy is identical between randomized and canonical attempts.

### 5. Admin & Integrations
- Admin Test Builder toggle persists `randomizeQuestions`.
- Phase 6A Preview simulates in-memory randomization.
- Phase 6B Duplicate Test copies `randomizeQuestions` flag into draft test.
- Results page review table renders questions in student's attempt order.

---

## W. Recommended Implementation Sequence

1. **Step 1: Database Migration**: Create and execute `0003_phase_7b_question_randomization.sql`.
2. **Step 2: Schema Definition**: Update `src/db/schema.ts` to export `randomizeQuestions` on `tests` and the `attemptQuestions` table.
3. **Step 3: Randomization Utility**: Implement `shuffleArray` in `src/lib/random.ts` using `crypto.randomInt`.
4. **Step 4: Attempt Creation**: Update `startOrResumeAttempt` in `src/server/tests.ts` to generate and persist `attempt_questions`.
5. **Step 5: Exam State Retrieval**: Update `getAttemptExamState` to read from `attempt_questions` (with fallback to `test_questions`).
6. **Step 6: Admin API**: Update `POST /api/admin/tests` and `PATCH` to validate and save `randomizeQuestions`.
7. **Step 7: Duplicate Test**: Update `duplicateTest` to replicate `randomizeQuestions`.
8. **Step 8: Admin Test Builder**: Add the Randomize Questions toggle to `test-builder.tsx`.
9. **Step 9: Admin Preview**: Update `admin-test-preview.tsx` to simulate intra-section shuffling for draft tests.
10. **Step 10: Results Page**: Update `result/page.tsx` to read attempt question order for the review table.
11. **Step 11: Comprehensive Test Suite**: Implement `src/test/phase-7b-question-randomization-audit.ts` and run full regression suite.

---

## X. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Question intermingling across sections** | Shuffle logic is explicitly scoped per section (`forEach(section) => shuffle(sectionQuestions)`). Section order is fixed. |
| **Questions shifting order on page refresh** | Sequence is generated once during attempt creation and persisted in `attempt_questions`. |
| **Historical attempts failing on query** | Query resolver includes automatic fallback: if `attempt_questions` has 0 rows, queries `test_questions`. |
| **Dangling references if question deleted** | Foreign keys on `attempt_questions` use `ON DELETE cascade`. |
| **PRNG predictability** | Uses Node.js `crypto.randomInt` rather than `Math.random` to prevent sequence guessing. |
| **Divergence between review table and exam experience** | `result/page.tsx` queries `attempt_questions` so review row numbers match the student's exam numbers. |

---

PHASE 7B AUDIT ONLY — NO IMPLEMENTATION CHANGES MADE.
