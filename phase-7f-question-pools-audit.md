# NEXORA — PHASE 7F ARCHITECTURAL AUDIT & IMPLEMENTATION SPECIFICATION
## Dynamic Question Pools System

---

> **NEXORA ASSESSMENT PLATFORM**  
> *“Your Operating System for Placements”*  
> **Phase**: 7F — Question Pools (Final Sub-Phase of Phase 7: Advanced Test Configuration)  
> **Document Status**: AUDIT COMPLETE — SPECIFICATION FINALIZED  
> **Evaluation Mode**: STRICT AUDIT ONLY — ZERO SOURCE CODE MODIFICATIONS  

---

## 1. Executive Summary

Phase 7F represents the final planned milestone of the Phase 7 assessment engine enhancements in Nexora. Prior sub-phases established negative marking (7A), section-aware question shuffling (7B), option shuffling with stable synthetic identifiers (7C), immutable attempt snapshots for question text, type, marks, options, and answer keys (7C.1), transactional per-student attempt limits with PostgreSQL advisory locking (7D), and pre-start test instructions (7E).

The objective of **Phase 7F (Question Pools)** is to introduce dynamic question pooling into this ecosystem: allowing assessment creators to define pools of eligible questions within test sections from which a configured number of questions (`selection_count`) is cryptographically sampled at attempt inception. Once sampled, selected questions are frozen into `attempt_questions` alongside any fixed questions, acquiring all Phase 7C/7C.1 immutability snapshots and behaving identically to fixed questions throughout testing, grading, analytics, and historical reviews.

This audit report delivers an exhaustive architectural assessment of the existing codebase (`frontend/src/db/schema.ts`, `frontend/src/server/tests.ts`, `frontend/src/server/grading.ts`, `frontend/src/app/api/admin/tests/route.ts`, `frontend/src/components/admin/test-builder.tsx`, etc.) and specifies the complete data model, selection algorithm, builder UX, duplication semantics, concurrency model, and migration strategy for Phase 7F.

---

## 2. Current Architecture Findings

Nexora is structured as a full-stack Next.js application utilizing TypeScript, PostgreSQL, Drizzle ORM, Auth.js v5 credentials, and Zod validation. The inspection revealed key architectural characteristics directly governing Question Pools:

1. **Section Hierarchy**: Assessments are organized hierarchically: `tests` $\rightarrow$ `test_sections` $\rightarrow$ `test_questions`. Sections partition questions and enforce independent scoring and navigation.
2. **Attempt Question Resolution**: At attempt start (`startOrResumeAttempt`), the server compiles questions for the test into `attempt_questions`. `attempt_questions` acts as the single source of truth for the exam lifecycle.
3. **Phase 7C.1 Snapshot Isolation**: `attempt_questions` persists 5 immutable snapshot columns: `question_text_snapshot`, `question_type_snapshot`, `marks_snapshot`, `options_snapshot`, `correct_answer_snapshot`. Active exams (`getAttemptExamState`), grading (`gradeAttempt`), and results review (`/tests/[id]/result`) read these snapshots rather than live question rows.
4. **Scoring Authoritativeness**: `gradeAttempt` dynamically aggregates `totalPossibleScore` by summing `marksSnapshot` from `attempt_questions` rows belonging to that specific attempt. It does not divide by `tests.totalMarks`.
5. **Phase 7D Concurrency Barrier**: `startOrResumeAttempt` executes inside a serializing PostgreSQL advisory lock (`pg_advisory_xact_lock(hashtext(userId || ':' || testId))`). Active attempts are resumed before any limit check; newly created attempts write `attempts` and `attempt_questions` atomically.
6. **Hard Database Uniqueness**: `attempt_questions` enforces `uniqueIndex("attempt_questions_unique_idx").on(table.attemptId, table.questionId)`. A question cannot appear more than once in a single attempt without throwing a unique constraint violation.
7. **Display Aggregations**: `getPublishedTests` and `getTestDetails` currently derive test question counts and subjects by querying `test_questions`.

---

## 3. Existing Test / Question Relationship

### Current State
```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│      tests      │◀─────┐│  test_sections  │◀─────┐│ test_questions  │
│  (Test Policy)  │      ││  (part 1, 2..)  │      ││  (Join Table)   │
└─────────────────┘      │└─────────────────┘      │└─────────────────┘
                         │                         │         │
                         └─────────────────────────┴─────────┼──────────┐
                                                             ▼          │
                                                    ┌─────────────────┐ │
                                                    │    questions    │◀┘
                                                    │ (Question Bank) │
                                                    └─────────────────┘
```

- Canonical questions reside in the `questions` table. They have no concept of `is_deleted`, `is_published`, or `is_archived`.
- A test directly assigns questions via the `test_questions` table, which pairs `(test_id, section_id, question_id, question_order)`.
- There is a unique constraint: `uniqueIndex("test_questions_unique_idx").on(table.testId, table.questionId)`. A canonical question can only be assigned once per test.
- Every assigned question is guaranteed to appear in every student's attempt.

