# NEXORA — PHASE 7D IMPLEMENTATION REPORT
## Attempt Limits

---

### 1. Executive Summary

Phase 7D introduces configurable per-test attempt limits. A test may be configured with `attempt_limit` = NULL (unlimited, the default for all existing tests) or an integer 1–100 representing the maximum number of **submitted** attempts a student may have for that test.

The limit is enforced exclusively server-side in `startOrResumeAttempt` (`frontend/src/server/tests.ts`): a student's resumable active attempt is always resumed regardless of the limit; only when no active attempt exists does the server count `status = 'submitted'` attempts and refuse to create a new one once the limit is reached. The resume-check, count, and create are serialized per (user, test) under a transaction-scoped PostgreSQL advisory lock (`pg_advisory_xact_lock`), so concurrent START requests — multiple tabs, double-clicks, parallel POSTs — cannot bypass the limit.

Compatibility is preserved: NULL default keeps every existing test unlimited; historical attempts are never modified; scoring, negative marking, randomization, sections, readiness, and analytics formulas are untouched. The Phase 7D audit suite passes 66/66, all eight existing regression suites pass, TypeScript reports 0 errors, ESLint reports 0 errors, and the production build succeeds.

---

### 2. Files Changed

| File | Status | Description |
|---|---|---|
| `frontend/src/db/migrations/0006_phase_7d_attempt_limits.sql` | **Created** | Adds `tests.attempt_limit integer NULL` + CHECK constraint + composite index `attempts (user_id, test_id, status)` |
| `frontend/src/db/migrations/meta/_journal.json` | Modified | Registers migration index 6 |
| `frontend/src/db/schema.ts` | Modified | `tests.attemptLimit: integer("attempt_limit")` (nullable; NULL = unlimited) |
| `frontend/src/server/tests.ts` | Modified | `startOrResumeAttempt` reworked: advisory-lock serialization, resume-first, submitted-count enforcement, metadata (`attemptLimit`/`attemptsUsed`/`attemptsRemaining`); `duplicateTest` copies `attemptLimit` |
| `frontend/src/app/api/admin/tests/route.ts` | Modified | POST + PATCH accept and validate `attemptLimit` (null or integer 1–100) |
| `frontend/src/components/admin/test-builder.tsx` | Modified | "Attempt Limit" control under Assessment Parameters (empty = unlimited, validation, helper text) |
| `frontend/src/app/(protected)/tests/[id]/page.tsx` | Modified | "Unlimited attempts" / "Attempts: X / N" badge; passes `attemptLimitReached` to the start button |
| `frontend/src/components/tests/start-test-button.tsx` | Modified | Disabled "Attempt limit reached" state (server still enforces) |
| `frontend/src/test/phase-7d-attempt-limits-audit.ts` | **Created** | 14 suites / 66 assertions incl. real concurrency race |

No existing tests were weakened, skipped, or deleted.

---

### 3. Migration & Schema

`0006_phase_7d_attempt_limits.sql` (exact contents):

```sql
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "attempt_limit" integer;

ALTER TABLE "tests" DROP CONSTRAINT IF EXISTS "tests_attempt_limit_check";
ALTER TABLE "tests" ADD CONSTRAINT "tests_attempt_limit_check"
  CHECK ("attempt_limit" IS NULL OR "attempt_limit" >= 1);

CREATE INDEX IF NOT EXISTS "attempts_user_test_status_idx"
  ON "attempts" ("user_id", "test_id", "status");
```

- `tests.attempt_limit`: nullable integer. **NULL = unlimited**; `>= 1` = max submitted attempts. The DB CHECK rejects 0 and negatives (verified by audit).
- The composite index serves both the resumable-attempt lookup and the submitted-attempt count on every START.
- Migration is additive and nullable → **existing tests are unlimited**, no backfill, no data touched. Applied and verified locally (`\d tests`, `\d attempts`).
- drizzle: `attemptLimit: integer("attempt_limit")` on the `tests` table.

