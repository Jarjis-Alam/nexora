# NEXORA PRODUCTION DASHBOARD 500 — FIX REPORT

**Task:** Fix `ERR_500_SYSTEM_FAULT` (Digest `2277838918`) on `https://nexora-rosy-five.vercel.app/dashboard`.
**Scope:** Targeted debugging only. No Phase 11A feature work. No new features.

---

## 1. EXACT ROOT CAUSE

**The production database schema is behind the deployed application code.**

The `/dashboard` server component **unconditionally** calls `getStudentPlacementTargets()` which queries four tables — `student_target_roles`, `roles`, `student_target_companies`, `companies` — created by migration `0011_phase_11a_company_role_intelligence.sql`. When those relations do not exist in the production database, PostgreSQL raises `relation "student_target_roles" does not exist`, the exception propagates out of the server component, and the root `error.tsx` boundary renders — producing exactly the observed browser output `ERR_500_SYSTEM_FAULT` + a digest.

Students **with** completed data would additionally crash inside `getStudentIntelligence()` (Phase 10) on the Phase 7F tables (`question_pools`, `question_pool_questions` — migration `0008`) and the Phase 8 lifecycle columns (`tests.status`, `scheduled_*` — migration `0009`). Either way the page 500s; the Phase 11A query is the guaranteed crash point for **every** student, including brand-new zero-data students — matching the report.

## 2. EVIDENCE FOR THE ROOT CAUSE

1. **Git history:** commit `7f7df63` is titled *"feat: complete Phase 6C through 11A (test engine, lifecycle, analytics, student intelligence & company/role targets)"*. The Phase 11A import + call entered `frontend/src/app/(protected)/dashboard/page.tsx` in that commit: `0` matches in the pre-11A tree (`5a85042`), `2` matches at HEAD.
2. **Code path:** `dashboard/page.tsx:7` imports `getStudentPlacementTargets` from `@/server/company-role-intelligence`; `page.tsx:45` calls it unconditionally for every authenticated session; `company-role-intelligence.ts:289` queries the four Phase 11A tables.
3. **Browser output:** `ERR_500_SYSTEM_FAULT` is the literal string hard-coded in `frontend/src/app/error.tsx` — i.e., the app's own root error boundary for any uncaught server-render exception (Next.js surfaces the digest alongside it). The error is deterministic (every authenticated user), not intermittent — consistent with a missing-table query rather than a data-condition bug.
4. **Deploy pipeline:** `package.json` scripts are `build: next build` / `start: next start` — **no automated migration step** runs at deploy. Migrations are applied manually, so the production DB can legitimately be behind the code.
5. **Zero-data analysis:** for a fresh student, `getStudentIntelligence()` early-returns safely (attempts/tests/readiness queries use only base tables), so the **only** unconditional query touching post-`0007` schema is the Phase 11A one — exactly matching your critical zero-data scenario.
6. **Local environment:** the local dev DB (`placement_os`) is fully migrated through `0011` and the dashboard renders correctly there (verified live via the HTTP suites) — proving the code is correct **once the schema is complete**. Production is the difference.
7. **No prod access used:** local `DATABASE_URL` points to `localhost`; no Vercel CLI/account or prod credentials were available. Per the approved plan, no production access was used.

## 3. WHY THE ERROR APPEARED

The dashboard (and `/profile`) code requiring Phase 11A / 7F / 8 schema shipped and deployed, but the production database never received migrations `0008`–`0011` (applied manually; the workflow is psql-by-hand, and nothing runs them automatically). The first page a logged-in student hits (`/dashboard`) immediately executes the missing-table queries → 500.

## 4. EXACT FILE / FUNCTION RESPONSIBLE

- `frontend/src/app/(protected)/dashboard/page.tsx` — line 45: `const placementTargets = await getStudentPlacementTargets(userId);` (unconditional)
- `frontend/src/server/company-role-intelligence.ts` — `getStudentPlacementTargets()` (lines 289+): queries `student_target_roles` ⋈ `roles`, `student_target_companies` ⋈ `companies`
- Upstream schema dependency: `frontend/src/db/migrations/0011_phase_11a_company_role_intelligence.sql`
- Secondary (students with data): `frontend/src/server/student-intelligence.ts` — queries `question_pools`/`question_pool_questions` (migration `0008`) and `tests.status`/`scheduled_*` (migration `0009`)