---

## 4. Existing Section Architecture

### Current State
- `test_sections` has `id`, `test_id`, `title`, `description`, `section_order`, `created_at`, `updated_at`.
- Sections are ordered via `uniqueIndex("test_sections_test_order_idx").on(table.testId, table.sectionOrder)`.
- In `startOrResumeAttempt`, questions are grouped by `sectionId`. Shuffling via `randomizeQuestions` operates **within** each section (`shuffleArray(secQs)`), strictly preserving section boundaries.
- In `result/page.tsx`, section performance is calculated by grouping `reviewQuestions` by `sectionId`, summing earned marks and total marks from `marksSnapshot`.

---

## 5. Existing Attempt Architecture

### Current State
- `attempts` stores attempt status (`in_progress`, `submitted`, `expired`), timestamps, scores, and snapshot policies (`negative_marking_enabled`, `negative_mark_rate`).
- `attempt_questions` stores the resolved sequence of questions for the attempt:
  - `attempt_id`, `question_id`, `section_id`, `question_order`
  - `option_order`: array of synthetic option IDs (e.g. `["opt_2", "opt_0", "opt_1", "opt_3"]`)
  - `question_text_snapshot`: text
  - `question_type_snapshot`: enum (`single_choice`, `multiple_choice`)
  - `marks_snapshot`: integer
  - `options_snapshot`: raw string array
  - `correct_answer_snapshot`: raw string or string array
- Constraints on `attempt_questions`:
  - `attempt_questions_unique_idx`: `(attempt_id, question_id)` UNIQUE
  - `attempt_questions_order_idx`: `(attempt_id, question_order)` UNIQUE
- Answers are stored in `answers` with unique constraint `(attempt_id, question_id)`.

---

## 6. Existing Randomization Architecture

### Current State
Nexora implements two independent, cryptographically secure randomization toggles:
1. `tests.randomizeQuestions`:
   - Utilizes `shuffleArray<T>` in `frontend/src/lib/random.ts`.
   - Uses Node.js `crypto.randomInt(0, i + 1)` (unbiased Fisher-Yates shuffle).
   - Operates section-by-section. Section Part 1 questions are never mixed into Section Part 2.
2. `tests.randomizeOptions`:
   - Assigns stable synthetic identities `opt_0`, `opt_1`, etc. based on canonical options index.
   - Per question, shuffles synthetic IDs with `shuffleArray`.
   - `saveAnswer` validates that submitted answers reference valid synthetic IDs.
   - `gradeAttempt` maps synthetic IDs back to canonical indices or compares canonical option strings.

---

## 7. Existing Snapshot Architecture (Phase 7C.1)

### Current State
1. At start (`startOrResumeAttempt`), every assigned question is read from `questions` and written into `attempt_questions` with all 5 snapshots populated.
2. Active exam (`getAttemptExamState`):
   - Reads exclusively from `attempt_questions`.
   - Security rule: `correctAnswerSnapshot` and `explanation` are omitted from the student payload.
3. Grading (`gradeAttempt`):
   - Reads `marksSnapshot` and `questionTypeSnapshot`.
   - Computes `totalPossibleScore = sum(marksSnapshot)`.
   - Computes earned marks and negative penalties based on `marksSnapshot`.
4. Result Review (`result/page.tsx`):
   - Displays snapshot question text, options, marks, and student answers.
   - Section breakdown derives `totalMarks` and `earnedMarks` from snapshots.

---

## 8. Proposed Question Pool Model

### Architectural Decisions

| Decision Area | Proposed Architecture | Rationale |
|---|---|---|
| **Ownership** | Pools belong to a specific `test` and `section` | Aligns with Nexora's section-driven test hierarchy; ensures clean cascading deletion and duplication. |
| **Membership Structure** | Separate join table `question_pool_questions` | Many-to-many relationship between pools and canonical questions; allows a question to be pooled across different tests while preventing duplicates within a single test. |
| **Fixed + Pools Coexistence** | **Option B: Coexistence** (A section may contain fixed questions AND pools) | Maximum pedagogical flexibility. Allows baseline required questions + topic-specific sampled pools. Fully backward compatible. |
| **Selection Count** | `selection_count integer NOT NULL CHECK (selection_count >= 1)` | Non-nullable. A pool must explicitly define how many questions to draw. |
| **Pool Ordering** | `pool_order integer NOT NULL DEFAULT 1` | Guarantees deterministic ordering when `randomizeQuestions` is disabled. |
| **Reusability** | Canonical questions in `questions` are reused; pool definitions are test-scoped | Avoids complex global pool governance; duplication handles copying pools across tests. |

---

## 9. Exact Schema Proposal

### 1. Table: `question_pools`
Defines a question pool assigned to a specific section within a test.

