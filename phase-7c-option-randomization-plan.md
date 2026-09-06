# NEXORA — PHASE 7C ARCHITECTURE AUDIT & IMPLEMENTATION PLAN
## Option Randomization (Shuffle Answer Choices Per Attempt)

---

### Executive Summary

Nexora currently stores multiple-choice options as an unkeyed, ordered JSONB array of strings (`questions.options: string[]`) and evaluates student selections by comparing raw string text (`answers.selectedAnswer === questions.correctAnswer`). Presentation letters (`A`, `B`, `C`, `D`) are synthesized dynamically on the client at render time based solely on display index.

Phase 7C introduces **Option Randomization**—allowing test administrators to enable per-attempt shuffling of answer choices independently from question randomization (Phase 7B).

This architectural audit establishes that:
1. Shuffling presentation order must **never alter question semantics or grading invariants**.
2. Storing display positions (e.g., `"A"`, `"B"`, index `0`, `1`) in the database is strictly prohibited; answer persistence must use a **stable option identity**.
3. Randomization must occur **server-side once per attempt** during attempt initialization using cryptographically secure Fisher-Yates shuffling (`crypto.randomInt`).
4. Persisting the randomized option mapping on the existing Phase 7B `attempt_questions` relational record provides complete immutability across page refreshes, test resumptions, multi-tab access, and post-submission result reviews without adding table bloat.
5. A **hybrid resolver** guarantees 100% backward compatibility for pre-existing tests and historical attempts without requiring disruptive historical data migrations.

---

### A. Current Option Data Model

