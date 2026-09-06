# NEXORA — PHASE 7C IMPLEMENTATION REPORT
## Server-Side Per-Attempt Option Randomization & Historical Immutability

*Reconstructed from direct inspection of the current codebase (commit `88fdec0` + uncommitted working tree) and live execution of the audit suites. No application code was modified during reconstruction.*

---

### Executive Summary

Phase 7C (Option Randomization) is implemented and operational in the Nexora assessment platform.

- **Test-level toggle**: `tests.randomize_options` (`randomizeOptions`), independent of `tests.randomize_questions` (`randomizeQuestions`). Defaults to `false` (OFF).
- **Server-side shuffling**: A cryptographically unbiased Fisher–Yates shuffle (`crypto.randomInt`) is applied once at attempt creation, inside the `startOrResumeAttempt` transaction.
- **Stable synthetic option identities**: Canonical options stay a plain `string[]` in `questions.options`; each option is addressed by a deterministic synthetic identity `opt_0`, `opt_1`, …, `opt_N-1` derived from its zero-based canonical index.
- **Per-attempt persistence**: The presentation permutation is persisted in `attempt_questions.option_order` (JSONB array of `opt_X` strings), frozen for the life of the attempt.
- **Frozen snapshots**: `attempt_questions.options_snapshot` and `attempt_questions.correct_answer_snapshot` are captured at attempt inception so later Question Bank edits cannot reinterpret a student's historical answer or change grading of option content.
- **Answer persistence**: Student answers are stored as the stable canonical identity (`"opt_1"`), never as a display letter (`"C"`) or display index (`2`).
- **Grading**: Server-side, position-independent, evaluated against the snapshotted correct answer via canonical identity resolution, with a full legacy text-matching fallback for historical attempts.
- **Hybrid resolver**: Attempts with `attempt_questions` rows use persisted order/snapshots; attempts without them (pre-7B, pre-7C) fall back to `test_questions` + live question data with canonical option order — no destructive backfill.

**Verification**: 34/34 Phase 7C audit assertions pass; all Phase 6B/6C/7A/7B/Integration/Regression suites pass; `tsc --noEmit` 0 errors; ESLint 0 errors; production build succeeds.

**Headline finding**: Question-edit immutability is **only partially** protected. Option texts and correct answers are snapshotted, but question **text**, **marks**, and **question type** are read live (see §11, Finding 1).

---

### 1. Files Changed & Added

| File | Status | Role in Phase 7C |
|---|---|---|
| `frontend/src/db/migrations/0004_phase_7c_option_randomization.sql` | Created | Adds `tests.randomize_options` + `attempt_questions.option_order`, `options_snapshot`, `correct_answer_snapshot` |
| `frontend/src/db/migrations/meta/_journal.json` | Modified | Registers migration index 4 (`0004_phase_7c_option_randomization`) |
| `frontend/src/db/schema.ts` | Modified | `tests.randomizeOptions` (boolean, NOT NULL, default false); `attemptQuestions.optionOrder`, `optionsSnapshot`, `correctAnswerSnapshot` (nullable jsonb) |
| `frontend/src/lib/random.ts` | Created | `shuffleArray<T>()` — crypto-secure Fisher–Yates via `crypto.randomInt` |
| `frontend/src/server/tests.ts` | Modified | `startOrResumeAttempt` generates/persists `optionOrder` + snapshots; `getAttemptExamState` projects options in presentation order (`{ id, text }`) via hybrid resolver; `saveAnswer` validates `opt_` identities against persisted `optionOrder`; `duplicateTest` copies `randomizeOptions` |
| `frontend/src/server/grading.ts` | Modified | `gradeAttempt` resolves canonical correct option identity from snapshots; `opt_`-based exact comparison for single & multiple choice; legacy text fallback; Phase 7A negative marking preserved |
| `frontend/src/components/assessment/exam-engine.tsx` | Modified | Options rendered as `{ id, text }`; selection + keyboard shortcuts (A–D / 1–4) bind to stable option identities; display letters derived from render position |
| `frontend/src/app/(protected)/tests/[id]/result/page.tsx` | Modified | Hybrid resolver; reconstructs review options in the attempt's persisted `optionOrder`; uses `optionsSnapshot`/`correctAnswerSnapshot` |
| `frontend/src/components/assessment/detailed-review-table.tsx` | Modified | "Your Choice" / "Correct Answer" badges matched by option identity *or* text; renders options in attempt order |
| `frontend/src/app/api/admin/tests/route.ts` | Modified | `randomizeOptions` parsed in `POST` (create) and `PATCH` (update) |
| `frontend/src/components/admin/test-builder.tsx` | Modified | Independent "Randomize Options [ OFF / ON ]" toggle + helper text under Assessment Parameters |
| `frontend/src/components/admin/admin-test-preview.tsx` | Created (Phase 6A-era file, extended here) | `PreviewDraft.randomizeOptions`; client-side in-memory per-question option shuffle; "Randomized Options" header badge |
| `frontend/src/test/phase-7c-option-randomization-audit.ts` | Created | 12 suites / 34 assertions (data model, permutations, payload, resume, grading, immutability, negative marking, 4 combinations, legacy, security, duplicate) |
| `frontend/src/test/integration-audit.ts` | Modified | Option selection in Milestone 3 now extracts `opt.id` from `{ id, text }` objects |