```sql
CREATE TABLE IF NOT EXISTS "question_pools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "test_id" uuid NOT NULL REFERENCES "tests"("id") ON DELETE CASCADE,
  "section_id" uuid NOT NULL REFERENCES "test_sections"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "description" text,
  "selection_count" integer NOT NULL,
  "pool_order" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "question_pools_selection_count_check" CHECK ("selection_count" >= 1)
);

CREATE INDEX IF NOT EXISTS "question_pools_test_id_idx" ON "question_pools" ("test_id");
CREATE INDEX IF NOT EXISTS "question_pools_section_id_idx" ON "question_pools" ("section_id");
CREATE UNIQUE INDEX IF NOT EXISTS "question_pools_section_pool_order_idx" ON "question_pools" ("section_id", "pool_order");
```

### 2. Table: `question_pool_questions`
Join table establishing membership of canonical questions in a pool.

```sql
CREATE TABLE IF NOT EXISTS "question_pool_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pool_id" uuid NOT NULL REFERENCES "question_pools"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
  "question_order" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "question_pool_questions_unique_idx" UNIQUE ("pool_id", "question_id")
);

CREATE INDEX IF NOT EXISTS "question_pool_questions_pool_id_idx" ON "question_pool_questions" ("pool_id");
CREATE INDEX IF NOT EXISTS "question_pool_questions_question_id_idx" ON "question_pool_questions" ("question_id");
```

### 3. Optional Audit Column: `attempt_questions.pool_id`
```sql
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "pool_id" uuid REFERENCES "question_pools"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "attempt_questions_pool_id_idx" ON "attempt_questions" ("pool_id");
```
*Note: This column is strictly for administrative auditability/traceability. Grading, snapshots, and exam rendering NEVER depend on `pool_id`.*

### Drizzle ORM Schema (`schema.ts`)
```ts
// === Question Pools ===
export const questionPools = pgTable(
  "question_pools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => testSections.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    selectionCount: integer("selection_count").notNull(),
    poolOrder: integer("pool_order").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("question_pools_test_id_idx").on(table.testId),
    index("question_pools_section_id_idx").on(table.sectionId),
    uniqueIndex("question_pools_section_pool_order_idx").on(table.sectionId, table.poolOrder),
  ]
);

// === Question Pool Questions (Membership) ===
export const questionPoolQuestions = pgTable(
  "question_pool_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => questionPools.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    questionOrder: integer("question_order").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("question_pool_questions_unique_idx").on(table.poolId, table.questionId),
    index("question_pool_questions_pool_id_idx").on(table.poolId),
    index("question_pool_questions_question_id_idx").on(table.questionId),
  ]
);
```

---

## 10. Selection Algorithm

### Requirements & Cryptographic Guarantee
- Selection must happen **server-side only** at the exact moment a new attempt is inserted in `startOrResumeAttempt`.
- Sampling without replacement is performed using `shuffleArray<T>` from `frontend/src/lib/random.ts` (powered by Node.js `crypto.randomInt`).
- `Math.random()` is strictly prohibited.

### Algorithm Steps (Inside the Advisory-Locked Transaction)
For a given test start request:
1. Resumable attempt check $\rightarrow$ If active, return immediately (zero pool sampling).
2. Attempt limit check $\rightarrow$ If submitted count $\ge$ `attemptLimit`, throw error (zero pool sampling).
3. Insert `attempts` row $\rightarrow$ generates `attemptId`.
4. Initialize global tracking set: `const selectedQuestionIds = new Set<string>();`
5. Fetch all `testSections` for `testId` ordered by `sectionOrder ASC`.
6. For each section `sec`:
   - **Step A: Fixed Questions**:
     Query `testQuestions` inner joined with `questions` where `testId = test.id` and `sectionId = sec.id` ordered by `questionOrder ASC`.
     For each fixed question:
     - Verify `!selectedQuestionIds.has(q.questionId)`.
     - Add `q.questionId` to `selectedQuestionIds`.
     - Store in `sectionCandidates` array.
   - **Step B: Pool Questions**:
     Query `question_pools` for this section ordered by `poolOrder ASC`.
     For each pool `p`:
     - Query eligible pool questions from `question_pool_questions` inner joined with `questions` where `poolId = p.id` ordered by `questionOrder ASC`.
     - Filter out any question already in `selectedQuestionIds` (defense-in-depth against overlap):
       `const available = eligibleQuestions.filter(q => !selectedQuestionIds.has(q.questionId));`
     - Validate sufficiency:
       `if (available.length < p.selectionCount) throw new Error("Insufficient questions in pool...");`
     - Cryptographically sample $K$ questions ($K = \text{p.selectionCount}$):
       `const sampled = shuffleArray(available).slice(0, p.selectionCount);`
     - If `test.randomizeQuestions` is FALSE:
       Sort `sampled` by their canonical `questionOrder` in the pool to guarantee deterministic ordering.
     - For each sampled question:
       - Add to `selectedQuestionIds`.
       - Tag with `poolId: p.id`.
       - Append to `sectionCandidates`.
   - **Step C: Section Randomization**:
     - If `test.randomizeQuestions` is TRUE:
       `finalSectionQuestions = shuffleArray(sectionCandidates);`
     - If `test.randomizeQuestions` is FALSE:
       `finalSectionQuestions = sectionCandidates;` (Preserves: Fixed questions in order, then Pool 1 sampled in order, then Pool 2 sampled in order).
   - **Step D: Snapshotting & Staging**:
     For each question in `finalSectionQuestions`:
     - Calculate `optionOrder`:
       If `test.randomizeOptions && options.length > 1`: `shuffleArray(canonicalOptionIds)`, else `canonicalOptionIds`.
     - Stage row for `attempt_questions`:
       ```ts
       attemptQuestionRows.push({
         attemptId: att.id,
         questionId: q.questionId,
         sectionId: sec.id,
         poolId: q.poolId ?? null,
         questionOrder: globalOrder++,
         optionOrder,
         questionTextSnapshot: q.question,
         questionTypeSnapshot: q.questionType,
         marksSnapshot: q.marks,
         optionsSnapshot: rawOptions,
         correctAnswerSnapshot: q.correctAnswer,
       });
       ```
