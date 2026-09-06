# Phase 7A: Negative Marking — Architecture & Grading Audit Plan

> **Scope**: Audit & Architecture Design Only (Refined per User Specification)  
> **Target Feature**: Test-Level Proportional Negative Marking Only (Unanswered Always 0)  
> **Status**: REFINED ARCHITECTURAL PLAN (NO CODE IMPLEMENTATION APPLIED)

---

## Executive Summary

Nexora currently implements a purely additive grading model: correct answers award the positive marks configured on each question record (`questions.marks`), while incorrect and unanswered questions award `0` marks.

Per the refined specification:
1. **Exclusively Proportional**: Negative marking is defined strictly as a proportional multiplier/fraction of the question's point value (e.g. `0.25` for 1/4th penalty, `0.33` for 1/3rd penalty, `0.50` for 1/2 penalty). Fixed penalty mode is removed.
2. **Unanswered is Invariably 0**: Unanswered questions never incur any deduction or marks under any circumstances. No configurable unanswered penalty.
3. **Test-Scoped Configuration**: Defined at the test level (`tests` table) with attempt snapshotting for historical reproducibility.
4. **Zero Regressions**: No disturbance to existing attempts, readiness calculations, question pool architecture, or Phase 6A/6B/6C features.

---

## A. Current Grading Architecture

### Core Source Files Audited
- `src/server/grading.ts` (`gradeAttempt`)
- `src/server/tests.ts` (`getTestDetails`, `startOrResumeAttempt`, `getAttemptExamState`, `saveAnswer`, `duplicateTest`)
- `src/db/schema.ts` (`tests`, `testSections`, `testQuestions`, `questions`, `attempts`, `answers`, `skillScores`)
- `src/server/analytics.ts` (`getAnalyticsData`)
- `src/server/readiness.ts` (`calculateReadiness`, `detectWeakAreas`)
- `src/app/(protected)/tests/[id]/page.tsx` (Student Test Detail)
- `src/app/(protected)/tests/[id]/result/page.tsx` (Assessment Results)
- `src/components/admin/test-builder.tsx` (Admin Test Builder)
- `src/components/admin/admin-test-preview.tsx` (Phase 6A Preview)
- `src/components/assessment/exam-engine.tsx` (Student Active Exam Engine)

### Component Roles
| Component | Current Responsibility |
|---|---|
| `questions.marks` | Integer (`default 2`), defines base point value per question. |
| `tests.totalMarks` | Integer, represents sum of all question marks in test. |
| `test_questions` | Join table `(test_id, question_id, section_id, question_order)`. Contains **no** marks. |
| `answers.selectedAnswer` | `jsonb` storing selected option(s). `null` or missing indicates unanswered. |
| `answers.isCorrect` | `boolean | null`. Populated **only** upon server-side submission in `gradeAttempt`. |
| `attempts.score` | `real`, stores normalized percentage score (`0..100`). |
| `attempts.accuracy` | `real`, stores `(correctCount / totalAnsweredCount) * 100`. |
| `skillScores` | Stores subject and topic accuracy percentages and point totals. |

---

## B. Current Score Flow

```
Student selects option in ExamEngine
        ↓
saveAnswerAction(attemptId, questionId, selectedAnswer, timeSpent)
        ↓
INSERT/UPDATE into answers table (isCorrect remains NULL)
        ↓
Student clicks "Finish Exam" OR authoritative timer hits 0:00
        ↓
submitTestAttemptAction(attemptId) → gradeAttempt(attemptId, userId)
        ↓
Load questions & correct answers (testQuestions ⋈ questions)
        ↓
Compare student selectedAnswer vs correctAnswer:
  - If match: totalScore += q.marks, correctCount++
  - If mismatch: isCorrect = false, NO mark deduction
  - If unanswered (null): skipped, NO mark deduction (earned = 0)
        ↓
Calculate normalized metrics:
  - normalizedScore = Math.round((totalScore / totalPossibleScore) * 100)
  - accuracy = Math.round((correctCount / totalAnsweredCount) * 100)
        ↓
UPDATE attempts SET score = normalizedScore, accuracy = accuracy, status = 'submitted'
        ↓
INSERT into skillScores (subject and topic point totals & accuracies)
        ↓
Result Page renders attempt.score (/100), accuracy %, and section earned/total marks
        ↓
Analytics & Readiness consume attempts.score and skillScores.accuracy
```