Note: the repository has only 4 commits; Phases 6A–7C live in the uncommitted working tree. The files above are the Phase 7C-relevant subset of those changes.

---

### 2. Schema / Migration Changes

Migration `0004_phase_7c_option_randomization.sql` (exact contents):

```sql
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "randomize_options" boolean DEFAULT false NOT NULL;
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "option_order" jsonb;
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "options_snapshot" jsonb;
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "correct_answer_snapshot" jsonb;
```

Registered in `_journal.json` as entry 4. Verified applied to the local `placement_os` database (`\d tests`, `\d attempt_questions`).

Schema invariants (drizzle, `frontend/src/db/schema.ts`):
- `tests.randomizeOptions: boolean("randomize_options").notNull().default(false)`
- `attemptQuestions.optionOrder: jsonb("option_order")` — nullable; array of `"opt_X"` strings in display sequence.
- `attemptQuestions.optionsSnapshot: jsonb("options_snapshot")` — nullable; frozen `string[]` of option texts.
- `attemptQuestions.correctAnswerSnapshot: jsonb("correct_answer_snapshot")` — nullable; frozen correct answer (`string` or `string[]`).
- `questions.options` and `questions.correctAnswer` remain **unmodified** (plain jsonb arrays/strings). No new tables, no changes to `answers`.

---

### 3. Data Model

**Option identity model** (synthetic, deterministic, zero schema change to the Question Bank):
- Canonical option at index `i` ↔ identity `opt_i` (`opt_0`, `opt_1`, `opt_2`, …).
- `optionOrder = ["opt_2", "opt_3", "opt_1", "opt_0"]` means display A=`opt_2`'s text, B=`opt_3`'s text, C=`opt_1`'s text, D=`opt_0`'s text.
- Display letters (A/B/C/D) and numbers (1–4) are render-time artifacts only and are never persisted as answer data.

**Per-attempt row** (`attempt_questions`): one row per (attempt, question) carrying `questionOrder`, `optionOrder`, `optionsSnapshot`, `correctAnswerSnapshot`. This is the single source of truth for presentation and grading across refresh/resume/multi-tab.

**Historical rows**:
- New attempts (7C onward): `optionOrder` is **always** written — canonical `["opt_0",…,"opt_N-1"]` when randomization is OFF, a shuffled permutation when ON.
- 7B-era attempts: rows exist but `optionOrder`/snapshots are `NULL` → canonical presentation via fallback.
- Pre-7B attempts: no `attempt_questions` rows at all → full `test_questions` fallback.

---

### 4. Runtime Flow

1. **Attempt creation** — `startOrResumeAttempt(testId, userId)` (`frontend/src/server/tests.ts`):
   - Loads the test; if an in-progress attempt exists, returns `{ attemptId, isResumed: true }` (auto-grading expired attempts first).
   - In one transaction: inserts the `attempts` row, fetches sections in order and questions grouped by section, applies `randomizeQuestions` intra-section if ON (Phase 7B), and for every question builds `canonicalOptionIds = rawOptions.map((_, i) => \`opt_${i}\`)`.
   - If `test.randomizeOptions && canonicalOptionIds.length > 1` → `shuffleArray(canonicalOptionIds)`; otherwise canonical.
   - Persists `optionOrder`, `optionsSnapshot` (= live `questions.options`), `correctAnswerSnapshot` (= live `questions.correctAnswer`) per `attempt_questions` row.
   - Section boundaries/order are untouched; option shuffling is strictly per-question inside each section.