Inspection of [`src/db/schema.ts`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/db/schema.ts#L98-L128) and [`src/db/reference-data.ts`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/db/reference-data.ts#L130-L220) reveals:

- **Database Column**: `questions.options` is defined as `jsonb("options").notNull()`.
- **In-Memory Representation**: Stored and typed as a flat array of plain strings: `string[]`.
- **Sample Canonical Row**:
  ```json
  [
    "36 km/h",
    "10 km/h",
    "48 km/h",
    "24 km/h"
  ]
  ```
- **Option Identifiers**: **There are currently NO stable option identifiers or keys in the database.**
- **Option Indexing**: Options possess only their 0-based array position in the canonical array: index `0`, `1`, `2`, `3`.
- **Admin Authoring**: In [`src/components/admin/question-form.tsx`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/components/admin/question-form.tsx#L184-L203) and [`src/app/api/admin/questions/route.ts`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/app/api/admin/questions/route.ts#L48-L54), the admin inputs an array of strings. Validation enforces `options.length >= 2`.

---

### B. Current Correct-Answer Representation

Inspection of `questions.correctAnswer` across schema, API, and reference data reveals:

- **Database Column**: `questions.correctAnswer` is defined as `jsonb("correct_answer").notNull()`.
- **Data Content**:
  - For `single_choice`: Stored as a JSON string containing the **exact textual content** of the correct option:
    ```json
    "36 km/h"
    ```
  - For `multiple_choice`: Stored as a JSON array of strings containing the exact textual content of all correct options:
    ```json
    ["Option A text", "Option C text"]
    ```
- **Admin Validation**: In [`src/app/api/admin/questions/route.ts:64`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/app/api/admin/questions/route.ts#L64):
  ```typescript
  if (typeof cleanAnswer === "string" && !cleanOptions.includes(cleanAnswer)) {
    return NextResponse.json({ error: "Correct answer must match one of the provided options exactly." }, { status: 400 });
  }
  ```
- **Finding**: `correctAnswer` references the option **by literal text value**, NOT by letter (`"A"`/`"B"`), NOT by canonical index (`0`/`1`), and NOT by foreign key.

---

### C. Current Answer Persistence

Inspection of [`src/server/actions.ts:24`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/server/actions.ts#L24) and [`src/server/tests.ts:430`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/server/tests.ts#L430):

- **Database Column**: `answers.selectedAnswer` is defined as `jsonb("selected_answer")`.
- **Exam Engine Flow**:
  1. In [`src/components/assessment/exam-engine.tsx:501`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/components/assessment/exam-engine.tsx#L501):
     `currentQ.options.map((opt: string, optIdx: number) => ...)`
  2. The student clicks an option button: `onClick={() => handleSelectOption(opt)}`.
  3. `handleSelectOption` passes `opt` (the literal string text, e.g. `"36 km/h"`).
  4. Dispatches `saveAnswerAction(attemptId, currentQ.id, selectedAnswer)`.
- **Database Row**:
  ```json
  {
    "attempt_id": "9f5fa68d-...",
    "question_id": "c45f210a-...",
    "selected_answer": "36 km/h",
    "is_correct": null,
    "time_spent": 15
  }
  ```
- **Finding**: The database stores **literal option text** (`"36 km/h"`), NOT display position (`"A"`/`"B"`).

---

### D. Current Grading Behavior

Inspection of [`src/server/grading.ts:150-166`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/server/grading.ts#L150-L166):

```typescript
// Evaluation based on question type
if (q.questionType === "single_choice") {
  isCorrect =
    String(studentAns.selectedAnswer).trim() ===
    String(q.correctAnswer).trim();
} else if (q.questionType === "multiple_choice") {
  const studentArr = Array.isArray(studentAns.selectedAnswer)
    ? studentAns.selectedAnswer.map(String).sort()
    : [String(studentAns.selectedAnswer)];
  const correctArr = Array.isArray(q.correctAnswer)
    ? (q.correctAnswer as unknown[]).map(String).sort()
    : [String(q.correctAnswer)];

  isCorrect =
    studentArr.length === correctArr.length &&
    studentArr.every((val, idx) => val === correctArr[idx]);
}
```

- **Evaluation Basis**: String equality comparison.
- **Independence from Presentation**: Because grading compares string values (`"TCP" === "TCP"`), presentation order does not inherently break grading *provided* option strings are unique and question data remains unmutated.
- **Vulnerabilities with Pure String Matching**:
  1. **Duplicate Option Text**: If two options share identical text (e.g. mathematical values, "None of the above"), string matching cannot distinguish which option was chosen.
  2. **Admin Question Mutations**: If an admin corrects a typographical error in question options after an attempt begins, the student's stored string becomes mismatching and grades as incorrect.

---

### E. Recommended Option Identity Model

To achieve robust decoupling of presentation order from question semantics, Nexora must establish a **stable option identity model**.

#### Options Evaluated:

1. **Option Model 1 — Separate Relational Table (`question_options`)**:
   - `question_options (id, question_id, option_text, option_order)`
   - *Verdict*: **REJECTED**. Disproportionately invasive. Breaks 160 seeded questions, requires migrating existing curriculum fixtures, breaks question authoring APIs, and introduces heavy multi-table joins for simple 4-choice questions.

2. **Option Model 2 — Schema Migration of `questions.options` to Objects**:
   - `questions.options = [ { "id": "opt-0", "text": "UDP" }, ... ]`
   - *Verdict*: **REJECTED**. Requires rewriting all question seeds, admin question forms, CSV question imports, and legacy attempt queries.

3. **Option Model 3 — Deterministic Synthetic Option Identifiers (RECOMMENDED)**:
   - Canonical options in `questions.options` remain an array of strings: `["UDP", "TCP", "HTTP", "DNS"]`.
   - Each option has a canonical index: `0, 1, 2, 3`.
   - We define stable, deterministic option identifiers:
     - Canonical index `0` $\rightarrow$ `opt_0` (or `0`)
     - Canonical index `1` $\rightarrow$ `opt_1` (or `1`)
     - Canonical index `2` $\rightarrow$ `opt_2` (or `2`)
     - Canonical index `3` $\rightarrow$ `opt_3` (or `3`)
   - For an attempt, the option permutation maps display positions to canonical option IDs.
   - For dual compatibility, the client submits the selected option payload (or stable ID), and the server resolves both ID-based and legacy text-based evaluations.

---

### F. Recommended Persistence Model

Where should the per-attempt option mapping be stored?

#### Architectures Evaluated:

1. **Architecture A — Separate Relational Table (`attempt_question_options`)**:
   - Schema: `(id, attempt_question_id, canonical_index, display_order, option_text)`
   - Evaluation:
     - 50 questions $\times$ 4 options = 200 rows per student attempt.
     - 10,000 attempts = 2,000,000 database rows.
     - Requires an additional multi-row JOIN in `getAttemptExamState` and `result/page.tsx`.
   - *Verdict*: Unnecessary storage amplification and query overhead.

2. **Architecture B — Extend `attempt_questions` with `option_order: jsonb` (RECOMMENDED)**:
   - Add column:
     ```sql
     ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "option_order" jsonb;
     ```
   - Content: An ordered array of canonical indices representing the display sequence for that attempt:
     ```json
     [2, 0, 3, 1]
     ```
     Meaning:
     - Display Position 0 (`A`) $\rightarrow$ Canonical Option `2` (`"HTTP"`)
     - Display Position 1 (`B`) $\rightarrow$ Canonical Option `0` (`"UDP"`)
     - Display Position 2 (`C`) $\rightarrow$ Canonical Option `3` (`"DNS"`)
     - Display Position 3 (`D`) $\rightarrow$ Canonical Option `1` (`"TCP"`)
   - If `randomizeOptions` is disabled: `option_order` is `[0, 1, 2, 3]` (or `null`).
   - *Advantages*:
     - Zero extra tables.
     - Atomic creation: Generated inside the existing `startOrResumeAttempt` transaction alongside Phase 7B question ordering.
     - Zero extra queries: Selected directly during the existing `SELECT ... FROM attempt_questions` query in `getAttemptExamState`.
     - Compact: ~20 bytes per question.

---

### G. Attempt Snapshot Strategy & Admin Question Edits

#### The Admin Edit Hazard:
Consider the scenario:
1. Student begins attempt on question:
   `options = ["UDP", "TCP", "HTTP", "DNS"]`, `correctAnswer = "TCP"`.
2. Admin subsequently edits the question in the Question Bank:
   Fixes typo: `"TCP"` $\rightarrow$ `"Transmission Control Protocol (TCP)"`.
3. If the attempt relies dynamically on the live `questions.options` table:
   - The student's answer text mismatch grades as incorrect.
   - Or if options were reordered in the bank, index mappings point to incorrect choices.

#### Resolution — Frozen Attempt Snapshot:
To provide complete protection against admin edits while keeping storage minimal:
- `attempt_questions.option_order` stores the shuffled sequence of option items as a self-contained snapshot for that attempt:
  ```json
  [
    { "id": "opt_2", "index": 2, "text": "HTTP" },
    { "id": "opt_0", "index": 0, "text": "UDP" },
    { "id": "opt_3", "index": 3, "text": "DNS" },
    { "id": "opt_1", "index": 1, "text": "TCP" }
  ]
  ```
- **Immutability Guarantee**: Even if the live question is edited, reordered, or deleted in the question repository, the active attempt reads from its persisted snapshot.
- Historical attempts and results remain 100% reproducible and tamper-proof.

---

### H. Question Randomization (Phase 7B) Interaction

Phase 7B and Phase 7C are **strictly orthogonal and independent**.

| Combination | Question Order | Option Order | Mechanism |
|---|---|---|---|
| **A. Q: OFF / Opt: OFF** | Canonical `1..N` | Canonical `A..D` | Canonical `test_questions` order, canonical option sequence |
| **B. Q: ON / Opt: OFF** | Randomized intra-section | Canonical `A..D` | Shuffled `attempt_questions.question_order`, canonical options |
| **C. Q: OFF / Opt: ON** | Canonical `1..N` | Randomized per question | Canonical `question_order`, shuffled `option_order` per row |
| **D. Q: ON / Opt: ON** | Randomized intra-section | Randomized per question | Both `question_order` and `option_order` shuffled independently |

Each `attempt_questions` row independently owns its `questionOrder` and its `optionOrder`.

---

### I. Section Behavior

Option randomization operates **strictly inside the boundaries of individual questions**:
- Section sequence (`sectionOrder`) is unchanged.
- Section boundaries and question allocations are unchanged.
- Section titles and descriptions are unchanged.
- Section navigation in `ExamEngine` remains identical.

---

### J. Answer Persistence

#### Recommended Storage Format in `answers.selectedAnswer`:
When a student selects an option:
1. `ExamEngine` passes both the stable option identifier (`opt_id`) and the option text:
   - For `single_choice`: Stored as the option text (or `{ id: "opt_1", text: "TCP" }` or stable ID).
   - To maintain 100% backward compatibility with all existing analytics, reporting, and result review code:
     `selectedAnswer` continues to store the selected option text string (or an object containing both `{ id: "opt_1", text: "TCP" }`).
   - If the student selected display option `C` (which displays `"TCP"`):
     The persisted answer is `"TCP"`.
2. **Keying Invariant**: Answers remain keyed strictly by `(attemptId, questionId)`. Display indices (`"C"`, `2`) are NEVER stored.

---

### K. Refresh & Resume Behavior

1. **Attempt Initiation**: `startOrResumeAttempt` generates the randomized option order and persists it in `attempt_questions`.
2. **In-Flight Answering**: Student selects option; answer is auto-saved to `answers` table.
3. **Browser Refresh / Navigation**:
   - Next.js server component calls `getAttemptExamState(attemptId, userId)`.
   - `getAttemptExamState` queries `attempt_questions.option_order`.
   - Returns the identical option order.
4. **Answer Re-hydration**:
   - `answersMap[questionId]` re-populates the student's selected option in `ExamEngine`.
   - The selected radio/checkbox is restored on the exact same physical button.
5. **Resume on Different Device**:
   - Fetches from PostgreSQL; exact same option sequence and selected answers are restored.

---

### L. Multiple-Tab Behavior

- If a student opens the test in Tab A and Tab B simultaneously:
  - Both tabs call `getAttemptExamState` with the same `attemptId`.
  - Both tabs read the **same single source of truth** persisted in `attempt_questions`.
  - Both tabs render identical question sequences and identical option sequences.
  - Zero possibility of cross-tab desynchronization.

---

### M. Active Exam Payload Security

Inspection of `getAttemptExamState` security constraints:
- **Omitted from Payload**:
  - `correctAnswer` (STRIPPED)
  - `explanation` (STRIPPED)
  - `isCorrect` (STRIPPED)
  - Answer keys / canonical correctness flags
- **Included in Payload**:
  - `id`: Question UUID
  - `question`: Question text
  - `questionType`: `"single_choice"` | `"multiple_choice"`
  - `options`: Array of option strings (in the attempt's randomized order)
  - `marks`, `difficulty`, `expectedTime`
  - `sectionId`, `sectionTitle`, `sectionOrder`, `questionOrder`
- **Result**: Randomized payloads preserve total answer-key secrecy.

---

### N. ExamEngine UI Architecture

In [`src/components/assessment/exam-engine.tsx`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/components/assessment/exam-engine.tsx):
- `currentQ.options` arrives from the server already ordered according to the student's attempt mapping.
- **Display Labels**:
  ```tsx
  const optionLetter = String.fromCharCode(65 + optIdx); // 0 -> A, 1 -> B, 2 -> C, 3 -> D
  ```
- **Aria Labels & Radio Roles**:
  - Preserved: `role="radio"`, `aria-checked={isSelected}`, `aria-label="Option A: HTTP"`.
  - Keyboard shortcuts (`1..4`, `A..D`) select the corresponding display position without knowing the underlying canonical index.

---

### O. Result Review Behavior

In [`src/app/(protected)/tests/[id]/result/page.tsx`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/app/(protected)/tests/[id]/result/page.tsx) and [`src/components/assessment/detailed-review-table.tsx`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/components/assessment/detailed-review-table.tsx):
- The review table displays options in the **exact presentation order the student experienced during the exam**.
- If Attempt 1 saw `[HTTP, DNS, TCP, UDP]`, the post-submission review renders:
  - `A. HTTP`
  - `B. DNS`
  - `C. TCP` (highlighted as Correct Answer)
  - `D. UDP`
- This eliminates student confusion where an answer marked "C" in their mind appears as "B" in the review.
- For historical attempts (pre-Phase 7C), options render in canonical order.

---

### P. Historical Compatibility & Hybrid Resolver

1. **Historical Tests**:
   - `randomize_options` defaults to `false`.
   - Existing tests present canonical option order `100%` identically to prior phases.
2. **Historical Attempts**:
   - Historical attempts have `option_order = NULL` (or no `attempt_questions` row).
   - Hybrid resolver rule:
     ```typescript
     const displayOptions = attemptQuestionRow?.optionOrder
       ? resolveAttemptOptions(attemptQuestionRow.optionOrder, question.options)
       : question.options;
     ```
   - Zero historical data backfill needed.
   - Historical scores, accuracies, and review tables remain 100% unchanged.

---

### Q. Admin Test Builder Integration

In [`src/components/admin/test-builder.tsx`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/components/admin/test-builder.tsx):
- Add a dedicated toggle under Assessment Parameters:
  ```tsx
  <div className="flex items-center justify-between">
    <div>
      <span className="text-label-xs font-mono font-bold uppercase">Randomize Options</span>
      <p className="text-body-xs text-text-muted">
        Answer choices are shuffled independently for each attempt.
      </p>
    </div>
    <button onClick={() => setRandomizeOptions(!randomizeOptions)}>
      [ OFF / ON ]
    </button>
  </div>
  ```
- Defaults to `OFF`.
- Passed in POST/PATCH payload to `/api/admin/tests`.

---

### R. Admin Preview (Phase 6A) Integration

In [`src/components/admin/admin-test-preview.tsx`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/components/admin/admin-test-preview.tsx):
- Extend `PreviewDraft` with `randomizeOptions?: boolean`.
- On preview mount:
  - If `draft.randomizeOptions` is enabled: Shuffle options in memory using client cryptographic entropy (`window.crypto.getRandomValues`).
  - Header badge: `Randomized Options`.
- Preview remains strictly client-side/sessionStorage; zero database records created.

---

### S. Duplicate Test (Phase 6B) Integration

In [`src/server/tests.ts:duplicateTest`](file:///Users/munshijarjisalam/Documents/Projects/nexora/frontend/src/server/tests.ts#L590):
- Copy `randomizeOptions: source.randomizeOptions` to the duplicated test.
- Duplicated test remains in `Draft` state (`isPublished = false`).
- Zero attempt option mappings or student records are copied.

---

### T. Negative Marking (Phase 7A) Interaction

- Option randomization has **zero mathematical impact** on Phase 7A negative marking.
- Correct answer $\rightarrow$ adds `+question.marks`.
- Incorrect answer:
  - `negativeMarkingEnabled == false` $\rightarrow$ `0`.
  - `negativeMarkingEnabled == true` $\rightarrow$ `-(question.marks * negativeMarkRate)`.
- Unanswered questions $\rightarrow$ `0`.
- Raw score, normalized score clamp ($\ge 0$), and accuracy calculations remain identical.

---

### U. Future Question Pool Compatibility (Phase 7F)

- In Phase 7F, dynamic question sampling will insert a subset of pool questions into `attempt_questions`.
- Because option randomization attaches to `attempt_questions.option_order`, each sampled question will automatically and independently receive its own randomized option mapping.

---

### V. Database Migration Plan

#### Migration SQL (`0004_phase_7c_option_randomization.sql`):
```sql
-- 1. Add randomize_options toggle to tests table
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "randomize_options" boolean DEFAULT false NOT NULL;

-- 2. Add option_order column to attempt_questions table
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "option_order" jsonb;
```

---

### W. API & Server Changes

1. **`src/db/schema.ts`**:
   - Add `randomizeOptions: boolean("randomize_options").notNull().default(false)` to `tests`.
   - Add `optionOrder: jsonb("option_order")` to `attemptQuestions`.
2. **`src/app/api/admin/tests/route.ts`**:
   - Parse `randomizeOptions: Boolean(body.randomizeOptions)` in `POST` and `PATCH`.
3. **`src/server/tests.ts`**:
   - In `startOrResumeAttempt`: When constructing `attemptQuestionRows`, if `test.randomizeOptions` is true, shuffle canonical option indices (`[0..M-1]`) using `shuffleArray()` and assign to `optionOrder`.
   - In `getAttemptExamState`: Reconstruct randomized option array using `attempt_questions.option_order`.
   - In `duplicateTest`: Copy `randomizeOptions: source.randomizeOptions`.
4. **`src/server/grading.ts`**:
   - Support both option identity and text-based matching in `gradeAttempt`.
5. **`src/app/(protected)/tests/[id]/result/page.tsx`**:
   - Query `attemptQuestions.optionOrder` and reconstruct review options in attempt display order.

---

### X. Security Analysis

| Threat Vector | Mitigation |
|---|---|
| **Client-Side Order Tampering** | Order is generated server-side and persisted in DB; student cannot alter option order. |
| **Answer Key Leakage** | `correctAnswer` and `explanation` are strictly stripped from active exam payloads. |
| **Cross-Attempt Correlation** | Shuffling is per-attempt; student in Attempt A cannot tell student in Attempt B which letter is correct. |
| **Arbitrary Option Injection** | Server validates that selected options exist in the question's valid option set. |
| **Tampering via DevTools** | Server-side grading evaluates correctness; client never submits `isCorrect`. |

---

### Y. Performance Analysis

- **Storage**: ~20-40 bytes per question row in `attempt_questions`. For a 50-question test, ~1.5 KB per attempt.
- **Query Count**: 0 additional SQL queries. `option_order` is fetched in the existing `SELECT ... FROM attempt_questions` query.
- **Latency**: Fisher-Yates shuffle on a 4-element array takes $< 0.005$ milliseconds.

---

### Z. Edge Cases

1. **0 or 1 Option**: Skip shuffle; preserve array as-is.
2. **2 Options (True/False)**: Permutes cleanly between `[True, False]` and `[False, True]`.
3. **> 4 Options**: Fisher-Yates scales to arbitrary lengths with zero performance penalty.
4. **Duplicate Option Strings**: Disambiguated by canonical index mapping.
5. **Multi-Select (`multiple_choice`)**: Options are shuffled; student submits an array of selected options; evaluated using exact set comparison.
6. **Unanswered Questions**: Always receive 0 marks regardless of option shuffle.
7. **Timer Expiration**: Auto-submit processes options in the saved state without re-shuffling.
8. **Double Submission**: Idempotency guard prevents duplicate grading.

---

### AA. Comprehensive Test Plan

#### Suite 1: Database Integrity
- `randomize_options` column exists on `tests` (NOT NULL, default `false`).
- `option_order` column exists on `attempt_questions`.

#### Suite 2: Randomization Combinations
- Q: OFF / Opt: OFF $\rightarrow$ Canonical questions, canonical options.
- Q: ON / Opt: OFF $\rightarrow$ Shuffled questions, canonical options.
- Q: OFF / Opt: ON $\rightarrow$ Canonical questions, shuffled options.
- Q: ON / Opt: ON $\rightarrow$ Both independent permutations active.

#### Suite 3: Option Permutation Integrity
- Each attempt receives a valid permutation of canonical options.
- No options duplicated, no options omitted.
- Across multiple attempts, independent orderings are generated.

#### Suite 4: Attempt Immutability & Resume
- Refreshing active exam returns identical option order.
- Resuming active exam returns identical option order.
- Opening in second tab returns identical option order.

#### Suite 5: Answer Persistence & Grading Invariant
- Selecting an option persists accurately.
- Correct answers award full marks regardless of display position.
- Incorrect answers apply Phase 7A negative marking penalty accurately.
- Unanswered questions receive 0 penalty.

#### Suite 6: Multi-Select Exact Set
- Multi-select options shuffled; selecting all correct options awards full marks; partial/incorrect selections evaluated accurately.

#### Suite 7: Result Review
- Review table renders options in the exact presentation order seen during the exam.
- Correct answer badge and student choice badge render on appropriate choices.

#### Suite 8: Admin Builder, Preview, Duplicate
- Builder toggle switches `randomizeOptions` on/off.
- Preview displays randomized options locally without DB mutations.
- Duplicate test copies `randomizeOptions` to draft.

#### Suite 9: Regressions
- Pass Phase 6A, 6B, 6C, 7A, 7B audits.
- Pass TypeScript (`0 errors`), ESLint (`0 errors`), and production build.

---

### AB. Implementation Sequence (For Phase 7C Implementation Task)

1. **Step 1: Database Migration**:
   - Create and apply `0004_phase_7c_option_randomization.sql`.
   - Register in `_journal.json`.
   - Update `src/db/schema.ts`.
2. **Step 2: Server Attempt Logic**:
   - Update `startOrResumeAttempt` in `src/server/tests.ts` to generate and persist `optionOrder`.
   - Update `getAttemptExamState` to reconstruct randomized options.
3. **Step 3: Grading & Answer Logic**:
   - Verify `gradeAttempt` evaluates randomized attempt selections accurately.
4. **Step 4: Result Page Review**:
   - Update `result/page.tsx` to display questions using the attempt's persisted `optionOrder`.
5. **Step 5: Admin Builder & Preview**:
   - Update `test-builder.tsx`, `api/admin/tests/route.ts`, and `admin-test-preview.tsx`.
   - Update `duplicateTest` in `tests.ts`.
6. **Step 6: Automated Audit & Regressions**:
   - Create `src/test/phase-7c-option-randomization-audit.ts`.
   - Run full regression test suites.

---

### AC. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Display letter saved as answer** | High | UI passes option identity/text; letter (`A/B/C/D`) is strictly computed during render. |
| **Admin edits question mid-attempt** | Medium | `attempt_questions` stores frozen snapshot of option order for the attempt. |
| **Option drift on page reload** | High | Option sequence is persisted in PostgreSQL at attempt start and read on every reload. |
| **Historical attempt regression** | High | Hybrid resolver falls back to canonical options when `option_order` is null. |

---

*End of Architecture Audit & Plan for Phase 7C.*
