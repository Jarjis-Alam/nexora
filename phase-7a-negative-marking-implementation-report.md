# Phase 7A: Negative Marking — Implementation Report

> **Target Phase**: Phase 7A — Configurable Proportional Negative Marking  
> **Status**: Complete & Verified  
> **Date**: September 5, 2026

---

## 1. Executive Summary

Phase 7A has introduced **test-level proportional negative marking** to the Nexora assessment platform without destabilizing existing tests, attempt history, grading determinism, analytics, or student readiness calculations.

All locked constraints have been adhered to:
1. **Test-Scoped Configuration**: Configured on `tests` (`negativeMarkingEnabled`, `negativeMarkRate`).
2. **Exclusively Proportional**: Penalties are calculated as a fraction of each question's configured marks (`-(question.marks * negativeMarkRate)`). No fixed penalty mode.
3. **Unanswered is Invariably 0**: Unanswered questions award 0 marks and incur 0 penalty across all evaluation paths.
4. **Attempt Snapshotting**: Attempts snapshot the test's marking scheme upon initiation, guaranteeing complete immutability against subsequent test modifications.
5. **Score Normalization**: Raw scores can become negative; normalized attempt scores persist clamped at 0 (`Math.max(0, ...)`).
6. **Decoupled Accuracy**: Accuracy remains strictly `(correct / attempted) * 100`, entirely independent of negative marking.
7. **Zero Feature Creep**: No randomization, question pools, scheduling, or attempt limits were implemented.

---

## 2. Files Changed & Added

| File | Action | Purpose |
|---|---|---|
| `frontend/src/db/migrations/0002_phase_7a_negative_marking.sql` | **[NEW]** | PostgreSQL migration adding columns and check constraints. |
| `frontend/src/db/migrations/meta/_journal.json` | **[MODIFY]** | Registered migration entry 2. |
| `frontend/src/db/schema.ts` | **[MODIFY]** | Added typed `negativeMarkingEnabled` and `negativeMarkRate` to `tests` and `attempts`. |
| `frontend/src/lib/utils.ts` | **[MODIFY]** | Added `round2` and `formatScore` utilities. |
| `frontend/src/server/grading.ts` | **[MODIFY]** | Updated `gradeAttempt` to evaluate using attempt snapshot, apply proportional penalties, and clamp normalized score. |
| `frontend/src/server/tests.ts` | **[MODIFY]** | Snapshot marking config in `startOrResumeAttempt`, expose policy in `getAttemptExamState`, replicate config in `duplicateTest`. |
| `frontend/src/app/api/admin/tests/route.ts` | **[MODIFY]** | Added Zod/numeric rate validation and persistence in `POST` and `PATCH`. |
| `frontend/src/components/admin/test-builder.tsx` | **[MODIFY]** | Added Negative Marking toggle, quick presets (25%, 33%, 50%), and rate input with live explanation. |
| `frontend/src/components/admin/admin-test-preview.tsx` | **[MODIFY]** | Added marking policy support and badges to PreviewDraft. |
| `frontend/src/components/assessment/exam-engine.tsx` | **[MODIFY]** | Added question score badge displaying net penalty for incorrect answers. |
| `frontend/src/app/(protected)/tests/[id]/page.tsx` | **[MODIFY]** | Displayed negative marking badge and student advisory notice. |
| `frontend/src/app/(protected)/tests/[id]/result/page.tsx` | **[MODIFY]** | Displayed negative marking badge, penalty notes on incorrect answers, and net section marks. |
| `frontend/src/test/phase-7a-negative-marking-audit.ts` | **[NEW]** | Comprehensive Phase 7A test suite covering all 25 audit requirements. |

---

## 3. Database Migration Details