---

## C. Recommended Data Model (Streamlined)

Following user directive:
- **No fixed penalty mode** (removed `negativeMarkingType`)
- **No configurable unanswered penalty** (removed `unansweredMarkRate`; unanswered is always `0`)
- **Only test-level proportional negative marking**

### Schema Definition on `tests`
```typescript
// Additions to tests table in src/db/schema.ts
negativeMarkingEnabled: boolean("negative_marking_enabled").notNull().default(false),
negativeMarkRate: numeric("negative_mark_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
```

#### Field Semantics
- **`negativeMarkingEnabled`** (`boolean`): Master switch for the test. Default `false` guarantees all existing tests remain 100% behaviorally identical.
- **`negativeMarkRate`** (`numeric(5,2)`): Proportional penalty rate (e.g. `0.25` for 1/4th penalty, `0.33` for 1/3rd penalty, `0.50` for 1/2 penalty). Stored as an unsigned positive rate in `[0.00, 1.00]`.

---

## D. Decimal Precision Strategy

### The Floating-Point Problem
In JavaScript binary floating-point representation:
```javascript
1.0 - 0.25 - 0.25 - 0.25 = 0.25000000000000006
3 * -0.33 = -0.9900000000000001
```
Without strict precision handling, database stores and UI displays would produce values like `7.2499999999 / 10`.

### Precision Architecture
1. **Database Layer**:
   - `tests.negativeMarkRate`: PostgreSQL `numeric(5, 2)` (exact base-10 decimal).
   - `attempts.negativeMarkRate`: PostgreSQL `numeric(5, 2)`.
2. **Domain/Grading Layer (`src/server/grading.ts`)**:
   - Compute penalties with standard rounding utility:
     ```typescript
     function round2(val: number): number {
       return Math.round((val + Number.EPSILON) * 100) / 100;
     }
     ```
3. **UI Display Utility (`src/lib/utils.ts`)**:
   - `formatScore(score: number): string`:
     - Clean integers: `8` → `"8"`
     - Decimals: `7.25` → `"7.25"`
     - Never render trailing float noise.

---

## E. Recommended Marking Semantics

### Proportional Marking Rules
All question mark weights originate from `questions.marks` ($M_i$).
When `negativeMarkingEnabled` is `true`, an incorrect answer on question $i$ deducts:
$$\text{Penalty}_i = \text{round2}(M_i \times \text{negativeMarkRate})$$

#### Examples with `negativeMarkRate = 0.25` (1/4th penalty):
- **1-mark question**:
  - Correct: `+1.00`
  - Incorrect: `-0.25`
  - Unanswered: `0.00`
- **2-mark question**:
  - Correct: `+2.00`
  - Incorrect: `-0.50`
  - Unanswered: `0.00`
- **4-mark question**:
  - Correct: `+4.00`
  - Incorrect: `-1.00`
  - Unanswered: `0.00`

### Exact Grading Formula
For each question $i$ with marks $M_i$:
$$
\text{Earned}_i = \begin{cases}
+ M_i & \text{if answered correctly} \\
- \text{round2}(M_i \times \text{negativeMarkRate}) & \text{if answered incorrectly and negativeMarkingEnabled} \\
0 & \text{if answered incorrectly and NOT negativeMarkingEnabled} \\
0 & \text{if unanswered (ALWAYS)}
\end{cases}
$$

Total Raw Score:
$$
\text{RawScore} = \sum_{i=1}^{N} \text{Earned}_i
$$

### Score Clamping (Floor Behavior)
- **Raw Score**: Can mathematically fall below zero (e.g. 1 correct out of 10 with 0.25 penalty produces $1 - 2.25 = -1.25$).
- **Normalized Attempt Score**: Clamped at zero:
  $$\text{normalizedScore} = \max\left(0, \text{round}\left(\frac{\text{RawScore}}{\text{TotalPossibleScore}} \times 100\right)\right)$$