7. Batch insert `attemptQuestionRows` into `attempt_questions`.
8. Commit transaction and release advisory lock.

---

## 11. Randomization Interaction

### Deterministic Rule Definition
Nexora establishes one unambiguous rule: **Section boundaries are inviolable; within each section, question selection precedes ordering.**

```
Section Resolution Flow:
┌────────────────────────────────────────────────────────┐
│ SECTION A                                              │
│                                                        │
│  [Fixed Questions]            [Pool 1]       [Pool 2]  │
│      (Q1, Q2)                (Sample 5)     (Sample 5) │
│         │                         │              │     │
│         └──────────────┬──────────┴──────────────┘     │
│                        ▼                               │
│              Combined 12 Questions                     │
│                        │                               │
│         ┌──────────────┴──────────────┐                │
│         │                             │                │
│  randomizeQuestions: FALSE    randomizeQuestions: TRUE │
│         │                             │                │
│         ▼                             ▼                │
│  Order: Fixed 1-2,             crypto Fisher-Yates     │
│         Pool 1 (1-5),          shuffle across all      │
│         Pool 2 (1-5)           12 questions in Section │
│         │                             │                │
│         └──────────────┬──────────────┘                │
│                        ▼                               │
│  For each question: if randomizeOptions: TRUE          │
│    $\rightarrow$ Shuffle option IDs independently     │
│                        │                               │
│                        ▼                               │
│  Persist to attempt_questions with globalOrder 1..12   │
└────────────────────────────────────────────────────────┘
```

### Matrix of All Combinations

| Combination | Fixed Questions | Pool Questions | randomizeQuestions | randomizeOptions | Final Behavior |
|---|---|---|---|---|---|
| **A** | Yes | No | OFF | OFF | Canonical fixed order, canonical option order. (Baseline) |
| **B** | Yes | No | ON | OFF | Shuffled fixed questions per section, canonical options. |
| **C** | No | Yes | OFF | OFF | Selected pool questions appear in pool order; canonical options. |
| **D** | No | Yes | ON | OFF | Selected pool questions shuffled within section; canonical options. |
| **E** | No | Yes | OFF | ON | Selected pool questions in pool order; shuffled options per question. |
| **F** | No | Yes | ON | ON | Selected pool questions shuffled; shuffled options per question. |
| **G** | No | Multiple Pools | OFF | OFF | Pool 1 selected questions, then Pool 2 selected questions; canonical options. |
| **H** | Yes | Multiple Pools | ON | ON | Fixed + Pool 1 + Pool 2 all shuffled together in section; options shuffled. |
| **I** | Any | Any | Any | Any | **Negative marking**: applies to `marksSnapshot` regardless of pool origin. |
| **J** | Any | Any | Any | Any | **Attempt limits**: enforce submitted count before any pool is touched. |

---

## 12. Fixed + Pool Compatibility Decision

### Options Evaluated
- **Option A**: A section contains *either* fixed questions *OR* pools.
- **Option B**: A section may contain *both* fixed questions *and* pools.
- **Option C**: Pools completely replace direct `test_questions` assignment.

### Audit Verdict: OPTION B (Coexistence)
1. **Zero Breaking Changes**: Existing tests have 0 pools and $N$ fixed questions in `test_questions`. They continue operating with zero migration alterations.
2. **Schema Uniformity**: Option B requires no artificial constraint preventing both rows from linking to `section_id`.
3. **Pedagogical Requirement**: Placement assessments frequently require 2 mandatory anchor questions followed by a random draw of 8 algorithmic questions from a pool. Option B natively supports this without cumbersome workarounds.