**Migration File**: `0002_phase_7a_negative_marking.sql`
```sql
ALTER TABLE "tests" ADD COLUMN "negative_marking_enabled" boolean DEFAULT false NOT NULL;
ALTER TABLE "tests" ADD COLUMN "negative_mark_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL;
ALTER TABLE "attempts" ADD COLUMN "negative_marking_enabled" boolean;
ALTER TABLE "attempts" ADD COLUMN "negative_mark_rate" numeric(5, 2);
ALTER TABLE "tests" ADD CONSTRAINT "tests_negative_mark_rate_range" CHECK ("negative_mark_rate" >= 0.00 AND "negative_mark_rate" <= 1.00);
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_negative_mark_rate_range" CHECK ("negative_mark_rate" IS NULL OR ("negative_mark_rate" >= 0.00 AND "negative_mark_rate" <= 1.00));
```

- **Default values**: `false` and `0.00` ensure all pre-existing tests remain completely identical in behavior.
- **Nullability**: `attempts` columns are nullable to support existing historical attempts without data mutation.
- **Range Constraints**: Checked in SQL to restrict rates to `[0.00, 1.00]`.

---

## 4. Authoritative Grading Changes

In `src/server/grading.ts`:
1. **Config Resolution**:
   ```typescript
   const isNegativeMarkingActive = attempt.negativeMarkingEnabled ?? test.negativeMarkingEnabled ?? false;
   const penaltyRate = isNegativeMarkingActive ? Number(attempt.negativeMarkRate ?? test.negativeMarkRate ?? 0) : 0;
   ```
2. **Question Evaluation Loop**:
   - **Correct Answer**: `totalScore = round2(totalScore + q.marks)`, `correctCount++`.
   - **Incorrect Answer**:
     - If negative marking is active:
       ```typescript
       const penalty = round2(q.marks * penaltyRate);
       totalScore = round2(totalScore - penalty);
       ```
     - If negative marking is disabled: deduction is `0`.
   - **Unanswered (Always)**: Awarded `0` marks and `0` deduction; excluded from `totalAnsweredCount`.
3. **Score Normalization & Clamping**:
   ```typescript
   const rawScore = totalScore;
   const normalizedScore = totalPossibleScore > 0 ? Math.max(0, Math.round((rawScore / totalPossibleScore) * 100)) : 0;
   const accuracy = totalAnsweredCount > 0 ? Math.round((correctCount / totalAnsweredCount) * 100) : 0;
   ```
4. **Skill Scores**: Accuracies in `skillScores` reflect correctness ratios (`(correct / attempted) * 100`) bounded in `[0, 100]`.

---

## 5. Attempt Snapshot Behavior

In `src/server/tests.ts` (`startOrResumeAttempt`):
- When a student begins an attempt, `test.negativeMarkingEnabled` and `test.negativeMarkRate` are copied into `attempts`.
- If an admin edits the parent test's marking parameters while an attempt is in progress or after it is finished, the attempt remains bound to its original snapshot.
- Legacy attempts with `NULL` snapshot values fall back to `negativeMarkingEnabled = false` and `penaltyRate = 0.00`.

---

## 6. Admin Test Builder & Preview

- **Test Builder** (`src/components/admin/test-builder.tsx`):
  - Toggle switch for Negative Marking (Default: OFF).
  - Quick presets: `1/4 Penalty (25%)`, `1/3 Penalty (~33%)`, `1/2 Penalty (50%)`.
  - Percentage input box with live dynamic feedback: *"Incorrect answers deduct 25% of the question's marks (e.g. -0.50 on a 2-mark question). Unanswered questions always receive 0 marks."*
- **Admin Test Preview** (`src/components/admin/admin-test-preview.tsx`):
  - `PreviewDraft` includes `negativeMarkingEnabled` and `negativeMarkRate`.
  - Preview header and question metadata cards display active negative marking parameters.
  - Preview remains 100% client-side with no database persistence.

---

## 7. Duplicate Test Integration

In `src/server/tests.ts` (`duplicateTest`):
- `negativeMarkingEnabled` and `negativeMarkRate` are copied from the source test to the duplicated test within the atomic database transaction.
- Duplicate remains `isPublished: false` (Draft).
- Source test and attempt history remain untouched.

