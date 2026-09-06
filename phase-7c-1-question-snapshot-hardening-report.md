# NEXORA — PHASE 7C.1 IMPLEMENTATION REPORT
## Question Snapshot Immutability Hardening

---

### 1. Executive Summary

Phase 7C.1 closes the immutability gap identified in the Phase 7C implementation report (§11, Finding 1). Under Phase 7C, `attempt_questions` already snapshotted **options** and **correct answer** per attempt, but question **text**, **question type**, and **marks** were still read live from the `questions` table. That allowed a Question Bank edit after an attempt started to change what the student's exam and review displayed (question text) and to alter the marks used in grading.

Phase 7C.1 extends the existing `attempt_questions` snapshot mechanism with three new columns — `question_text_snapshot`, `question_type_snapshot`, `marks_snapshot` — captured at attempt inception, and routes the active exam, grading, and result review through the snapshots with a safe fallback for historical attempts. No new tables were created, no destructive backfill was performed, and no Phase 7A/7B/7C behavior was altered.

**Verified**: New audit suite **63/63 PASSED**; all existing regression suites green; TypeScript 0 errors; ESLint 0 errors; production build succeeds.

---

### 2. Original Immutability Gap (Before This Change)

| Field | Pre-7C.1 behavior |
|---|---|
| `questions.options` | Snapshotted (Phase 7C): `options_snapshot` |
| `questions.correctAnswer` | Snapshotted (Phase 7C): `correct_answer_snapshot` |
| `attempt_questions.option_order` | Persisted per attempt (Phase 7C) |
| `questions.question` (text) | **LIVE** — read in `getAttemptExamState` and `result/page.tsx`; an admin edit changed the exam/review display mid-attempt |
| `questions.questionType` | **LIVE** — read in `gradeAttempt`; a type change could reinterpret an answer |
| `questions.marks` | **LIVE** — read in `gradeAttempt` (score + total) and `result/page.tsx` (section breakdown); a marks edit before grading changed the computed score |

---

### 3. Files Changed

| File | Status | Description |
|---|---|---|
| `frontend/src/db/migrations/0005_phase_7c1_question_snapshot_hardening.sql` | **Created** | Adds `question_text_snapshot` (text), `question_type_snapshot` (question_type enum), `marks_snapshot` (integer) to `attempt_questions` |
| `frontend/src/db/migrations/meta/_journal.json` | Modified | Registers migration index 5 |
| `frontend/src/db/schema.ts` | Modified | Drizzle schema: `attemptQuestions.questionTextSnapshot` (text), `questionTypeSnapshot` (questionTypeEnum), `marksSnapshot` (integer) — all nullable for historical compatibility |
| `frontend/src/server/tests.ts` | Modified | `startOrResumeAttempt` snapshots text/type/marks at attempt creation; `getAttemptExamState` serves snapshot text/type/marks (with live fallback only for historical rows) |
| `frontend/src/server/grading.ts` | Modified | Grading uses `marksSnapshot` (scoring, totals, penalties, skill scores) and `questionTypeSnapshot` (answer interpretation), with live fallback for historical attempts |
| `frontend/src/app/(protected)/tests/[id]/result/page.tsx` | Modified | Review rendering and section breakdown use snapshot text/type/marks; `marks` shown and used for breakdowns now come from `marksSnapshot` |
| `frontend/src/test/phase-7c1-question-snapshot-audit.ts` | **Created** | 10 suites / 63 assertions covering snapshot capture, edit immunity (before/after submission), grading invariance, negative marking, all four randomization combinations, sections, historical compatibility, and security |

No other files required modification. The client `ExamEngine` needed no changes — it renders whatever the server sends, and the server now sends snapshot content.

---

### 4. Migration Details

`0005_phase_7c1_question_snapshot_hardening.sql` (exact contents):

```sql
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "question_text_snapshot" text;
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "question_type_snapshot" question_type;
ALTER TABLE "attempt_questions" ADD COLUMN IF NOT EXISTS "marks_snapshot" integer;
```

- Uses the existing `question_type` enum type (no new enum values, no new question types).
- Columns are nullable because historical rows predating 7C.1 cannot be backfilled without changing their meaning (per spec: no destructive backfill). New attempts always write non-NULL values.
- `IF NOT EXISTS` + additive columns → safe on existing data; no resets, truncations, or deletions.
- Applied and verified locally:

```
 question_text_snapshot  | text           |   |     |
 question_type_snapshot  | question_type  |   |     |
 marks_snapshot          | integer        |   |     |
```

---

### 5. Snapshot Schema (Data Model)

`attempt_questions` now carries the complete frozen question configuration for an attempt:

```
attempt_questions
├── attemptId
├── questionId                 (identity; FK to questions, unchanged)
├── sectionId                  (Phase 6C, unchanged)
├── questionOrder              (Phase 7B, unchanged)
├── optionOrder                (Phase 7C, unchanged)
├── questionTextSnapshot       (NEW: text)      — question.text at attempt start
├── questionTypeSnapshot       (NEW: question_type enum) — question.type at attempt start
├── marksSnapshot              (NEW: integer)   — question.marks at attempt start
├── optionsSnapshot            (Phase 7C)       — question.options at attempt start
└── correctAnswerSnapshot      (Phase 7C)       — question.correctAnswer at attempt start
```

All snapshot values are written server-side inside the `startOrResumeAttempt` transaction; clients never submit any snapshot field (verified by audit — `saveAnswer` only writes `selectedAnswer`/`timeSpent`).

---

### 6. Attempt-Start Behavior

In `startOrResumeAttempt` (`frontend/src/server/tests.ts`), the canonical-question fetch now also selects `questions.question`, `questions.questionType`, and `questions.marks`, and each `attempt_questions` row is inserted with:

```ts
questionTextSnapshot: q.question,
questionTypeSnapshot: q.questionType,
marksSnapshot: q.marks,
optionsSnapshot: rawOptions,
correctAnswerSnapshot: q.correctAnswer,
optionOrder,
```

The snapshot therefore represents the exact question configuration at the moment the attempt was created, including under both randomization toggles (optionOrder shuffled per question, question order shuffled per section).

---

### 7. Active Exam Behavior

`getAttemptExamState` (server, `frontend/src/server/tests.ts`) now resolves every content field from the attempt snapshot, preferring it over the live `questions` table:

```ts
question:     q.questionTextSnapshot ?? q.question,
questionType: q.questionTypeSnapshot ?? q.questionType,
marks:        q.marksSnapshot ?? q.marks,
options:      optionsSnapshot + optionOrder  (unchanged Phase 7C behavior)
```

- The `questions` table is still joined for identity/metadata (subject/topic/section names), but active attempt content comes from the snapshot.
- The student sees exactly what existed when the attempt started — after refresh, resume, multiple tabs, server restart, or Question Bank edits. (Verified: refresh returns byte-identical state; resume returns identical state; edits to text/type/marks/options/correctAnswer after start do not change the served state.)
- Answer-key secrecy is unchanged: `correctAnswer`, `correctAnswerSnapshot`, and `explanation` are still never selected for the active payload.

---

### 8. Grading Behavior

`gradeAttempt` (`frontend/src/server/grading.ts`):

- Per question: `const marks = q.marksSnapshot ?? q.marks;` and `const questionType = q.questionTypeSnapshot ?? q.questionType;`
- `marks` is used everywhere the old code used `questions.marks`:
  - `totalPossibleScore += marks`
  - correct answer → `+marks`
  - incorrect with negative marking → `-(marks × negativeMarkRate)` (round2)
  - subject/topic aggregation totals, earned marks, and `skillScores` insertions
- `questionType` selects the single-choice vs multiple-choice grading branch, so a later admin type change cannot reinterpret an already-saved answer.
- The Phase 7A formula is otherwise untouched: correct `+marksSnapshot`, incorrect `-(marksSnapshot × penaltyRate)`, unanswered `0`, normalized score clamped ≥ 0, accuracy = `correct / attempted × 100` (marks-independent).
- Negative-marking policy continues to come from the attempt's existing snapshot fields (`attempts.negative_marking_enabled` / `negative_mark_rate`, falling back to the test's live policy for legacy attempts).
- Grading remains idempotent: already-submitted attempts return early and are never regraded (verified).

**Verified with distinguishing test cases** (assertions that fail if live values were used):
- Score stays 50% when the live question marks are edited 4→8 on the correct question only (live marks would yield 67%).
- Negative-marking score stays 38% when the live marks of the incorrect question are edited 4→2 (live marks would yield 58%).
- Score stays 50% when the live question type is changed to multiple_choice and the live answer key changed (live data would yield 0%).

---

### 9. Option Randomization Compatibility (Phase 7C)

Preserved exactly:
- Stable synthetic identities (`opt_0`, `opt_1`, …) unchanged.
- `optionOrder` remains the per-attempt permutation; displayed options resolve from `optionsSnapshot + optionOrder`.
- Answers persist as stable identities; display letters (A/B/C/D) are never stored.
- `saveAnswer` validation of `opt_` identities against `optionOrder` unchanged.
- Audits: Phase 7C audit 34/34; 7C.1 combinations suite covers all option-randomization permutations with full snapshots.

