# Nexora

Your Operating System for Placements

Nexora is an industrial-grade placement-preparation platform for engineering students. It accurately assesses technical foundations, detects granular concept weaknesses under time pressure, and computes real-time placement readiness across 7 core technical domains.

---

## 🎯 Product Overview

Nexora is engineered around a continuous placement-readiness feedback loop:
```
Assess → Practice → Analyze → Identify Weaknesses → Improve → Track Readiness
```

- **Objective Evaluation**: Rigorous server-evaluated assessments with strictly controlled timers.
- **Granular Diagnostics**: Topic-level accuracy tracking, topic breakdown, and weak-area identification across 60 syllabus topics.
- **Genuine Placement Readiness Index**: Calibrated composite readiness score weighted by subject priority, difficulty factors, and baseline completion.
- **Zero Hallucinated Metrics**: Uncalibrated/fresh student accounts start cleanly with zero fabricated progress until authentic diagnostic tests are completed.

---

## ✨ Core Features

1. **Enterprise Authentication**: NextAuth.js v5 with bcryptjs password hashing, HTTP-only JWT session cookies, self-healing DB validation, and role-based access control (`student` vs `admin`).
2. **Assessment & Attempt Engine**:
   - Single-attempt enforcement and resume persistence across page reloads/refreshes.
   - Authoritative server-side remaining time calculation resilient to client tab throttling.
   - Real-time question navigation, question palette with review marking, and instant answer state sync.
3. **Server-Side Grading & Security**:
   - Zero leakage of `correctAnswer` or `explanation` in active test payloads.
   - Server-evaluated scoring; clients cannot manipulate marks or inject `isCorrect`.
   - Complete immutability of submitted attempts.
4. **Placement Readiness & Diagnostics Engine**:
   - Multi-factor algorithm evaluating Aptitude, DSA, DBMS, OS, Computer Networks, OOP, and SQL.
   - Detection of critical concept weaknesses based on sub-50% accuracy thresholds.
5. **Student Analytics & Radar Profiles**:
   - Subject-level competency radar charts, difficulty distribution metrics, and weak topic alerts.
6. **Administrator Control Suite**:
   - Question Bank management (create, update, filter by subject, topic, and difficulty).
   - Test Builder (compose multi-subject assessments with deterministic question sequencing).

---

## 🏗 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | Next.js 16 (App Router, Server & Client Components) |
| **Language & Runtime** | TypeScript 5 (Strict Mode), Node.js v20+ / v22+ |
| **Styling & UI System** | Tailwind CSS v4, Lucide Icons, Material Symbols |
| **Authentication** | Auth.js (NextAuth v5 beta), bcryptjs |
| **Database** | PostgreSQL 16+ (Normalized Relational Architecture) |
| **ORM & Migrations** | Drizzle ORM, Drizzle Kit |
| **Schema Validation** | Zod v4 |
| **Charts & Analytics** | Recharts, SVG Progress Indicators |

---

## 🏛 Architecture Overview

```
Next.js 16 (App Router / React 19)
       ↓
Auth.js (Session & Role Verification)
       ↓
Server Actions & Route Handlers (Input Validation via Zod)
       ↓
Business Logic (Exam Engine, Grading, Readiness Algorithm)
       ↓
Drizzle ORM (Type-Safe Queries & Schema Definitions)
       ↓
PostgreSQL 16 (Relational Database with Foreign Key Cascades & Indexes)
```

---

## 📁 Project Structure

```
nexora/
├── README.md                      # Workspace documentation
├── backend/                       # Legacy python dependencies
├── stitch designs/                # Stitch UI specification exports
└── frontend/                      # Main Next.js Application
    ├── package.json               # Scripts and dependencies
    ├── next.config.ts             # Next.js & security headers configuration
    ├── drizzle.config.ts          # Drizzle Kit migration configuration
    ├── .env.example               # Environment template
    ├── .env.local                 # Local environment secrets (git-ignored)
    └── src/
        ├── app/                   # App Router pages and API routes
        │   ├── (public)/          # Landing, login, registration
        │   ├── dashboard/         # Student placement dashboard
        │   ├── tests/             # Catalog, details, attempt engine, results
        │   ├── analytics/         # Performance analytics & radar charts
        │   ├── profile/           # Student academic profile & settings
        │   ├── admin/             # Admin Question Bank & Test Builder
        │   └── api/               # Auth, registration, profile, admin endpoints
        ├── components/            # Reusable UI & Stitch-aligned components
        ├── db/                    # Drizzle connection, schema, seed, migrations
        │   ├── schema.ts          # Relational PostgreSQL schema definitions
        │   ├── migrations/        # Production Drizzle migration SQL files
        │   ├── index.ts           # Connection pool & fail-fast configuration
        │   └── seed.ts            # Development/demo seed data (160 questions)
        ├── lib/                   # Auth configurations, rate limiting, utils
        ├── server/                # Server actions, grading engine, readiness logic
        └── test/                  # Automated verification & audit suites
```

---

## ⚙️ Local Setup

### 1. Prerequisites
- **Node.js**: `v20.x` or `v22.x`
- **PostgreSQL**: `v15+` running on `localhost:5432`

