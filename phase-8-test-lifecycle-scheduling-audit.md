# NEXORA — PHASE 8 ARCHITECTURAL AUDIT & IMPLEMENTATION SPECIFICATION
## Test Lifecycle & Availability Scheduling System

---

> **NEXORA ASSESSMENT PLATFORM**  
> *“Your Operating System for Placements”*  
> **Phase**: 8 — Test Lifecycle & Availability Scheduling  
> **Document Status**: AUDIT COMPLETE — SPECIFICATION FINALIZED  
> **Evaluation Mode**: STRICT AUDIT ONLY — ZERO IMPLEMENTATION MUTATIONS  

---

## 1. Executive Summary

Nexora successfully completed Phase 7 (sub-phases 7A through 7F) with **343 / 343 passing assertions** across all dedicated test suites. The assessment engine currently supports:
- Negative marking with immutable penalty rates (7A)
- Section-aware question randomization (7B)
- Stable synthetic option randomization (7C)
- Frozen question, option, marks, and answer key snapshots in `attempt_questions` (7C.1)
- Transactional per-student attempt limits under PostgreSQL advisory locks (7D)
- Pre-start test instructions with mandatory student acknowledgement (7E)
- Dynamic question pooling with deterministic mark parity and atomic sampling (7F)

The objective of **Phase 8 (Test Lifecycle & Scheduling)** is to evolve the simplistic binary publication model (`is_published: boolean`) into an enterprise-grade, state-machine-driven lifecycle accompanied by a timezone-aware availability scheduling engine.

Currently, tests in Nexora exist in an unconstrained binary state:
- A boolean flag `isPublished` controls presence in the student test catalog (`/tests`).
- **Security Gap Identified in Current State**: Neither test detail view (`/tests/[id]`) nor attempt initialization (`startOrResumeAttempt`) checks `isPublished`. Any authenticated student who knows or guesses a test UUID can view unreleased draft tests and initiate active exam sessions.
- There is zero temporal availability awareness: tests cannot be scheduled for future placement drives, cannot automatically open or close at specific times, and have no timezone metadata.

This audit provides an exhaustive architectural inspection of the repository (`frontend/src/db/schema.ts`, `frontend/src/server/tests.ts`, `frontend/src/server/actions.ts`, `frontend/src/app/api/admin/tests/route.ts`, `frontend/src/components/admin/test-builder.tsx`, student test routes, and analytics). It formulates a strict, server-authoritative state machine, boundary-tested scheduling semantics, active exam preservation guarantees, and an exact backward-compatible migration plan.

---

## 2. Current State

Nexora's assessment subsystem is implemented in Next.js (App Router), TypeScript, PostgreSQL, and Drizzle ORM. An audit of the live codebase reveals the following current state:

### Database Layer (`frontend/src/db/schema.ts`)
1. **Tests Table**:
   ```typescript
   export const tests = pgTable("tests", {
     id: uuid("id").defaultRandom().primaryKey(),
     title: varchar("title", { length: 255 }).notNull(),
     description: text("description"),
     instructions: text("instructions"),
     type: testTypeEnum("type").notNull(),
     duration: integer("duration").notNull(),
     difficulty: difficultyEnum("difficulty"),
     totalMarks: integer("total_marks").notNull(),
     negativeMarkingEnabled: boolean("negative_marking_enabled").notNull().default(false),
     negativeMarkRate: numeric("negative_mark_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
     randomizeQuestions: boolean("randomize_questions").notNull().default(false),
     randomizeOptions: boolean("randomize_options").notNull().default(false),
     attemptLimit: integer("attempt_limit"),
     isPublished: boolean("is_published").notNull().default(false),
     createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
     updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
   });
   ```
2. **Missing Lifecycle Columns**: There is no lifecycle status enum. There are no scheduling columns (`scheduled_start_at`, `scheduled_end_at`, `schedule_timezone`).
3. **Timestamp Handling**: All existing timestamp columns (`createdAt`, `updatedAt`, `startedAt`, `submittedAt`) utilize PostgreSQL `timestamp with time zone` (`timestamptz`), which stores UTC epochs under the hood.

### Server Layer (`frontend/src/server/tests.ts`)
1. **`getPublishedTests(userId)`**:
   - Queries `tests` filtering strictly on `where(eq(tests.isPublished, true))`.
   - Computes question count (fixed + pool selection counts) and user attempt stats (`bestScore`, `hasInProgress`).
2. **`getTestDetails(testId, userId)`**:
   - Queries `tests` by `where(eq(tests.id, testId))`.
   - **Does NOT filter by `isPublished`**. Returns test metadata, sections, pool counts, and user attempt history regardless of publication status.
3. **`startOrResumeAttempt(testId, userId)`**:
   - Checks user existence and test existence:
     ```typescript
     const testList = await db.select().from(tests).where(eq(tests.id, testId)).limit(1);
     if (testList.length === 0) throw new Error("Test not found");
     ```
   - **Does NOT check `test.isPublished`**.
   - Acquires advisory lock `pg_advisory_xact_lock(hashtext(userId || ':' || testId))`.
   - Resumes active `in_progress` attempt if elapsed seconds < allowed duration.
   - Enforces `attemptLimit` for new attempts.
   - Generates immutable snapshot rows in `attempt_questions`.
4. **`duplicateTest(sourceTestId)`**:
   - Clones title (with ` — Copy`), description, instructions, type, duration, difficulty, marks, negative marking, randomization toggles, attempt limit, sections, fixed questions, and question pools.
   - Resets `isPublished: false`.
   - Does not copy attempts or answers.

### Admin APIs & Components
1. **`POST /api/admin/tests`**:
   - Validates admin session. Accepts `isPublished` (defaults to `true` if omitted: `isPublished ?? true`).
   - Accepts duplication action (`body.action === "duplicate"`).
2. **`PATCH /api/admin/tests`**:
   - Updates `isPublished`, `title`, `description`, `duration`, `negativeMarkingEnabled`, `negativeMarkRate`, `randomizeQuestions`, `randomizeOptions`, `attemptLimit`, `instructions`.
   - Does not touch sections or questions.
3. **Admin Test List (`frontend/src/components/admin/test-list.tsx`)**:
   - Displays a toggle button between "Live" (`isPublished === true`) and "Draft" (`isPublished === false`).
   - Toggling invokes `PATCH /api/admin/tests` with `{ isPublished: !currentStatus }`.

---

## 3. Existing Publication Model

### CURRENT STATE Analysis