2. **Exam state** — `getAttemptExamState(attemptId, userId)`:
   - Hybrid resolver: `attempt_questions` rows (if any) else `test_questions`.
   - Presentation options = `optionOrder.map(optId → { id: optId, text: (optionsSnapshot ?? options)[index(optId)] })`. When `optionOrder` is `NULL`, options are returned as the plain canonical `string[]` (legacy clients still work).
   - `correctAnswer`, `correctAnswerSnapshot`, and `explanation` are **not selected** for the active exam payload.
   - Expired in-progress attempts are auto-graded before returning `isExpired`.
3. **Answering** — `ExamEngine` binds each display row to its `opt.id`; single-choice replaces, multiple-choice toggles; optimistic local update then `saveAnswerAction` (server `saveAnswer`).
4. **Saving** — `saveAnswer` validates `opt_`-prefixed submissions against the question's persisted `optionOrder` (rejects `opt_999`, `opt_malformed_xyz`, etc.), verifies the question belongs to the attempt (with legacy `test_questions` fallback), then upserts into `answers` keyed by `(attemptId, questionId)`.
5. **Grading** — `gradeAttempt` (see §6).
6. **Review** — `result/page.tsx` hybrid query, reconstructs options in `optionOrder`, passes to `DetailedReviewTable`.

**Refresh / resume / multi-tab consistency**: every read re-queries the persisted `attempt_questions` rows; option order and snapshots are identical across refreshes, resumes, and concurrent tabs (single source of truth in PostgreSQL). Verified by audit Suite 5 (identical order across resume) and by code inspection of the read path.

---

### 5. Answer Persistence

- Stored in `answers.selectedAnswer` (jsonb, unchanged column).
- New-format answers are the stable canonical identity: `"opt_1"` for single-choice, `["opt_1","opt_3"]` for multiple-choice. Display letters/indices are never stored.
- Legacy-format answers (plain text such as `"TCP"`) remain accepted and stored as-is for backward compatibility; grading resolves them against the snapshotted answer.
- Keying invariant: strictly `(attemptId, questionId)` via the existing unique index — unchanged.

---

### 6. Grading Behavior

`gradeAttempt` (`frontend/src/server/grading.ts`) — fully server-side; client-provided correctness/score/keys are ignored:

1. Resolves effective data per question: `rawOptions = optionsSnapshot ?? live options`; `rawCorrect = correctAnswerSnapshot ?? live correctAnswer`.
2. **single_choice**:
   - If the student answer starts with `opt_`: resolves the canonical correct identity (`opt_X` if snapshot already stores an identity, else `index of rawCorrect text in rawOptions` → `opt_X`), then exact string equality `studentChoice === canonicalCorrectOptId`. Position-independent.
   - Else (legacy text): `studentChoice === rawCorrect` (trimmed string equality) — identical to pre-7C behavior.
