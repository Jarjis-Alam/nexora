<div align="center">

# 🎓 Nexora

### The Operating System for Engineering Placements

An industrial-grade placement-preparation platform engineered for engineering students and university placement cells. Nexora evaluates technical foundations, detects concept vulnerabilities under timed conditions, provides explainable study paths, and aligns preparation with company and role requirements.

<br />

<!-- Technology Badges -->
[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x_Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F?style=for-the-badge&logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Auth.js](https://img.shields.io/badge/Auth.js-v5_Beta-7928CA?style=for-the-badge&logo=auth0&logoColor=white)](https://authjs.dev/)
[![License](https://img.shields.io/badge/License-MIT-emerald?style=for-the-badge)](LICENSE)

<!-- Quality & Verification Badges -->
[![Build](https://img.shields.io/badge/Build-Passing-22c55e?style=flat-square&logo=githubactions&logoColor=white)](https://github.com/Jarjis-Alam/nexora)
[![Type_Checking](https://img.shields.io/badge/Type_Safety-Strict_TS-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![ESLint](https://img.shields.io/badge/Linter-ESLint_9-4B32C3?style=flat-square&logo=eslint&logoColor=white)](https://eslint.org/)
[![Database](https://img.shields.io/badge/Database-11_Migrations_Applied-0284c7?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Security](https://img.shields.io/badge/Security-Strict_CSP_&_RBAC-f43f5e?style=flat-square&logo=securityscorecard&logoColor=white)](#-security-model--compliance)

<br />

[Key Features](#-key-features) • [Platform Architecture](#-platform-architecture) • [Database Architecture](#-database-schema) • [Quick Start](#-quick-start) • [API Reference](#-api-routes-reference) • [Verification](#-verification--quality-assurance)

---

</div>

## 🎯 Value Proposition

Placement preparation is often fractured: students complete disconnected online quizzes, receive superficial percentage scores with no diagnosis of concept weaknesses, and lack targeted guidance for specific job roles and company tiers.

**Nexora solves this by providing a unified feedback loop:**

```
Assess → Calibrate → Diagnose Weaknesses → Personalize Actions → Target Role/Company → Track Readiness
```

- **Zero Hallucinated Metrics**: Fresh student accounts start completely uncalibrated. No vanity progress bars or placeholder metrics appear until genuine diagnostic tests are completed.
- **Server-Evaluated Integrity**: Correct answers and explanations are stripped from active client payloads. Submissions are immutable and graded deterministically on the server.
- **Explainable Recommendations**: Students receive actionable, prioritized recommendations showing *what* to study, *why* it matters, and *which* company/role targets are impacted.

---

## ✨ Key Features

### 1. ⚡ High-Stakes Diagnostic Exam Engine
- **Multi-Section Assessments**: Create tests with independent sections (e.g., Quantitative Aptitude, CS Fundamentals, Core Coding Concepts) with individual or overall time constraints.
- **Negative Marking**: Configurable penalty rates per test or section (e.g., `-0.25`, `-0.33`, `-0.50`, or custom values) with complete audit breakdown.
- **Randomization & Integrity**: Per-student question ordering and option shuffling seeded deterministically to prevent collusion.
- **Dynamic Question Pools**: Assemble tests that draw random questions from curated pools filtered by subject, topic, and difficulty.
- **Attempt Restrictions**: Configure single-attempt or capped multiple-attempt policies with real-time enforcement.
- **Tamper-Resistant Timers**: Authoritative server-side remaining time calculation resilient to browser tab suspension or clock manipulation.
- **Snapshot Hardening**: Questions and options are snapshotted at attempt creation, preserving attempt integrity even if the Question Bank is modified later.

### 2. 🧠 Student Intelligence & Recommendations
- **7 Core Technical Disciplines**: Real-time competency tracking across **Aptitude, Data Structures & Algorithms, DBMS, Operating Systems, Computer Networks, Object-Oriented Programming, and SQL**.
- **Next Best Action Engine**: Deterministic algorithm evaluating recent performance, error frequency, and topic weights to prescribe the single highest-value next step.
- **Topic Weak-Spot Radar**: Automatic detection of critical vulnerability areas based on accuracy thresholds under timed conditions.
- **Effort Allocation Guidance**: Clear recommendations on what to prioritize, what to practice next, and what to stop spending excess time on.

### 3. 🏢 Company & Role Intelligence
- **Target Role Configuration**: Students define target career tracks (Frontend, Backend, Full Stack, SRE/DevOps, Data/ML Engineer, QA Automation).
- **Target Company Tiers**: Track preparation against Tier 1 (FAANG/MAMAA), Tier 2 (Unicorns), Mass Recruiters, Product Firms, and High-Growth Startups.
- **Custom Preparation Focus**: Students tag specialized focus areas (e.g., System Design, Concurrency, Low-Level Design) directly in their profile.
- **Executive Placement Target Card**: Live target summary directly accessible on the student dashboard.

### 4. 📊 Admin & Instructor Analytics
- **Live Monitoring Drawer**: Real-time visibility into students currently taking active tests with elapsed time and heartbeat tracking.
- **Question Discrimination Index**: Diagnostic metrics identifying questions that are too easy, excessively difficult, or statistically non-discriminating.
- **Subject & Topic Performance Matrix**: High-level and granular drop-off and error heatmaps across cohorts.
- **Cohort Comparison Modal**: Compare test metrics side-by-side (mean score, standard deviation, pass rate, completion rate).
- **Scheduled Test Lifecycle**: Full test lifecycle control (`draft` → `scheduled` → `published` → `closed` → `archived`).

---

## 🏛 Platform Architecture

```mermaid
flowchart TD
    subgraph Client["Presentation Layer (React 19 / Next.js 16)"]
        Landing["Landing & Auth (/auth/login)"]
        Dash["Student Dashboard & Intelligence (/dashboard)"]
        Exam["Exam Engine (/tests/[id]/attempt)"]
        Analytics["Student Radar (/analytics)"]
        AdminUI["Admin Suite (/admin/analytics, /admin/tests)"]
    end

    subgraph Security["Security & Middleware Layer"]
        Proxy["Next.js Proxy & Security Headers"]
        Auth["Auth.js (NextAuth v5 JWT)"]
        RBAC["Role-Based Access Control (Admin vs Student)"]
        RateLimit["Sliding-Window Rate Limiter"]
    end

    subgraph Services["Core Business Logic Layer"]
        ExamSvc["Exam & Attempt State Machine"]
        GradingSvc["Deterministic Grading & Negative Marking"]
        ReadinessSvc["Placement Readiness Algorithm (7 Pillars)"]
        IntelSvc["Student Intelligence & Next Action Engine"]
        AdminAnalyticsSvc["Cohort Analytics & Metrics Aggregator"]
        TargetSvc["Company & Role Target Catalog"]
    end

    subgraph Data["Persistence Layer"]
        Drizzle["Drizzle ORM (Strict Schema & Type Safety)"]
        Postgres[(PostgreSQL 16 Engine)]
    end

    Client --> Proxy --> Auth --> RBAC --> RateLimit
    RateLimit --> Services
    ExamSvc --> Drizzle
    GradingSvc --> Drizzle
    ReadinessSvc --> Drizzle
    IntelSvc --> Drizzle
    AdminAnalyticsSvc --> Drizzle
    TargetSvc --> Drizzle
    Drizzle --> Postgres
```

---

## 🛠 Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Framework** | Next.js (App Router, Turbopack) | `16.3.1` | Full-stack server rendering and dynamic routing |
| **UI Library** | React | `19.2.8` | Component architecture & modern concurrent features |
| **Language** | TypeScript | `5.x (Strict)` | End-to-end type safety |
| **Styling** | Tailwind CSS | `v4.0` | Modern utility-first CSS design system |
| **Database** | PostgreSQL | `16+` | Relational data persistence with strict foreign keys |
| **ORM** | Drizzle ORM | `0.45.2` | Type-safe query builder and migration lifecycle |
| **Validation** | Zod | `4.4.3` | Contract and schema payload validation |
| **Authentication** | Auth.js (NextAuth.js) | `5.0.0-beta.32` | JWT session management & HTTP-only cookies |
| **Cryptography** | bcryptjs | `3.0.3` | Password hashing & salt rounds |
| **Data Viz** | Recharts | `3.10.1` | Diagnostic radar charts, bar charts, and trends |
| **Icons** | Lucide React | `1.33.0` | Accessible vector icon library |

---

## 🗄 Database Schema

The database uses a normalized PostgreSQL architecture with 16 core tables and cascading referential integrity:

```
├── Identity & Access
│   ├── users                         # Core authentication records (email, password hash, role)
│   └── profiles                      # Student academic profile (college, branch, graduation year)
│
├── Question Bank & Catalogs
│   ├── subjects                      # 7 core academic disciplines
│   ├── topics                        # 60 syllabus topics categorized under subjects
│   ├── questions                     # Question bank items (options, correct answer, explanation)
│   ├── companies                     # Canonical target companies (name, category, tier, website)
│   └── roles                         # Standard job roles (title, department, required skills)
│
├── Assessment Authoring & Pools
│   ├── tests                         # Test definitions (duration, negative marking, attempt limits)
│   ├── test_sections                 # Test sections with per-section time limits & instructions
│   ├── test_questions                # Ordered association of questions to tests
│   ├── question_pools                # Curated question pools for dynamic assembly
│   └── question_pool_questions       # Questions mapped to pools with sampling weights
│
├── Test Execution & Results
│   ├── attempts                      # Student attempts (status, scores, timestamps, duration)
│   ├── attempt_questions             # Per-attempt snapshotted question and option order
│   ├── answers                       # Candidate responses, review flags, and time spent per item
│   └── skill_scores                  # Derived subject and topic accuracy metrics per attempt
│
└── Student Targets
    ├── student_target_roles          # Student target career roles (primary vs secondary)
    └── student_target_companies      # Target companies prioritized by the student
```

---

## 📁 Project Structure

```
nexora/
├── README.md                              # Repository documentation
├── LICENSE                                # MIT license
├── backend/                               # Legacy reference specifications
└── frontend/                              # Main Next.js 16 Application
    ├── package.json                       # Scripts and dependencies
    ├── next.config.ts                     # Next.js configuration & CSP security headers
    ├── drizzle.config.ts                  # Drizzle Kit migration configuration
    ├── .env.example                       # Environment variable template
    ├── .env.local                         # Local environment secrets (git-ignored)
    └── src/
        ├── app/                           # App Router routes & endpoints
        │   ├── (public)/                  # Landing page & authentication
        │   ├── (protected)/
        │   │   ├── dashboard/             # Student dashboard & placement targets
        │   │   ├── tests/                 # Test catalog, instructions, exam engine
        │   │   ├── analytics/             # Student performance radar & diagnostic metrics
        │   │   ├── profile/               # Student academic & target configuration
        │   │   └── admin/
        │   │       ├── analytics/         # Cohort analytics, test performance, drop-offs
        │   │       ├── questions/         # Question Bank authoring & filtering
        │   │       ├── tests/             # Test Builder, pool composition, test preview
        │   │       ├── companies/         # Canonical company catalog management
        │   │       └── roles/             # Career role catalog management
        │   └── api/                       # REST API route handlers
        ├── components/                    # Component library
        │   ├── admin/                     # Analytics dashboards, test builders, modals
        │   ├── assessment/                # Exam engine, question palette, review table
        │   ├── layout/                    # Responsive sidebar, navigation, developer drawer
        │   └── profile/                   # Target role and company selection dialogs
        ├── db/                            # Database infrastructure
        │   ├── schema.ts                  # Drizzle ORM schema definitions
        │   ├── migrations/                # Drizzle migration files (0000 - 0011)
        │   ├── index.ts                   # PostgreSQL connection pool with fail-fast
        │   ├── bootstrap.ts               # Idempotent canonical seed & admin bootstrapper
        │   └── seed.ts                    # Development demo dataset generator
        ├── lib/                           # Shared utility libraries & validators
        │   ├── lifecycle.ts               # Test lifecycle state transitions
        │   ├── instructions.ts            # Test instruction parsers
        │   ├── random.ts                  # Cryptographic deterministic shuffling
        │   └── validations/               # Zod validation contracts
        ├── server/                        # Backend service layer
        │   ├── actions.ts                 # Next.js Server Actions
        │   ├── grading.ts                 # Server-side grading & negative marking
        │   ├── readiness.ts               # Placement readiness score calculator
        │   ├── student-intelligence.ts    # Next best action & personalized diagnostics
        │   ├── admin-analytics.ts         # Instructor analytics & discrimination index
        │   ├── company-role-intelligence.ts # Company & role targets service
        │   └── tests.ts                   # Attempt management & state recovery
        └── test/                          # Automated regression & verification test suites
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: `v20.x` or `v22.x`
- **PostgreSQL**: `v15+` or `v16+` running on `localhost:5432`

### 1. Clone & Install
```bash
git clone https://github.com/Jarjis-Alam/nexora.git
cd nexora/frontend
npm install
```

### 2. Configure Environment
Create `frontend/.env.local` using `.env.example`:
```bash
cp .env.example .env.local
```

Configure your local database credentials:
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/placement_os"
AUTH_SECRET="generate_with_openssl_rand_base64_32"
AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Run Migrations & Bootstrap Data
Apply all 11 database migrations and populate canonical reference data (core subjects, 60 syllabus topics, roles, companies, and admin user):
```bash
# Execute Drizzle migrations
npm run db:migrate

# Bootstrap canonical reference data
npm run db:bootstrap
```

*(Optional) Seed 160 demo questions and mock test assessments for development:*
```bash
npm run db:seed
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

#### Demo Credentials (from bootstrap/seed):
- **Admin**: `admin@placementos.dev` / `admin123`
- **Student**: `alex.chen@placementos.dev` / `alex123`

---

## 📡 API Routes Reference

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/api/auth/[...nextauth]` | `GET`, `POST` | Public | Auth.js session handshake, sign-in, and sign-out |
| `/api/auth/register` | `POST` | Public | Register new candidate account with password hashing |
| `/api/student/targets` | `GET`, `PUT` | Student | Fetch and update candidate target roles and companies |
| `/api/student/intelligence` | `GET` | Student | Retrieve personalized next best actions and weak areas |
| `/api/companies` | `GET` | Student | Search canonical active company listings |
| `/api/roles` | `GET` | Student | Search canonical active role listings |
| `/api/profile` | `GET`, `PUT` | Student | Manage candidate academic metadata and preferences |
| `/api/admin/tests` | `GET`, `POST` | Admin | List and author multi-section assessments with pools |
| `/api/admin/questions` | `GET`, `POST` | Admin | Question Bank CRUD with subject/topic filtering |
| `/api/admin/analytics` | `GET` | Admin | Cohort overview, pass rates, and active attempts |
| `/api/admin/analytics/tests/[id]`| `GET` | Admin | Test-specific metrics, item discrimination, and drop-offs |
| `/api/admin/companies` | `GET`, `POST` | Admin | Manage company catalog and tier classification |
| `/api/admin/companies/[id]` | `PATCH` | Admin | Update company status, website, and tier |
| `/api/admin/roles` | `GET`, `POST` | Admin | Manage role catalog and required skill matrices |
| `/api/admin/roles/[id]` | `PATCH` | Admin | Update role descriptions, tags, and status |

---

## 🔒 Security Model & Compliance

- **Strict Content Security Policy (CSP)**: Nonce-based script execution, clickjacking prevention (`X-Frame-Options: DENY`), MIME sniffing protection (`X-Content-Type-Options: nosniff`), and HSTS configured in `next.config.ts`.
- **Payload Stripping**: Active assessment payloads permanently omit `correctAnswer` and `explanation`. All evaluation occurs server-side inside PostgreSQL transactions.
- **Session Verification & Immutability**: All student actions verify database identity on every call. Submitted or expired attempts reject all further mutations permanently.
- **Data Isolation**: Multi-tenant data segregation ensures candidates can only access their own attempts, targets, and diagnostic scores.
- **Sliding-Window Rate Limiting**: Built-in protection against brute-force authentication and rapid-fire API spam.

---

## 🧪 Verification & Quality Assurance

Run the automated test suites and compiler checks to verify full codebase health:

```bash
# Validate strict TypeScript type compliance (0 errors)
npx tsc --noEmit

# Execute ESLint across all components and routes (0 errors)
npm run lint

# Core Exam Engine & Deterministic Grading Suite
npx tsx src/test/suite.ts

# Phase 11A Company & Role Intelligence Suite (70 assertions)
npx tsx src/test/phase-11a-company-role-intelligence.ts

# Attempt Engine & Session Recovery Regression
npx tsx src/test/start-test-regression.ts

# Live Production HTTP Endpoint Verification
npx tsx src/test/e2e-http-verification.ts

# Security Regression & Access Control Suite
npx tsx src/test/security-regression.ts

# End-to-End Production Smoke Test
npx tsx src/test/smoke-test-flow.ts

# Verify production build compilation (30/30 routes)
npm run build
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) © 2026 Munshi Jarjis Alam.
