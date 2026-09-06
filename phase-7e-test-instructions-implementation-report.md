# NEXORA — PHASE 7E IMPLEMENTATION REPORT
## Test Instructions

---

### 1. Executive Summary

Phase 7E adds optional, admin-authored **test instructions** shown to students on the test detail page before they start. Instructions are stored as a single nullable plain-text column (`tests.instructions`, NULL = none), rendered with React's default text escaping (no HTML/Markdown/rich text, no new dependencies), and never touch the attempt lifecycle: viewing instructions creates zero attempts, consumes zero time, and consumes zero attempt allowance.

Attempt-creation timing, the server-authoritative timer, Phase 7D attempt limits, Phase 7C/7C.1 snapshots, grading, analytics, and readiness are all **intentionally unchanged**. A client-side acknowledgement checkbox ("I have read and understood the instructions.") gates only the *new-start* path when instructions exist; Resume is never blocked and works in one click.

**Verified**: Phase 7E audit **38/38 PASSED**; all nine existing regression suites green; TypeScript 0 errors; ESLint 0 errors; production build succeeds.

---

### 2. Files Changed

| File | Status | Description |
|---|---|---|
| `frontend/src/db/migrations/0007_phase_7e_test_instructions.sql` | **Created** | `ALTER TABLE tests ADD COLUMN IF NOT EXISTS instructions text;` |
| `frontend/src/db/migrations/meta/_journal.json` | Modified | Registers migration index 7 |
| `frontend/src/db/schema.ts` | Modified | `tests.instructions: text("instructions")` (nullable; NULL/empty = none) |
| `frontend/src/lib/instructions.ts` | **Created** | Pure, dependency-free `parseTestInstructions` validator shared by the admin API and the audit |
| `frontend/src/app/api/admin/tests/route.ts` | Modified | POST/PATCH accept and validate `instructions` via `parseTestInstructions` |
| `frontend/src/components/admin/test-builder.tsx` | Modified | "Test Instructions" textarea under Assessment Parameters + client validation + POST payload |
| `frontend/src/components/admin/admin-test-preview.tsx` | Modified | `PreviewDraft.instructions` + instructions panel in preview |
| `frontend/src/server/tests.ts` | Modified | `duplicateTest` copies `instructions` |
| `frontend/src/app/(protected)/tests/[id]/page.tsx` | Modified | "Test Instructions" panel (only when non-empty) + `requireAcknowledgement` prop |
| `frontend/src/components/tests/start-test-button.tsx` | Modified | Client-side acknowledgement checkbox gating only the new-start path |
| `frontend/src/test/phase-7e-test-instructions-audit.ts` | **Created** | 14 suites / 38 assertions |

No existing tests were weakened, skipped, or deleted. No old migrations were modified.

---

### 3. Migration & Schema

`0007_phase_7e_test_instructions.sql` (exact contents):

```sql
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "instructions" text;
```

- Additive, nullable, no default, no backfill → **all existing tests have `instructions = NULL` = no instructions**.
- Applied and verified locally (`\d tests` shows `instructions | text | | |`).
- drizzle: `instructions: text("instructions")` on `tests`.

---

### 4. Content Model

**Plain text only** — no HTML, Markdown, rich text, JSON blocks, or new dependencies. Rendering uses React text nodes (auto-escaped) with `whitespace-pre-wrap` to preserve multiline content. No `dangerouslySetInnerHTML` anywhere (verified by inspection). Stored and served byte-identical — the XSS audit confirms `<script>`, `onerror`, and `javascript:` payloads remain literal text.

---

### 5. Validation

`parseTestInstructions(value)` in `frontend/src/lib/instructions.ts` (pure function, used by the admin route):

| Input | Result |
|---|---|
| `undefined` | `null` (and on PATCH: field untouched) |
| `null` | `null` (store NULL) |
| `""` | `null` |
| whitespace-only | `null` |
| valid string | trimmed, stored; internal newlines preserved |
| ≤ 5000 chars | accepted |
| > 5000 chars | rejected (`error` → HTTP 400) |
| non-string | rejected (HTTP 400) |

- **POST**: validated → stored (`instructions: parsedInstructions.value`).
- **PATCH**: `instructions !== undefined` → validated → `updateData.instructions` (so undefined = no change, null/"" clears to NULL).
- Authorization unchanged: the route requires an authenticated admin session; students have no mutation path for instructions (no student API/action writes them — verified).

---

### 6. Admin UX