---

### 10. Question Randomization Compatibility (Phase 7B)

Preserved exactly. All four combinations verified (7C.1 audit Suite 7):

1. Q: OFF / Opt: OFF — canonical order, canonical options, full snapshots ✓
2. Q: ON / Opt: OFF — shuffled questions, canonical options, full snapshots ✓
3. Q: OFF / Opt: ON — canonical questions, shuffled options, full snapshots ✓
4. Q: ON / Opt: ON — both shuffled, full snapshots ✓

Snapshots correspond to the exact questions assigned to the attempt; option ordering remains independent of question ordering (each `attempt_questions` row owns both). Phase 7B audit: 41/41.

---

### 11. Negative Marking Compatibility (Phase 7A)

Preserved exactly, with the single intended change that marks come from `marksSnapshot`. Phase 7A audit: 62/62. 7C.1 audit Suite 6 adds a distinguishing negative-marking case under option randomization:
- Q1 correct (+4), Q2 incorrect (−1 at 25% of 4) → raw 3.00 / 8 → normalized 38%, accuracy 50% — even after the live marks of Q2 are edited to 2 (live-marks grading would produce 58%).

---

### 12. Section Compatibility (Phase 6C)

Unchanged: `sectionId`, section ordering, question ordering, grouped navigator, and section result breakdown are untouched. The result page's section breakdown now computes earned/total marks from `marksSnapshot` (via the mapped review questions) so the breakdown stays consistent with the graded score even if live marks are later edited. Phase 6C audit: 52/52; 7C.1 audit Suite 8 verifies distinct sectionIds and snapshot content per section.

---

### 13. Historical Attempt Compatibility

Deliberately non-destructive; exact behavior by era:

| Attempt era | `attempt_questions` rows | New 7C.1 snapshot columns | Behavior |
|---|---|---|---|
| New (7C.1+) | yes, full snapshots | non-NULL | Fully immutable — snapshots drive display and grading |
| 7C-era | yes, optionOrder + optionsSnapshot + correctAnswerSnapshot | NULL | Text/type/marks fall back to **live** question values; options/order/answer behavior preserved from 7C snapshots (verified: options still served from optionsSnapshot+optionOrder; grading falls back to live marks) |
| Pre-7B | none | — | Full legacy path: `test_questions` + live question data, text-based answer matching (verified: grades correctly with text answer) |

No historical attempt is rewritten, regraded, or reinterpreted. The `??` fallback chain means a NULL snapshot column degrades to exactly the pre-7C.1 behavior for that attempt.

---

### 14. Security

- Snapshot values are created only server-side inside the attempt-start transaction; client `saveAnswer` writes only `selectedAnswer`/`timeSpent` and cannot touch any snapshot column (verified by audit).
- Active exam payload still strips `correctAnswer`, `correctAnswerSnapshot`, and `explanation`.
- `saveAnswer` still rejects injected option identities (`opt_999`) and questions not in the attempt.
- Student ownership checks, admin-only question/test mutation, answer validation, submitted-attempt immutability (gradeAttempt idempotency), and server-authoritative grading all preserved.

---

### 15. Tests and Exact Results

#### New audit: `frontend/src/test/phase-7c1-question-snapshot-audit.ts` — **63 PASSED, 0 FAILED**