| Surface | Behavior on `isPublished = true` | Behavior on `isPublished = false` (Draft) | Vulnerability / Deficiency |
| :--- | :--- | :--- | :--- |
| **Catalog (`/tests`)** | Rendered in grid with stats and Start/Resume button. | Excluded from `getPublishedTests`. Hidden from catalog. | None. Catalog query works as intended. |
| **Detail (`/tests/[id]`)** | Displays full test details, instructions, and Start Test button. | **Displays full test details, instructions, and Start Test button.** | **Critical Security Gap**: Direct URL reveals draft tests to non-admin students. |
| **Start Attempt API** | Creates or resumes attempt in `attempts` & `attempt_questions`. | **Creates or resumes attempt in `attempts` & `attempt_questions`.** | **Critical Security Gap**: Student can start an unreleased exam by POSTing directly. |
| **Attempt Engine (`/tests/[id]/attempt`)** | Loads questions and starts exam timer. | **Loads questions and starts exam timer.** | Inherits bypass from `startOrResumeAttempt`. |
| **Duplication** | Clones all structure; creates copy as `isPublished: false`. | Clones all structure; creates copy as `isPublished: false`. | Correct behavior. |
| **Baseline Assessment** | Redirects from `/assessment` to `/tests/[baselineId]`. | Redirects to `/tests` if baseline not found. Baseline is seeded published. | Evergreen flow. |

**Key Finding**: The current publication model is purely cosmetic at the catalog layer. The server-side evaluation engine has **zero authorization barriers** preventing students from taking unpublished tests if they obtain the test ID. Phase 8 must rectify this by establishing strict server-side lifecycle authority.

---

## 4. Proposed Lifecycle Model

Phase 8 evolves the system from a binary boolean into a structured state machine. Six lifecycle states were evaluated:
1. `DRAFT`: Test is under construction or being edited. Visible only to Admins.
2. `PUBLISHED`: Test configuration is approved and finalized.
3. `SCHEDULED`: Test has a future availability start time.
4. `ACTIVE`: Test is currently open and accepting new attempts from students.
5. `CLOSED`: Test window has closed or test was manually closed by Admin. No new attempts permitted.
6. `ARCHIVED`: Historical test retired from active operations. Retained for historical transcripts and analytics.

### Architectural Evaluation: Persisted vs. Derived States

A fundamental design decision is whether all six states should be persisted in the database column, or whether states should be partitioned into **Administrative Lifecycle State** vs. **Temporal Availability State**.

#### The Flaw of Persisting `SCHEDULED` and `ACTIVE` as Static Column Values:
If `status` is a persisted enum containing both `SCHEDULED` and `ACTIVE`:
- A test scheduled for `2026-10-01 09:00:00 UTC` is written to DB as `status = 'SCHEDULED'`.
- At `2026-10-01 09:00:01 UTC`, what changes the database column to `'ACTIVE'`?
  - If it requires a cron job or worker daemon: any worker delay, crash, or polling interval (e.g. 5 minutes) means students are locked out of their exam until the job runs.
  - If a test ends at `12:00:00 UTC`, students could continue starting attempts at `12:01:00 UTC` if the cron hasn't executed yet.
- This creates **database-clock drift** and dual-source-of-truth errors.

#### The Recommended Architecture: Unified Lifecycle State Machine with Authoritative Query-Time Derivation

We recommend persisting five explicit states in the PostgreSQL enum `test_status_enum`:
```sql
CREATE TYPE test_status_enum AS ENUM (
  'draft',
  'published',
  'closed',
  'archived'
);
```
*(With optional `'scheduled'` and `'active'` if admins explicitly want manual forced override capabilities, detailed below).*

**The Cleanest, Industry-Standard Model**:
1. **Persisted Admin State (`tests.status`)**:
   - `draft`: Test is in development. Not visible to students.
   - `published`: Test is officially released by admin. Its immediate availability is governed by its scheduling timestamps (`scheduled_start_at`, `scheduled_end_at`).
   - `closed`: Admin has explicitly closed the test. Overrides any scheduling window.
   - `archived`: Test is retired.
2. **Computed Student-Facing State (`effectiveStatus`)**:
   - If `status === 'draft'`: $\rightarrow$ **`DRAFT`**
   - If `status === 'archived'`: $\rightarrow$ **`ARCHIVED`**
   - If `status === 'closed'`: $\rightarrow$ **`CLOSED`**
   - If `status === 'published'`:
     - If `now < scheduled_start_at`: $\rightarrow$ **`SCHEDULED`** (Upcoming)
     - If `scheduled_start_at <= now` AND (`scheduled_end_at IS NULL` OR `now < scheduled_end_at`): $\rightarrow$ **`ACTIVE`** (Available Now)
     - If `now >= scheduled_end_at`: $\rightarrow$ **`CLOSED`** (Schedule Expired)

This design guarantees **zero cron lag, zero polling overhead, zero clock drift, and instant temporal transitions** to the exact millisecond.

If the platform requires Admins to see explicit `SCHEDULED` and `ACTIVE` badges in the admin table, the UI and server utility simply compute `effectiveStatus(test, now)`.

---

## 5. State Transition Matrix

The table below defines every valid administrative transition between lifecycle states:

```
                  ┌──────────────┐
                  │    DRAFT     │◀─────────────────┐ (Reset on Duplicate)
                  └──────┬───────┘                  │
                         │ [Publish / Schedule]     │
                         ▼                          │
                  ┌──────────────┐                  │
         ┌───────▶│  PUBLISHED   │                  │
         │        └──────┬───────┘                  │
         │               │                          │
         │ [Reopen]      │ [Close / Auto-Expire]    │
         │               ▼                          │
         │        ┌──────────────┐                  │
         └────────│    CLOSED    │                  │
                  └──────┬───────┘                  │
                         │ [Archive]                │
                         ▼                          │
                  ┌──────────────┐                  │
                  │   ARCHIVED   ├──────────────────┘
                  └──────────────┘ (Read-Only Terminal; Duplicate to re-run)
```

### Transition Rules