- **Test Builder**: "Test Instructions" textarea under Assessment Parameters (between Context/Description and Negative Marking), rows 4, `maxLength={5000}`, placeholder *"e.g. This test has 4 sections. No negative marking. You may not use external resources..."*, helper text *"Shown to students before they start. Duration, marks, sections, attempt limit, and negative marking are already displayed automatically."* Client validates trim/≤5000 before submit; empty/whitespace → null.
- **Admin Preview**: `PreviewDraft.instructions?: string | null`; the preview renders a "Test Instructions" panel above the first question when non-empty. Preview remains client-side / `sessionStorage`-based, creates no DB records, no timer, no acknowledgement requirement.

---

### 7. Student UX

On `/tests/[id]`, a "Test Instructions" panel renders **only when `instructions` is non-empty**, positioned immediately before the "Before You Begin" card. All existing content is preserved: badges (type, negative marking, attempt limit), metrics, sections, attempt history, and Start/Resume behavior.

**Acknowledgement** (`StartTestButton`, client-only):
- Shown only when instructions exist **and** there is no active attempt **and** the limit is not reached.
- "☐ I have read and understood the instructions." — Start remains disabled until checked.
- No instructions → no checkbox, Start behaves exactly as before.
- Active attempt → "Resume Test" in one click, checkbox absent (never blocks resume).

---

### 8. Attempt Creation Timing / Timer / Limits (intentionally unchanged)

- Flow remains: Test detail → Instructions → Start → `startAttemptAction` → `startOrResumeAttempt` → attempt created/resumed → attempt route → timer.
- `startOrResumeAttempt` was **not modified** for 7E. Viewing the test or instructions creates zero attempts, consumes zero allowance, zero test time, zero snapshots, zero randomization (audit Suites 6, 8).
- Timer starts only at attempt creation (~1800s for a 30-min test — audit Suite 9).
- Phase 7D attempt limits fully preserved with instructions present (audit Suite 8: limit 1 enforced, allowance never consumed by viewing).
- Refresh/multi-tab/concurrent behavior preserved: refresh returns identical exam state; multiple tabs converge via the 7D advisory lock (audit Suite 13).

---

### 9. Duplicate Test

`duplicateTest` copies `instructions: source.instructions` alongside the other policy fields. It never copies attempts, answers, `attempt_questions`, student history, analytics, or readiness (audit Suite 10: duplicate has the copied instructions and zero attempt rows).

---

### 10. Historical Behavior

Instructions are **pre-start content only**: not snapshotted into `attempt_questions`, not part of the exam payload, not shown on `/tests/[id]/result`. Admin edits after start/submission have **no effect** on active attempts, submitted attempts, results, grading, analytics, or readiness (audit Suites 11–12). Historical result semantics are unchanged.

---

### 11. Security

- Plain text stored/served byte-identical; React escapes at render (no `dangerouslySetInnerHTML` introduced) — audit Suite 5 verifies `<script>`, `onerror`, and `javascript:` payloads remain literal text end-to-end.
- Admin-only mutation via the existing admin route authorization; students have no write path.
- Forged test IDs, anonymous mutation, and unpublished-test behavior are unchanged (same boundaries as title/description).

---

### 12. Tests & Exact Results

#### New: `frontend/src/test/phase-7e-test-instructions-audit.ts` — **38 PASSED, 0 FAILED**