```
==================================================
🛡️  NEXORA — PHASE 7C.1: QUESTION SNAPSHOT HARDENING AUDIT
==================================================
--- TEST SUITE 1: SNAPSHOT CREATION AT ATTEMPT START ---
  ✓ PASS: Attempt A created 2 attempt_questions rows
  ✓ PASS: questionTextSnapshot captures the question text at attempt start
  ✓ PASS: questionTypeSnapshot captures the question type at attempt start
  ✓ PASS: marksSnapshot captures the question marks at attempt start
  ✓ PASS: optionsSnapshot captures the canonical options at attempt start
  ✓ PASS: correctAnswerSnapshot captures the canonical correct answer at attempt start
  ✓ PASS: optionOrder is a valid 4-option permutation at attempt start
--- TEST SUITE 2: ACTIVE EXAM USES SNAPSHOTS ---
  ✓ PASS: Attempt A exam state is active
  ✓ PASS: Active exam question text comes from snapshot
  ✓ PASS: Active exam question type comes from snapshot
  ✓ PASS: Active exam marks come from snapshot
  ✓ PASS: Active exam options are { id, text } in persisted order
  ✓ PASS: SECURITY: correctAnswer and explanation hidden from active payload
  ✓ PASS: Refresh returns byte-identical exam state (frozen)
--- TEST SUITE 3: RESUME PERSISTENCE ---
  ✓ PASS: Resume returns isResumed: true
  ✓ PASS: Resume returns the same attemptId
  ✓ PASS: Resumed exam state is identical to the original (no reshuffle, no live reads)
--- TEST SUITE 4: QUESTION BANK EDIT AFTER START (BEFORE SUBMISSION) ---
  ✓ PASS: Question text edit cannot change the active exam (snapshot served)
  ✓ PASS: Question type edit cannot change the active exam (snapshot served)
  ✓ PASS: Marks edit cannot change the active exam (snapshot served)
  ✓ PASS: Options edit cannot change the active exam (optionsSnapshot served)
  ✓ PASS: Option ordering unchanged after Question Bank edit
  ✓ PASS: Attempt A submitted after grading
  ✓ PASS: Grading uses snapshot marks/type/answer: score 50% (got: 50)
  ✓ PASS: Accuracy unchanged by snapshots: 50% (got: 50)
--- TEST SUITE 5: QUESTION EDIT AFTER SUBMISSION ---
  ✓ PASS: Submitted attempt score remains 50% after post-submission question edit
  ✓ PASS: Submitted attempt status remains submitted
  ✓ PASS: gradeAttempt is idempotent on submitted attempts (no regrade)
  ✓ PASS: New attempt created after edit
  ✓ PASS: New attempt snapshots the current question text (start-time capture)
  ✓ PASS: New attempt snapshots the current marks (start-time capture)
  ✓ PASS: New attempt snapshots the current question type (start-time capture)
  ✓ PASS: New attempt snapshots the current correct answer (start-time capture)
--- TEST SUITE 6: NEGATIVE MARKING + SNAPSHOT MARKS ---
  ✓ PASS: Negative marking uses snapshot marks: +4 - 1 = 3/8 -> 38% (got: 38)
  ✓ PASS: Accuracy under negative marking unchanged: 50% (got: 50)
--- TEST SUITE 7: ALL FOUR COMBINATIONS (Phase 7B + 7C) ---
  ✓ PASS: Combination [OFF / OFF] initialized 2 attempt_questions rows
  ✓ PASS: Combination [OFF / OFF] captures full snapshots (text/type/marks/options/answer/order)
  ✓ PASS: Combination [OFF / OFF] preserves canonical optionOrder
  ✓ PASS: Combination [OFF / OFF] exam state serves snapshotted question text
  ✓ PASS: Combination [ON / OFF] initialized 2 attempt_questions rows
  ✓ PASS: Combination [ON / OFF] captures full snapshots (text/type/marks/options/answer/order)
  ✓ PASS: Combination [ON / OFF] preserves canonical optionOrder
  ✓ PASS: Combination [ON / OFF] exam state serves snapshotted question text
  ✓ PASS: Combination [OFF / ON] initialized 2 attempt_questions rows
  ✓ PASS: Combination [OFF / ON] captures full snapshots (text/type/marks/options/answer/order)
  ✓ PASS: Combination [OFF / ON] exam state serves snapshotted question text
  ✓ PASS: Combination [ON / ON] initialized 2 attempt_questions rows
  ✓ PASS: Combination [ON / ON] captures full snapshots (text/type/marks/options/answer/order)
  ✓ PASS: Combination [ON / ON] exam state serves snapshotted question text
--- TEST SUITE 8: SECTIONS PRESERVED ---
  ✓ PASS: Sectioned attempt created 2 rows
  ✓ PASS: Rows retain their distinct sectionIds (Phase 6C architecture preserved)
  ✓ PASS: Global questionOrder assigned across sections
  ✓ PASS: Exam state preserves both section identities
  ✓ PASS: Exam state serves snapshot content (text/type/marks) across sections
--- TEST SUITE 9: HISTORICAL ATTEMPT COMPATIBILITY ---
  ✓ PASS: Pre-7B legacy attempt (no attempt_questions) graded with text answer: 50% (got: 50)
  ✓ PASS: Historical NULL-snapshot attempt falls back to live question text (compat path)
  ✓ PASS: Historical NULL-snapshot attempt falls back to live marks (compat path)
  ✓ PASS: Historical attempt keeps 7C optionsSnapshot + optionOrder behavior (all 4 options present)
  ✓ PASS: Historical NULL-snapshot attempt grades with live marks fallback: 33% (got: 33)
--- TEST SUITE 10: SECURITY ---
  ✓ PASS: SECURITY: active payload strips correctAnswer and explanation
  ✓ PASS: Arbitrary injected option identity rejected
  ✓ PASS: Question not in attempt rejected
  ✓ PASS: Snapshot columns remain server-authored (never nulled/overwritten by client writes)
--- CLEANUP ---
Cleanup completed.
==================================================
AUDIT RESULTS: 63 PASSED, 0 FAILED
==================================================
```