---

## 8. Results Page & Sections

- **Results Page** (`src/app/(protected)/tests/[id]/result/page.tsx`):
  - Displays a banner when negative marking was active: *"Negative Marking Applied: -25% on incorrect answers (Unanswered: 0)"*.
  - Incorrect stat card indicates the penalty rate applied.
  - Section Performance cards calculate net earned marks after deductions:
    $$\text{secEarnedMarks} = \max\left(0, \text{round2}\left(\sum_{q \in \text{sec}} \text{earned}_q\right)\right)$$
  - Renders decimal scores cleanly using `formatScore`.

---

## 9. Analytics & Readiness Engine Compatibility

- **Accuracy**: Retains pure correctness semantics (`correct / attempted * 100`).
- **Score**: Reflects net marks after deductions.
- **Readiness Engine** (`src/server/readiness.ts`): Receives normalized attempt scores bounded in `[0, 100]` and `skillScores.accuracy` bounded in `[0, 100]`. Zero formula modifications required.

---

## 10. Security & Input Sanitization

- **RBAC**: Admin check (`isAdmin === true`) enforced on `POST /api/admin/tests` and `PATCH`.
- **Validation**: Enforces `rate >= 0.00 && rate <= 1.00`, rejecting negative inputs, non-numbers, NaN, or Infinity.
- **Client Secrecy**: Active exam payloads never leak answer keys (`correctAnswer`, `isCorrect`). Students only receive safe policy metadata (`markingPolicy`).

---

## 11. Verification Results

### A. New Phase 7A Test Suite (`src/test/phase-7a-negative-marking-audit.ts`)
```
==================================================
🎯 NEXORA — PHASE 7A: NEGATIVE MARKING COMPREHENSIVE AUDIT
==================================================
62 PASSED, 0 FAILED
- Negative marking OFF verified (+marks, 0 for wrong)
- Negative marking ON verified (+marks, -penalty for wrong)
- All correct, all incorrect, all unanswered verified
- Mixed answers (correct + incorrect + unanswered) verified
- Decimal penalties (0.25, 0.33) verified
- Different question marks (1, 2, 4 marks) verified
- Raw score below zero and clamped normalized score verified
- Accuracy decoupling verified
- Attempt snapshot immutability verified
- Editing test after attempt start verified
- Legacy attempts with NULL snapshot verified
- Multi-section net calculations verified
- Preview contract verified
- Duplicate test copying verified
- Admin/Student authorization verified
- Database CHECK constraints verified
- Decimal precision utilities (round2, formatScore) verified
- Double submission idempotency verified
- Timer expiration auto-submit verified
- Pre-existing tests regression verified
==================================================
```

### B. Existing Regression Suites
- **Milestone 3 Integration Audit** (`src/test/integration-audit.ts`): **61 PASSED, 0 FAILED**
- **Phase 6C Sections Audit** (`src/test/phase-6c-sections-audit.ts`): **52 PASSED, 0 FAILED**
- **Duplicate Test Audit** (`src/test/duplicate-test-audit.ts`): **41 PASSED, 0 FAILED**

### C. Build, Lint & Typecheck
- **TypeScript**: `npx tsc --noEmit` → **0 errors**
- **ESLint**: `npm run lint` → **0 errors**
- **Next.js Production Build**: `npm run build` → **Compiled successfully in 1064ms (20/20 routes dynamic/static)**

---

## 12. Scope Confirmation

No code or schema was added for:
- Fixed/absolute penalties
- Unanswered penalties
- Section-specific marking configuration
- Phase 7B (Question Randomization)
- Phase 7C (Option Randomization)
- Phase 7D (Attempt Limits)
- Phase 7F (Question Pools)

---

PHASE 7A IMPLEMENTATION COMPLETE — NEGATIVE MARKING ENABLED WITH PROPORTIONAL TEST-LEVEL PENALTIES.
