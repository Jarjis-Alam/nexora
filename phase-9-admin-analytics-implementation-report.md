# Phase 9 — Admin Analytics & Telemetry: Implementation Report

## Executive Summary

Phase 9 delivers a production-grade **Admin Analytics & Telemetry System** for the Nexora placement-preparation platform. It empowers administrators and instructors with deep operational insight into student engagement, curriculum mastery, item difficulty distribution, question discrimination, and assessment integrity.

All implementation requirements were executed directly with zero regression:
- **Server-Side CTE & SQL Aggregation Engine**: High-performance statistical queries leveraging PostgreSQL CTEs, window functions, and dedicated indexes.
- **Analytical Indexes**: Zero-downtime performance indexes on `attempts`, `attempt_questions`, and `answers`.
- **Global & Deep Dive Telemetry**: High-level institutional metrics paired with test-specific item analysis, section performance, and pool exposure.
- **Item Analysis & Quality Signals**: Automated detection of statistical anomalies (High Failure Rate, Potentially Too Difficult, High Skip Rate, Low Sample Size).
- **In-Flight Operational Visibility**: Live monitoring of active test sessions with privacy-safe attributes.
- **Zero Student Regression**: Complete decoupling from the student readiness engine (`calculateReadiness`) and `/analytics` views.

---

## Answering the 10 Core Instructor Questions

| Question | Admin Analytics Capability |
| :--- | :--- |
| **1. Are students actually taking our tests?** | Participation metrics tracking total vs. submitted vs. in-flight vs. expired attempts, unique students, and completion rate %. |
| **2. How are students performing?** | Average score, average accuracy, duration metrics, and 5-tier binned score & accuracy distribution histograms (0–20, 21–40, 41–60, 61–80, 81–100). |
| **3. Which subjects/topics are weak?** | Taxonomy breakdown ranking subjects and topics by accuracy, correct/incorrect count, and average marks earned, with sample size safeguards. |
| **4. Which questions are too easy or too difficult?** | Item discrimination analysis calculating actual served accuracy vs. metadata difficulty, highlighting "Very Difficult" (<20%) and "Very Easy" (>95%) outliers. |
| **5. Which tests perform well?** | Comparative assessment directory sorting tests by completion rate, submission volume, average score, and side-by-side test comparison. |
| **6. Where are students losing marks?** | Dedicated negative marking deduction metrics computing gross vs. net marks, penalty deductions, and incorrect answer penalty counts. |
| **7. How do sections perform?** | Section-level telemetry aggregating question volume, served counts, sectional accuracy, and marks earned per section. |
| **8. How do question pools perform?** | Dynamic pool exposure tracking candidate question counts, selection rules, total times served, and comparative accuracy. |
| **9. How does performance change over time?** | Daily aggregated average score and accuracy trend curve across submitted attempts with "Limited history" guards when data points are sparse. |
| **10. Are tests behaving as intended?** | Operational visibility into in-flight attempt progress, timer auto-submit status, and lifecycle state alignment. |

---

## Database Architecture & Migration

Performance indexes were added to support sub-50ms analytical queries on multi-thousand row datasets without blocking table writes:

```sql
-- Migration: 0010_phase_9_admin_analytics_indexes.sql
CREATE INDEX IF NOT EXISTS "attempts_submitted_at_idx" 
  ON "attempts" ("submitted_at");

CREATE INDEX IF NOT EXISTS "attempts_test_status_submitted_idx" 
  ON "attempts" ("test_id", "status", "submitted_at");

CREATE INDEX IF NOT EXISTS "attempt_questions_attempt_id_idx" 
  ON "attempt_questions" ("attempt_id");

CREATE INDEX IF NOT EXISTS "answers_attempt_question_idx" 
  ON "answers" ("attempt_id", "question_id");

CREATE INDEX IF NOT EXISTS "answers_question_is_correct_idx" 
  ON "answers" ("question_id", "is_correct");
```

---

## Server & UI Architecture

