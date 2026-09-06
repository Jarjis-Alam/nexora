import Link from "next/link";
import { auth } from "@/lib/auth";
import { LandingNav } from "@/components/layout/landing-nav";
import { DeveloperFooter } from "@/components/layout/developer-footer";
import { DevButton } from "@/components/layout/dev-modal";

export default async function LandingPage() {
  const session = await auth();

  const navItems = [
    { label: "Features", href: "#features" },
    { label: "Readiness Model", href: "#readiness" },
    { label: "Curriculum", href: "#curriculum" },
  ];

  return (
    <div className="min-h-screen bg-transparent text-text-primary tech-grid selection:bg-primary/30 selection:text-text-primary flex flex-col justify-between">
      {/* Top Navigation */}
      <header className="border-b border-border/80 sticky top-0 z-50 bg-base/80 backdrop-blur-md w-full">
        <div className="container-fluid h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-surface-high flex items-center justify-center border border-border">
              <span className="material-symbols-outlined text-primary-text text-[18px]">
                terminal
              </span>
            </div>
            <span className="font-bold text-title-md tracking-tight">Nexora</span>
          </div>

          <LandingNav items={navItems} />

          <div className="flex items-center space-x-3 sm:space-x-4">
            {/* DEV Profile Trigger */}
            <DevButton variant="nav" />

            {session ? (
              <Link
                href="/dashboard"
                className="bg-primary text-text-inverse font-medium text-body-sm px-5 py-2.5 rounded hover:bg-primary-text transition-colors flex items-center gap-1.5 shadow-sm"
              >
                Go to Dashboard
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-body-sm text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 font-medium"
                >
                  Log In
                </Link>
                <Link
                  href="/auth/register"
                  className="bg-primary text-text-inverse font-medium text-body-sm px-5 py-2.5 rounded hover:bg-primary-text transition-colors shadow-sm"
                >
                  Start Assessment
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-16 pb-12 container-fluid text-center">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-border bg-surface text-label-xs text-text-muted mb-8">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span>PHASE 1 ENGINE LIVE • 7 SUBJECTS • 130+ ASSESSMENTS</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-text-primary mb-6 leading-tight">
          Your Operating System <br className="hidden sm:inline" />
          for <span className="text-primary-text">Placements</span>
        </h1>

        <p className="text-body-md text-text-secondary max-w-2xl mx-auto mb-10 text-lg leading-relaxed">
          Assess your skills, identify your weaknesses, practice smarter, and
          measure your placement readiness with high-precision metrics.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={session ? "/dashboard" : "/auth/register"}
            className="w-full sm:w-auto bg-primary text-text-inverse font-medium text-body-sm px-8 py-3.5 rounded hover:bg-primary-text transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primary/10"
          >
            Start Assessment
            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
          <Link
            href={session ? "/tests" : "/auth/login"}
            className="w-full sm:w-auto bg-surface border border-border text-text-primary font-medium text-body-sm px-8 py-3.5 rounded hover:bg-surface-high transition-colors"
          >
            Explore Tests
          </Link>
        </div>
      </section>

      {/* Readiness Model Section */}
      <section id="readiness" className="container-fluid pb-16 scroll-mt-20">
        <span id="assessment" className="scroll-mt-20 block" aria-hidden="true" />
        {/* Product Visual Container (Stitch Representation) */}
        <div className="p-3 rounded-xl bg-gradient-to-b from-border/50 via-border/20 to-transparent border border-border/60 shadow-2xl">
          <div className="rounded-lg bg-surface border border-border/80 p-6 md:p-8 text-left relative overflow-hidden">
            {/* Window bar */}
            <div className="flex items-center justify-between pb-6 border-b border-border mb-6">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-error/40 border border-error/60" />
                <span className="w-3 h-3 rounded-full bg-tertiary/40 border border-tertiary/60" />
                <span className="w-3 h-3 rounded-full bg-secondary/40 border border-secondary/60" />
                <span className="text-label-xs text-text-muted ml-3 font-mono">nexora-v1.0.app</span>
              </div>
              <div className="text-label-xs text-primary-text font-mono">STATUS: OPTIMAL</div>
            </div>

            {/* Quick Preview Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-base border border-border p-5 rounded-lg">
                <div className="text-label-xs text-text-muted uppercase mb-1">Placement Readiness</div>
                <div className="text-3xl font-bold font-mono text-text-primary mb-2">73%</div>
                <div className="text-label-xs text-secondary font-semibold">COMPETITIVE TIER</div>
                <div className="w-full bg-surface-highest h-1.5 rounded-full mt-3 overflow-hidden">
                  <div className="bg-primary h-full w-[73%]" />
                </div>
              </div>

              <div className="bg-base border border-border p-5 rounded-lg">
                <div className="text-label-xs text-text-muted uppercase mb-1">Benchmark Breakdown</div>
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between text-label-xs">
                    <span className="text-text-muted">DSA & Algo</span>
                    <span className="text-text-primary font-mono">85%</span>
                  </div>
                  <div className="flex justify-between text-label-xs">
                    <span className="text-text-muted">OS & Systems</span>
                    <span className="text-text-primary font-mono">51%</span>
                  </div>
                  <div className="flex justify-between text-label-xs">
                    <span className="text-text-muted">DBMS & SQL</span>
                    <span className="text-text-primary font-mono">77%</span>
                  </div>
                </div>
              </div>

              <div className="bg-base border border-border p-5 rounded-lg">
                <div className="text-label-xs text-text-muted uppercase mb-1">Weak Area Detection</div>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-error" />
                    <span className="text-body-sm text-text-primary">Process Synchronization (OS)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                    <span className="text-body-sm text-text-primary">Graph Algorithms (DSA)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Grid matching Technical Precision Design */}
      <section id="features" className="py-20 container-fluid border-t border-border/80 scroll-mt-20">
        <div className="mb-12 text-center md:text-left">
          <h2 className="text-headline-lg font-bold text-text-primary mb-3">
            Comprehensive Placement Preparation
          </h2>
          <p className="text-body-md text-text-secondary max-w-3xl">
            A modular toolkit engineered for technical rigor. Stop guessing and start measuring with industrial-grade analytics.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
          {/* Card 1: Skill Assessment */}
          <div className="bg-surface/80 backdrop-blur-md border border-border/80 rounded-xl p-8 flex flex-col justify-between hover:border-primary/50 transition-all duration-300 shadow-lg hover:shadow-primary/5">
            <div>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary-text mb-6">
                <span className="material-symbols-outlined text-[24px]">assignment</span>
              </div>
              <h3 className="text-title-md font-semibold text-text-primary mb-3">
                Skill Assessment
              </h3>
              <p className="text-body-sm text-text-secondary mb-8 leading-relaxed">
                Deep-dive technical evaluations across algorithms, system design, and core CS fundamentals.
              </p>
            </div>
            <div className="space-y-4 pt-6 border-t border-border/60">
              <div>
                <div className="flex justify-between text-label-xs mb-1.5">
                  <span className="text-text-muted font-mono">ALGORITHMS</span>
                  <span className="text-text-primary font-mono font-medium">85%</span>
                </div>
                <div className="h-1.5 bg-surface-highest rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-[85%]" />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-label-xs mb-1.5">
                  <span className="text-text-muted font-mono">SYSTEM DESIGN</span>
                  <span className="text-text-primary font-mono font-medium">62%</span>
                </div>
                <div className="h-1.5 bg-surface-highest rounded-full overflow-hidden">
                  <div className="h-full bg-tertiary w-[62%]" />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Readiness Score */}
          <div className="bg-surface/80 backdrop-blur-md border border-border/80 rounded-xl p-8 flex flex-col justify-between hover:border-secondary/50 transition-all duration-300 shadow-lg hover:shadow-secondary/5">
            <div>
              <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary mb-6">
                <span className="material-symbols-outlined text-[24px]">speed</span>
              </div>
              <h3 className="text-title-md font-semibold text-text-primary mb-3">
                Readiness Score
              </h3>
              <p className="text-body-sm text-text-secondary mb-8 leading-relaxed">
                A single weighted metric defining your probability of clearing top-tier technical interviews.
              </p>
            </div>
            <div className="flex items-baseline gap-4 pt-6 border-t border-border/60">
              <span className="text-5xl font-bold font-mono text-text-primary">84</span>
              <span className="text-label-xs text-secondary font-mono flex items-center gap-1">
                <span className="material-symbols-outlined text-[16px]">trending_up</span>
                +12% vs last week
              </span>
            </div>
          </div>

          {/* Card 3: Performance Analytics */}
          <div className="bg-surface/80 backdrop-blur-md border border-border/80 rounded-xl p-8 flex flex-col justify-between hover:border-primary/50 transition-all duration-300 shadow-lg hover:shadow-primary/5">
            <div>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary-text mb-6">
                <span className="material-symbols-outlined text-[24px]">insights</span>
              </div>
              <h3 className="text-title-md font-semibold text-text-primary mb-3">
                Performance Analytics
              </h3>
              <p className="text-body-sm text-text-secondary mb-8 leading-relaxed">
                Time-series tracking of your problem-solving speed, accuracy, and optimal approach rate.
              </p>
            </div>
            <div className="flex items-end gap-2.5 h-14 pt-6 border-t border-border/60">
              <div className="flex-1 bg-border rounded-t h-[40%]" />
              <div className="flex-1 bg-border rounded-t h-[60%]" />
              <div className="flex-1 bg-border rounded-t h-[50%]" />
              <div className="flex-1 bg-primary/70 rounded-t h-[80%]" />
              <div className="flex-1 bg-primary rounded-t h-[95%]" />
            </div>
          </div>

          {/* Card 4: Weak Area Detection */}
          <div className="bg-surface/80 backdrop-blur-md border border-border/80 rounded-xl p-8 flex flex-col justify-between hover:border-tertiary/50 transition-all duration-300 shadow-lg hover:shadow-tertiary/5">
            <div>
              <div className="w-12 h-12 rounded-lg bg-tertiary/10 flex items-center justify-center text-tertiary mb-6">
                <span className="material-symbols-outlined text-[24px]">track_changes</span>
              </div>
              <h3 className="text-title-md font-semibold text-text-primary mb-3">
                Weak Area Detection
              </h3>
              <p className="text-body-sm text-text-secondary mb-8 leading-relaxed">
                Automated isolation of concepts where you consistently underperform under time pressure.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 pt-6 border-t border-border/60">
              <span className="text-label-xs px-3 py-1.5 rounded-md bg-error/10 text-error border border-error/20 font-mono">
                Dynamic Programming
              </span>
              <span className="text-label-xs px-3 py-1.5 rounded-md bg-tertiary/10 text-tertiary border border-tertiary/20 font-mono">
                Graph Theory
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Curriculum & Placement Tests Section */}
      <section id="curriculum" className="py-20 container-fluid border-t border-border/80 scroll-mt-20">
        <span id="tests" className="scroll-mt-20 block" aria-hidden="true" />
        <div className="mb-12 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface text-label-xs text-primary-text font-mono mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            STANDARDIZED SYLLABUS
          </div>
          <h2 className="text-headline-lg font-bold text-text-primary mb-3">
            Placement Curriculum & Mock Tests
          </h2>
          <p className="text-body-md text-text-secondary max-w-3xl">
            Engineered to cover the complete technical interview lifecycle across 7 core subjects and high-fidelity placement simulations.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full items-stretch">
          {/* Left: 7 Core Subjects Curriculum */}
          <div className="lg:col-span-1 bg-surface/80 backdrop-blur-md border border-border/80 rounded-xl p-8 flex flex-col justify-between hover:border-primary/50 transition-all duration-300 shadow-lg">
            <div>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary-text mb-6">
                <span className="material-symbols-outlined text-[24px]">menu_book</span>
              </div>
              <h3 className="text-title-md font-semibold text-text-primary mb-2">
                7 Core Subjects
              </h3>
              <p className="text-body-sm text-text-secondary mb-6 leading-relaxed">
                Complete topic coverage with 60 key competencies and 160 vetted questions.
              </p>

              <ul className="space-y-2.5">
                {[
                  "Data Structures & Algorithms",
                  "Operating Systems & Concurrency",
                  "Database Management & SQL",
                  "Computer Networks & Protocols",
                  "Object-Oriented Programming (OOP)",
                  "System Design Fundamentals",
                  "Aptitude & Quantitative Analysis",
                ].map((subject, idx) => (
                  <li key={idx} className="flex items-center gap-2.5 text-body-sm text-text-primary font-mono text-[13px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <span>{subject}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-6 mt-6 border-t border-border/60 flex items-center justify-between text-label-xs font-mono text-text-muted">
              <span>60 TOPICS</span>
              <span>160 QUESTIONS</span>
            </div>
          </div>

          {/* Right: Placement Tests */}
          <div className="lg:col-span-2 bg-surface/80 backdrop-blur-md border border-border/80 rounded-xl p-8 flex flex-col justify-between hover:border-primary/50 transition-all duration-300 shadow-lg hover:shadow-primary/5">
            <div>
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary-text mb-6">
                <span className="material-symbols-outlined text-[24px]">quiz</span>
              </div>
              <h3 className="text-title-md font-semibold text-text-primary mb-3">
                Placement Tests
              </h3>
              <p className="text-body-sm text-text-secondary mb-6 max-w-2xl leading-relaxed">
                Curated mock tests covering Aptitude, CS Fundamentals, and Full-Stack Placement rounds designed to simulate exact interview environments with strict time limits and server-side evaluation.
              </p>

              {/* Ready Test Chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {[
                  { name: "Comprehensive Placement Assessment", meta: "50 Questions • 60 Mins", tag: "BASELINE" },
                  { name: "Core CS Fundamentals Benchmark", meta: "40 Questions • 45 Mins", tag: "CS CORE" },
                  { name: "Advanced Data Structures & Algorithms", meta: "35 Questions • 45 Mins", tag: "DSA" },
                  { name: "Full-Stack Engineering Mock", meta: "35 Questions • 45 Mins", tag: "SYSTEMS" },
                ].map((test, i) => (
                  <div key={i} className="p-3.5 rounded-lg bg-surface-high/60 border border-border/60 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-body-sm font-semibold text-text-primary truncate">{test.name}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-primary/10 text-primary-text border border-primary/20 shrink-0">
                        {test.tag}
                      </span>
                    </div>
                    <span className="text-label-xs font-mono text-text-muted">{test.meta}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <span className="text-label-xs text-text-muted font-mono tracking-wider">
                4 READY TESTS • 160 CURATED QUESTIONS
              </span>
              <Link
                href="/tests"
                className="text-primary-text hover:text-primary text-body-sm font-semibold flex items-center gap-1.5 group"
              >
                Explore Tests
                <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Developer Details & Footer */}
      <DeveloperFooter />
    </div>
  );
}