---

## 13. Pool Question Overlap Behavior

### Critical Finding
In `frontend/src/db/schema.ts`, `attempt_questions` enforces:
```ts
uniqueIndex("attempt_questions_unique_idx").on(table.attemptId, table.questionId)
```
If question $Q$ were selected twice in the same attempt, PostgreSQL will throw a unique constraint error `23505`, aborting the attempt start.

### Decision & Policy
1. **Within a Single Test**:
   - A question **cannot** appear as both a fixed question and a pool question.
   - A question **cannot** appear in more than one pool within the same test.
   - **Enforcement**:
     - *Admin UI*: The question selector disables any question already assigned to fixed questions or another pool in that test.
     - *Admin API*: Validates that the union of all `testQuestions` and all `questionPoolQuestions` across all sections has no duplicate `questionId`.
2. **Across Different Tests**:
   - A question in the global `questions` bank CAN belong to Pool A of Test 1 and Pool B of Test 2.
3. **Attempt Selection Defense-in-Depth**:
   - The selection algorithm maintains `selectedQuestionIds: Set<string>` across all sections and pools, ensuring a question can never be selected twice in the same attempt even if misconfigured.

---

## 14. Insufficient Pool Questions Behavior

### Scenario
A pool has 4 assigned questions, but `selection_count` is set to 10.

### Audit Decision: STRICT INTEGRITY (Never Silently Under-Select)
Nexora will **NEVER** silently reduce `selection_count` to the available question count. If 10 questions were configured, selecting 4 produces an incomplete assessment and corrupts total marks.

### 4-Tier Validation Architecture
1. **Admin Builder (Client)**:
   - When editing a pool, the builder checks `pool.questions.length >= pool.selectionCount`.
   - If invalid, an inline warning is shown, and "Publish Test" / "Create Test" is blocked.
2. **Admin API (`POST /api/admin/tests`)**:
   - Validates each pool:
     `selectionCount >= 1`
     `assignedQuestions.length >= selectionCount`
   - If `assignedQuestions.length < selectionCount`, returns HTTP 400:
     `{ error: "Pool \"${pool.title}\" has selectionCount (${pool.selectionCount}) exceeding the number of assigned questions (${pool.questions.length})." }`
3. **Draft State Compatibility**:
   - Tests cannot be saved with invalid pools, even as Drafts. A draft must remain structurally valid to allow Admin Preview and prevent corrupted deployments.
4. **Attempt Start Runtime Guard**:
   - If canonical questions are somehow deleted from the bank, leaving a pool deficient:
   - `startOrResumeAttempt` detects `available.length < pool.selectionCount`, rolls back the transaction, and throws:
     `"Unable to start assessment: Pool \"${pool.title}\" has insufficient eligible questions. Please contact administrator."`

---

## 15. Marks & TotalMarks Implications

### Critical Architectural Finding
How should `tests.totalMarks` and question counts be represented when tests include pools?

In `frontend/src/server/grading.ts`:
```ts
let totalPossibleScore = 0;
for (const q of testQuestionRows) {
  const marks = q.marksSnapshot ?? q.marks;
  totalPossibleScore += marks;
  ...
}
const normalizedScore = totalPossibleScore > 0
  ? Math.max(0, Math.round((rawScore / totalPossibleScore) * 100))
  : 0;
```
`gradeAttempt` **already computes `totalPossibleScore` by summing the actual marks of the questions in the attempt!** It does not divide by `tests.totalMarks`.

However, if pool questions have **variable marks** (e.g. some 2 marks, some 4 marks):
- Attempt 1 could draw questions totaling 48 marks.
- Attempt 2 could draw questions totaling 52 marks.
- On `/tests/[id]`, the student is shown `Total Marks: 50`. An attempt out of 48 or 52 creates confusion and perceived unfairness.

### Policy Decision: Uniform Marks per Pool Rule (Approach A)
1. **Rule**: All questions assigned to a specific question pool must have the **same mark value** (e.g., all 2 marks, or all 4 marks).
2. **Deterministic Test Total Marks**:
   $$\text{Test Total Marks} = \sum \text{fixed question marks} + \sum (\text{pool.selection\_count} \times \text{pool.marks\_per\_question})$$
3. **Benefits**:
   - `tests.totalMarks` is 100% deterministic and mathematically exact for every student attempt.
   - Admin builder automatically calculates and displays the exact total marks.
   - `/tests/[id]` displays the exact total marks.
   - Grading normalization is consistent across all students.
4. **Enforcement**:
   - In the Admin Builder, adding a question with a different mark value to an existing pool is flagged or blocked.
   - The Admin API verifies that all questions in a pool share identical `marks`.

---

## 16. Score Normalization Implications