| From State | To State | Trigger | Permitted? | Conditions / Guardrails |
| :--- | :--- | :--- | :--- | :--- |
| `DRAFT` | `PUBLISHED` | Admin clicks "Publish" or "Schedule" | **YES** | Test must have $\ge 1$ section and $\ge 1$ question (fixed or pool with selection count). Total marks must match. |
| `DRAFT` | `CLOSED` | Admin action | **NO** | Cannot close an unreleased draft. Must publish or keep draft. |
| `DRAFT` | `ARCHIVED` | Admin clicks "Archive" | **YES** | Allows discarding draft tests without publishing them. |
| `PUBLISHED` | `DRAFT` | Admin clicks "Revert to Draft" | **CONDITIONAL**| **Allowed ONLY if 0 attempts exist.** If any student has started or submitted an attempt, reverting to draft is rejected to prevent orphaned attempt states. |
| `PUBLISHED` | `CLOSED` | Admin clicks "Close Test" or end time passes | **YES** | Immediate effect. In-flight active attempts are allowed to complete until their timer expires. |
| `PUBLISHED` | `ARCHIVED` | Admin clicks "Archive" | **NO** | Must transition through `CLOSED` first, or admin confirmation dialog closes and archives in one step. |
| `CLOSED` | `PUBLISHED` | Admin clicks "Reopen Test" | **YES** | Admin can reopen a test or extend its `scheduled_end_at`. Previously submitted attempts remain permanently frozen. |
| `CLOSED` | `ARCHIVED` | Admin clicks "Archive" | **YES** | Test is retired. Removed from active student catalog. Available in historical records. |
| `CLOSED` | `DRAFT` | Admin action | **NO** | Cannot revert closed tests with existing attempts to draft. |
| `ARCHIVED` | Any State | Admin action | **NO** | **`ARCHIVED` is terminal.** To re-run an archived test, Admin must use `duplicateTest()`, which produces a fresh `DRAFT`. |

---

## 6. Scheduling Model

### Proposed Schema Fields for `tests`

```typescript
// Proposed additions to tests table in frontend/src/db/schema.ts
status: testStatusEnum("status").notNull().default("draft"),
scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
scheduleTimezone: varchar("schedule_timezone", { length: 100 }),
```

### Detailed Field Specifications

1. **`status`**:
   - Type: PostgreSQL enum (`test_status_enum`).
   - Values: `'draft'`, `'published'`, `'closed'`, `'archived'`.
   - Nullability: `NOT NULL`.
   - Default: `'draft'`.
2. **`scheduled_start_at`**:
   - Type: `timestamp with time zone` (`timestamptz`).
   - Nullability: `NULLABLE`.
   - Storage: Always converted to and stored as UTC in PostgreSQL.
   - Semantics: The instant at which the test becomes available for students to start new attempts.
3. **`scheduled_end_at`**:
   - Type: `timestamp with time zone` (`timestamptz`).
   - Nullability: `NULLABLE`.
   - Storage: Always converted to and stored as UTC in PostgreSQL.
   - Semantics: The instant at which the test stops admitting new attempts.
4. **`schedule_timezone`**:
   - Type: `varchar(100)`.
   - Nullability: `NULLABLE`.
   - Storage: Standard IANA Timezone Identifier string (e.g., `'Asia/Kolkata'`, `'America/New_York'`, `'UTC'`).
   - Semantics: Stores the administrative context in which the schedule was scheduled. Prevents date/time picker distortion when editing tests across daylight saving transitions or multi-timezone admin teams.

### Scheduling Configurations Supported

| Case | `scheduledStartAt` | `scheduledEndAt` | Availability Behavior |
| :--- | :--- | :--- | :--- |
| **Evergreen / Open-Ended** | `NULL` | `NULL` | Available immediately upon `PUBLISHED`. Remains open indefinitely until manually `CLOSED`. (Standard for Practice / Baseline mocks). |
| **Fixed Window** | `2026-10-10 10:00:00Z` | `2026-10-10 12:00:00Z` | Unavailable before 10:00 UTC (Scheduled). Available between 10:00 and 12:00 UTC (Active). Closed after 12:00 UTC. |
| **Scheduled Start (Open End)** | `2026-10-10 10:00:00Z` | `NULL` | Unavailable before 10:00 UTC. Opens at 10:00 UTC and stays open indefinitely until manually closed. |
| **Immediate Start (Fixed End)**| `NULL` | `2026-10-10 18:00:00Z` | Opens immediately upon `PUBLISHED`. Closes automatically at 18:00 UTC. |

---

## 7. Availability Semantics

### Exact Boundary Testing & Time Comparisons

Let $T_{\text{start}} = \text{scheduled\_start\_at}$, $T_{\text{end}} = \text{scheduled\_end\_at}$, and $T_{\text{now}} = \text{Server UTC Clock}$.

Availability condition for **new attempt initiation**:
$$\text{IsAvailable}(T_{\text{now}}) \iff (\text{status} = \text{'published'}) \land (T_{\text{start}} = \text{NULL} \lor T_{\text{now}} \ge T_{\text{start}}) \land (T_{\text{end}} = \text{NULL} \lor T_{\text{now}} < T_{\text{end}})$$

#### Boundary Rules:
- **$T_{\text{now}} = T_{\text{start}} - 1\text{ ms}$**: UNAVAILABLE. `startOrResumeAttempt` throws `TEST_SCHEDULED_NOT_STARTED`.
- **$T_{\text{now}} = T_{\text{start}}$**: **AVAILABLE**. Student can initiate attempt.
- **$T_{\text{now}} = T_{\text{end}} - 1\text{ ms}$**: **AVAILABLE**. Student can initiate attempt.
- **$T_{\text{now}} = T_{\text{end}}$**: **UNAVAILABLE**. Test is closed. `startOrResumeAttempt` throws `TEST_CLOSED`.

### Database Integrity Constraints
To prevent corrupt scheduling ranges, the database must enforce:
```sql
ALTER TABLE tests ADD CONSTRAINT tests_schedule_range_check 
CHECK (
  scheduled_end_at IS NULL 
  OR scheduled_start_at IS NULL 
  OR scheduled_end_at > scheduled_start_at
);
```

---

## 8. Timezone Policy

### Recommended Platform Standard

1. **Storage**:
   - All timestamps (`scheduled_start_at`, `scheduled_end_at`, `started_at`, `submitted_at`, `created_at`, `updated_at`) must be stored in PostgreSQL as `timestamp with time zone` in **UTC**.
   - Ambiguous local ISO strings without timezone offsets (e.g. `"2026-10-10T10:00:00"`) are strictly rejected by Zod validation at the API boundary.
2. **Timezone Representation**:
   - The admin UI submits ISO 8601 strings with full UTC offsets (e.g. `"2026-10-10T10:00:00.000Z"`), accompanied by the IANA timezone string (e.g. `"Asia/Kolkata"`).
   - The platform uses IANA identifiers (from `Intl.supportedValuesOf('timeZone')`), never legacy three-letter abbreviations (`IST`, `EST`, `CST`) which are ambiguous and lack DST transition definitions.
3. **Admin Rendering**:
   - Admin sees the schedule formatted in `scheduleTimezone`, with an explicit timezone tag: e.g. `Oct 10, 2026, 10:00 AM IST (Asia/Kolkata)`.
4. **Student Rendering**:
   - Student catalog and detail pages format timestamps according to the student's browser locale and timezone using standard `Intl.DateTimeFormat`: e.g. `Starts Oct 10, 2026 at 3:30 PM (Your local time)`.