## 5. EXACT FIX APPLIED

**No application code changes** (per approved plan — the code is correct once the schema exists). The fix is **production schema completion**: apply the existing, already-registered, idempotent migrations `0008` → `0009` → `0010` → `0011` to the production database.

This environment could not apply them (no production access) — the exact steps for you to run are in §12. All four files exist in the repo and are registered in `_journal.json`; none are new.

## 6. FILES CHANGED

- `dashboard-500-fix-report.md` — this report (the only change; `git status` clean otherwise).

## 7. DATABASE / MIGRATION FINDINGS

- **Local dev DB (`placement_os`)** contains all required relations: `question_pools`, `question_pool_questions` (0008); `tests.status` + `scheduled_start_at`/`scheduled_end_at`/`schedule_timezone` (0009); `companies`, `roles`, `student_target_roles`, `student_target_companies` (0011).
- **Journal** (`_journal.json`) registers migrations `0000`–`0011`.
- **Idempotency verified locally:**
  - `0009`, `0010`, `0011` re-apply cleanly as no-ops (`NOTICE … already exists, skipping`, no errors, exit 0).
  - `0008` is **not** fully idempotent: its two FK constraints use plain `ADD CONSTRAINT` (no exception guard). Re-running it on an already-migrated DB errors; a **fresh** apply (the production case) succeeds. Apply it only if `question_pools` is absent.
- `0009` includes a safe backfill: it populates the **new** `status` column from existing `is_published` — no existing column/data is rewritten.
- No migration mismatch of any other kind found; no missing columns beyond those covered by 0008/0009/0011.

## 8. AUTHENTICATION FINDINGS

- `/dashboard` uses the standard `auth()`; unauthenticated users get `null` and the middleware redirects to `/auth/login` (verified by the security/smoke suites: anonymous access is redirected).
- Session lookup is null-safe (`profile?.name || session.user.name`); no stale-session crash path identified; no auth rewrite needed.

## 9. PHASE 10 FINDINGS