Because Uniform Marks per Pool is enforced:
1. Every student attempt has identical `totalPossibleScore`.
2. Raw scores are normalized to 0–100 via:
   $$\text{normalizedScore} = \text{round}\left(\frac{\text{rawScore}}{\text{totalPossibleScore}} \times 100\right)$$
3. Accuracy is marks-independent:
   $$\text{accuracy} = \text{round}\left(\frac{\text{correctCount}}{\text{attemptedCount}} \times 100\right)$$
4. Skill scores (`skillScores` table) and readiness (`calculateReadiness`) continue consuming `attempts.score` and `skillScores.accuracy` without modification.

---

## 17. Admin Test Builder UX

### Component Design (`test-builder.tsx`)
Within each Section card in the test builder:

```
┌────────────────────────────────────────────────────────────────────────┐
│ SECTION 1: Technical Core                            [Reorder] [Delete]│
│ Description: Core computer science fundamentals                        │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Fixed Questions (2)                             [+ Add Fixed Q]    │ │
│ │ 1. What is virtual memory? (2 pts)                 [↑] [↓] [Trash] │ │
│ │ 2. Explain ACID properties. (2 pts)                [↑] [↓] [Trash] │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Question Pools (1)                                  [+ Add Pool]   │ │
│ │ ┌────────────────────────────────────────────────────────────────┐ │ │
│ │ │ Pool 1: OS Scheduling Algorithms               [Delete Pool]   │ │ │
│ │ │ Description: Round Robin, Priority, FCFS                       │ │ │
│ │ │ Selection: Select [ 3 ] questions from 15 eligible questions   │ │ │
│ │ │ Question Marks: 2 pts each | Pool Contribution: 6 pts          │ │ │
│ │ │                                                                │ │ │
│ │ │ Member Questions (15):                     [+ Add Questions]   │ │ │
│ │ │ • Calculate average waiting time for RR... (2 pts)    [Remove] │ │ │
│ │ │ • Which algorithm suffers from Convoy effect? (2 pts) [Remove] │ │ │
│ │ │ • [13 more questions...]                                       │ │ │
│ │ └────────────────────────────────────────────────────────────────┘ │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ Section Summary: 5 Questions (2 fixed + 3 pooled) | 10 Total Marks     │
└────────────────────────────────────────────────────────────────────────┘
```

### State Representation in `TestBuilder`
```ts
interface BuilderPoolQuestionItem {
  id: string;
  question: RepositoryQuestion;
  marks: number;
}

interface BuilderQuestionPool {
  id: string;
  title: string;
  description: string;
  selectionCount: number;
  poolOrder: number;
  questions: BuilderPoolQuestionItem[];
}

interface BuilderSection {
  id: string;
  title: string;
  description: string;
  sectionOrder: number;
  questions: BuilderQuestionItem[]; // Fixed questions
  pools: BuilderQuestionPool[];     // Question pools (Phase 7F)
}
```

---

## 18. Preview Behavior

### Admin Preview (`admin-test-preview.tsx`)
- Preview remains strictly client-side via `sessionStorage`.
- It **never** inserts into `attempts`, `attempt_questions`, or `answers`.
- It **never** consumes student attempt limits or alters analytics.
- **Preview Generation**:
  When clicking "Preview" in `test-builder.tsx`:
  For each pool in each section, the client samples `selectionCount` questions using `window.crypto.getRandomValues`.
  Sampled questions are staged into `PreviewDraft.questions` with a badge indicating their source: `poolTitle?: string`.
  Admin can experience the exact exam flow as a student would see it.

---

## 19. Student UX & Test Details

### Student View (`/tests/[id]`)
- **Transparency without Leakage**:
  Students must know how many questions they will face and the total marks, but should not see internal pool structures or unused questions.
- **Metric Cards**:
  - `Questions`: $\sum \text{fixed questions} + \sum \text{pool.selectionCount}$
  - `Total Marks`: $\text{tests.totalMarks}$
  - `Minutes`: $\text{tests.duration}$
- **Assessment Sections Breakdown**:
  For each section:
  Shows `Part X: Title` and `N Questions` where:
  $$N = \text{fixed questions in section} + \sum \text{pool.selectionCount in section}$$
- **During Exam**:
  Student sees sequential questions 1..N across sections. There is no visual distinction between fixed and pooled questions.

---

## 20. Duplication Behavior (`duplicateTest`)

### Logic Specification in `frontend/src/server/tests.ts`
When `duplicateTest(sourceTestId)` is called:
1. Duplicate `tests` row with `${title} — Copy`.
2. Duplicate `testSections`, maintaining `oldSectionIdToNew: Map<string, string>`.
3. Duplicate `testQuestions` (fixed questions) mapped to new section IDs.
4. **Phase 7F Addition**:
   - Query all `question_pools` for `sourceTestId`.
   - Insert new `question_pools` pointing to `newTest.id` and `oldSectionIdToNew.get(pool.sectionId)`.
   - Maintain `oldPoolIdToNew: Map<string, string>`.
   - Query all `question_pool_questions` for the source pools.
   - Batch insert new `question_pool_questions` mapping `poolId = oldPoolIdToNew.get(pq.poolId)`.
   - Canonical question references remain untouched.