---

### 4. Attempt Lifecycle & Counting Semantics

- **Counting**: only `attempts` rows with `status = 'submitted'` consume the allowance. Manual submit, auto-submit on expiry, and the `getAttemptExamState` expiry path all converge on `submitted` (verified previously: the `expired` enum value is never written by any code), so exactly one counter governs every path. Active (`in_progress`) attempts never count and never block resume. No new attempt states were invented.
- **Lifecycle unchanged**: start → active (frozen 7C/7C.1 snapshots) → refresh/resume/multi-tab on the same attemptId → submit or auto-submit → `submitted` → new attempt only while `submitted < attempt_limit` (or unlimited).
- **Expiry**: unchanged timer logic; an expired attempt is auto-submitted and, being `submitted`, consumes one allowance (audit Suite 6 verifies limit 1 + expiry → denial).

---

### 5. Server Enforcement (startOrResumeAttempt)

The function is now a single transaction serialized per (user, test):

```
BEGIN
  SELECT pg_advisory_xact_lock(hashtext(userId || ':' || testId))
  1. Find resumable active attempt (in_progress, newest first)
       → active & not expired: RESUME (attemptLimit/attemptsUsed/attemptsRemaining returned)
       → active & expired:     gradeAttempt (auto-submit; consumes an attempt) then continue
  2. COUNT submitted attempts for (user, test)
  3. If attemptLimit != NULL AND count >= attemptLimit → throw "Attempt limit reached. …"
  4. Create attempts + attempt_questions (existing snapshot/randomization logic)
COMMIT  (advisory lock auto-released)
```

- The lock makes the check-then-create atomic: with limit 1 and two concurrent starts, exactly one attempt is created and the other resumes it (or is denied after submission) — verified by the audit's real `Promise.all` race (Suite 9).
- Resume is never blocked: the active-attempt branch returns before the limit check.
- `gradeAttempt` runs while the transaction holds the advisory lock; it commits independently on the global pool, which is safe (it never takes advisory locks; the count re-query inside the transaction sees its committed result).
- Response metadata: `{ attemptId, isResumed, attemptLimit, attemptsUsed, attemptsRemaining }` on both paths. `attemptsUsed` is always the server-computed submitted count.

---

### 6. Admin Configuration

- **Test Builder** (`test-builder.tsx`): "Attempt Limit" numeric input under Assessment Parameters; empty = Unlimited (badge shows "Unlimited"); helper text: *"Maximum number of attempts a student can submit for this test. Leave empty for unlimited."* Client validates: empty/null → unlimited; integer 1–100 → valid; 0, negatives, decimals, >100 → rejected with an error before submit.
- **Admin API** (`/api/admin/tests`): POST and PATCH parse `attemptLimit`; validation returns 400 unless null/"" or integer 1–100. PATCH accepts `attemptLimit: null` to convert a test back to unlimited. Admin-only authorization unchanged.
- **Admin edits** apply forward-only: the limit is read live at START. 3→1 denies future attempts once the student has ≥1 submitted (history untouched); 1→3 allows up to 3; 3→unlimited / unlimited→1 behave symmetrically. Active attempts remain resumable regardless of edits (audit Suite 12).
- **Draft/published**: drafts store and enforce the same way; publishing state does not change enforcement (audit Suite 13).

---

### 7. Student UI

- `/tests/[id]`: server-computed badge — "Unlimited attempts" when `attemptLimit` is NULL, or "Attempts: {submitted} / {limit}" when limited (both derived in the server component from `getTestDetails`, never from the client).
- Start button: "Resume Test" whenever an active attempt exists (unchanged, never disabled by the limit); when the limit is reached and no active attempt exists, the button is disabled and reads "Attempt limit reached". The server remains the authoritative enforcer — the disabled button is UX only.
- Attempt history panel unchanged.

---

### 8. Duplicate Test

