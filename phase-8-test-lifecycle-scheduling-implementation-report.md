# Phase 8: Test Lifecycle & Availability Scheduling — Implementation Report

**Nexora — “Your Operating System for Placements”**  
**Phase:** Phase 8 (Test Lifecycle & Availability Scheduling)  
**Status:** COMPLETE & VERIFIED  

---

## 1. What Changed

Prior to Phase 8, assessment availability in Nexora relied solely on a binary boolean flag (`isPublished`). This model presented architectural limitations and a critical security gap: `isPublished` was filtered in `getPublishedTests()`, but neither `getTestDetails()` nor `startOrResumeAttempt()` enforced publication server-side. Consequently, any student who knew or discovered a test UUID could view or initiate attempts on unreleased/draft tests.

Phase 8 introduces a comprehensive, database-backed lifecycle and availability scheduling engine:
- **Authoritative 4-State Lifecycle Model:** Replaced binary publication with `draft`, `published`, `closed`, and `archived` states.
- **Dynamic Derived Availability:** Query-time server evaluation producing 5 effective availability states: `draft`, `scheduled`, `active`, `closed`, and `archived`.
- **Absolute Timezone-Aware Scheduling:** Absolute UTC timestamps via PostgreSQL `timestamptz` with IANA timezone strings (`schedule_timezone`), enforcing a half-open window `[scheduledStartAt, scheduledEndAt)`.
- **Authoritative Server Security Guards:** Completely resolved the security gap by validating lifecycle status in `getTestDetails()`, `startOrResumeAttempt()`, and administrative endpoints.
- **Active In-Flight Continuity:** Ensured that students with ongoing, in-progress attempts can resume and complete their exams within their allotted duration timer even if the test closes or its schedule window expires.
- **Admin Lifecycle Controls & Test Builder Integration:** Added UI and server action controls for lifecycle state transitions, availability scheduling, and timezone selection.

---

## 2. Schema & Migration

### Migration Details
- **File:** `frontend/src/db/migrations/0009_phase_8_test_lifecycle_scheduling.sql`
- **Journal Index:** `9` in `frontend/src/db/migrations/meta/_journal.json`

### Database Changes
1. **Enum Type:**
   ```sql
   CREATE TYPE "public"."test_status" AS ENUM('draft', 'published', 'closed', 'archived');
   ```
2. **Table Alterations on `tests`:**
   - `status`: `test_status` NOT NULL DEFAULT `'draft'`
   - `scheduled_start_at`: `timestamptz` NULL
   - `scheduled_end_at`: `timestamptz` NULL
   - `schedule_timezone`: `varchar(100)` NULL
3. **CHECK Constraint:**
   ```sql
   ALTER TABLE "tests" ADD CONSTRAINT "tests_schedule_range_check"
     CHECK ("scheduled_end_at" IS NULL OR "scheduled_start_at" IS NULL OR "scheduled_end_at" > "scheduled_start_at");
   ```
4. **Performance Indexes:**
   - `tests_status_idx` on `(status)`
   - `tests_type_status_idx` on `(type, status)`
   - `tests_schedule_window_idx` on `(scheduled_start_at, scheduled_end_at)`
5. **Bidirectional Legacy Synchronization Trigger:**
   A trigger `trg_sync_test_lifecycle_status` maintaining backward compatibility between `status` and `is_published` for direct legacy SQL operations without compromising `status` as the authoritative source of truth.

---

## 3. Lifecycle State Model

The database stores four authoritative lifecycle states:

| Persisted Status | Description | Visibility to Students | Attempt Policy |
| :--- | :--- | :--- | :--- |
| **`draft`** | Initial authoring state. Admin-only. | Inaccessible (`null` / 404) | Cannot be started by students. |
| **`published`** | Live test. Available evergreen or driven by schedule. | Catalog & Detail visible | Governed by effective schedule window. |
| **`closed`** | Manually or scheduled closed assessment. | Catalog & Detail visible (marked Closed) | New attempts rejected. In-flight attempts resume. |
| **`archived`** | Historical / deprecated state. Terminal read-only. | Inaccessible in catalog. Results preserved. | New attempts rejected. |

### Valid Administrative Transitions
Validated centrally via `validateLifecycleTransition(currentStatus, targetStatus, hasAttempts)`:
- `draft` → `published`
- `draft` → `archived`
- `published` → `closed`
- `published` → `archived`
- `published` → `draft` (allowed only if 0 attempts exist; rejected if attempts exist to protect historical integrity)
- `closed` → `published` (re-opening assessment)
- `closed` → `archived`
- `archived` is strictly terminal: cannot transition to any other status (duplication required).

---

## 4. Effective Availability Logic

Availability is computed server-side via `getEffectiveTestStatus(test, now)`:

```typescript
if (status === "draft") return "draft";
if (status === "archived") return "archived";
if (status === "closed") return "closed";

if (status === "published") {
  const nowMs = now.getTime();
  const startMs = test.scheduledStartAt ? new Date(test.scheduledStartAt).getTime() : null;
  const endMs = test.scheduledEndAt ? new Date(test.scheduledEndAt).getTime() : null;

  // 1. Future start -> scheduled
  if (startMs !== null && nowMs < startMs) return "scheduled";

  // 2. Expired window -> closed
  if (endMs !== null && nowMs >= endMs) return "closed";

  // 3. Evergreen or inside active window -> active
  return "active";
}
```

### Half-Open Interval Rule: `[startAt, endAt)`
- `now < startAt`: **`scheduled`** (unavailable for new attempts)
- `now === startAt`: **`active`** (available)
- `startAt < now < endAt`: **`active`** (available)
- `now === endAt`: **`closed`** (unavailable for new attempts)
- `now > endAt`: **`closed`** (unavailable for new attempts)

All availability checks execute server-side; client clocks are never trusted.

---

## 5. Scheduling & Timezone Behavior

1. **Storage Format:** Stored as PostgreSQL `timestamptz` (absolute UTC timestamps).
2. **Timezone Identifiers:** Persists standard IANA timezone identifiers (e.g., `Asia/Kolkata`, `America/New_York`, `Europe/London`). Ambiguous abbreviations (e.g., `EST`, `IST`) are disallowed.
3. **Range Validation:** Validates `scheduledEndAt > scheduledStartAt` both at the application layer and via PostgreSQL CHECK constraint `tests_schedule_range_check`.

---

## 6. Server Authorization & Security Fix

### Security Vulnerability Resolved
Previously:
- `getTestDetails()` fetched test records by UUID without verifying `isPublished`.
- `startOrResumeAttempt()` initiated tests without verifying `isPublished`.

### Phase 8 Hardening
1. **`getTestDetails(testId, userId, isAdmin)`:**
   - If `test.status === "draft"` and user is not admin, returns `null` (rendering Next.js `notFound()`), preventing draft leakage.
   - Attaches derived `effectiveStatus`, `scheduledStartAt`, `scheduledEndAt`, and `scheduleTimezone`.
2. **`startOrResumeAttempt(testId, userId)`:**
   - Evaluates authoritative `effectiveStatus`.
   - If `effectiveStatus !== "active"`:
     - Allows active in-flight attempts to resume if one already exists.
     - For new attempts: rejects draft (`"Test not found"`), scheduled (`"This test is not available yet."`), closed (`"This test is closed and no longer accepts new attempts."`), and archived (`"This test is archived and no longer available."`).
     - Admins retain preview/test access to draft tests.
3. **Server Action `updateTestLifecycleAction`:**
   - Strictly enforces admin session authentication.
   - Rejects unauthenticated and student mutations.

---

## 7. Attempt Creation & Advisory Lock

The complete Phase 7 transactional pipeline in `startOrResumeAttempt()` remains authoritative:
1. Authenticate user session.
2. Resolve test record.
3. Acquire PostgreSQL transaction advisory lock (`pg_advisory_xact_lock(hashtext(userId || ':' || testId))`).
4. Check for active in-progress attempt.
5. If in-progress attempt exists: check timer expiration; if valid, resume without applying new-attempt availability restrictions.
6. If no active attempt: verify `effectiveStatus === "active"` (rejecting draft, scheduled, closed, archived).
7. Enforce Phase 7D attempt limits.
8. Create new attempt row.
9. Sample questions from Phase 7F pools.
10. Apply Phase 7B question randomization.
11. Apply Phase 7C option randomization.
12. Generate immutable Phase 7C.1 question snapshots.
13. Commit transaction.

---

## 8. Active Attempt Continuity

A core requirement of Phase 8 is that **an active, in-progress attempt is never aborted simply because the test closes or its schedule expires**.

### Example Scenario
- Test scheduled window: 10:00 to 12:00 (Duration: 60 minutes).
- Student starts test at 11:50.
- At 12:00, the test becomes effectively `closed`. New students cannot start.
- The student in progress can continue taking their exam until their individual 60-minute duration timer expires (12:50).
- If the student refreshes or re-enters at 12:15, `startOrResumeAttempt()` detects their existing active attempt and resumes it (`isResumed: true`), without reshuffling options or resetting snapshots.

---

## 9. Duplicate Test Behavior

In `duplicateTest()`:
- Duplicate test is strictly reset to `status = "draft"` and `isPublished = false`.
- Clears scheduling fields: `scheduledStartAt = null`, `scheduledEndAt = null`, `scheduleTimezone = null`.
- Zero attempts, answers, attempt questions, or skill scores are duplicated.
- All configuration is preserved: duration, total marks, negative marking, attempt limits, sections, fixed questions, question pools, and pool question memberships.