- **Accuracy**: Strictly decoupled from marks:
  $$\text{accuracy} = \frac{\text{correctCount}}{\text{totalAnsweredCount}} \times 100$$
  *(If `totalAnsweredCount === 0`, accuracy is `0`)*

---

## F. Attempt Snapshot Strategy (Immutability)

### The Invariant
Once a student starts an attempt, the marking parameters for that attempt are **frozen**. Subsequent edits to the parent test by an admin will not alter active or historical attempts.

### Schema Definition on `attempts`
```typescript
// Snapshot columns on attempts table in src/db/schema.ts
negativeMarkingEnabled: boolean("negative_marking_enabled"),
negativeMarkRate: numeric("negative_mark_rate", { precision: 5, scale: 2 }),
```

- When `startOrResumeAttempt` initiates a new attempt, it copies the parent test's `negativeMarkingEnabled` and `negativeMarkRate` into the attempt record.
- When `gradeAttempt` executes, it evaluates using the attempt's snapshotted values (falling back to parent test if null for legacy attempts).

---

## G. Historical Compatibility

1. **Existing Tests**: Default `negativeMarkingEnabled = false`, `negativeMarkRate = 0.00`.
2. **Existing Attempts**:
   - `attempts.negativeMarkingEnabled = null` (evaluated as `false`).
   - Already-stored `attempts.score`, `attempts.accuracy`, and `skillScores` are permanent and untouched.
3. **Legacy Fallback Logic**:
   ```typescript
   const isNegativeMarkingActive = attempt.negativeMarkingEnabled ?? test.negativeMarkingEnabled ?? false;
   const penaltyRate = Number(attempt.negativeMarkRate ?? test.negativeMarkRate ?? 0);
   ```

---

## H. Admin UI Changes (Test Builder)

### Location
In `src/components/admin/test-builder.tsx`, within the `Assessment Parameters` card:

```
─────────────────────────────────────────────────────────────────
NEGATIVE MARKING
─────────────────────────────────────────────────────────────────
[ Toggle: Negative Marking (ON / OFF) ]

When ON:
Quick Presets:
  [ 1/4 (-25%) ]   [ 1/3 (-33%) ]   [ 1/2 (-50%) ]   [ Custom ]

Penalty Rate (% of question marks):
  [ 25 ] %   → Incorrect answers deduct 25% of question marks
               (e.g., -0.50 on a 2-mark question)

* Unanswered questions always receive 0 marks.
─────────────────────────────────────────────────────────────────
```

### Safety & UX Principles
- Admins enter **positive rate values** (e.g. `25%` or `0.25`).
- The UI displays the signed deduction dynamically: *"Incorrect answers deduct 0.25 × question marks"*.
- Eliminates double-negative admin entry errors.

---

## I. API & Server Changes

### 1. `POST /api/admin/tests`
Validation schema:
```typescript
negativeMarkingEnabled: z.boolean().optional().default(false),
negativeMarkRate: z.number().min(0).max(1).optional().default(0),
```
Transactional insert writes these fields directly into `tests`.

### 2. `src/server/grading.ts`
In `gradeAttempt`:
```typescript
const isNegativeMarkingActive = attempt.negativeMarkingEnabled ?? test.negativeMarkingEnabled ?? false;
const penaltyRate = isNegativeMarkingActive ? Number(attempt.negativeMarkRate ?? test.negativeMarkRate ?? 0) : 0;

for (const q of questionList) {
  const ans = answersMap.get(q.id);
  const hasAnswered = ans && ans.selectedAnswer !== null && ans.selectedAnswer !== undefined;

  if (!hasAnswered) {
    // Unanswered questions ALWAYS award 0 marks and incur 0 penalty
    continue;
  }

  totalAnsweredCount += 1;
  const isCorrect = evaluateAnswer(ans.selectedAnswer, q.correctAnswer, q.questionType);

  if (isCorrect) {
    totalScore += q.marks;
    correctCount += 1;
    subjectAgg[q.subjectId].earned += q.marks;
    topicAgg[q.topicId].earned += q.marks;
  } else {
    incorrectCount += 1;
    if (isNegativeMarkingActive && penaltyRate > 0) {
      const penalty = round2(q.marks * penaltyRate);
      totalScore -= penalty;
      subjectAgg[q.subjectId].earned -= penalty;
      topicAgg[q.topicId].earned -= penalty;
    }
  }
}

// Normalized score clamped at 0
const normalizedScore = totalPossibleScore > 0 ? Math.max(0, Math.round((totalScore / totalPossibleScore) * 100)) : 0;
const accuracy = totalAnsweredCount > 0 ? Math.round((correctCount / totalAnsweredCount) * 100) : 0;
```