5. **Server Authority**:
   - All comparisons (`now >= scheduledStartAt`) execute server-side in Node.js/PostgreSQL using absolute millisecond epoch timestamps (`Date.now()` / `CURRENT_TIMESTAMP`). Client clocks are never trusted.

---

## 9. Server Authorization

Server authority is the core requirement of Phase 8. No client-side hidden button or frontend route guard can be considered a security boundary.

### Server Enforcement Touchpoints

```
                                    STUDENT REQUEST
                                           │
                                           ▼
                             ┌───────────────────────────┐
                             │    Auth.js Session Check  │
                             └─────────────┬─────────────┘
                                           │ Authenticated
                                           ▼
                             ┌───────────────────────────┐
                             │  Role Check (Admin/User)  │
                             └─────────────┬─────────────┘
                                           │ Non-Admin Student
                                           ▼
                                 OPERATION EVALUATOR
                     ┌─────────────────────┼─────────────────────┐
                     ▼                     ▼                     ▼
             [List / Catalog]      [Get Test Details]    [Start/Resume Attempt]
                     │                     │                     │
                     ▼                     ▼                     ▼
             Filter tests:         If status = draft     1. Lock advisory lock
             status IN ('published') ──▶ Return 404/Null   2. Check in_progress attempt
             + effectiveStatus     If status = scheduled  ──▶ If valid: RESUME (ALLOWED)
             categorization        ──▶ Show upcoming UI   3. Check availability:
                                   If status = closed     ──▶ If not active: THROW
                                   ──▶ Show closed UI     4. Check attempt limit
                                   If status = archived   ──▶ If exceeded: THROW
                                   ──▶ Return 404/Null    5. Create attempt & snapshot
```

### Authorization Rules by Route & API

1. **`getPublishedTests(userId)`**:
   - Restricts rows to `tests.status = 'published'` (or `'closed'` if including student history).
   - Never leaks `status = 'draft'` or `status = 'archived'` rows to students.
2. **`getTestDetails(testId, userId)`**:
   - If user is non-admin and `test.status === 'draft'`: Returns `null` $\rightarrow$ triggers Next.js `notFound()`.
   - If user is non-admin and `test.status === 'archived'`: Returns `null` $\rightarrow$ `notFound()`.
   - If `test.status === 'published'` (or `'closed'`): Returns test details along with derived availability status.
3. **`startOrResumeAttempt(testId, userId)`**:
   - Enforces transactional availability check. Cannot be bypassed via direct action or REST call.
4. **`getAttemptExamState(attemptId, userId)`**:
   - Verifies ownership (`attempts.userId === userId`).
   - If an attempt was legitimately started while active, `getAttemptExamState` continues serving the exam questions until the attempt timer expires.
5. **Admin Endpoints (`/api/admin/tests`)**:
   - Rejects non-admin users with HTTP 403 Forbidden.

---

## 10. Attempt Behavior

### Inception Semantics: New Attempts vs. Resume

When a student calls `startOrResumeAttempt(testId, userId)`:

```typescript
// Transactional Advisory Lock ensures serialization
await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId} || ':' || ${testId}))`);
```

#### Step 1: Check for Existing Resumable Attempt
- If an attempt with `status = 'in_progress'` exists for `(testId, userId)`:
  - Calculate elapsed time: `(now - startedAt) / 1000`.
  - If `elapsed >= test.duration * 60`:
    - The attempt has expired. Automatically submit and grade it (`gradeAttempt`), consuming an attempt.
  - If `elapsed < test.duration * 60`:
    - **RESUME IS PERMITTED IMMEDIATELY**, even if the test has since become `closed` or expired!
    - Return `{ attemptId, isResumed: true, remainingTime }`.

#### Step 2: Check Availability for New Attempt Creation
If no resumable attempt exists:
- Evaluate test lifecycle and schedule:
  - If `test.status === 'draft'`: Throw `"Test not found"` (404-equivalent error).
  - If `test.status === 'archived'`: Throw `"Test is archived and no longer available."`
  - If `test.status === 'closed'`: Throw `"This assessment is closed and no longer accepting new attempts."`
  - If `test.status === 'published'`:
    - If `test.scheduledStartAt && now < test.scheduledStartAt`:
      - Throw `"This assessment is scheduled to begin on ${formattedDate}. You cannot start yet."`
    - If `test.scheduledEndAt && now >= test.scheduledEndAt`:
      - Throw `"The scheduled window for this assessment has ended."`
- Evaluate attempt limit (`submittedCount >= test.attemptLimit`).
- Only if all checks pass: Insert new attempt in `attempts` and snapshot questions in `attempt_questions`.

---

## 11. Active Attempt Behavior

### What happens when an Admin closes a test while a student is actively taking it?

The prompt outlines four potential behaviors:
- **A. Immediately lose access**: Boot the student out and invalidate their exam.
- **B. Be allowed to finish indefinitely**: Remove time limits.
- **C. Be allowed to finish only until their existing timer expires**: Preserve the individual attempt duration.
- **D. Depend on `endAt`**: Cut off the exam at `endAt`.

### Recommended Behavior: Option C (Exam Continuity / Graceful Completion)

**Rationale**:
1. **The Phase 7C.1 Snapshot Guarantee**: At attempt start, the student's exam state is completely frozen into `attempt_questions`. The attempt has an explicit `startedAt` and duration. It is an independent, self-contained transaction.
2. **Real-World Exam Hall Standard**: In standardized testing (GRE, SAT, AWS, GATE, university placement drives), closing registration or closing the test door stops **new test-takers from entering**. Students who have already been admitted and are sitting at their desks are granted their full allotted time.
3. **Resilience Against Network Disconnects**: If an active student refreshes their browser or experiences a network blink at 10:01 when the test closes at 10:00, booting them would result in severe unfairness. Because resume is allowed under Option C, they can safely re-enter and complete their remaining minutes.

#### Exact Rules for In-Flight Attempts:
- Test closure (manual by admin or automatic by schedule expiry) acts as a **gate against new attempts**.
- Students with an active in-flight attempt can continue answering questions and submitting until their personal timer (`test.duration * 60 - elapsedSeconds`) reaches 0.
- When their timer expires, the attempt is graded and submitted normally.
- Once submitted, they cannot start another attempt because the test is closed.

---

## 12. Attempt Limit Interaction (Phase 7D Compatibility)

Phase 7D introduced transactional attempt limits:
- `tests.attempt_limit`: `integer` (nullable; `NULL` = unlimited, $\ge 1$ = limit).
- Only `attempts.status === 'submitted'` consumes an attempt allowance.
- Concurrency race conditions are blocked by `pg_advisory_xact_lock(hashtext(userId || ':' || testId))`.

### Phase 8 Lifecycle Integration:
1. **Advisory Lock Scope**: Lifecycle availability validation is executed **inside** the Phase 7D advisory lock transaction.
2. **Evaluation Order**:
   1. Active in-progress attempt check (Resume allowed $\rightarrow$ bypass limit check).
   2. Lifecycle availability check (`published` + window valid $\rightarrow$ if invalid, abort).
   3. Attempt limit check (`submittedCount < attemptLimit` $\rightarrow$ if exceeded, abort).
   4. Atomically insert `attempts` and `attempt_questions`.
3. **No Regressions**:
   - Scheduled test: Student cannot start $\rightarrow$ 0 attempts consumed.
   - Active test: Student can take up to `attemptLimit` attempts.
   - Closed test: Student cannot start a new attempt, even if `attemptsRemaining > 0`.
   - In-progress resume: Does NOT consume an extra attempt.

---

## 13. Baseline Assessment Behavior

### Current State
In `frontend/src/app/(protected)/assessment/page.tsx`, the `/assessment` route executes:
```typescript
const baseline = await db
  .select({ id: tests.id })
  .from(tests)
  .where(eq(tests.type, "baseline"))
  .limit(1);