- `getStudentIntelligence()` is **zero-data safe**: fresh users early-return with `hasCompletedBaseline: false`, null readiness, empty recommendations — no fake data, no crash (verified live: fresh registered student's dashboard renders `--%` UNCALIBRATED).
- For users with data it correctly requires migrations `0008`/`0009` relations — another reason schema completion is the fix.
- No logic defect found in Phase 10.

## 10. TESTS RUN

DB-level suites (no server needed):

| Suite | Command | Result |
|---|---|---|
| Core suite | `npx tsx src/test/suite.ts` | 19 PASSED, 0 FAILED |
| Start-test regression | `npx tsx src/test/start-test-regression.ts` | 23 PASSED, 0 FAILED |
| Phase 11A intelligence | `npx tsx src/test/phase-11a-company-role-intelligence.ts` | 70 PASSED, 0 FAILED |

HTTP-level suites (against `next start` on `localhost:3000` — the exact dashboard code path):

| Suite | Result |
|---|---|
| Security regression (`security-regression.ts`) | 14/14 vectors verified |
| Production smoke flow (`smoke-test-flow.ts`) | all flows pass (landing → login → dashboard → tests → attempt → result → analytics → profile → admin) |
| E2E HTTP verification (`e2e-http-verification.ts`) | 30 PASSED, 1 FAILED — see below |

**The e2e dashboard assertions — the subject of this task — PASS:** fresh registered student → `/dashboard` returns 200, renders greeting + readiness component, shows `--%` / UNCALIBRATED zero-fake-data state.

## 11. TEST RESULTS — QUALITY GATES

- `npx tsc --noEmit` → **0 errors**
- `npm run lint` → **0 errors** (132 pre-existing warnings; no source files touched)
- `npm run build` → **succeeds** (all routes compiled, incl. `/dashboard` as dynamic server route)

**The single e2e failure is pre-existing copy drift, unrelated to this task:** `e2e-http-verification.ts` Step 6 asserts the analytics empty state contains `"Your analytics will appear here"`, but the page (200 OK) renders `"Your intelligence analytics will appear here."`. The test expectation is stale relative to the UI copy; it would fail identically on a clean checkout. Per instructions, no tests were modified to hide it.

## 12. PRODUCTION VERIFICATION — APPLY THE FIX (USER ACTION REQUIRED)

No production access was available, so the fix must be applied by you. Steps:

**Step 1 — verify current production schema (read-only):**
```bash
psql "$PROD_DATABASE_URL" -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('question_pools','question_pool_questions','companies','roles','student_target_roles','student_target_companies') ORDER BY tablename;"
psql "$PROD_DATABASE_URL" -tAc "SELECT column_name FROM information_schema.columns WHERE table_name='tests' AND column_name IN ('status','scheduled_start_at','scheduled_end_at','schedule_timezone') ORDER BY column_name;"
```

**Step 2 — apply only the missing migrations, in order** (from the repo root):
```bash
cd frontend
# Apply each file individually; if a file errors with "already exists", that migration is already applied — skip it.
psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/0008_phase_7f_question_pools.sql
psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/0009_phase_8_test_lifecycle_scheduling.sql
psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/0010_phase_9_admin_analytics_indexes.sql
psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -f src/db/migrations/0011_phase_11a_company_role_intelligence.sql
```
Notes: `--> statement-breakpoint` lines are SQL comments (psql ignores them). Do **not** run `seed.ts`; do not truncate/delete/reset anything. After migration the `companies`/`roles` tables are empty until the optional idempotent canonical seed (`npm run db:bootstrap`) is run — the app handles this correctly (dashboard shows "No target role selected").

**Step 3 — verify in the browser:** open `/dashboard`, `/profile`, `/analytics`, `/tests`, `/assessment`; confirm the readiness ring, skill overview, recent activity, Next Actions (Phase 10), and the Placement Target card render.

## 13. PRODUCTION DATA MODIFIED

None by this work (no production access was used). The recommended prod step modifies only the **new** `tests.status` column via 0009's backfill; no existing rows/columns are altered.

## 14. ENVIRONMENT VARIABLES CHANGED

None. `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL` were confirmed present (names only — no values printed or exposed).

## 15. KNOWN LIMITATIONS

1. **Production not yet verified** — the migration application requires your action (no prod access here). Final status below is honest: not yet confirmed in production.
2. **Digest `2277838918`** cannot be reverse-mapped to the exception text; if you have Vercel runtime logs, the error line should read `relation "student_target_roles" does not exist` (or `question_pools` / `tests.status` for with-data users) — that would be definitive confirmation.
3. **`0008` non-idempotency** — apply it only on a fresh DB (prod expected); if `question_pools` already exists, skip 0008.
4. **Pre-existing e2e copy drift** (Step 6 analytics string) — unrelated, unfixed per instructions.
5. **Empty 11A catalogs** until optional canonical seed runs; not required for the dashboard to render.

---

ROOT CAUSE:
Production DB is missing migrations 0008–0011. `/dashboard` (and `/profile`) unconditionally query Phase 11A tables (`student_target_roles`, `roles`, `student_target_companies`, `companies`) via `getStudentPlacementTargets()`, and the with-data path additionally queries Phase 7F/8 relations inside `getStudentIntelligence()`. Missing relations → `relation … does not exist` → uncaught → root `error.tsx` boundary → `ERR_500_SYSTEM_FAULT` (Digest 2277838918), deterministic for every authenticated student.

FIX:
Apply the existing, already-registered migrations `0008 → 0009 → 0010 → 0011` to the production DB (commands in §12). Zero application-code changes — the code is verified correct on a fully-migrated schema.

FILES CHANGED:
`dashboard-500-fix-report.md` only (git status clean; no app/schema/test changes).

TESTS:
suite 19/19 · start-test 23/23 · phase-11a 70/70 · security 14/14 · smoke all-pass · e2e 30/31 (1 pre-existing copy-drift, dashboard steps pass) · `tsc --noEmit` 0 errors · ESLint 0 errors · production build succeeds.

PRODUCTION:
Not verified (no access). Pending: apply migrations §12, then confirm `/dashboard`, `/profile`, `/analytics`, `/tests`, `/assessment` render.

PHASE 11A:
NOT IMPLEMENTED — DO NOT START YET
(Note: the repo already contains a committed Phase 11A implementation from `7f7df63`; no Phase 11A code was added or changed by this work.)

FINAL STATUS:
NOT FIXED (production) — root cause identified with high confidence and fix prepared; awaiting production migration application + browser verification. Local evidence (fully-migrated DB + all suites + live HTTP checks) confirms the dashboard renders correctly once the schema is complete.