---

## J. Result Page Changes

In `src/app/(protected)/tests/[id]/result/page.tsx`:
1. **Marking Badge**: If negative marking was active, display badge:
   `Negative Marking: -25% on wrong answers | 0 on unanswered`
2. **Stat Cards**:
   - `Correct`: `8 / 10` (`+16.00 marks`)
   - `Incorrect`: `2 / 10` (`-1.00 mark penalty`)
   - `Unanswered`: `0 / 10` (`0.00 marks`)
3. **Section Performance Card**:
   - Section earned marks reflect penalties incurred on questions in that section.
   - Section accuracy remains pure correctness ratio.

---

## K. Analytics Implications

- **Accuracy**: Formula remains `correctCount / totalAnsweredCount * 100`. It measures correctness strictly and is not diluted by mark penalties.
- **Average Score**: Calculated from `attempts.score`, accurately reflecting penalty impact across cohorts.
- **Difficulty Performance**: Accuracy-based (`correct / attempted * 100`).
- **Topic Performance**: Accuracy-based.

---

## L. Readiness Implications

In `src/server/readiness.ts`:
- Readiness consumes `skillScores.accuracy` (70% weight) and `attempts.score` (15% weight).
- Because `normalizedScore` is clamped at `0`, negative marking penalizes blind guessing naturally without breaking readiness calculation boundaries (`0..100`).
- **Zero modification** required for `READINESS_WEIGHTS` or readiness tier thresholds.

---

## M. Section Implications (Phase 6C Integration)

- Negative marking is uniform across sections within a test.
- Section calculations in results:
  $$\text{SectionEarned} = \max\left(0, \sum_{q \in \text{Sec}} \text{Earned}_q\right)$$
- Section total marks remain the sum of question points in that section.
- Section accuracy remains `(correct in section / answered in section) * 100`.

---

## N. Preview Implications (Phase 6A Integration)

- `PreviewDraft` receives:
  ```typescript
  negativeMarkingEnabled?: boolean;
  negativeMarkRate?: number;
  ```
- Preview Question Canvas displays a notification:
  `Marking Scheme: +Marks for Correct | -25% for Incorrect | 0 for Unanswered`
- Preview remains strictly local (`sessionStorage` only). No attempt or answer database records are created.

---

## O. Duplicate Test Implications (Phase 6B Integration)

In `duplicateTest` (`src/server/tests.ts`):
- Copy `negativeMarkingEnabled` and `negativeMarkRate` from the source test to the duplicated test within the existing transaction.
- Duplicate remains `isPublished = false` (Draft).
- Source test remains completely unchanged.

---

## P. Migration Strategy

### Proposed Migration: `0002_phase_7a_negative_marking.sql`
```sql
-- Phase 7A: Negative Marking Migration
ALTER TABLE tests ADD COLUMN negative_marking_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE tests ADD COLUMN negative_mark_rate numeric(5, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE attempts ADD COLUMN negative_marking_enabled boolean;
ALTER TABLE attempts ADD COLUMN negative_mark_rate numeric(5, 2);
```
- Completely backward-compatible.
- Defaults guarantee existing tests and attempts experience zero behavioral change.

---

## Q. Security Strategy