3. **multiple_choice**: same dual path with sorted-array exact set comparison on canonical identities (opt path) or texts (legacy path).
4. **Negative marking (Phase 7A)**: unchanged — incorrect answers deduct `marks * penaltyRate` (rounded to 2dp) when `negativeMarkingEnabled`, using the attempt-level snapshot of the policy (fallback to the test's live policy for legacy attempts). Unanswered = 0 marks, 0 penalty.
5. Score normalization (`round(raw/totalPossible*100)` clamped ≥ 0), accuracy (`correct/attempted*100`), `isCorrect` back-fill on `answers`, and subject/topic `skillScores` regeneration are unchanged.

**Duplicate option text**: disambiguated by canonical index — grading compares identities, not just strings.

---

### 7. Historical Compatibility (Existing/Historical Data)

| Data | Behavior |
|---|---|
| Tests created before 7C | `randomize_options` defaults `false` → canonical presentation, byte-identical to prior phases |
| Attempts with `attempt_questions` but NULL `optionOrder` (7B-era) | Canonical option order; live question data (same as before 7C) |
| Attempts with no `attempt_questions` (pre-7B) | `getAttemptExamState`, `gradeAttempt`, and `result/page.tsx` fall back to `test_questions`; options canonical; answers graded by text |
| Historical stored answers (plain text) | Graded by text fallback against `correctAnswer`/snapshot |
| Historical scores/accuracies | Stored on `attempts`; never recomputed unless the attempt is re-graded |
| No destructive backfill | None performed; nullable columns + hybrid resolver make backfill unnecessary |

Verified by audit Suite 10 (legacy attempt with text answer, no `attempt_questions`, grades correctly) and Suite 2 (OFF preserves canonical order).

---

### 8. Compatibility Matrix (Phase 7B × 7C)

| Combination | Question order | Option order | Mechanism |
|---|---|---|---|
| Q: OFF / Opt: OFF | Canonical (per section) | Canonical `opt_0…opt_3` | Canonical `questionOrder`, canonical persisted `optionOrder` |
| Q: ON / Opt: OFF | Randomized intra-section | Canonical | Shuffled `questionOrder`, canonical `optionOrder` |
| Q: OFF / Opt: ON | Canonical | Randomized per question | Canonical `questionOrder`, shuffled `optionOrder` per row |
| Q: ON / Opt: ON | Randomized intra-section | Randomized per question | Both independently shuffled |

Each `attempt_questions` row owns its `questionOrder` and `optionOrder` independently. Verified by audit Suite 9 (all four combinations initialize; canonical order preserved whenever option randomization is OFF).

**Sections**: unchanged — section sequence, boundaries, titles, and question allocations are untouched; navigation and section breakdowns behave as in Phase 6C.

---

### 9. Security & Validation

- **Server-side shuffling**: permutation is generated in the DB transaction with `crypto.randomInt`; clients cannot influence or tamper with order.
- **Option identity validation** (`saveAnswer`): any submitted string starting with `opt_` must be a member of the question's persisted `optionOrder`, else `Error("Invalid option identity submitted")`. Injected identities (`opt_999`, `opt_malformed_xyz`) rejected (audit Suite 11).
- **Cross-question isolation**: question must belong to the attempt (or the test, for legacy fallback); otherwise rejected.
- **Answer-key secrecy**: active exam payload (`getAttemptExamState`) never selects `correctAnswer`, `correctAnswerSnapshot`, or `explanation` (audit Suite 4).
- **Client untrusted**: `isCorrect`, score, and keys are computed strictly server-side in `gradeAttempt`.
- **Legacy text submissions remain accepted** (intentional compatibility): a plain-text answer on a randomized attempt is graded by text against the snapshot. Since all option texts are visible in the UI anyway, this does not leak additional information; it preserves pre-7C client behavior.
- **Question-edit resistance**: option content and correct answer used for grading/display come from frozen snapshots (§11 covers the remaining gaps).

---

### 10. Test Results (executed during reconstruction)

```
==================================================
🔀 NEXORA — PHASE 7C: OPTION RANDOMIZATION AUDIT
==================================================
--- TEST SUITE 1: DATA MODEL & DEFAULT VALUES ---
  ✓ PASS: tests.randomizeOptions defaults to false
  ✓ PASS: tests.randomizeQuestions defaults to false
--- TEST SUITE 2: CANONICAL PRESERVATION (randomizeOptions = false) ---
  ✓ PASS: 4 attempt_questions generated
  ✓ PASS: randomizeOptions=false preserves canonical optionOrder: ['opt_0', 'opt_1', 'opt_2', 'opt_3']
  ✓ PASS: optionsSnapshot correctly recorded
  ✓ PASS: correctAnswerSnapshot correctly recorded
--- TEST SUITE 3: OPTION RANDOMIZATION (randomizeOptions = true) ---
  ✓ PASS: Every randomized question has a valid, bijective 4-option permutation with no duplicates or omissions
--- TEST SUITE 4: ACTIVE EXAM PAYLOAD & STABLE IDENTITY ---
  ✓ PASS: Exam state is not expired
  ✓ PASS: Exam state exposes exactly 4 options
  ✓ PASS: Exam state options are structured as { id, text }
  ✓ PASS: Option identity is synthetic canonical ('opt_1')
  ✓ PASS: SECURITY: correctAnswer and explanation are completely hidden from active exam payload
--- TEST SUITE 5: RESUME & REFRESH IMMUTABILITY ---
  ✓ PASS: startOrResumeAttempt returns isResumed: true
  ✓ PASS: Resume returns the same attemptId
  ✓ PASS: Option presentation order is identical and frozen across resumes/refreshes
--- TEST SUITE 6: ANSWER PERSISTENCE & GRADING INVARIANCE ---
  ✓ PASS: Student selected answer persisted as stable canonical identity 'opt_1' (NOT display letter or display index)
  ✓ PASS: Attempt successfully graded and marked submitted
  ✓ PASS: Normalized score is exactly 25% (got: 25)
  ✓ PASS: Accuracy is 50% (1/2 attempted correct, got: 50)
--- TEST SUITE 7: IMMUTABILITY AGAINST ADMIN QUESTION BANK EDITS ---
  ✓ PASS: Historical correctAnswerSnapshot remained 'TCP' despite Question Bank edit
  ✓ PASS: Historical optionsSnapshot remained ['UDP', 'TCP', 'HTTP', 'DNS'] despite Question Bank edit
--- TEST SUITE 8: NEGATIVE MARKING INTERACTION (Phase 7A + Phase 7C) ---
  ✓ PASS: Negative marking score correctly calculated (+4 - 1 = 3.00 out of 8 total -> 38%, got: 38%) with randomized options
--- TEST SUITE 9: ALL FOUR COMBINATIONS (Phase 7B + 7C Independence) ---
  ✓ PASS: Combination [OFF / OFF] successfully initialized 2 attempt questions
  ✓ PASS: Combination [OFF / OFF] preserves canonical optionOrder
  ✓ PASS: Combination [ON / OFF] successfully initialized 2 attempt questions
  ✓ PASS: Combination [ON / OFF] preserves canonical optionOrder
  ✓ PASS: Combination [OFF / ON] successfully initialized 2 attempt questions
  ✓ PASS: Combination [ON / ON] successfully initialized 2 attempt questions
--- TEST SUITE 10: HISTORICAL ATTEMPT COMPATIBILITY (Hybrid Resolver) ---
  ✓ PASS: Historical attempt with text answer graded correctly (score: 25%) without attempt_questions
--- TEST SUITE 11: SECURITY (Option Tampering Rejection) ---
  ✓ PASS: Arbitrary injected option identity 'opt_999' rejected
  ✓ PASS: Malformed option identity 'opt_malformed_xyz' rejected
  ✓ PASS: Question not in attempt rejected
--- TEST SUITE 12: DUPLICATE TEST PRESERVES randomizeOptions ---
  ✓ PASS: duplicateTest copies randomizeOptions: true
  ✓ PASS: duplicateTest sets isPublished: false (Draft)
==================================================
AUDIT RESULTS: 34 PASSED, 0 FAILED
==================================================
```

Full regression sweep (all executed during reconstruction, against the live local DB):

| Suite | Command | Result |
|---|---|---|
| Phase 7C Option Randomization | `npx tsx src/test/phase-7c-option-randomization-audit.ts` | **34 PASSED, 0 FAILED** |
| Phase 7B Question Randomization | `npx tsx src/test/phase-7b-question-randomization-audit.ts` | **41 PASSED, 0 FAILED** |
| Phase 7A Negative Marking | `npx tsx src/test/phase-7a-negative-marking-audit.ts` | **62 PASSED, 0 FAILED** |
| Phase 6C Test Sections | `npx tsx src/test/phase-6c-sections-audit.ts` | **52 PASSED, 0 FAILED** |
| Duplicate Test (6B) | `npx tsx src/test/duplicate-test-audit.ts` | **41 PASSED, 0 FAILED** |
| Milestone 3 Integration | `npx tsx src/test/integration-audit.ts` | **61 PASSED, 0 FAILED** |
| Start Test Regression | `npx tsx src/test/start-test-regression.ts` | **23 PASSED, 0 FAILED** |

**Quality gates**:
- **TypeScript**: `npx tsc --noEmit` → **0 errors** (exit 0).
- **ESLint**: `npm run lint` → **0 errors** (55 warnings, all pre-existing `no-explicit-any` / unused-var warnings in test files; exit 0).
- **Production build**: `npm run build` → **success** (all routes compiled; static + dynamic generated cleanly; exit 0).

---

### 11. Known Limitations / Findings

#### Finding 1 — Question-Edit Immutability is ONLY PARTIALLY PROTECTED (IMPORTANT)

The implementation snapshots **option texts** (`options_snapshot`) and **correct answer** (`correct_answer_snapshot`) at attempt inception, and both grading and review rendering prefer those snapshots. This fully protects historical grading against option-text and correct-answer edits (audit Suite 7 confirms the snapshots survive a Question Bank mutation).

However, three question attributes are **still read live** and are **not snapshotted**:

1. **Question text** (`questions.question`): selected live in `getAttemptExamState` and `result/page.tsx`. If an admin edits a question's wording after an attempt starts, the in-progress exam and the post-submission review display the **new** text while the options/correct answer remain the **old** (snapshotted) ones — an inconsistent, potentially confusing review.
2. **Question marks** (`questions.marks`): read live in `gradeAttempt` for both `totalPossibleScore` and score award, and in `result/page.tsx` for the section breakdown. If an admin changes marks **after an attempt starts but before it is graded** (e.g., a long-running in-progress attempt), the computed historical score changes. Once graded, `attempts.score`/`accuracy` are frozen, but the section-breakdown recompute on the result page still uses live marks and can drift from the stored score.
3. **Question type** (`questions.questionType`): read live in `gradeAttempt`; changing `single_choice` ↔ `multiple_choice` mid-attempt changes the grading branch applied to an already-saved answer.

The audit test (Suite 7) verifies only that the snapshot columns survive mutation; it does **not** assert that question text, marks, or review display remain invariant. This gap exists in the current implementation and is reported here per instruction — **not silently fixed**.

#### Finding 2 — Question deletion still cascades into historical attempts (pre-existing)
`attemptQuestions.questionId → questions.id` uses `onDelete: "cascade"` (as does `testQuestions`). Deleting a question from the bank removes its `attempt_questions` rows, so that question disappears from exam state, grading input, and the review table for all attempts. The stored `attempts.score` remains, but detail-level review is lost. This behavior predates Phase 7C and is not addressed by the snapshot columns (the join key itself is removed).

#### Finding 3 — `saveAnswer` accepts legacy plain-text submissions on randomized attempts
Only `opt_`-prefixed identities are strictly validated against `optionOrder`. A plain-text answer (e.g., `"TCP"`) is still accepted for backward compatibility; it is graded by text against the snapshot, so correctness is preserved, but it bypasses the stable-identity guarantee. Not a security hole (option texts are already visible to the student), but worth noting if strict identity enforcement is desired later.

#### Finding 4 — ESLint warnings
`npm run lint` exits 0 but reports 55 warnings (mostly `@typescript-eslint/no-explicit-any` and unused imports in test/audit files). None are errors and none block the build.

#### Finding 5 — Operational guidance
- Only `single_choice` / `multiple_choice` with more than one option are shuffled; the identity model degenerates safely for 1-option questions (no shuffle).
- Fixed-position options such as "All of the above" / "None of the above" may move from the bottom when randomization is enabled; authors should write position-independent choices.
- Preview shuffling is client-side (`window.crypto.getRandomValues`) and stored in `sessionStorage`; it creates no DB attempts, so it cannot inflate attempt counters.

---

### 12. Final Implementation Status

| Requirement | Status |
|---|---|
| `tests.randomizeOptions` column + toggle | ✅ Implemented & verified |
| `attempt_questions.optionOrder` persistence | ✅ Implemented & verified |
| Stable synthetic identities (`opt_0`, `opt_1`, …) | ✅ Implemented & verified |
| Server-side per-attempt option shuffling (crypto Fisher–Yates) | ✅ Implemented & verified |
| Answers stored by stable identity, not display position | ✅ Implemented & verified |
| Correct grading after randomization (single & multiple choice) | ✅ Implemented & verified |
| Refresh / resume / multi-tab consistency | ✅ Implemented & verified (persisted single source of truth) |
| Historical attempts & tests with randomization OFF / canonical order | ✅ Implemented & verified (hybrid resolver, no backfill) |
| Question-edit immutability (options + correct answer) | ✅ Protected via snapshots |
| Question-edit immutability (question text, marks, type) | ⚠️ **NOT fully protected — see Finding 1** |
| All four Q×Opt combinations | ✅ Implemented & verified |
| Sections | ✅ Unchanged, per-question shuffle inside sections |
| Negative marking interaction | ✅ Verified (38% case) |
| Result/review rendering in attempt order | ✅ Implemented & verified |
| Admin test builder / API (POST, PATCH) | ✅ Implemented |
| Preview (client-side shuffle + badge) | ✅ Implemented |
| Duplicate test copies `randomizeOptions`, stays Draft | ✅ Implemented & verified |
| Security & validation (injection, cross-question, key secrecy) | ✅ Implemented & verified |
| Tests, TypeScript, ESLint, production build | ✅ 34/0 + full regression green; tsc 0 errors; lint 0 errors; build OK |

Phase 7C is functionally complete and green across all executed suites. The one substantive gap is Finding 1 (question text / marks / type are live reads, not snapshots), which is documented and intentionally left unfixed.

---

PHASE 7C IMPLEMENTATION REPORT RECONSTRUCTED.