5. Zero attempts, answers, snapshots, or student histories are copied.

---

## 21. Security Model

1. **Authorization**:
   - Admin routes (`/api/admin/tests`, etc.) enforce `session.user.isAdmin === true`.
   - Non-admins and anonymous users receive HTTP 403 / 401.
2. **Answer Key Protection**:
   - In `getAttemptExamState`, `correctAnswer`, `correctAnswerSnapshot`, and `explanation` are omitted from the student payload.
3. **Client Tampering Immunity**:
   - Students cannot specify which pool questions to receive. Selection is executed server-side in a closed transaction.
4. **Answer Validation**:
   - `saveAnswer` validates that submitted answers reference valid synthetic option IDs in `attempt_questions.option_order`.

---

## 22. Transaction & Concurrency Model

Phase 7F integrates with Phase 7D's PostgreSQL advisory locking:

```
startOrResumeAttempt(testId, userId)
  │
  ├─► BEGIN TRANSACTION
  │     │
  │     ├─► SELECT pg_advisory_xact_lock(hashtext(userId || ':' || testId))
  │     │
  │     ├─► 1. Query active in_progress attempt
  │     │      ├─► Found & Not Expired: RETURN EXISTING ATTEMPT (Zero pool selection)
  │     │      └─► Found & Expired: Grade attempt, continue
  │     │
  │     ├─► 2. Count submitted attempts
  │     │      └─► If count >= attemptLimit: THROW ERROR (Zero pool selection)
  │     │
  │     ├─► 3. INSERT INTO attempts -> new attemptId
  │     │
  │     ├─► 4. SELECT Fixed Questions + Pools
  │     │      ├─► Validate pool question counts >= selectionCount
  │     │      ├─► Crypto shuffle & sample selectionCount questions per pool
  │     │      ├─► Apply randomizeQuestions / randomizeOptions
  │     │      └─► Capture all 5 snapshots (text, type, marks, options, correct_answer)
  │     │
  │     ├─► 5. BATCH INSERT INTO attempt_questions
  │     │
  │     └─► COMMIT (Advisory lock automatically released)
```

**Concurrency Guarantee**: Concurrent clicks or parallel tabs from the same user are serialized. Exactly one attempt is created with its pool selection; concurrent calls resume that same attempt.

---

## 23. Backward Compatibility

1. **Existing Tests**: Have 0 question pools. When started, `question_pools` returns empty, and the engine selects only `test_questions` (100% legacy parity).
2. **Historical Attempts**:
   - `attempt_questions` rows created in Phase 7C.1 or earlier have `pool_id = NULL`.
   - `getAttemptExamState` and `gradeAttempt` read snapshots from `attempt_questions` and are completely agnostic to whether questions originated from a pool or fixed assignment.
3. **Database Stability**: Migrations are strictly additive. No tables or columns are deleted or renamed.

---

## 24. Migration Plan

### File: `frontend/src/db/migrations/0008_phase_7f_question_pools.sql`

```sql
-- Phase 7F: Question Pools Migration
-- Create question_pools table
CREATE TABLE IF NOT EXISTS "question_pools" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "test_id" uuid NOT NULL REFERENCES "tests"("id") ON DELETE CASCADE,
  "section_id" uuid NOT NULL REFERENCES "test_sections"("id") ON DELETE CASCADE,
  "title" varchar(255) NOT NULL,
  "description" text,
  "selection_count" integer NOT NULL,
  "pool_order" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "question_pools_selection_count_check" CHECK ("selection_count" >= 1)
);

CREATE INDEX IF NOT EXISTS "question_pools_test_id_idx" ON "question_pools" ("test_id");
CREATE INDEX IF NOT EXISTS "question_pools_section_id_idx" ON "question_pools" ("section_id");
CREATE UNIQUE INDEX IF NOT EXISTS "question_pools_section_pool_order_idx" ON "question_pools" ("section_id", "pool_order");

-- Create question_pool_questions table (membership join)
CREATE TABLE IF NOT EXISTS "question_pool_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pool_id" uuid NOT NULL REFERENCES "question_pools"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "questions"("id") ON DELETE CASCADE,
  "question_order" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "question_pool_questions_unique_idx" UNIQUE ("pool_id", "question_id")
);

CREATE INDEX IF NOT EXISTS "question_pool_questions_pool_id_idx" ON "question_pool_questions" ("pool_id");
CREATE INDEX IF NOT EXISTS "question_pool_questions_question_id_idx" ON "question_pool_questions" ("question_id");

-- Optional audit linkage on attempt_questions
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "pool_id" uuid REFERENCES "question_pools"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "attempt_questions_pool_id_idx" ON "attempt_questions" ("pool_id");
```