- **Authorization**: Only users with `isAdmin === true` can configure negative marking in `POST /api/admin/tests`.
- **Input Sanitization**: Zod enforces `negativeMarkRate >= 0` and `<= 1.00`, rejecting negative inputs, non-numbers, NaN, or Infinity.
- **Client Secrecy**: Active exams never receive answer keys (`correctAnswer`, `isCorrect`). Students only receive policy metadata (`negativeMarkingEnabled`, `negativeMarkRate`).

---

## R. Comprehensive Test Plan

### Database & Schema Tests
1. `tests` table contains `negative_marking_enabled` and `negative_mark_rate` with proper defaults.
2. `attempts` table contains snapshot columns.
3. Existing tests preserved with `negative_marking_enabled = false`.
4. Existing attempts preserved with original scores.

### Grading Engine Tests
5. Test with negative marking OFF grades normally (+marks, 0 for wrong, 0 for unanswered).
6. Test with negative marking ON deducts exact proportional penalty on incorrect answers.
7. Unanswered questions ALWAYS award 0 marks and 0 deduction.
8. Questions of varying point values (e.g. 1 mark vs 2 marks) deduct proportional penalties (`-0.25` vs `-0.50`).
9. All incorrect answers result in raw negative score clamped to 0 for normalized score.
10. Precision tests with repeating decimals (e.g. 1/3rd penalty: `0.33`) produce clean rounded values.

### Immutability & Duplication Tests
11. Attempt snapshots parent test's marking scheme upon start.
12. Modifying test marking scheme does not alter in-progress or completed attempts.
13. `duplicateTest` accurately replicates marking configuration to draft copy.

### Admin & Security Tests
14. Admin can create test with negative marking.
15. Non-admin / student cannot create or modify marking configuration.
16. Out-of-bounds rates (`rate < 0` or `rate > 1`) are rejected by validation.

### Regression Tests
17. Phase 6A Preview displays marking rules in draft mode.
18. Phase 6B Duplicate Test preserves marking scheme.
19. Phase 6C Sections breakdown correctly partitions penalties.
20. Milestone 3 integration audit passes without regressions.

---

## S. Recommended Implementation Sequence

1. **Step 1: Database Migration**: Create and run `0002_phase_7a_negative_marking.sql`.
2. **Step 2: Schema Update**: Update `src/db/schema.ts` to export new fields on `tests` and `attempts`.
3. **Step 3: Server Domain & Snapshot**: Update `startOrResumeAttempt` in `src/server/tests.ts` to snapshot marking configuration.
4. **Step 4: Grading Logic**: Upgrade `gradeAttempt` in `src/server/grading.ts` to apply proportional penalties with unanswered always `0`.
5. **Step 5: Admin API & Validation**: Update `POST /api/admin/tests` to accept and validate `negativeMarkingEnabled` and `negativeMarkRate`.
6. **Step 6: Test Duplication**: Update `duplicateTest` in `src/server/tests.ts` to replicate marking configuration.
7. **Step 7: Admin UI**: Enhance `TestBuilder` (`test-builder.tsx`) with the Proportional Marking Scheme toggle and presets.
8. **Step 8: Student UI**: Update student test details and exam instructions with marking rules.
9. **Step 9: Result Page**: Update `result/page.tsx` to display deductions and net section marks.
10. **Step 10: Full Regression Testing**: Execute test suite, typecheck, lint, and production build.

---

## T. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Floating-point display bugs (`7.249999999`) | Enforce PostgreSQL `numeric(5,2)` and JavaScript `round2` precision utility before persistence. |
| Student scores dropping below zero breaking UI and readiness | Raw score tracks exact negative points, but normalized score percentage is strictly clamped at 0. |
| Historical test score changes upon re-grading | Attempt snapshots marking scheme at attempt creation; legacy attempts fallback to no penalties. |
| Confusion between accuracy and score | Accuracy remains strictly correctness-based (`correct / answered`); score reflects net marks. |
| Admin entering negative penalty (`-0.25`) causing double negation | UI accepts positive rate `25%` or `0.25`; server schema enforces unsigned positive values and applies minus sign internally. |
| Unanswered questions mistakenly receiving penalties | Unanswered questions are hardcoded to award `0` points and `0` penalty across all grading paths. |