### 2. Installation
```bash
cd frontend
npm install
```

### 3. Environment Variables
Create `frontend/.env.local` based on `.env.example`:
```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/placement_os
AUTH_SECRET=a_very_secure_random_string_at_least_32_chars_long
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 💾 Database Setup & Migrations

### Development Schema Sync
```bash
npm run db:push
```

### Production Migration Strategy
In production environments, Drizzle migrations are tracked and executed without running development seed scripts:
```bash
# Generate SQL migration file from schema changes:
npm run db:generate

# Execute pending SQL migrations against production PostgreSQL:
npm run db:migrate
```

### Development Seed Data
To populate the 7 core subjects, 60 topics, 160 questions, 4 mock assessments, and demo accounts:
```bash
npm run db:seed
```
> **Safety Guard**: `seed.ts` contains an automatic production lock. It will refuse to run in `NODE_ENV=production` unless `ALLOW_DESTRUCTIVE_SEED=true` is explicitly provided.

### Default Seed Credentials (Development Only)
- **Admin**: `admin@placementos.dev` / `admin123`
- **Student**: `alex.chen@placementos.dev` / `alex123`

---

## 🏃 Development & Production Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start development server with Turbopack on `http://localhost:3000` |
| `npm run build` | Compile and build optimized production bundle |
| `npm run start` | Run production server on `http://localhost:3000` |
| `npm run lint` | Execute ESLint audit across the codebase |
| `npx tsc --noEmit` | Validate strict TypeScript type compliance |
| `npm run db:generate` | Generate SQL migration from schema |
| `npm run db:migrate` | Execute Drizzle migrations on PostgreSQL |
| `npm run db:seed` | Seed development database |

---

## 🚀 Production Deployment Notes

### Recommended Deployment Architecture
- **Web Application**: Node.js container (Docker) or Serverless hosting (Vercel, AWS ECS, Railway, Render) running Next.js standalone.
- **Database**: Managed PostgreSQL instance (AWS RDS, Supabase, Neon, Railway) with connection pooling.
- **Caching & Rate Limiting**: Redis or managed in-memory store for high-throughput distributed rate limiting.

### Production Environment Checklist
1. `DATABASE_URL`: Must point to production PostgreSQL database with SSL enabled.
2. `AUTH_SECRET`: Strong cryptographically random 64-character string (`openssl rand -base64 32`).
3. `AUTH_URL`: Canonical HTTPS domain (e.g., `https://nexora.example.com`).
4. `NEXT_PUBLIC_APP_URL`: Canonical public URL matching `AUTH_URL`.
5. `NODE_ENV`: Set to `production`.

### Production Deployment Procedure
1. Provision managed PostgreSQL database.
2. Run migration: `npm run db:migrate` (or apply `src/db/migrations/0000_violet_kid_colt.sql`).
3. Build container/application: `npm run build`.
4. Launch production server: `npm run start`.
5. Verify health check on `/` and `/api/auth/session`.

---

## 🔒 Security Model & Audit Boundaries

- **HTTP Security Headers**: Strict CSP, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and HSTS configured in `next.config.ts`.
- **Authentication & Sessions**: Auth.js JWT strategy with HTTP-only cookies, 30-day session lifetime, and real-time database user verification to prevent stale session foreign-key violations.
- **Role-Based Access Control**: Strict middleware and server action boundaries preventing students from accessing `/admin/*` routes or mutating admin records.
- **Cross-User Data Isolation**: Exam attempts, answers, and profile mutations are strictly scoped by authenticated `session.user.id`. Student B cannot view or tamper with Student A's data.
- **Exam Integrity**: Active exam payloads strip all `correctAnswer`, `explanation`, and `marks` metadata. All grading is computed deterministically server-side.
- **Attempt Immutability**: Once an attempt is submitted or expired, answer persistence is locked permanently.
- **Rate Limiting**: Sliding-window rate limiter protecting registration (10 req/min) and admin authoring endpoints (30-60 req/min).
- **Safe Error Handling**: Generic user-facing error messages prevent raw database error disclosure or stack trace leaks.

---

## 🧪 Testing Suites

Run all automated test suites:
```bash
# Type check & Linting
npx tsc --noEmit
npm run lint

# Core Algorithm Suite (Grading, Readiness, Immutability)
npx tsx src/test/suite.ts

# Authentication & RBAC Audit (30 assertions)
npx tsx src/test/auth-audit.ts

# Relational Database & Data Layer Audit (40 assertions)
npx tsx src/test/database-audit.ts

# End-to-End Integration Audit (60 assertions)
npx tsx src/test/integration-audit.ts

# Start Test Attempt Engine Regression (23 assertions)
npx tsx src/test/start-test-regression.ts

# UI Spacing, Timers, & Component Validation (39 assertions)
npx tsx src/test/m4-polish-audit.ts

# Live Production HTTP Verification (19 assertions)
npx tsx src/test/e2e-http-verification.ts

# Final Security Regression Suite (14 vector assertions)
npx tsx src/test/security-regression.ts

# End-to-End Production Smoke Test
npx tsx src/test/smoke-test-flow.ts
```
All **250+ automated assertions** pass with 0 failures.