if (baseline.length > 0) redirect(`/tests/${baseline[0].id}`);
else redirect("/tests");
```
In `frontend/src/server/readiness.ts`, `calculateReadiness(userId)` calculates student readiness by querying:
```typescript
where(and(eq(attempts.userId, userId), eq(tests.type, "baseline"), eq(attempts.status, "submitted")))
```

### Phase 8 Architectural Recommendation
1. **Evergreen Availability**:
   - Baseline assessments must default to `status = 'published'` with `scheduled_start_at = NULL` and `scheduled_end_at = NULL`.
   - They must remain permanently active.
2. **Admin UI Protection**:
   - The Admin test management UI must place a protection badge on `type === 'baseline'` tests.
   - Closing or scheduling a baseline test must trigger a warning dialog: *"Warning: Baseline assessments are required for student readiness calibration. Closing this test will prevent new students from completing onboarding."*
3. **Readiness Immunity**:
   - `calculateReadiness` and `detectWeakAreas` operate strictly on `attempts` where `status = 'submitted'`. Phase 8 lifecycle states have zero negative impact on readiness computations.

---

## 14. Duplicate Behavior

### Current State
`duplicateTest(sourceTestId)` in `frontend/src/server/tests.ts` copies:
- `title` with ` — Copy` suffix and auto-incrementing numbers
- `description`, `instructions`, `type`, `duration`, `difficulty`, `totalMarks`
- `negativeMarkingEnabled`, `negativeMarkRate`
- `randomizeQuestions`, `randomizeOptions`
- `attemptLimit`
- `sections`, `test_questions`, `question_pools`, `question_pool_questions`
And resets:
- `isPublished: false`
- Attempts, answers, and analytics are omitted.

### Phase 8 Specification for `duplicateTest`
When duplicating any test (regardless of whether the source test is `draft`, `published`, `scheduled`, `active`, `closed`, or `archived`):
1. **Status Reset**: Duplicated test must be created with `status: 'draft'`.
2. **Schedule Reset**:
   - `scheduledStartAt`: Reset to `NULL`.
   - `scheduledEndAt`: Reset to `NULL`.
   - `scheduleTimezone`: Retained from source or set to `NULL` (retaining is helpful so the admin doesn't have to re-select their timezone).
3. **Structure Preserved**:
   - All Phase 7 properties (negative marking, question randomization, option randomization, instructions, pools, selection counts, attempt limits) are copied identically.
4. **Clean Slate**:
   - Zero attempts, zero answers, zero question snapshots copied.

---

## 15. Admin UX

### Admin Test Management (`/admin/tests`)

#### Table Columns:
1. **Title & Track**: Title, type tag (`Aptitude`, `CS Fundamentals`, `Mixed`, `Baseline`).
2. **Difficulty & Duration**: Duration (e.g. `60m`), difficulty badge.
3. **Lifecycle Status Badge**:
   - `Draft`: Gray badge (`bg-surface-high text-text-muted border-border`)
   - `Scheduled`: Blue badge (`bg-primary/10 text-primary-text border-primary/20`) with start date
   - `Active`: Green badge (`bg-secondary/10 text-secondary border-secondary/20`) with "Live" pulsing dot
   - `Closed`: Amber badge (`bg-tertiary/10 text-tertiary border-tertiary/20`)
   - `Archived`: Dark muted badge (`opacity-60`)
4. **Window / Schedule**:
   - Shows formatted range: `Oct 10, 10:00 AM — 12:00 PM IST` or `Evergreen / Open-ended`.
5. **Contextual Action Menu**:
   - For `Draft`: **[Publish Now]** | **[Schedule]** | **[Edit]** | **[Duplicate]**
   - For `Scheduled`: **[Activate Now]** | **[Edit Schedule]** | **[Cancel Schedule]** | **[Duplicate]**
   - For `Active`: **[Close Test]** | **[Edit Schedule]** | **[Duplicate]**
   - For `Closed`: **[Reopen / Publish]** | **[Archive]** | **[Duplicate]**
   - For `Archived`: **[Duplicate]** (Read-only historical view)

### Test Builder / Edit UI (`/admin/tests/new` & `/admin/tests/[id]/edit`)
Add a dedicated **"Availability & Lifecycle"** card in the builder settings:
- **Publication Mode**: Segmented control: `[Draft]` vs. `[Published]`
- **Availability Window**:
  - Radio: `Always Available (Evergreen)`
  - Radio: `Scheduled Window`
    - Start Date & Time input
    - End Date & Time input (optional)
    - Timezone dropdown (defaults to browser IANA timezone)
- Live client-side validation: Ensures `endAt > startAt`.

---

## 16. Student UX

### Student Test Catalog (`/tests`)

The catalog should organize tests cleanly without cluttering the view with closed or irrelevant drafts:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Placement Tests                                                         │
│ Practice under realistic placement conditions.                          │
├─────────────────────────────────────────────────────────────────────────┤
│ [ All Tests ] [ Available Now (3) ] [ Upcoming (2) ] [ Completed (4) ]  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  AVAILABLE NOW                                                          │
│  ┌────────────────────────┐  ┌────────────────────────┐                │
│  │ Aptitude Diagnostic    │  │ Full Stack Mock        │                │
│  │ 60m • 30 Questions     │  │ 90m • 45 Questions     │                │
│  │ [Start Test]           │  │ [Resume Test (42m left)│                │
│  └────────────────────────┘  └────────────────────────┘                │
│                                                                         │
│  UPCOMING ASSESSMENTS                                                   │
│  ┌────────────────────────┐                                             │
│  │ TCS NQT Placement Mock │                                             │
│  │ Opens Oct 15, 10:00 AM │                                             │
│  │ [Opens in 2 days]      │                                             │
│  └────────────────────────┘                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

#### Status Indicators on Test Cards:
- **Available**: Standard "Start Test" CTA button.
- **In Progress**: Highlighted "Resume Test" CTA button.
- **Scheduled / Upcoming**: Disabled CTA button showing `"Opens Oct 15, 10:00 AM"` or countdown timer.
- **Closed**: Shows `"Assessment Ended"`. If student attempted it, shows `"View Results"`. If student never attempted it, hidden from main view (accessible via "Past Tests" filter).
- **Draft & Archived**: Never shown to students under any circumstances.

### Student Test Detail Page (`/tests/[id]`)
- **`Draft`**: Returns 404 (prevents leakage).
- **`Scheduled`**:
  - Displays test metadata, syllabus, instructions, and duration.
  - Start button replaced by an **Upcoming Banner**: `"This assessment is scheduled to open on Oct 15, 2026 at 10:00 AM IST. Please return then to begin."`
- **`Active`**: Displays standard `StartTestButton` with instruction acknowledgement checkbox.
- **`Closed`**:
  - If student has an active `in_progress` attempt: Displays **`Resume Test`** with remaining timer!
  - If student has submitted attempts: Displays **`View Results`** CTA.
  - If student has no attempts: Displays **`Assessment Closed`** message.

---

## 17. Direct URL & API Security

| Attack Vector | Current Behavior | Proposed Phase 8 Security Enforcement |
| :--- | :--- | :--- |
| **Student navigates to `/tests/[draft-id]`** | Page loads; displays questions count, instructions, and Start button. | Server returns `notFound()` (HTTP 404). Existence of draft test is completely hidden. |
| **Student calls `startAttemptAction(draftId)`** | **Attempt is created; student takes unreleased exam.** | Throws `"Test not found"` error. No DB record created. |
| **Student calls `startAttemptAction(scheduledId)` before start time** | **Attempt is created; student starts exam early.** | Throws `"Test is scheduled to start at ${date}. You cannot start yet."` |
| **Student calls `startAttemptAction(closedId)`** | **Attempt is created; student starts closed exam.** | Throws `"This assessment is closed."` |
| **Student calls `saveAnswerAction` on active attempt after test closes** | Attempt answers saved. | **Allowed**. Student's active attempt continues until their timer expires. |
| **Non-admin student calls `PATCH /api/admin/tests`** | Session check returns 403. | **Protected**. Retains existing 403 Forbidden check. |
| **Student manipulates client clock to bypass schedule** | N/A | **Defeated**. Availability decisions are made 100% on the server using UTC `CURRENT_TIMESTAMP`. |

---

## 18. Active Test Editing Policy

### Can Admins modify tests while students have active attempts?

Phase 7C.1 and Phase 7F established an immutable attempt snapshot architecture:
- When an attempt starts, `attempt_questions` copies and freezes:
  - `question_text_snapshot`
  - `question_type_snapshot`
  - `marks_snapshot`
  - `options_snapshot`
  - `correct_answer_snapshot`
  - `option_order`
- The grading engine (`gradeAttempt`) and the review page (`/tests/[id]/result`) read **strictly from snapshots**.
- Therefore, modifying the canonical question in `questions` does NOT corrupt existing attempts!

### However, structural test edits create fairness and consistency anomalies:
If an admin modifies test questions, pools, or sections on an active test:
- Student A (started at 10:00) receives Questions 1, 2, 3.
- Admin changes the test at 10:15.
- Student B (started at 10:20) receives Questions 4, 5, 6.
- Both students receive different exams for the same placement drive.

### Recommended Active Test Editing Policy:

| Field Category | Specific Fields | Editing Policy on `ACTIVE` / `PUBLISHED` with Existing Attempts |
| :--- | :--- | :--- |
| **Schedule / Availability** | `scheduledStartAt`, `scheduledEndAt`, `status` | **EDITABLE AT ANY TIME**. Admin can extend the end time (e.g. by 30 mins) or close the test early. |
| **Display Metadata** | `title`, `description`, `instructions` | **EDITABLE AT ANY TIME**. Typo fixes in instructions or descriptions do not alter scoring. |
| **Scoring & Structure** | `totalMarks`, `negativeMarkingEnabled`, `negativeMarkRate`, `duration` | **LOCKED**. Cannot be edited if $\ge 1$ attempt exists. To change, Admin must duplicate test or close it. |
| **Question Composition** | `test_questions`, `question_pools`, `sections` | **LOCKED**. Cannot add, delete, or swap questions/pools if $\ge 1$ attempt exists. |

---

## 19. Historical Data Behavior

1. **Attempts & Answers Immutability**:
   - Changing a test's lifecycle status (e.g. `ACTIVE` $\rightarrow$ `CLOSED` $\rightarrow$ `ARCHIVED`) must never delete or mutate:
     - `attempts` rows
     - `attempt_questions` rows
     - `answers` rows
     - `skill_scores` rows
2. **Review Access**:
   - Students must always be able to view their detailed question-by-question review at `/tests/[id]/result?attemptId=...` for closed or archived tests they previously submitted.
3. **No Cascading Deletions**:
   - Archiving a test must set `status = 'archived'`. Under no circumstances should archiving execute a SQL `DELETE` on `tests`.

---

## 20. Analytics & Readiness Compatibility

### Audit of `frontend/src/server/readiness.ts` & `analytics.ts`

1. **Readiness Calculation (`calculateReadiness`)**:
   - Inspecting line 48-54 of `readiness.ts`:
     ```typescript
     where(
       and(
         eq(attempts.userId, userId),
         eq(tests.type, "baseline"),
         eq(attempts.status, "submitted")
       )
     )
     ```
   - It filters strictly on `tests.type === 'baseline'` and `attempts.status === 'submitted'`.
   - It does NOT depend on `tests.isPublished` or `tests.status`.
   - **Verdict: 100% Compatible.**
2. **Subject Performance Aggregation**:
   - Queries `skillScores` joined with `attempts` where `attempts.status = 'submitted'`.
   - **Verdict: 100% Compatible.**
3. **Analytics Dashboard (`/analytics`)**:
   - Analyzes score progression and accuracy over time from submitted attempts.
   - Retains all historical mock data even if mock tests are subsequently closed or archived.

---

## 21. Database Design & Schema Proposal

### Proposed Drizzle Schema Changes (`frontend/src/db/schema.ts`)

```typescript
// 1. Define new test status enum
export const testStatusEnum = pgEnum("test_status", [
  "draft",
  "published",
  "closed",
  "archived",
]);