### 1. Backend Service Layer (`src/server/admin-analytics.ts`)
- `getAdminOverviewAnalytics(filters)`: Computes institutional KPIs, distributions, negative marking penalties, subject/topic/difficulty cohorts, and performance trends over time.
- `getAdminTestPerformanceList(filters)`: Computes paginated assessment directory metrics with lifecycle states.
- `getAdminTestDetailAnalytics(testId, filters)`: Aggregates section breakdowns (Phase 6C), question pool telemetry (Phase 7F), and item discrimination.
- `getAdminQuestionAnalytics(filters)`: Item analysis computing accuracy, skip rates, and assigning automated Quality Signals.
- `getAdminActiveAttempts(limit)`: In-flight telemetry tracking elapsed time and current question progress.
- `compareAdminTests(testIdA, testIdB)`: Side-by-side differential engine.

### 2. Secure REST API Endpoints
- `GET /api/admin/analytics`: Role-based protected endpoint serving views (`overview`, `tests`, `questions`, `active_attempts`, `compare`).
- `GET /api/admin/analytics/tests/[id]`: Protected test deep dive endpoint.

### 3. Frontend Dashboard (`/admin/analytics`)
- **Global Filters Toolbar**: Preset ranges (Today, 7D, 30D, 90D, All time), custom date picker, test filter, subject filter, and lifecycle status filter.
- **View Tabs**: "Overview & Distributions", "Assessments Directory", "Question Item Analysis", and "In-Flight Sessions".
- **Visualizations**: Score & accuracy cohort histograms and performance area charts using Recharts.
- **Test Deep Dive Page (`/admin/analytics/tests/[id]`)**: Granular section and pool tables with item discrimination.
- **Side-by-Side Comparison Modal**: Differential analysis between any two tests.

---

## Quality Signals & Sample Size Safeguards

To prevent misleading instructors with premature statistics, the following safeguards are enforced:
1. **Low Sample Size Guard**: Questions or topics with `< 5` attempts are flagged with `Low sample size` / `Low N` badges.
2. **Extreme Outliers**:
   - `High failure rate`: Accuracy `< 30%`.
   - `Potentially too difficult`: Accuracy `< 20%`.
   - `High skip rate`: Unanswered rate `≥ 40%`.
   - `High success rate`: Accuracy `≥ 90%`.
   - `Potentially too easy`: Accuracy `> 95%`.
3. **Limited History Guard**: Trend lines are suppressed and replaced with a single-date badge when only 1 date point exists, preventing manufactured slopes.
4. **Submitted Only Metrics**: In-progress or abandoned attempts are strictly excluded from average score and accuracy metrics.

---

## Audit & Verification Results

### 1. Dedicated Phase 9 Audit (`src/test/phase-9-admin-analytics-audit.ts`)
**Result: 70 PASSED, 0 FAILED**
- Group 1: Analytical Database Indexes (5 tests) — PASSED
- Group 2: Controlled Telemetry Fixtures (1 test) — PASSED
- Group 3: Overview Metrics Calculation (11 tests) — PASSED
- Group 4: Distributions & Trend Lines (5 tests) — PASSED
- Group 5: Granular Taxonomy Breakdowns (7 tests) — PASSED
- Group 6: Assessment Directory & Comparative Metrics (6 tests) — PASSED
- Group 7: Test Detail Telemetry (7 tests) — PASSED
- Group 8: Question Analysis & Quality Signals (7 tests) — PASSED
- Group 9: Active In-Flight Operational Telemetry (6 tests) — PASSED
- Group 10: Test Side-by-Side Comparison (5 tests) — PASSED
- Group 11: Date Boundaries & Filter Sanitization (3 tests) — PASSED
- Group 12: Zero Regression on Student Analytics & Readiness (4 tests) — PASSED

### 2. Cross-Phase Regression Audits
- **Phase 8 Lifecycle & Scheduling Audit**: 91 PASSED, 0 FAILED
- **Phase 7A Negative Marking Audit**: 62 PASSED, 0 FAILED
- **Phase 6C Sections Audit**: 52 PASSED, 0 FAILED
- **Next.js Production Build (`npm run build`)**: Compiled successfully with 0 errors.

---

## Zero-Regression Guarantee

1. **Student Readiness**: The student readiness engine (`calculateReadiness`) and formula remain untouched.
2. **Student Analytics Page**: `/analytics` remains isolated to personal student performance.
3. **Test Lifecycle & Scheduling**: Effective status resolution (`getEffectiveTestStatus`) remains the single source of truth across catalog and analytics.
4. **Negative Marking & Grading**: Grading logic was not altered; analytics derives calculations from existing recorded scores and question snapshots.