---

## 25. Detailed Audit Test Plan

When Phase 7F is implemented, a comprehensive standalone audit suite `frontend/src/test/phase-7f-question-pools-audit.ts` will verify:

1. **Schema & Constraints**:
   - `question_pools` creation, foreign keys to `tests` and `test_sections`.
   - `selection_count >= 1` CHECK constraint rejects 0 and negative values.
   - `question_pool_questions` unique index rejects duplicate question in the same pool.
2. **Admin API & Validation**:
   - Rejection of pool with `selection_count > assignedQuestions.length`.
   - Rejection of pool with 0 questions.
   - Rejection of duplicate questions across pools in the same test.
   - Rejection of non-admin mutation requests.
3. **Attempt Creation & Selection**:
   - Exact number of questions sampled matching `selection_count`.
   - Cryptographic variation across sequential attempts by different users.
   - No duplicate questions in any single attempt.
4. **Immutability & Snapshots**:
   - All 5 snapshots captured for pool questions at start.
   - Post-start edits to canonical question text/marks do not affect active attempt or grading.
   - Post-start pool deletion does not corrupt existing attempts.
5. **Randomization Combinations**:
   - Fixed + Pool without randomization (deterministic order).
   - Fixed + Pool with `randomizeQuestions` (shuffled within section).
   - Pool with `randomizeOptions` (shuffled synthetic option IDs).
   - Multiple pools in a section.
6. **Scoring & Negative Marking**:
   - Accurate grading using `marksSnapshot`.
   - Negative marking penalty applied accurately to pooled questions.
   - Normalized score calculated against frozen attempt total marks.
7. **Concurrency & Attempt Limits**:
   - Concurrent starts resolve to the single attempt (no double selection).
   - Attempt limit rejects start after submitted count reached without selecting questions.
8. **Duplication**:
   - `duplicateTest` copies pools and pool memberships with new IDs.
   - Cloned test starts and samples questions independently.
9. **Regression Suites**:
   - 7A, 7B, 7C, 7C.1, 7D, 7E, and 6C audit suites remain 100% green.

---

## 26. Risks & Edge Cases

| Risk / Edge Case | Likelihood | Impact | Architectural Mitigation |
|---|---|---|---|
| **Under-Sampling Race** (Question deleted after test published) | Very Low | High | `startOrResumeAttempt` checks available question count inside transaction; aborts cleanly if insufficient. |
| **Duplicate Question Assignment** (Same Q in fixed and pool) | Medium | Critical | Unique validation in builder and API; `selectedQuestionIds` tracking set in selection algorithm. |
| **Variable Marks Score Mismatch** | Medium | Medium | Uniform Marks per Pool rule enforced; grading calculates `totalPossibleScore` dynamically. |
| **Section Count Desynchronization** on UI | Medium | Low | Updated `getTestDetails` and `getPublishedTests` helper queries sum fixed + pool selection counts. |
| **Cascade Deletion of Attempts** | Low | Critical | `attempt_questions.pool_id` uses `ON DELETE SET NULL`, ensuring attempts survive pool deletion. |

---

## 27. Explicit Out-of-Scope Items for Phase 7F

The following items are intentionally deferred to future phases:
- **Global / Cross-Test Pool Management UI**: Pools are strictly test-and-section-scoped in Phase 7F.
- **Dynamic Rule-Based Pool Filtering** (e.g. "Auto-select 5 Hard questions tagged 'Graphs'"): Phase 7F implements manual pool membership. Dynamic criteria pools will be introduced in Phase 8/9.
- **Weighted Question Sampling**: All eligible questions in a pool have uniform selection probability.
- **Student Adaptive Testing (CAT / Item Response Theory)**: Question selection is random at start, not dynamically adapted based on mid-test student performance.

---

## 28. Recommended Implementation Sequence

Once approved, implementation should proceed in 6 atomic steps:
1. **Migration & Schema**: Execute `0008_phase_7f_question_pools.sql` and update `frontend/src/db/schema.ts`.
2. **Server Attempt Engine**: Enhance `startOrResumeAttempt` in `frontend/src/server/tests.ts` with pool selection, sufficiency validation, and snapshot staging.
3. **Query Helpers & Duplication**: Update `getTestDetails`, `getPublishedTests`, and `duplicateTest` in `frontend/src/server/tests.ts`.
4. **Admin API**: Update POST and PATCH handlers in `frontend/src/app/api/admin/tests/route.ts` with Zod validation for pools.
5. **Admin Builder UI**: Add Question Pool management to `frontend/src/components/admin/test-builder.tsx` and update preview in `admin-test-preview.tsx`.
6. **Comprehensive Audit Suite**: Implement `frontend/src/test/phase-7f-question-pools-audit.ts` and run full regression verification.

---

## 29. Final Audit Verdict

PHASE 7F AUDIT APPROVED — READY FOR IMPLEMENTATION.
