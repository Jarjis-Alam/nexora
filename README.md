# Nexora (Placement OS) — Technical Precision Placement Platform

> **Your Operating System for Placements**

Placement OS is an industrial-grade placement-preparation platform for engineering and computer science students. It accurately assesses technical foundations, detects granular concept weaknesses under time pressure, and computes real-time placement readiness across 7 core technical domains.

---

## 🏗 Architecture & Tech Stack

### Frontend & Application Layer
- **Framework**: Next.js 15+ (App Router) with TypeScript Strict Mode
- **Design System**: Technical Precision (Geist + JetBrains Mono, Obsidian dark surfaces, Electric Blue accents)
- **Styling**: Tailwind CSS v4
- **Charts & Visualizations**: Recharts + Custom SVG Circular Progress Gauges
- **Authentication**: NextAuth.js v5 with Credentials Provider and Session Persistence

### Data & Backend Layer
- **Database**: PostgreSQL 18+ (Normalized Relational Model)
- **ORM & Migrations**: Drizzle ORM + Drizzle Kit
- **Validation**: Zod
- **Grading**: Isolated Server-Side Deterministic Grading Engine with Question Security

---

## 🚀 Quickstart Guide

### Prerequisites
- Node.js `v20+` or `v22+` (Tested on `v26.7.0`)
- npm `v10+` (Tested on `v12.0.2`)
- PostgreSQL `v15+` running on localhost:5432

### 1. Installation
```bash
cd frontend
npm install
```

### 2. Environment Configuration
Create `frontend/.env.local`:
```env
DATABASE_URL=postgresql://postgres@localhost:5432/placement_os
AUTH_SECRET=generate-a-secure-secret-here
AUTH_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database Setup & Migrations
```bash
# Push schema to PostgreSQL
npm run db:push
# or npx drizzle-kit push
```

### 4. Database Seeding (130+ Questions, 7 Subjects, 4 Mock Tests)
```bash
npx tsx src/db/seed.ts
```

This seeds:
- **7 Subjects**: Aptitude, DSA, DBMS, OS, Computer Networks, OOP, SQL
- **60 Granular Topics**
- **134+ Curated Assessment Items** (Easy, Medium, Hard)
- **4 Tests**: Baseline Assessment, Aptitude Assessment, CS Fundamentals, Mixed Placement Test
- **1 Admin Account**: `admin@placementos.dev` / `admin123`

### 5. Running the Application
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view Placement OS.

---

## 🧪 Testing

Execute the automated test suite verifying question security, server-side grading, answer recovery, readiness algorithms, and immutability:

```bash
cd frontend
npx tsx src/test/suite.ts
```

Build validation:
```bash
npm run build
```

---

## 📐 Domain Models & Scoring Algorithm

### 1. Phase 1 Core Subjects
| Code | Subject | Category |
|------|---------|----------|
| `APT` | Aptitude (Quant, Logic, Verbal) | Aptitude |
| `DSA` | Data Structures & Algorithms | Computer Science |
| `DBMS` | Database Management Systems | Computer Science |
| `OS` | Operating Systems | Computer Science |
| `CN` | Computer Networks | Computer Science |
| `OOP` | Object Oriented Programming | Computer Science |
| `SQL` | SQL & Query Optimization | Computer Science |

### 2. Placement Readiness Score Formulation
$$ \text{Readiness} = (0.2 \times \text{APT}) + (0.2 \times \text{DSA}) + (0.3 \times \text{Core CS}) + (0.1 \times \text{SQL}) + (0.1 \times \text{Overall Test}) + (0.1 \times \text{Consistency}) $$

- **Core CS**: Average accuracy across DBMS, OS, CN, and OOP.
- **Tiers**:
  - `90 - 100`: Elite
  - `75 - 89`: Placement Ready
  - `60 - 74`: Competitive
  - `40 - 59`: Developing
  - `0 - 39`: Beginner
- **Zero Fake Data Policy**: If baseline assessment is not yet completed, readiness remains `Uncalibrated` until calibrated by real evaluation.

### 3. Question Security
Answer keys and explanations are **never transmitted** to the browser during active attempts. Evaluation is performed strictly server-side upon completion or timer expiry.

---

## 📂 Project Structure

```
placement-os/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/                # Login & Registration
│   │   │   ├── (protected)/           # Protected Route Group
│   │   │   │   ├── dashboard/         # Student Dashboard (Readiness, Skills, Activity)
│   │   │   │   ├── tests/             # Test Catalog & Details
│   │   │   │   │   ├── [id]/attempt/  # Exam Engine
│   │   │   │   │   └── [id]/result/   # Results & Review
│   │   │   │   ├── analytics/         # Performance Analytics
│   │   │   │   ├── profile/           # Developer Profile
│   │   │   │   └── admin/             # Question Bank & Test Builder
│   │   │   ├── api/                   # API Endpoints
│   │   │   ├── layout.tsx             # Root layout with fonts & providers
│   │   │   └── page.tsx               # Landing Page
│   │   ├── components/
│   │   │   ├── layout/                # Responsive Sidebar Navigation
│   │   │   ├── assessment/            # Exam Engine & Detailed Review Table
│   │   │   ├── analytics/             # Recharts Visualizations
│   │   │   ├── profile/               # Profile Editor
│   │   │   └── admin/                 # Question Form & Test Builder
│   │   ├── db/
│   │   │   ├── schema.ts              # Normalized Relational Schema
│   │   │   ├── index.ts               # Connection Pool
│   │   │   └── seed.ts                # Database Seeder
│   │   ├── server/
│   │   │   ├── grading.ts             # Server-Side Grading Service
│   │   │   ├── readiness.ts           # Readiness & Weak Area Logic
│   │   │   ├── analytics.ts           # Analytics Aggregation
│   │   │   ├── tests.ts               # Test Lifecycle & Security
│   │   │   └── actions.ts             # Next.js Server Actions
│   │   └── test/
│   │       └── suite.ts               # Automated Verification Suite
└── README.md
```
>>>>>>> b6231de (feat: complete Placement OS platform with Next.js, WebGL shaders, ReactBits UI, and responsive system)