`duplicateTest` copies `attemptLimit` alongside the other test-policy flags (like `randomizeQuestions`/`randomizeOptions`). It copies no attempts, answers, `attempt_questions`, student history, analytics, or readiness data (audit Suite 11 verifies: duplicate has `attemptLimit = 2` and zero attempt rows).

---

### 9. Historical Compatibility

- Existing tests: `attempt_limit` is NULL → unlimited → behavior byte-identical to before (audit Suite 2: 3 sequential submit→restart cycles all succeed).
- Historical attempts: never modified — no backfill, no deletion, no score/status changes, including across admin limit edits (audit Suite 12 verifies rows/statuses/scores identical before vs after edits).
- Readiness/analytics: `calculateReadiness` returns identical results before and after limit enforcement/denials (audit Suite 12); scoring formulas, negative marking, skill scores, weak-area logic, and analytics calculations are untouched.

---

### 10. Security

- Enforcement is keyed on `session.user.id` (via `startAttemptAction`); a client can never supply the userId, the count, or the remaining allowance.
- Verified in audit: independent allowances per student (user B starts while user A is at limit); cross-user attempt-state access denied; forged test ID rejected; repeated direct invocations cannot exceed the limit; concurrent starts cannot create a second attempt.
- Submitted attempts remain immutable; the limit path only ever prevents *creation* of a new attempt — it never deletes, resets, regrades, or alters existing attempts, answers, snapshots, or scores.

---

### 11. Concurrency Strategy

- **Mechanism**: `pg_advisory_xact_lock(hashtext(userId || ':' || testId))` inside the start transaction — transaction-scoped, auto-released at commit/rollback, cluster-wide (correct for multi-instance Next.js), zero table changes, no cross-user contention.
- **Verified race tests** (audit Suite 9):
  - limit 1, 0 submitted, two concurrent starts → both resolve to the **same** attemptId; exactly one `in_progress` row; exactly one attempt row total.
  - After submitting that attempt, two concurrent starts → **both** rejected; zero new attempts.

---

### 12. Timer / Expiry

Timer implementation untouched. Server-authoritative expiry in `getAttemptExamState` and on resume in `startOrResumeAttempt` still auto-submits; because auto-submission produces `status = 'submitted'`, it consumes an allowance under the canonical counting model (audit Suite 6).

---

### 13. Performance

- Per START: one advisory-lock acquisition + one indexed COUNT over the student's rows for that test (+ one extra COUNT on the resume path for metadata). Negligible at current scale.
- New composite index `attempts_user_test_status_idx (user_id, test_id, status)` serves both the resume lookup and the count; no additional indexes required.

---

### 14. Tests & Exact Results

#### New: `frontend/src/test/phase-7d-attempt-limits-audit.ts` — **66 PASSED, 0 FAILED**

