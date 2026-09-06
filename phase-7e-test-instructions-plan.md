# NEXORA — PHASE 7E AUDIT & IMPLEMENTATION PLAN
## Test Instructions

---

### 1. Executive Summary

Nexora has **no configurable test-instruction content today**. The only pre-start UX is the test detail page (`/tests/[id]`), which shows test metadata plus a hard-coded **"Before You Begin"** card (internet connection, timer auto-submit, question types/review, post-submission explanations — plus a negative-marking advisory when enabled), and a Start button that **immediately creates the attempt** via `startAttemptAction → startOrResumeAttempt → router.push('/tests/[id]/attempt')`. There is no confirmation step, no modal, and no instruction storage anywhere in the schema or UI (verified by code search: the only "instruction…" string in the app is a placeholder inside the test-builder's section-description input).

This audit recommends the minimal, safe model: **one nullable plain-text column `tests.instructions`**, rendered as a "Test Instructions" panel on the test detail page (and in the admin preview), with the existing attempt-creation timing, timer, attempt-limit, and resume semantics **completely unchanged**.

---

### 2. Current Test Detail / Pre-Start UX (verified)

`/tests/[id]` (server component, `frontend/src/app/(protected)/tests/[id]/page.tsx`):

- Header badges: test type, short ID, negative-marking (when enabled), attempt limit (Phase 7D: "Unlimited attempts" / "Attempts: X / N"); then title and description.
- 4 metric cards: Questions, Minutes, Marks, Difficulty.
- Subjects Covered; Test Sections breakdown (Phase 6C); **"Before You Begin"** card with four static bullets + negative-marking warning.
- "Your Attempts" history panel (resume / view-result links per attempt).
- `StartTestButton` (client component): "Start Test", "Resume Test", or disabled "Attempt limit reached". Click → `startAttemptAction(testId)` (server action) → `startOrResumeAttempt` → `router.push` to the attempt route.
- `/assessment` is a pure redirect to the baseline test's detail page — no separate assessment flow.
- **No modal/dialog, no confirmation step, no acknowledgement anywhere in the flow.**

### 3. Current Attempt Creation Flow

`startOrResumeAttempt` (post-Phase 7D): a single transaction serialized per (user, test) with `pg_advisory_xact_lock`; resume-first (an active attempt is always resumed, limit-exempt); then counts `status = 'submitted'` attempts and enforces `tests.attempt_limit`; then creates `attempts` + `attempt_questions` (7C option snapshots + 7C.1 question snapshots) and sets `started_at` / `remaining_time` (timer start).

**Key fact: attempts are created only when Start is clicked. Simply opening the detail page or viewing any content consumes nothing** (no attempt row, no time, no allowance).

---

### 4. Recommended Instruction Semantics

Clean separation of content categories:

| Category | Handling |
|---|---|
| **A. Admin-authored configurable content** | `tests.instructions` (plain text) — the only new storage |
| **B/C. System-generated information** | Already rendered as metadata: duration (Minutes card), marks, sections, attempt limit badge, negative-marking badge/advisory, "Before You Begin" rules. **Not duplicated** in instructions |
| **D. Optional** | NULL/empty = no instructions → panel simply not rendered |

Helper text for admins will state which facts are auto-displayed so instructions never conflict with system metadata.

---

### 5. Recommended Content Model

**OPTION A — single plain-text field `tests.instructions TEXT NULL` (RECOMMENDED).**

| Option | Verdict |
|---|---|
| A. Plain-text field | **RECOMMENDED** — mirrors the existing `tests.description TEXT` pattern exactly (same storage, same textarea UX, same admin-route validation style); zero XSS surface (React escapes text); no dependencies; mobile-safe |
| B. Structured items `[{title, body}]` | Rejected — over-engineered for prose rules; no structured-content precedent in the schema |
| C. Rich text / HTML | Rejected — stored-XSS surface, sanitization dependency, complexity for no product need |
| D. Markdown | Rejected — adds a renderer dependency and injection considerations; can be layered on later if ever required |

---

### 6. Security / Sanitization Analysis

- **Plain text ⇒ no script, event-handler, iframe, or style injection is possible at render time.** React renders text nodes and escapes by default; no `dangerouslySetInnerHTML`.
- The only write path is the admin-only API route (session `isAdmin` check, same boundary as title/description today).
- **No sanitization library and no Markdown parser are needed.** If rich text is ever requested later, it must be a separate, sanitized, reviewed feature — explicitly out of scope here.

---

### 7. Recommended Display Flow

**OPTION A — inline on the test detail page.** A "Test Instructions" panel rendered between the description and the "Before You Begin" card, only when `instructions` is non-empty.

| Option | Verdict |
|---|---|
| A. Detail page only (inline) | **RECOMMENDED** — the detail page is already the pre-start surface; no new route/modal; consistent with Nexora's routing (detail → attempt) |
| B. Dedicated pre-start screen | Rejected — new route/state for no benefit |
| C. Modal before Start | Rejected — adds dialog machinery; instruction content is short prose |
| D. Detail + pre-start screen | Rejected — duplication |
| E. Inside active exam | Rejected — would place content inside the timed, snapshot-frozen attempt |

The admin preview (Phase 6A) mirrors the same panel client-side.

---

### 8. Acknowledgement Recommendation

**Client-only, required-when-present checkbox** ("I have read and understood the instructions.") gating the Start button — and **only** when instructions exist **and** there is no active attempt.

- **No server persistence, no new server action, no schema field.** A server cannot meaningfully verify "read"; persisting an acknowledgement is theater without audit value and adds API/attempt complexity.
- The checkbox is a lightweight UX nudge consistent with the existing single-client-component Start flow; the server remains the sole authority for attempt *creation* (ownership, limits) exactly as today.
- **Resume is never gated** (Phase 7D principle: never block resume).
- Server-persisted acknowledgement is documented as a future option if the product ever demands per-attempt auditability.

---

### 9. Attempt Creation Timing (critical)

**Attempts are created only when Start Test is clicked — unchanged.**

```
Test detail (instructions visible) → click Start → startOrResumeAttempt → attempt created → timer begins
```

Consequences, analyzed:
- **Attempt limits**: viewing instructions consumes 0; the allowance only rises at creation (7D counting unchanged).
- **Timer**: `started_at`/`remaining_time` set at creation — instruction viewing consumes no test time.
- **Snapshots/randomization** (7C/7C.1): frozen at creation, exactly as today; instructions are not part of the attempt.
- **Abandoned attempts / browser close / refresh**: identical to current behavior; nothing is created until Start is clicked.

---

### 10. Timer Interaction

`Test detail (incl. instructions) → Start → attempt created → server-authoritative timer begins` — the current order, preserved. Instructions never consume time because they exist **before** `startOrResumeAttempt` runs.

---

### 11. Attempt Limit Interaction

All Phase 7D cases preserved:

- No attempt → Start creates one (subject to the limit).
- One active attempt → button reads **"Resume Test"**; instructions may still display but the acknowledgement gate is skipped; resume in one click.
- Limit reached (no active) → disabled "Attempt limit reached"; server also denies.
- **Viewing instructions never counts toward the limit.**

---

### 12. Refresh / Back / Multi-tab

- Refresh/back on the detail page: instructions re-render from the `tests` row (server component) — no state loss; the client checkbox resets (informational only).
- Two tabs showing instructions: each Start call goes through `startOrResumeAttempt`; the Phase 7D advisory lock guarantees a single attempt / resume convergence.
- One tab starts while another still shows instructions: harmless — the second Start either resumes the active attempt or is denied by the limit; it can never double-create.

---

### 13. Active Attempt Resume Behavior

A student with an active attempt revisiting `/tests/[id]` sees instructions (informational) but the button shows **"Resume Test"** and the acknowledgement checkbox does **not** gate it. One click resumes. A second attempt can never be created merely by viewing instructions (verified against the 7D resume-first flow).

---

### 14. Question Snapshot Interaction

**Instructions are NOT snapshotted and are NOT part of result semantics.** They are pre-start content on the detail page — not part of the graded attempt.

- Admin edits after a student opens the detail page → the student sees the latest text on their next view (fine).
- Admin edits after start/submit → **no effect** on the active attempt or on historical review; instructions never appear on `/tests/[id]/result`.
- No `attempt_questions` column, no snapshotting — the minimum safe behavior. Documented; no historical complexity added.

---

### 15. Admin Builder UX

In the Test Builder's Assessment Parameters card (`frontend/src/components/admin/test-builder.tsx`), between the description textarea and the marking/randomization controls:

- **Textarea** labeled "Test Instructions" (optional).
- Placeholder: *"e.g. This test has no negative marking. You may not use external resources. Answer every question before submitting."*
- Helper: *"Shown to students before they start. Duration, marks, sections, attempt limit, and negative marking are already displayed automatically."*
- Max length 5000 (client + server validation); empty/whitespace → no instructions.
- Styled with the existing input classes (same Technical Precision system as the description textarea). No new editor.

---

### 16. Admin Preview

Phase 6A preview (`frontend/src/components/admin/admin-test-preview.tsx`) stays fully client-side / `sessionStorage`:

- Add `instructions?: string | null` to `PreviewDraft`.
- Render an instructions panel at the top of the preview (before the first question) when non-empty.
- No acknowledgement required in preview (it is a flow check, not an assessment).
- No DB writes, no attempt created — unchanged.

---

### 17. Duplicate Test

`duplicateTest` copies `instructions: source.instructions` alongside the other policy fields (like `attemptLimit`). It never copies attempts, answers, `attempt_questions`, student history, analytics, or readiness (already true; verified by the 7D audit, Suite 11).

---

### 18. Result / Historical Behavior

Instructions are **pre-start only**: not shown on `/tests/[id]/result`, not snapshotted, not part of historical review. Rationale: they carry no grading meaning; showing them post-submission adds historical complexity for zero value. (Documented recommendation; a "Test Instructions" block on results can be added later if the product wants it.)

---

### 19. Student UX (exact flow)

```
/tests/[id]
  Test Overview (title, badges, description, metric cards, sections)
  ↓
  Test Instructions           ← NEW panel, only when configured (whitespace-pre-wrap)
  ↓
  Before You Begin            (system-generated rules, unchanged)
  ↓
  ☐ I have read and understood the instructions.   ← only when instructions exist AND no active attempt
  [ Start Test ] / [ Resume Test ] / [ Attempt limit reached ]
  ↓
/tests/[id]/attempt
```

Implemented as additions to the existing detail page and `StartTestButton` — no new routes, no new components beyond a small server-rendered panel and a checkbox state in the button.

---

### 20. API Contract

- **Admin POST/PATCH `/api/admin/tests`**: accept `instructions` (string | null).
  - Validation: `undefined` / `null` / `""` / whitespace-only → store `NULL`; otherwise trim and require ≤ 5000 characters (else 400: "Test instructions cannot exceed 5000 characters."); non-string → 400.
  - Authorization: admin-only, unchanged.
- **Read**: `getTestDetails` already returns the full `tests` row (`...test` spread) — `instructions` rides along with zero server changes. `getPublishedTests` does not need it (catalog shows no instructions).
- **Server action**: none new needed; acknowledgement is client-only (see §8).
- Client is never trusted for authorization or counts; the limit logic remains server-side (7D).

---

### 21. Validation Rules

- `null` / `undefined` / `""` / whitespace-only → stored as `NULL` (no instructions).
- Valid: any string (Unicode, newlines, multiline) trimmed to ≤ 5000 chars; newlines preserved and rendered with `whitespace-pre-wrap` (matching the question-text rendering style).
- Invalid: non-string; string > 5000 chars → 400.
- Test builder mirrors the same rules client-side before submit.

---

### 22. Security Model

- **Stored XSS**: impossible with plain text + React's default text escaping (no HTML/Markdown).
- **Admin authorization**: instructions writable only through the admin-only route/action — same boundary as title/description.
- **Direct API calls / forged test IDs**: mutations require admin session; reads follow the existing `getTestDetails` path.
- **Visibility**: instructions are shown wherever the test detail is shown — identical to description/title boundaries today, including the pre-existing fact that `getTestDetails` does not itself check `is_published` (documented, unchanged).

---

### 23. Draft / Published Behavior

- **Draft tests**: instructions can be set/edited freely (stored like any other field).
- **Published tests**: admins may edit instructions anytime; changes apply to subsequent views; no effect on active attempts or submitted results (§14).
- **Unpublished tests**: instructions follow the test — hidden from the catalog; direct-URL access behavior is unchanged from today.

---

### 24. Future Lifecycle Compatibility

No lifecycle fields added. `tests.instructions` is orthogonal to any future Scheduled/Active/Closed/Archived states: it is test content read at detail-page render time. No conflicts.

---

### 25. Analytics / Readiness Impact

**None.** Instructions are never read by `gradeAttempt`, `calculateReadiness`, analytics, skill-score, or weak-area logic, and they never affect attempt counts. Scoring, accuracy, negative marking, readiness, and analytics formulas are untouched. Documented explicitly.

---

### 26. Performance

Zero added queries: `instructions` is a column on the already-selected `tests` row in `getTestDetails` (and the admin list). No new indexes, no joins, no N+1.

---

### 27. Edge Case Matrix

| Case | Expected behavior |
|---|---|
| No instructions (NULL/"") | Panel not rendered; Start immediate |
| Short / long instructions | Rendered with pre-wrap; ≤ 5000 enforced |
| Whitespace-only | Stored NULL |
| Unicode / multiline | Preserved and rendered |
| Active attempt exists | Button "Resume Test"; instructions visible; no acknowledgement gate; resume in 1 click |
| No active attempt | Instructions + (optional) acknowledgement checkbox gate Start |
| Attempt limit reached | Disabled "Attempt limit reached"; server denies |
| Unlimited test | Unchanged behavior + instructions |
| Refresh / back | Re-render from DB; checkbox resets (informational) |
| Multiple tabs | Each Start → 7D advisory lock → single attempt / converge |
| Concurrent Start | 7D race protections unchanged |
| Admin edits instructions | Next detail-page view shows new text; active attempts and submitted results unaffected |
| Duplicate test | Copies instructions; copies no history |
| Draft test | Stored; not in catalog |
| Published / unpublished | Follows today's test visibility |
| Preview | Client-side instructions panel; no attempt created |
| Historical result | Instructions never shown |

---

### 28. Detailed Implementation Plan (build phase — NOT executed in this audit)

1. **Migration** `0007_phase_7e_test_instructions.sql`: `ALTER TABLE tests ADD COLUMN IF NOT EXISTS instructions text;` + journal registration + apply locally. Additive, nullable, no backfill.
2. **`schema.ts`**: `instructions: text("instructions")` on `tests`.
3. **Admin API route**: parse/validate `instructions` in POST/PATCH (§20/§21).
4. **Test builder**: textarea + validation + payload; **admin preview**: `PreviewDraft.instructions` + rendered panel.
5. **`duplicateTest`**: copy `instructions`.
6. **Detail page + StartTestButton**: server-rendered instructions panel; checkbox state gating only the new-start path.
7. **New audit** `phase-7e-test-instructions-audit.ts` (§29) + full regression sweep + `tsc` / ESLint / build.
8. **Report** `phase-7e-test-instructions-implementation-report.md`.

---

### 29. Test Plan

A. **Schema**: column exists, nullable, NULL default.
B. **Create with instructions** via the server path.
C. **Update instructions**.
D. **Empty/whitespace** → stored NULL.
E. **Validation**: >5000 rejected, non-string rejected, Unicode/multiline accepted.
F. **Student visibility**: panel rendered when set; absent when NULL.
G/H. **Draft vs published** visibility boundaries (as today).
I. **Authorization**: non-admin cannot mutate.
J. **Start flow**: attempt created only on Start; viewing instructions creates nothing.
K. **Timer**: `started_at`/`remaining_time` set at creation, not at page load.
L. **Limit interaction**: viewing consumes 0; limit still enforced at creation.
M. **Active resume**: 1-click resume; acknowledgement not required.
N. **Refresh**: no server-state loss.
O. **Multi-tab**: converge via the 7D advisory lock.
P. **Concurrent start**: unchanged race protections.
Q. **Preview**: instructions shown; no attempt created.
R. **Duplicate**: copies instructions, not history.
S. **Historical**: results show no instructions; instruction edits don't alter submitted attempts.
T. **XSS/security**: stored and rendered as escaped plain text.
U–X. **Regressions**: Phase 7D 66/66, 7C.1 63/63, 7C 34/34, 7B 41/41, 7A 62/62, 6C 52/52, duplicate 41/41, integration 61/61, start-test 23/23; `tsc --noEmit` 0 errors; ESLint 0 errors; `npm run build` succeeds. No existing test weakened.

---

### 30. Risks / Open Questions

1. **Acknowledgement enforcement depth**: client-only is trivially bypassable, but the server has nothing to verify — acceptable because the checkbox is a UX nudge, not an access control. If the product later wants auditability ("student acknowledged on attempt X"), that requires a server action + persisted flag — deferred.
2. **Max length 5000** is a judgment call (the description field uses 2000); adjustable without a schema change.
3. **Plain text only**: any future rich-text/Markdown request must be a separate, sanitized, reviewed feature.
4. **Unpublished-test direct access by URL** remains possible (pre-existing); instructions inherit that boundary.

---

### 31. NOT IMPLEMENTED

This audit made zero changes: no schema/migration/server/UI/test modifications, no dependencies added, no database writes, no behavior changes. All recommendations are grounded in direct inspection of the current codebase (post-Phase 7D working tree).

---

PHASE 7E AUDIT COMPLETE — NO IMPLEMENTATION CHANGES MADE.