#### Full regression sweep (executed after implementation)

| Suite | Result |
|---|---|
| Phase 7C.1 Question Snapshot Hardening | **63 PASSED, 0 FAILED** |
| Phase 7C Option Randomization | **34 PASSED, 0 FAILED** |
| Phase 7B Question Randomization | **41 PASSED, 0 FAILED** |
| Phase 7A Negative Marking | **62 PASSED, 0 FAILED** |
| Phase 6C Test Sections | **52 PASSED, 0 FAILED** |
| Phase 6B Duplicate Test | **41 PASSED, 0 FAILED** |
| Milestone 3 Integration | **61 PASSED, 0 FAILED** |
| Start Test Regression | **23 PASSED, 0 FAILED** |

No existing test was weakened, skipped, or deleted. The two intermediate audit failures during development were assertion bugs in the new test itself (order assumptions on randomized options, and reusing a mutated question as a pristine fixture) — fixed in the test, not by weakening implementation coverage.

---

### 16. TypeScript / ESLint / Build Results

- **TypeScript** (`npx tsc --noEmit`): **0 errors**.
- **ESLint** (`npm run lint`): **0 errors**, 58 warnings. All warnings are pre-existing `no-explicit-any` / unused-var warnings in test and admin files; the three new ones are `(q as any)` snapshot casts in `result/page.tsx` that follow that file's existing cast pattern (the file already used `as any` for `optionsSnapshot`/`correctAnswerSnapshot` before this change). None block the build.
- **Production build** (`npm run build`): **success** — all static + dynamic routes compiled cleanly.

---

### 17. Remaining Limitations

1. **Historical (pre-7C.1) attempts are not retroactively immutable for text/type/marks.** By design and per spec, their new snapshot columns are NULL and fall back to live question values. Only newly-created attempts receive full immutability. A future backfill would change the meaning of existing submitted attempts and was deliberately not performed.
2. **Question deletion still cascades** (`attempt_questions.question_id` FK `ON DELETE CASCADE`, pre-existing from Phase 6B-era schema): deleting a question from the bank removes its attempt rows, so the question disappears from exam state, grading input, and review for all attempts. Stored `attempts.score` survives; detail-level review is lost. This is outside the Phase 7C.1 scope (snapshots protect content edits, not row deletion) and remains a pre-existing limitation.
3. **`saveAnswer` accepts legacy plain-text submissions** (pre-7C behavior, intentionally preserved for compatibility): only `opt_`-prefixed identities are strictly validated against `optionOrder`. Grading still evaluates text answers correctly against the snapshot.
4. **ESLint warnings**: 58 warnings (0 errors), mostly `no-explicit-any` in audit/admin files, consistent with the codebase's existing style.

---

### 18. Final Status

| Acceptance criterion | Status |
|---|---|
| Every newly-created attempt has immutable question content snapshots (text, type, marks, options, correct answer, option order) | ✅ Verified (audit Suites 1, 7) |
| Active exams use snapshots | ✅ Verified (Suites 2, 4) |
| Grading uses snapshot marks | ✅ Verified (Suites 4, 6 — distinguishing mark-edit cases) |
| Question edits cannot alter active attempts | ✅ Verified (Suite 4 — text/type/marks/options/order) |
| Question edits cannot alter submitted results | ✅ Verified (Suite 5 — score unchanged, idempotent regrade) |
| Option randomization still works | ✅ Phase 7C audit 34/34 |
| Question randomization still works | ✅ Phase 7B audit 41/41 |
| Negative marking still works | ✅ Phase 7A audit 62/62 + 7C.1 Suite 6 |
| Sections still work | ✅ Phase 6C audit 52/52 + 7C.1 Suite 8 |
| Historical attempts remain compatible | ✅ Suite 9 (legacy + 7C-era NULL-snapshot paths) |
| No correct answers leak during active attempts | ✅ Suites 2, 10 |
| All regression suites pass | ✅ 8/8 suites green |
| TypeScript 0 errors | ✅ |
| ESLint 0 errors | ✅ |
| Production build succeeds | ✅ |

Phase 7C.1 is complete. The immutability gap identified in the Phase 7C report is closed for all newly-created attempts: every started attempt now carries a complete, server-authored snapshot of question text, type, marks, options, correct answer, and option ordering, and the active exam, grading, and result review all read from that snapshot.

---

PHASE 7C.1 HARDENING COMPLETE — ATTEMPT QUESTION SNAPSHOTS ARE IMMUTABLE.