```
==================================================
🔒 NEXORA — PHASE 7D: ATTEMPT LIMITS AUDIT
==================================================
--- TEST SUITE 1: SCHEMA, DEFAULTS & CHECK CONSTRAINT ---
  ✓ PASS: tests.attempt_limit defaults to NULL (unlimited)
  ✓ PASS: DB CHECK rejects attempt_limit = 0
  ✓ PASS: DB CHECK rejects negative attempt_limit
--- TEST SUITE 2: NULL = UNLIMITED (backward compatible) ---
  ✓ PASS: Unlimited test: attempt #1 created
  ✓ PASS: Unlimited test: attempt #2 created
  ✓ PASS: Unlimited test: attempt #3 created
  ✓ PASS: Unlimited test allows 3 sequential submitted attempts
--- TEST SUITE 3: LIMIT = 1 ---
  ✓ PASS: Limit 1: first attempt created
  ✓ PASS: start response reports attemptLimit = 1
  ✓ PASS: start response reports attemptsUsed = 0
  ✓ PASS: start response reports attemptsRemaining = 1
  ✓ PASS: Limit 1: second start after submission is denied
  ✓ PASS: Limit 1: only one submitted attempt exists after denial
  ✓ PASS: Limit 1: denial inserted NO new attempt row
--- TEST SUITE 4: LIMIT = 2 AND LIMIT = 3 ---
  ✓ PASS: Limit 2: attempt #1 created
  ✓ PASS: Limit 2: attempt #2 created
  ✓ PASS: Limit 2: third start after 2 submissions denied
  ✓ PASS: Limit 3: attempt #1 created
  ✓ PASS: Limit 3: attempt #2 created
  ✓ PASS: Limit 3: attempt #3 created
  ✓ PASS: Limit 3: fourth start after 3 submissions denied
--- TEST SUITE 5: ACTIVE ATTEMPT RESUME EXEMPTION ---
  ✓ PASS: Limit 1 with active attempt: START resumes (not denied)
  ✓ PASS: Resume returns the same attemptId
  ✓ PASS: Exactly one active attempt row remains after resume
  ✓ PASS: Resume response reports attemptLimit
  ✓ PASS: Resume response reports attemptsUsed = 0
--- TEST SUITE 6: EXPIRY AUTO-SUBMIT CONSUMES AN ATTEMPT ---
  ✓ PASS: Expired attempt auto-submitted
  ✓ PASS: Expired (now submitted) attempt consumed the single allowance -> denied
  ✓ PASS: Expiry produced exactly one submitted attempt
--- TEST SUITE 7: REFRESH ---
  ✓ PASS: Active exam state is not expired
  ✓ PASS: Refresh returns identical exam state
--- TEST SUITE 8: MULTIPLE TABS / CONCURRENT RESUME ---
  ✓ PASS: Two tabs converge on the same active attempt
  ✓ PASS: Multiple tabs never create a second active attempt
--- TEST SUITE 9: CONCURRENT START RACE (limit = 1) ---
  ✓ PASS: Two concurrent starts converge on a single attempt
  ✓ PASS: Concurrent start race: exactly ONE active attempt created
  ✓ PASS: Concurrent start race: zero submitted attempts
  ✓ PASS: Concurrent start race: exactly one attempt row total
  ✓ PASS: After limit consumed: both concurrent starts are denied
  ✓ PASS: After limit consumed: zero new attempts created by concurrent starts
--- TEST SUITE 10: OWNERSHIP, FORGED IDS & DIRECT BYPASS ---
  ✓ PASS: Student B has an independent allowance (A at limit, B can start)
  ✓ PASS: Forged attempt ownership: user A cannot read user B's attempt state
  ✓ PASS: Forged test ID rejected
  ✓ PASS: Repeated direct calls cannot bypass the limit (student B blocked)
--- TEST SUITE 11: DUPLICATE TEST ---
  ✓ PASS: Duplicate test copies attemptLimit = 2
  ✓ PASS: Duplicate test is a draft
  ✓ PASS: Duplicate test copies NO attempt history
--- TEST SUITE 12: ADMIN LIMIT EDITS ---
  ✓ PASS: Admin reduces limit below used count -> new attempt denied
  ✓ PASS: Admin increases limit -> new attempt allowed
  ✓ PASS: Increased limit response reports attemptsUsed = 2
  ✓ PASS: Increased limit response reports attemptsRemaining = 1
  ✓ PASS: Unlimited conversion -> new attempt allowed
  ✓ PASS: Admin limit edits NEVER modify historical attempts (rows, statuses, scores intact)
  ✓ PASS: Analytics/readiness unchanged by attempt-limit enforcement
--- TEST SUITE 13: PUBLISHED / DRAFT CONSISTENCY ---
  ✓ PASS: Draft tests enforce attempt limits identically
--- TEST SUITE 14: RANDOMIZATION COMBINATIONS WITH LIMITS ---
  ✓ PASS: Combo [OFF / OFF]: attempt created under limit 1  (+ exam state + enforcement)
  ✓ PASS: Combo [ON / OFF]: attempt created under limit 1  (+ exam state + enforcement)
  ✓ PASS: Combo [OFF / ON]: attempt created under limit 1  (+ exam state + enforcement)
  ✓ PASS: Combo [ON / ON]: attempt created under limit 1  (+ exam state + enforcement)
==================================================
AUDIT RESULTS: 66 PASSED, 0 FAILED
==================================================
```