---

## 10. Baseline Assessment Evergreen Behavior

The platform baseline assessment (`type = "baseline"`) maintains its designated role:
- Configured as `status = "published"` without scheduled start/end dates.
- Resolves to `effectiveStatus = "active"` continuously.
- `/assessment` continues resolving the baseline assessment without friction.

---

## 11. Admin & Student UI Updates

1. **Admin Test List (`/admin/tests`):**
   - Renders clear badges for lifecycle states: `Active` (emerald), `Scheduled` (cyan), `Closed` (charcoal), `Draft` (amber), `Archived` (slate).
   - Provides quick lifecycle action buttons: Publish, Close, Reopen, Archive, Duplicate, View.
2. **Admin Test Builder (`/admin/tests/new`):**
   - Added Availability & Lifecycle configuration card.
   - Allows choosing between `Always Available` and `Scheduled Window`.
   - Datetime inputs with timezone selector (`Asia/Kolkata`, `UTC`, `America/New_York`, `Europe/London`, etc.).
   - Client and server validation ensuring `scheduledEndAt > scheduledStartAt`.
3. **Student Test Catalog (`/tests`):**
   - Excludes Draft tests completely.
   - Shows badges for `Upcoming` (with start date/time) and `Closed`.
   - Card button reflects state: `Start Test`, `Resume Test`, `View Schedule`, or `View Results`.
4. **Student Test Detail (`/tests/[id]`):**
   - Draft tests return safe 404.
   - Scheduled tests display an Upcoming Assessment banner with designated start date/time/timezone, and a disabled Start button.
   - Closed tests display a Closed banner. If the student has an active attempt, a prominent "Resume Test" button is rendered.

---

## 12. Verification & Regression Results

### 1. Phase 8 Dedicated Lifecycle & Scheduling Suite
**File:** `frontend/src/test/phase-8-lifecycle-scheduling-audit.ts`
- **Total Assertions:** **91**
- **Passed:** **91**
- **Failed:** **0**

Coverage verified:
- [x] Draft test inaccessible to student via `getTestDetails()`
- [x] Draft test start rejected for student via `startOrResumeAttempt()`
- [x] Admin can view and test draft tests
- [x] Published evergreen test active and startable
- [x] Future scheduled test inaccessible for starting
- [x] Exact start boundary `now === startAt` accepted (`active`)
- [x] During window accepted (`active`)
- [x] Exact end boundary `now === endAt` rejected (`closed`)
- [x] After end rejected (`closed`)
- [x] Manually closed test rejects new attempts
- [x] Archived test rejects new attempts
- [x] Active attempt resumes after test is closed
- [x] Active attempt resumes after schedule expires
- [x] Duplicate test resets to draft with null schedule
- [x] Baseline assessment remains active and evergreen
- [x] Results survive test archive and remain accessible
- [x] Analytics and readiness calculations unaffected
- [x] Phase 7 question pool sampling interaction verified
- [x] Student catalog excludes draft tests
- [x] Anonymous / unauthorized mutations rejected

### 2. Phase 7 Cumulative Regression Suite
All Phase 7 test suites executed and verified:
- **Phase 7A (Negative Marking):** 62 / 62 passed
- **Phase 7B (Question Randomization):** 41 / 41 passed
- **Phase 7C (Option Randomization):** 34 / 34 passed
- **Phase 7C.1 (Question Snapshots):** 63 / 63 passed
- **Phase 7D (Attempt Limits):** 66 / 66 passed
- **Phase 7E (Test Instructions):** 38 / 38 passed
- **Phase 7F (Question Pools):** 39 / 39 passed
- **Phase 7 Total:** **343 / 343 PASSED** (0 regressions)

### 3. Ancillary Integration & Regression Suites
- **Duplicate Test Audit (`duplicate-test-audit.ts`):** 41 / 41 passed
- **Start Test Regression (`start-test-regression.ts`):** 23 / 23 passed
- **Milestone 3 Integration Audit (`integration-audit.ts`):** 61 / 61 passed

### 4. Code Quality & Production Build
- **TypeScript Check (`npx tsc --noEmit`):** PASSED (0 errors)
- **ESLint (`npm run lint`):** PASSED (0 errors)
- **Production Build (`npm run build`):** PASSED (All 20 Next.js routes generated successfully)
- **Test Fixture Cleanup:** Database inspected; 0 leftover test fixtures, 0 orphaned test attempts.

---

## 13. Known Limitations & Non-Goals
As defined in project specifications:
- No automated cron jobs / daemons for background state transitions (effective status is computed at query time).
- No recurring test schedules, calendar synchronizations, email alerts, or push notifications.
- No changes to grading mathematical models or readiness formulas.

---

PHASE 8 IMPLEMENTATION COMPLETE — TEST LIFECYCLE & SCHEDULING ENABLED.