// 2. Updated tests table definition
export const tests = pgTable(
  "tests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    instructions: text("instructions"),
    type: testTypeEnum("type").notNull(),
    duration: integer("duration").notNull(),
    difficulty: difficultyEnum("difficulty"),
    totalMarks: integer("total_marks").notNull(),
    negativeMarkingEnabled: boolean("negative_marking_enabled").notNull().default(false),
    negativeMarkRate: numeric("negative_mark_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
    randomizeQuestions: boolean("randomize_questions").notNull().default(false),
    randomizeOptions: boolean("randomize_options").notNull().default(false),
    attemptLimit: integer("attempt_limit"),
    
    // === PHASE 8 LIFECYCLE & SCHEDULING FIELDS ===
    status: testStatusEnum("status").notNull().default("draft"),
    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
    scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
    scheduleTimezone: varchar("schedule_timezone", { length: 100 }),
    
    // Backward compatibility during migration phase (can be dropped in Phase 9 or made generated)
    isPublished: boolean("is_published").notNull().default(false),
    
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "tests_schedule_range_check",
      sql`${table.scheduledEndAt} IS NULL OR ${table.scheduledStartAt} IS NULL OR ${table.scheduledEndAt} > ${table.scheduledStartAt}`
    ),
    index("tests_status_idx").on(table.status),
    index("tests_type_status_idx").on(table.type, table.status),
    index("tests_schedule_window_idx").on(table.scheduledStartAt, table.scheduledEndAt),
  ]
);
```

---

## 22. Migration Plan

### Step-by-Step Zero-Downtime Migration (`0009_phase_8_test_lifecycle.sql`)

```sql
-- Step 1: Create test_status enum
DO $$ BEGIN
  CREATE TYPE test_status AS ENUM ('draft', 'published', 'closed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 2: Add lifecycle columns to tests table
ALTER TABLE tests ADD COLUMN IF NOT EXISTS status test_status NOT NULL DEFAULT 'draft';
ALTER TABLE tests ADD COLUMN IF NOT EXISTS scheduled_start_at timestamp with time zone;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS scheduled_end_at timestamp with time zone;
ALTER TABLE tests ADD COLUMN IF NOT EXISTS schedule_timezone varchar(100);

-- Step 3: Backfill status from existing is_published column
-- Any test currently marked is_published = true transitions cleanly to 'published'
UPDATE tests 
SET status = 'published' 
WHERE is_published = TRUE AND status = 'draft';

-- Ensure baseline assessments are marked published
UPDATE tests 
SET status = 'published' 
WHERE type = 'baseline' AND status = 'draft';

-- Step 4: Add check constraint for valid scheduling window
ALTER TABLE tests ADD CONSTRAINT tests_schedule_range_check 
CHECK (
  scheduled_end_at IS NULL 
  OR scheduled_start_at IS NULL 
  OR scheduled_end_at > scheduled_start_at
);

-- Step 5: Create performance indexes
CREATE INDEX IF NOT EXISTS tests_status_idx ON tests (status);
CREATE INDEX IF NOT EXISTS tests_type_status_idx ON tests (type, status);
CREATE INDEX IF NOT EXISTS tests_schedule_window_idx ON tests (scheduled_start_at, scheduled_end_at);
```

### Rollback Strategy
If any issue occurs during deployment:
- The `is_published` column remains intact and populated.
- A rollback simply drops the constraint and columns (`scheduled_start_at`, `scheduled_end_at`, `schedule_timezone`, `status`) and enum `test_status`. Existing Phase 7 tests continue operating without loss of data.

---

## 23. Indexing Strategy

To support high-throughput student catalog queries and availability lookups:
1. **`tests_status_idx` (`status`)**:
   - Enables fast filtering for `WHERE status = 'published'`.
2. **`tests_type_status_idx` (`type, status`)**:
   - Accelerates baseline queries (`WHERE type = 'baseline' AND status = 'published'`) and track filtering.
3. **`tests_schedule_window_idx` (`scheduled_start_at, scheduled_end_at`)**:
   - Optimizes time-window queries evaluating `now >= scheduled_start_at AND (scheduled_end_at IS NULL OR now < scheduled_end_at)`.

---

## 24. Edge Cases & Boundary Conditions

| Edge Case Scenario | Expected System Behavior |
| :--- | :--- |
| **`startAt == endAt`** | Rejected by DB check constraint `scheduled_end_at > scheduled_start_at` and API Zod validator with 400 Bad Request. |
| **`endAt < startAt`** | Rejected by DB check constraint and Zod validator (`"End time must be after start time"`). |
| **Daylight Saving Time (DST) Transition** | Storing UTC timestamps guarantees exact elapsed time. The `scheduleTimezone` IANA string ensures the UI renders the correct local wall clock time without 1-hour jump glitches. |
| **Admin modifies schedule while test is Active** | Allowed. If `endAt` is extended, students get a longer admittance window. Existing active attempts continue respecting their individual attempt duration. |
| **Admin closes test while student is answering a question** | Student's answer submission (`saveAnswerAction`) and exam completion (`submitTestAttemptAction`) succeed. Their individual timer continues to countdown. No new attempts permitted. |
| **Student attempts to start test at exact millisecond of `startAt`** | Permitted (`now >= scheduledStartAt`). |
| **Student attempts to start test at exact millisecond of `endAt`** | Blocked (`now < scheduledEndAt` evaluates to false). |
| **Student loses internet during exam and reconnects after `endAt`** | If their attempt duration has not elapsed, `startOrResumeAttempt` **RESUMES** their attempt. If their attempt duration has elapsed, it auto-submits and grades their answers. |
| **Admin publishes without schedule dates** | Evergreen test. Available immediately and indefinitely. |
| **Admin schedules with start time only (no end time)** | Opens at `startAt` and remains open until manually closed. |
| **Admin schedules with end time only (no start time)** | Open immediately upon publish, closes at `endAt`. |

---

## 25. Comprehensive Test Plan

A dedicated verification suite `frontend/src/test/phase-8-lifecycle-scheduling-audit.ts` must be developed to validate all Phase 8 behaviors with at least **60+ assertions**:

### Test Plan Breakdown

1. **State Machine Transitions**:
   - Valid: `DRAFT` $\rightarrow$ `PUBLISHED`
   - Valid: `PUBLISHED` $\rightarrow$ `CLOSED`
   - Valid: `CLOSED` $\rightarrow$ `PUBLISHED` (Reopen)
   - Valid: `CLOSED` $\rightarrow$ `ARCHIVED`
   - Invalid: `DRAFT` $\rightarrow$ `CLOSED` (Rejected)
   - Invalid: `ARCHIVED` $\rightarrow$ `PUBLISHED` (Terminal rejection)
   - Conditional: `PUBLISHED` $\rightarrow$ `DRAFT` (Allowed with 0 attempts; rejected when attempts exist)
2. **Scheduling Window Semantics**:
   - Attempt creation before `startAt` $\rightarrow$ Throws `TEST_NOT_STARTED`
   - Attempt creation at exact `startAt` $\rightarrow$ Success
   - Attempt creation during active window $\rightarrow$ Success
   - Attempt creation at exact `endAt` $\rightarrow$ Throws `TEST_CLOSED`
   - Attempt creation after `endAt` $\rightarrow$ Throws `TEST_CLOSED`
   - Evergreen test (null start & end) $\rightarrow$ Always starts
   - Start only $\rightarrow$ Fails before start, succeeds after
   - End only $\rightarrow$ Succeeds before end, fails after
3. **Active Exam Continuity**:
   - Student starts attempt while `ACTIVE`.
   - Admin transitions test to `CLOSED`.
   - Second student attempts to start $\rightarrow$ Blocked.
   - First student resumes active attempt $\rightarrow$ Allowed.
   - First student saves answers and submits $\rightarrow$ Graded successfully.
4. **Attempt Limits & Advisory Lock Integration**:
   - Concurrent start requests on scheduled test $\rightarrow$ Both blocked, 0 attempts used.
   - Concurrent start requests on active test with `attemptLimit = 1` $\rightarrow$ Exactly 1 succeeds, 1 blocked.
   - Resuming in-progress attempt after test closes does not increment attempts used.
5. **Duplication Semantics**:
   - Duplicate published test $\rightarrow$ Produces `status = 'draft'`.
   - Duplicate scheduled test $\rightarrow$ Produces `status = 'draft'` with cleared timestamps.
   - Original test publication and scheduling remain unchanged.
6. **Security & Direct URL Protection**:
   - Anonymous user hits API $\rightarrow$ 401 Unauthorized.
   - Non-admin student hits `getTestDetails` on draft $\rightarrow$ Returns 404/null.
   - Non-admin student calls `startAttemptAction` on draft $\rightarrow$ Throws error.
   - Non-admin student calls `PATCH /api/admin/tests` $\rightarrow$ 403 Forbidden.
7. **Regression Suite**:
   - Run Phase 7A through 7F suites (343 assertions) to confirm 100% backward compatibility.

---

## 26. Future Compatibility

### Phase 9: Admin Analytics
- Lifecycle states (`closed`, `archived`) allow admins to filter analytics by specific placement drive batches without mixing active student test-takers with historical cohorts.

### Phase 10: Student Intelligence & Recommendations
- Recommendation engine will recommend only tests in `ACTIVE` state or notify students of `SCHEDULED` upcoming mock drives.

### Phase 11: Placement Operating System & Company Drives
- Company-specific test scheduling (e.g. "Google Mock Assessment" available strictly between 6:00 PM and 8:00 PM on Friday) relies directly on the Phase 8 scheduling schema.

---

## 27. Out of Scope

The following capabilities are explicitly deferred from Phase 8:
- Automated email or push notifications for upcoming tests
- Cron-based external webhook triggers
- Google Calendar / iCal integrations
- Recurring cron-scheduled tests (e.g. "Every Monday at 9 AM")
- Company-specific access control lists (ACLs) or college domain restrictions
- AI recommendations or readiness formula alterations
- Proctoring, camera monitoring, or tab-switch tracking

---

## 28. Recommended Implementation Sequence

Once this audit is approved, implementation should follow this five-step sequence:

1. **Step 1 — Schema & Database Migration**:
   - Define `testStatusEnum`, add columns and constraints to `tests` table in `schema.ts`.
   - Generate and execute migration `0009_phase_8_test_lifecycle.sql`.
   - Backfill existing tests (`is_published: true` $\rightarrow$ `status: 'published'`).
2. **Step 2 — Server Authorization & State Derivation**:
   - Create lifecycle helper module `frontend/src/lib/lifecycle.ts` to compute `getEffectiveTestStatus()`.
   - Update `getPublishedTests()` to filter on `status = 'published'` and attach effective status.
   - Update `getTestDetails()` to block `draft` and `archived` tests from non-admins.
   - Update `startOrResumeAttempt()` to enforce server-side availability windows and state transitions.
   - Update `duplicateTest()` to reset `status = 'draft'` and clear schedule dates.
3. **Step 3 — Admin APIs & Test Management UI**:
   - Update `POST /api/admin/tests` and `PATCH /api/admin/tests` to handle `status`, `scheduledStartAt`, `scheduledEndAt`, and `scheduleTimezone`.
   - Update `/admin/tests` table with lifecycle badges and contextual action buttons.
   - Update `TestBuilder` with the Availability & Scheduling card.
4. **Step 4 — Student Catalog & Test Experience**:
   - Update `/tests` catalog to group/tab by "Available Now" vs. "Upcoming".
   - Update `/tests/[id]` detail page to render "Upcoming" banner for scheduled tests and "Resume" for in-flight tests.
5. **Step 5 — Verification & Regression**:
   - Execute dedicated Phase 8 test suite (`phase-8-lifecycle-scheduling-audit.ts`).
   - Run full regression across Phase 7 (7A–7F) and core integration suites.

---

## 29. Risks & Mitigations

| Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **In-flight exam disruption** | High: Students taking tests are booted if an admin closes a test. | **Mitigated**: Attempt engine reads from frozen snapshots in `attempt_questions`. In-progress attempts continue until individual timers expire. |
| **Timezone confusion** | Medium: Admins schedule tests for 10 AM local time, but server schedules for 10 AM UTC. | **Mitigated**: Schema stores explicit IANA `scheduleTimezone`. Zod validates ISO strings with UTC offsets. UI renders localized previews. |
| **Draft test leak via direct URL** | High: Students discover unreleased tests. | **Mitigated**: `getTestDetails` and `startOrResumeAttempt` strictly enforce server-side authorization and return 404 for drafts. |
| **Baseline test lock-out** | High: New students unable to take baseline assessment. | **Mitigated**: Baseline tests are seeded as evergreen (`published` with null start/end) and protected in admin UI. |
| **Phase 7 regression** | Critical: Attempt limits, pools, or snapshots fail. | **Mitigated**: Phase 8 logic wraps around Phase 7 structures without altering snapshot generation or advisory locking. Full regression test suite execution mandatory. |

---

## 30. Final Verdict

PHASE 8 AUDIT APPROVED — READY FOR IMPLEMENTATION.