#### Regression sweep (all executed after implementation)

| Suite | Result |
|---|---|
| Phase 7D Attempt Limits | **66 PASSED, 0 FAILED** |
| Phase 7C.1 Question Snapshot Hardening | **63 PASSED, 0 FAILED** |
| Phase 7C Option Randomization | **34 PASSED, 0 FAILED** |
| Phase 7B Question Randomization | **41 PASSED, 0 FAILED** |
| Phase 7A Negative Marking | **62 PASSED, 0 FAILED** |
| Phase 6C Test Sections | **52 PASSED, 0 FAILED** |
| Phase 6B Duplicate Test | **41 PASSED, 0 FAILED** |
| Milestone 3 Integration | **61 PASSED, 0 FAILED** |
| Start Test Regression | **23 PASSED, 0 FAILED** |

#### Quality gates

- **TypeScript** (`npx tsc --noEmit`): **0 errors**.
- **ESLint** (`npm run lint`): **0 errors**, 58 warnings (all pre-existing `no-explicit-any`/unused-vars in audit/admin files; the Phase 7D files add zero warnings).
- **Production build** (`npm run build`): **success** — all static + dynamic routes compiled cleanly.

---

### 15. Known Limitations

1. **Abandoned active attempts have no TTL.** A started-but-never-submitted attempt stays `in_progress` indefinitely; it does not consume the allowance (it isn't `submitted`), but it *is* the resumable attempt, so a student with a stale active attempt who hits START resumes it rather than starting fresh. This is the designed resume-first behavior; an "abandon/expire" reaper is future scope.
2. **`expired` enum value remains unused** (pre-existing): all finalized attempts are `submitted`. If a future phase starts writing `expired`, it must be treated as a finalized, allowance-consuming state.
3. **Draft tests can be started via direct server calls** (pre-existing): publish-gating is enforced in the UI, not in `startOrResumeAttempt`; limit enforcement is identical regardless of publish state (verified).
4. **Baseline assessments default to unlimited** (by design this phase): a one-shot baseline can be configured later by setting `attempt_limit = 1` without changing the underlying semantics.

---

### 16. Final Status

| Acceptance criterion | Status |
|---|---|
| NULL means unlimited | ✅ (audit Suite 2) |
| Submitted attempts counted correctly | ✅ (Suites 3, 4, 6) |
| Active attempts always resumable | ✅ (Suite 5 — never blocked by limit) |
| Limits enforced server-side | ✅ (Suites 3, 10 — repeated direct calls blocked) |
| Concurrent starts cannot bypass | ✅ (Suite 9 — advisory lock, real race) |
| Admin can configure limits | ✅ (builder + POST/PATCH validation) |
| Student sees authoritative attempt status | ✅ (server-computed badge + disabled state) |
| Duplicates inherit limit, not history | ✅ (Suite 11) |
| Historical attempts unchanged | ✅ (Suite 12) |
| Expiry behavior correct (consumes allowance) | ✅ (Suite 6) |
| Analytics/readiness unchanged | ✅ (Suite 12) |
| All required tests pass | ✅ 66/66 + 8/8 suites green |
| TypeScript 0 errors | ✅ |
| ESLint 0 errors | ✅ |
| Production build succeeds | ✅ |

Phase 7D is complete: attempt limits are enforced server-side and database-safely, resume remains exempt, NULL keeps every existing test unlimited, and no historical data or scoring behavior changed.

---

PHASE 7D IMPLEMENTATION COMPLETE — ATTEMPT LIMITS ENFORCED.