```
==================================================
📜 NEXORA — PHASE 7E: TEST INSTRUCTIONS AUDIT
==================================================
--- TEST SUITE 1: SCHEMA & NULLABLE BEHAVIOR ---
  ✓ PASS: tests.instructions defaults to NULL (no instructions)
--- TEST SUITE 2: VALIDATION RULES ---
  ✓ PASS: null -> NULL (no instructions)
  ✓ PASS: undefined -> NULL
  ✓ PASS: empty string -> NULL
  ✓ PASS: whitespace-only -> NULL
  ✓ PASS: valid string is trimmed
  ✓ PASS: Unicode preserved
  ✓ PASS: Multiline content preserved (newlines intact)
  ✓ PASS: Exactly 5000 characters accepted
  ✓ PASS: >5000 characters rejected
  ✓ PASS: Non-string value rejected
--- TEST SUITE 3: STORAGE, UPDATE & EXPOSURE ---
  ✓ PASS: Instructions stored on test creation
  ✓ PASS: Instructions updated
  ✓ PASS: Instructions cleared back to NULL
--- TEST SUITE 4: VISIBILITY VIA getTestDetails ---
  ✓ PASS: getTestDetails exposes instructions to the student
  ✓ PASS: Absent instructions exposed as NULL (panel hidden by UI)
--- TEST SUITE 5: XSS SAFE STORAGE ---
  ✓ PASS: XSS payload stored and served byte-identical as plain text (no sanitizer mangling)
  ✓ PASS: <script> remains literal text in storage
  ✓ PASS: Event-handler string remains literal text
  ✓ PASS: Unsafe link string remains literal text
--- TEST SUITE 6: VIEWING CREATES NO ATTEMPT ---
  ✓ PASS: Viewing the test detail creates ZERO attempts
--- TEST SUITE 7: ACKNOWLEDGEMENT SEMANTICS (server side) ---
  ✓ PASS: Server creates the attempt without requiring acknowledgement (client-side gating only)
  ✓ PASS: Resume works in one click with instructions present (acknowledgement never blocks resume)
--- TEST SUITE 8: ATTEMPT LIMIT INTERACTION ---
  ✓ PASS: Attempt limit still enforced with instructions present
  ✓ PASS: Viewing instructions never consumed the allowance
--- TEST SUITE 9: TIMER STARTS AT ATTEMPT CREATION ---
  ✓ PASS: Timer starts at attempt creation (~1800s remaining, got 1800)
--- TEST SUITE 10: DUPLICATE TEST ---
  ✓ PASS: Duplicate test copies instructions
  ✓ PASS: Duplicate test copies NO attempt history
--- TEST SUITE 11: HISTORICAL & POST-START EDITS ---
  ✓ PASS: Admin instructions edit after start does NOT affect the active attempt
  ✓ PASS: Instruction edits after submission do NOT alter the historical result
  ✓ PASS: Submitted attempt status unchanged after instruction edit
--- TEST SUITE 12: ANALYTICS / READINESS UNCHANGED ---
  ✓ PASS: Readiness unchanged by instructions (no scoring/analytics effect)
  ✓ PASS: Score and accuracy of historical attempts unchanged
--- TEST SUITE 13: REFRESH, MULTI-TAB & CONCURRENT START ---
  ✓ PASS: Refresh returns identical exam state (instructions not part of exam payload)
  ✓ PASS: Multiple tabs converge on the same active attempt (7D protection intact)
--- TEST SUITE 14: FULL-FLOW REGRESSION COMPATIBILITY ---
  ✓ PASS: Full flow: attempt graded with instructions present
  ✓ PASS: Full flow: score computed normally
  ✓ PASS: Full flow: instructions still served alongside randomization/marking configuration
==================================================
AUDIT RESULTS: 38 PASSED, 0 FAILED
==================================================
```

#### Regression sweep (all executed after implementation)

| Suite | Result |
|---|---|
| Phase 7E Test Instructions | **38 PASSED, 0 FAILED** |
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
- **ESLint** (`npm run lint`): **0 errors**, 58 warnings (the pre-7E baseline; the Phase 7E files add zero warnings).
- **Production build** (`npm run build`): **success** — all static + dynamic routes compiled cleanly.

---

### 13. Known Limitations

1. **Acknowledgement is client-only** (by design). A determined client can start without checking the box; the server has nothing to verify, so this is a UX nudge, not access control. Server-persisted acknowledgement would require a new server action + stored field (deferred).
2. **Plain text only**: no rich text/Markdown; a future rich-text format would be a separate, sanitized, reviewed feature.
3. **5000-char cap** is a judgment call (description uses 2000); adjustable without a schema change.
4. **Unpublished-test direct-URL access** remains possible (pre-existing) — instructions inherit the same visibility boundary as title/description.

---

### 14. Final Status

| Acceptance criterion | Status |
|---|---|
| Instructions stored as nullable plain text | ✅ (migration + schema; audit Suite 1) |
| Admin can create/edit them | ✅ (builder + POST/PATCH; audit Suites 2–3) |
| Validation works (null/empty/whitespace/5000/type) | ✅ (audit Suite 2) |
| Students see them before starting | ✅ (detail-page panel; audit Suite 4) |
| Acknowledgement gates only NEW attempts | ✅ (checkbox client-side; audit Suite 7 server-side) |
| Resume is never blocked | ✅ (audit Suite 7) |
| Viewing instructions creates no attempt | ✅ (audit Suite 6) |
| Instructions consume no timer | ✅ (audit Suite 9) |
| Attempt limits remain correct | ✅ (audit Suite 8) |
| Preview works | ✅ (PreviewDraft + panel; code-verified) |
| Duplicate copies instructions | ✅ (audit Suite 10) |
| Historical results unchanged | ✅ (audit Suites 11–12) |
| No XSS vulnerability introduced | ✅ (plain text + React escaping; audit Suite 5) |
| No analytics/readiness changes | ✅ (audit Suite 12) |
| All required tests pass | ✅ 38/38 + 9/9 suites green |
| TypeScript 0 errors | ✅ |
| ESLint 0 errors | ✅ |
| Production build succeeds | ✅ |

Phase 7E is complete: test instructions are stored as nullable plain text, configured by admins, shown to students before they start, gated by a client-only acknowledgement for new attempts only, and completely inert with respect to attempts, timers, limits, scoring, analytics, and readiness.

---

PHASE 7E IMPLEMENTATION COMPLETE — TEST INSTRUCTIONS ENABLED.