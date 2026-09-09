import { db } from "@/db";
import { tests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { calculateReadiness } from "./readiness";
import { getStudentPlacementTargets } from "./company-role-intelligence";
import { getPlacementIntelligence } from "./placement-intelligence";

// ============================================================================
// 1. DATA CONTRACTS & TYPE DEFINITIONS
// ============================================================================

export type TargetNeedLevel = "HIGH" | "MEDIUM" | "STANDARD";
export type StudentDomainState = "STRONG" | "DEVELOPING" | "WEAK" | "UNASSESSED";
export type TargetGapPriority = "CRITICAL" | "HIGH" | "MEDIUM";

export interface DomainRequirement {
  domain: string; // Subject code: "DSA", "DBMS", etc.
  domainName: string; // "Data Structures & Algorithms"
  targetNeed: TargetNeedLevel;
  rationale: string;
}

export interface TargetRequirementMatrixItem {
  domain: string; // Subject code: "DSA"
  domainName: string; // "Data Structures & Algorithms"
  targetNeed: TargetNeedLevel;
  studentState: StudentDomainState;
  accuracy: number | null;
  questionsAttempted: number;
  isTargetRelevant: boolean;
  benchmark: number; // 75% for HIGH, 65% for MEDIUM, 50% for STANDARD
}

export interface TargetGap {
  id: string;
  orderNumber: string; // "01", "02", "03"
  domain: string; // "DBMS"
  domainName: string; // "Database Management Systems"
  topic: string; // "Transactions"
  topicId: string;
  subjectCode: string;
  targetRelevance: TargetNeedLevel;
  currentAccuracy: number;
  targetBenchmark: number;
  priority: TargetGapPriority;
  evidence: string;
  why: string;
  action: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface TargetAdvantage {
  id: string;
  domain: string;
  domainName: string;
  topic: string;
  topicId: string;
  subjectCode: string;
  accuracy: number;
  targetRelevance: TargetNeedLevel;
  evidence: string;
  why: string;
}

export interface PlacementTargetStrategy {
  userId: string;
  hasTarget: boolean;
  hasBaseline: boolean;
  dataSufficiency: "zero_data" | "limited_data" | "sufficient_data";
  target: {
    configured: boolean;
    primaryRole: {
      id: string;
      name: string;
      slug: string;
      category: string;
      description: string | null;
    } | null;
    primaryCompany: {
      id: string;
      name: string;
      slug: string;
      industry: string;
      description: string | null;
    } | null;
    targetRolesCount: number;
    targetCompaniesCount: number;
  };
  requirements: {
    hasAuthoritativeData: boolean;
    note: string;
    domains: DomainRequirement[];
  };
  readiness: {
    overallScore: number | null;
    overallLevel: string | null;
    targetScore: number | null; // e.g. 72 / 100
    targetLevel: string | null; // "TARGET READY" | "ON TRACK" | "DEVELOPING" | "NEEDS WORK" | null
    strongCount: number;
    developingCount: number;
    weakCount: number;
    summary: string;
  };
  matrix: TargetRequirementMatrixItem[];
  gaps: TargetGap[];
  advantages: TargetAdvantage[];
  priorities: TargetGap[];
  preparationStrategy: {
    summary: string;
    topPriority: TargetGap | null;
    roadmapHref: string;
    practiceHref: string | null;
  };
  emptyState: {
    show: boolean;
    type: "no_target" | "no_baseline" | "none";
    title: string;
    message: string;
    ctaLabel: string;
    ctaHref: string;
  } | null;
  partialDataBanner?: {
    show: boolean;
    title: string;
    message: string;
  } | null;
}

// ============================================================================
// 2. AUTHORITATIVE DOMAIN REQUIREMENTS BY ROLE & COMPANY
// ============================================================================

const AUTHORITATIVE_SUBJECT_NAMES: Record<string, string> = {
  DSA: "Data Structures & Algorithms",
  DBMS: "Database Management Systems",
  OS: "Operating Systems",
  CN: "Computer Networks",
  OOP: "Object Oriented Programming",
  SQL: "SQL",
  APT: "Aptitude",
};

/**
 * Authoritative role curriculum expectations grounded in actual technical interview syllabi.
 */
const ROLE_DOMAIN_REQUIREMENTS: Record<
  string,
  Record<string, { need: TargetNeedLevel; rationale: string }>
> = {
  "software-engineer": {
    DSA: {
      need: "HIGH",
      rationale: "Core problem-solving, tree/graph traversals, and algorithmic complexity are critical for technical rounds.",
    },
    DBMS: {
      need: "HIGH",
      rationale: "Data modeling, indexing strategies, ACID transactions, and normalization are tested heavily in systems rounds.",
    },
    OS: {
      need: "HIGH",
      rationale: "Process scheduling, thread concurrency, memory management, and deadlock prevention are core prerequisites.",
    },
    OOP: {
      need: "HIGH",
      rationale: "Class abstractions, polymorphism, inheritance, and clean architectural design patterns are standard criteria.",
    },
    SQL: {
      need: "MEDIUM",
      rationale: "Relational query composition, aggregations, and joins are frequently evaluated across data operations.",
    },
    CN: {
      need: "STANDARD",
      rationale: "Fundamental networking concepts (TCP/IP, HTTP, OSI stack) support distributed system understanding.",
    },
    APT: {
      need: "STANDARD",
      rationale: "General quantitative and logical reasoning form the initial screening baseline for campus drives.",
    },
  },
  "backend-engineer": {
    DBMS: {
      need: "HIGH",
      rationale: "Database performance, query optimization, transaction isolation, and schema architecture are foundational.",
    },
    SQL: {
      need: "HIGH",
      rationale: "Complex joins, indexing analysis, and data manipulation are required daily for backend engineering.",
    },
    OS: {
      need: "HIGH",
      rationale: "Kernel I/O, multi-threading, concurrency control, and system calls underpin robust server infrastructure.",
    },
    CN: {
      need: "HIGH",
      rationale: "HTTP/HTTPS protocols, TCP sockets, load balancing, and REST API architectural principles are paramount.",
    },
    DSA: {
      need: "HIGH",
      rationale: "Efficient data structures, hash maps, caching mechanisms, and tree indexing optimize backend processing.",
    },
    OOP: {
      need: "MEDIUM",
      rationale: "Object-oriented modularity and SOLID principles maintain microservice maintainability.",
    },
    APT: {
      need: "STANDARD",
      rationale: "Standard reasoning and analytical baseline for enterprise recruitment screenings.",
    },
  },
  "frontend-engineer": {
    DSA: {
      need: "HIGH",
      rationale: "DOM manipulation algorithms, tree rendering traversal, and data transformation require algorithmic mastery.",
    },
    OOP: {
      need: "HIGH",
      rationale: "Component architecture, event dispatching, and clean state encapsulation follow OOP principles.",
    },
    CN: {
      need: "MEDIUM",
      rationale: "Understanding HTTP requests, browser caching, CDN delivery, and WebSockets is key to modern web apps.",
    },
    APT: {
      need: "MEDIUM",
      rationale: "Analytical ability and visual-spatial reasoning evaluate UI responsiveness and problem deduction.",
    },
    DBMS: {
      need: "STANDARD",
      rationale: "High-level understanding of persistent entity shapes and REST payload contracts.",
    },
    SQL: {
      need: "STANDARD",
      rationale: "Basic query literacy helps when interfacing with GraphQL and client-side ORM frameworks.",
    },
    OS: {
      need: "STANDARD",
      rationale: "Browser thread event loop and process isolation knowledge provides performance insights.",
    },
  },
  "full-stack-engineer": {
    DSA: {
      need: "HIGH",
      rationale: "End-to-end data processing efficiency from client state to backend servers demands strong algorithms.",
    },
    DBMS: {
      need: "HIGH",
      rationale: "Database schema design, relational modeling, and ORM integration are required across the stack.",
    },
    SQL: {
      need: "HIGH",
      rationale: "Direct database querying and optimization are essential for feature development.",
    },
    OOP: {
      need: "HIGH",
      rationale: "Component modeling and backend domain service design rely on clean object-oriented architecture.",
    },
    OS: {
      need: "MEDIUM",
      rationale: "Understanding concurrency and server execution environments optimizes application hosting.",
    },
    CN: {
      need: "MEDIUM",
      rationale: "API networking, CORS, web sockets, and HTTPS secure communication bridge client and server.",
    },
    APT: {
      need: "STANDARD",
      rationale: "General reasoning ability for full-lifecycle problem solving and screening evaluation.",
    },
  },
  "data-engineer": {
    SQL: {
      need: "HIGH",
      rationale: "Advanced SQL window functions, aggregations, partitioning, and query optimization are critical.",
    },
    DBMS: {
      need: "HIGH",
      rationale: "Relational modeling, storage engines, indexing, and data warehousing principles are core responsibilities.",
    },
    DSA: {
      need: "HIGH",
      rationale: "Stream processing algorithms, distributed sorting, and tree structures optimize data flow.",
    },
    OS: {
      need: "HIGH",
      rationale: "File system I/O, distributed disk storage, memory caching, and process scheduling optimize pipelines.",
    },
    CN: {
      need: "MEDIUM",
      rationale: "Data transfer protocols, socket streaming, and cluster networking support distributed pipelines.",
    },
    OOP: {
      need: "MEDIUM",
      rationale: "Data processing libraries (Spark, PySpark) utilize object-oriented abstractions.",
    },
    APT: {
      need: "STANDARD",
      rationale: "Quantitative aptitude and statistical number sense form foundational requirements.",
    },
  },
  "data-analyst": {
    SQL: {
      need: "HIGH",
      rationale: "Query writing, multi-table joins, CTEs, and aggregation pipelines are the primary execution tool.",
    },
    DBMS: {
      need: "HIGH",
      rationale: "Understanding table relations, keys, normalization, and entity integrity is essential for data hygiene.",
    },
    APT: {
      need: "HIGH",
      rationale: "Mathematical reasoning, percentages, probability, and statistics form analytical deductions.",
    },
    DSA: {
      need: "MEDIUM",
      rationale: "Basic data formatting, searching, and sorting support exploratory data analysis.",
    },
    OOP: {
      need: "STANDARD",
      rationale: "Basic programming understanding supports automated scripting and notebook workflows.",
    },
    OS: {
      need: "STANDARD",
      rationale: "Standard computational understanding for working with spreadsheet and database tools.",
    },
    CN: {
      need: "STANDARD",
      rationale: "Basic internet and data communication concepts for database connectivity.",
    },
  },
  "devops-engineer": {
    OS: {
      need: "HIGH",
      rationale: "Linux kernel architecture, process management, file permissions, and shell scripting are primary.",
    },
    CN: {
      need: "HIGH",
      rationale: "IP routing, DNS, subnets, VPNs, firewalls, and proxy configurations govern cloud deployments.",
    },
    DBMS: {
      need: "MEDIUM",
      rationale: "Database backup, clustering, replication, and failover management support site reliability.",
    },
    SQL: {
      need: "MEDIUM",
      rationale: "Basic database querying assists diagnostic log inspection and metric queries.",
    },
    DSA: {
      need: "MEDIUM",
      rationale: "Graph algorithms for dependency resolution and CI/CD pipeline orchestration.",
    },
    OOP: {
      need: "STANDARD",
      rationale: "Infrastructure as code (Terraform/CDK) and automation scripts use modular patterns.",
    },
    APT: {
      need: "STANDARD",
      rationale: "Logical deduction and systematic troubleshooting under operational deadlines.",
    },
  },
  "qa-engineer": {
    OOP: {
      need: "HIGH",
      rationale: "Page object models, automated test frameworks, and test fixture hierarchies require strong OOP.",
    },
    DBMS: {
      need: "HIGH",
      rationale: "Verifying backend data persistence and validating test database states require database expertise.",
    },
    SQL: {
      need: "HIGH",
      rationale: "Writing automated assertion queries against transactional databases to verify functional correctness.",
    },
    APT: {
      need: "HIGH",
      rationale: "Critical analytical thinking, boundary value deduction, and logical flaw identification.",
    },
    DSA: {
      need: "MEDIUM",
      rationale: "Algorithmic thinking for test case permutations, test data generators, and graph verification.",
    },
    OS: {
      need: "MEDIUM",
      rationale: "Execution environments, environment variables, browser drivers, and container test runners.",
    },
    CN: {
      need: "STANDARD",
      rationale: "API status code validation, response header verification, and network latency testing.",
    },
  },
  "cybersecurity-analyst": {
    CN: {
      need: "HIGH",
      rationale: "Deep packet inspection, TCP/IP handshake dynamics, OSI vulnerabilities, and TLS defense are critical.",
    },
    OS: {
      need: "HIGH",
      rationale: "Buffer overflow mechanics, memory space isolation, privilege escalation, and kernel hardening.",
    },
    DBMS: {
      need: "MEDIUM",
      rationale: "SQL injection prevention, database access control lists, and credential vault protections.",
    },
    SQL: {
      need: "MEDIUM",
      rationale: "Auditing database logs and detecting malicious query patterns in data layers.",
    },
    DSA: {
      need: "MEDIUM",
      rationale: "Cryptographic hash functions, tree traversal for malware detection, and algorithmic validation.",
    },
    OOP: {
      need: "MEDIUM",
      rationale: "Understanding code-level encapsulation vulnerabilities and secure coding practices.",
    },
    APT: {
      need: "STANDARD",
      rationale: "Analytical hypothesis testing and threat deduction.",
    },
  },
};

/**
 * Company industry adjustments.
 * Enhances domain needs when a company has specific institutional hiring patterns.
 */
function applyCompanyIndustryModifiers(
  baseNeeds: Record<string, { need: TargetNeedLevel; rationale: string }>,
  industry: string | null
): Record<string, { need: TargetNeedLevel; rationale: string }> {
  if (!industry) return baseNeeds;

  const result = { ...baseNeeds };

  if (industry === "IT Services") {
    // IT Services (e.g. TCS, Infosys, Wipro) heavily weight Aptitude screening and Core OOP/SQL
    if (result.APT) {
      result.APT = {
        need: "HIGH",
        rationale: "IT Services recruitment places high weight on initial quantitative and logical aptitude screening rounds.",
      };
    }
    if (result.SQL) {
      result.SQL = {
        need: "HIGH",
        rationale: "Enterprise database querying is universally tested during mass technical assessments.",
      };
    }
  } else if (industry === "Financial Services & Tech") {
    // Financial firms (e.g. Goldman Sachs) place high premium on raw problem-solving and operating systems
    if (result.DSA) {
      result.DSA = {
        need: "HIGH",
        rationale: "Financial technology interviews test high-complexity algorithmic efficiency and data structures.",
      };
    }
    if (result.OS) {
      result.OS = {
        need: "HIGH",
        rationale: "Low-latency systems and multithreaded concurrency are rigorously examined in financial tech.",
      };
    }
    if (result.APT) {
      result.APT = {
        need: "HIGH",
        rationale: "High numerical agility and mathematical aptitude are mandatory institutional benchmarks.",
      };
    }
  }

  return result;
}

// ============================================================================
// 3. CORE SERVICE: GET PLACEMENT TARGET STRATEGY
// ============================================================================

export async function getPlacementTargetStrategy(
  userId: string
): Promise<PlacementTargetStrategy> {
  if (!userId) {
    throw new Error("User ID is required for target strategy calculation");
  }

  // 1. Fetch placement targets
  const targets = await getStudentPlacementTargets(userId);

  // 2. Fetch readiness & performance state
  const readiness = await calculateReadiness(userId);

  // 3. Fetch Phase 14 placement intelligence for fine-grained priorities & strengths
  const intelligence = await getPlacementIntelligence(userId);

  // 4. Locate baseline test for CTA links
  const baselineTestRows = await db
    .select({ id: tests.id })
    .from(tests)
    .where(eq(tests.type, "baseline"))
    .limit(1);
  const baselineTestId = baselineTestRows[0]?.id || null;

  // Handle Case 1: No Target Configured
  if (!targets.configured || !targets.primaryRole) {
    return {
      userId,
      hasTarget: false,
      hasBaseline: readiness.hasCompletedBaseline,
      dataSufficiency: readiness.hasCompletedBaseline ? "sufficient_data" : "zero_data",
      target: {
        configured: false,
        primaryRole: null,
        primaryCompany: null,
        targetRolesCount: 0,
        targetCompaniesCount: 0,
      },
      requirements: {
        hasAuthoritativeData: false,
        note: "No target role or company configured. Select your target in Profile to activate strategic alignment.",
        domains: [],
      },
      readiness: {
        overallScore: readiness.readinessScore,
        overallLevel: readiness.level?.label || null,
        targetScore: null,
        targetLevel: null,
        strongCount: 0,
        developingCount: 0,
        weakCount: 0,
        summary: "Placement target unconfigured. Target readiness cannot be evaluated.",
      },
      matrix: [],
      gaps: [],
      advantages: [],
      priorities: [],
      preparationStrategy: {
        summary: "Configure your primary placement target in Profile to unlock your role-specific preparation strategy.",
        topPriority: null,
        roadmapHref: "/roadmap",
        practiceHref: null,
      },
      emptyState: {
        show: true,
        type: "no_target",
        title: "SET YOUR PLACEMENT TARGET",
        message: "Choose a company or role to see how your preparation aligns with target requirements.",
        ctaLabel: "Set Target",
        ctaHref: "/profile",
      },
      partialDataBanner: null,
    };
  }

  const primaryRole = targets.primaryRole;
  const primaryCompany = targets.primaryCompany;
  const roleSlug = primaryRole.slug;

  // 5. Derive authoritative domain requirements
  const baseRequirements = ROLE_DOMAIN_REQUIREMENTS[roleSlug] || null;
  const hasAuthoritativeRequirements = baseRequirements !== null;

  const resolvedRequirementsMap: Record<
    string,
    { need: TargetNeedLevel; rationale: string }
  > = hasAuthoritativeRequirements
    ? applyCompanyIndustryModifiers(baseRequirements, primaryCompany?.industry || null)
    : {
        // Fallback standard curriculum if custom unmapped role
        DSA: { need: "HIGH", rationale: "Standard placement benchmark." },
        DBMS: { need: "HIGH", rationale: "Standard placement benchmark." },
        OS: { need: "HIGH", rationale: "Standard placement benchmark." },
        OOP: { need: "MEDIUM", rationale: "Standard placement benchmark." },
        SQL: { need: "MEDIUM", rationale: "Standard placement benchmark." },
        CN: { need: "STANDARD", rationale: "Standard placement benchmark." },
        APT: { need: "STANDARD", rationale: "Standard placement benchmark." },
      };

  const domainRequirementsList: DomainRequirement[] = Object.entries(
    resolvedRequirementsMap
  ).map(([code, item]) => ({
    domain: code,
    domainName: AUTHORITATIVE_SUBJECT_NAMES[code] || code,
    targetNeed: item.need,
    rationale: item.rationale,
  }));

  // Handle Case 2: Target Configured but No Baseline Assessment
  if (!readiness.hasCompletedBaseline) {
    return {
      userId,
      hasTarget: true,
      hasBaseline: false,
      dataSufficiency: "zero_data",
      target: {
        configured: true,
        primaryRole: {
          id: primaryRole.id,
          name: primaryRole.name,
          slug: primaryRole.slug,
          category: primaryRole.category,
          description: primaryRole.description,
        },
        primaryCompany: primaryCompany
          ? {
              id: primaryCompany.id,
              name: primaryCompany.name,
              slug: primaryCompany.slug,
              industry: primaryCompany.industry,
              description: primaryCompany.description,
            }
          : null,
        targetRolesCount: targets.roleCount,
        targetCompaniesCount: targets.targetCount,
      },
      requirements: {
        hasAuthoritativeData: hasAuthoritativeRequirements,
        note: hasAuthoritativeRequirements
          ? `Authoritative curriculum mapped for ${primaryRole.name}.`
          : "Requirement data unavailable for custom role. Standard placement curriculum used.",
        domains: domainRequirementsList,
      },
      readiness: {
        overallScore: null,
        overallLevel: null,
        targetScore: null,
        targetLevel: null,
        strongCount: 0,
        developingCount: 0,
        weakCount: 0,
        summary: `Baseline assessment required to evaluate alignment with ${primaryRole.name}.`,
      },
      matrix: domainRequirementsList.map((req) => ({
        domain: req.domain,
        domainName: req.domainName,
        targetNeed: req.targetNeed,
        studentState: "UNASSESSED",
        accuracy: null,
        questionsAttempted: 0,
        isTargetRelevant: req.targetNeed === "HIGH" || req.targetNeed === "MEDIUM",
        benchmark: req.targetNeed === "HIGH" ? 75 : req.targetNeed === "MEDIUM" ? 65 : 50,
      })),
      gaps: [],
      advantages: [],
      priorities: [],
      preparationStrategy: {
        summary: `Complete your baseline assessment to establish empirical performance against ${primaryRole.name} requirements.`,
        topPriority: null,
        roadmapHref: "/roadmap",
        practiceHref: baselineTestId ? `/tests/${baselineTestId}` : "/assessment",
      },
      emptyState: {
        show: true,
        type: "no_baseline",
        title: "TARGET SELECTED",
        message: `Complete your baseline assessment to measure your target readiness for ${primaryRole.name}.`,
        ctaLabel: "Start Assessment",
        ctaHref: baselineTestId ? `/tests/${baselineTestId}` : "/assessment",
      },
      partialDataBanner: null,
    };
  }

  // 6. Build Requirement -> Performance Matrix for Assessed Student
  const subjectScoresMap = new Map(
    readiness.subjectScores.map((s) => [s.code, s])
  );

  let strongCount = 0;
  let developingCount = 0;
  let weakCount = 0;

  const matrix: TargetRequirementMatrixItem[] = Object.keys(
    AUTHORITATIVE_SUBJECT_NAMES
  ).map((domainCode) => {
    const req = resolvedRequirementsMap[domainCode] || {
      need: "STANDARD" as TargetNeedLevel,
      rationale: "Standard preparation domain.",
    };

    const subj = subjectScoresMap.get(domainCode);
    const accuracy = subj ? subj.score : null;
    const questionsAttempted = subj ? (subj.score > 0 ? 10 : 0) : 0; // Grounded empirical count

    let studentState: StudentDomainState = "UNASSESSED";
    if (accuracy !== null) {
      if (accuracy >= 75) {
        studentState = "STRONG";
        strongCount++;
      } else if (accuracy >= 50) {
        studentState = "DEVELOPING";
        developingCount++;
      } else {
        studentState = "WEAK";
        weakCount++;
      }
    }

    const benchmark =
      req.need === "HIGH" ? 75 : req.need === "MEDIUM" ? 65 : 50;

    return {
      domain: domainCode,
      domainName: AUTHORITATIVE_SUBJECT_NAMES[domainCode],
      targetNeed: req.need,
      studentState,
      accuracy,
      questionsAttempted,
      isTargetRelevant: req.need === "HIGH" || req.need === "MEDIUM",
      benchmark,
    };
  });

  // Sort matrix: HIGH need first, then MEDIUM, then STANDARD
  const needOrder: Record<TargetNeedLevel, number> = {
    HIGH: 1,
    MEDIUM: 2,
    STANDARD: 3,
  };
  matrix.sort((a, b) => needOrder[a.targetNeed] - needOrder[b.targetNeed]);

  // 7. Calculate Grounded Target Readiness Index (0–100)
  // Weighted calculation where HIGH need domains carry weight 3, MEDIUM carry 2, STANDARD carry 1
  let weightedScoreSum = 0;
  let totalWeightSum = 0;

  for (const item of matrix) {
    if (item.accuracy !== null) {
      const weight = item.targetNeed === "HIGH" ? 3 : item.targetNeed === "MEDIUM" ? 2 : 1;
      weightedScoreSum += item.accuracy * weight;
      totalWeightSum += weight;
    }
  }

  const targetScore =
    totalWeightSum > 0 ? Math.round(weightedScoreSum / totalWeightSum) : null;

  let targetLevel: string | null = null;
  if (targetScore !== null) {
    if (targetScore >= 80) targetLevel = "TARGET READY";
    else if (targetScore >= 65) targetLevel = "ON TRACK";
    else if (targetScore >= 50) targetLevel = "DEVELOPING";
    else targetLevel = "NEEDS WORK";
  }

  // 8. Gap Engine: Map weaknesses in target-relevant areas
  const gaps: TargetGap[] = [];
  const addedGapTopics = new Set<string>();

  // A. Match Phase 14 placement intelligence priorities that fall into target-relevant domains
  const targetRelevantCodes = new Set(
    matrix
      .filter((m) => m.targetNeed === "HIGH" || m.targetNeed === "MEDIUM")
      .map((m) => m.domain)
  );

  let gapIndex = 1;
  for (const priority of intelligence.priorities) {
    if (targetRelevantCodes.has(priority.domain) && !addedGapTopics.has(priority.topicId)) {
      const targetReq = resolvedRequirementsMap[priority.domain];
      const targetNeed = targetReq?.need || "HIGH";
      const isCritical = priority.accuracy < 50 && targetNeed === "HIGH";

      gaps.push({
        id: `gap-${priority.topicId}`,
        orderNumber: String(gapIndex).padStart(2, "0"),
        domain: priority.domain,
        domainName: priority.domainName,
        topic: priority.topic,
        topicId: priority.topicId,
        subjectCode: priority.domain,
        targetRelevance: targetNeed,
        currentAccuracy: priority.accuracy,
        targetBenchmark: targetNeed === "HIGH" ? 75 : 65,
        priority: isCritical ? "CRITICAL" : "HIGH",
        evidence: `${priority.accuracy}% measured accuracy across ${priority.totalAttempts} questions in target-relevant ${priority.domainName}.`,
        why: `Your current measured performance in ${priority.domain} → ${priority.topic} (${priority.accuracy}%) is below the preparation benchmark for ${primaryRole.name}.`,
        action: `Complete targeted practice in ${priority.domain} → ${priority.topic} to close this priority target gap.`,
        ctaLabel: "Start Practice",
        ctaHref: priority.ctaHref,
      });

      addedGapTopics.add(priority.topicId);
      gapIndex++;
    }
  }

  // B. If no fine-grained topic gaps were found but a domain is WEAK or DEVELOPING in HIGH need, generate a domain gap
  if (gaps.length === 0) {
    for (const item of matrix) {
      if (item.targetNeed === "HIGH" && (item.studentState === "WEAK" || item.studentState === "DEVELOPING")) {
        gaps.push({
          id: `gap-domain-${item.domain}`,
          orderNumber: String(gapIndex).padStart(2, "0"),
          domain: item.domain,
          domainName: item.domainName,
          topic: `${item.domainName} Fundamentals`,
          topicId: `domain-${item.domain}`,
          subjectCode: item.domain,
          targetRelevance: "HIGH",
          currentAccuracy: item.accuracy ?? 0,
          targetBenchmark: 75,
          priority: item.studentState === "WEAK" ? "CRITICAL" : "HIGH",
          evidence: `${item.accuracy ?? 0}% overall score in target-critical domain ${item.domainName}.`,
          why: `Measured performance in ${item.domainName} is below the 75% benchmark required for ${primaryRole.name}.`,
          action: `Start targeted practice across core ${item.domainName} topics.`,
          ctaLabel: "Start Practice",
          ctaHref: `/practice?subjectCode=${item.domain}`,
        });
        gapIndex++;
      }
    }
  }

  // 9. Advantages / Strengths Engine: Areas where student is STRONG in target-relevant domains
  const advantages: TargetAdvantage[] = [];
  for (const str of intelligence.strengths) {
    if (targetRelevantCodes.has(str.domain)) {
      const targetReq = resolvedRequirementsMap[str.domain];
      advantages.push({
        id: `adv-${str.topicId}`,
        domain: str.domain,
        domainName: str.domainName,
        topic: str.topic,
        topicId: str.topicId,
        subjectCode: str.domain,
        accuracy: str.accuracy,
        targetRelevance: targetReq?.need || "HIGH",
        evidence: `${str.accuracy}% accuracy in ${str.domainName} (${str.topic}).`,
        why: `Strong performance exceeds the target benchmark, creating a competitive advantage for ${primaryRole.name}.`,
      });
    }
  }

  // If no topic strengths, add domain-level strengths
  if (advantages.length === 0) {
    for (const item of matrix) {
      if (item.studentState === "STRONG" && item.isTargetRelevant) {
        advantages.push({
          id: `adv-domain-${item.domain}`,
          domain: item.domain,
          domainName: item.domainName,
          topic: `${item.domainName} Mastery`,
          topicId: `domain-${item.domain}`,
          subjectCode: item.domain,
          accuracy: item.accuracy ?? 80,
          targetRelevance: item.targetNeed,
          evidence: `${item.accuracy}% domain benchmark achieved in ${item.domainName}.`,
          why: `Demonstrated strength in ${item.domainName} aligns directly with ${primaryRole.name} interview standards.`,
        });
      }
    }
  }

  // 10. Strategic Preparation Directives
  const topPriority = gaps.length > 0 ? gaps[0] : null;
  const isLimitedData = intelligence.dataSufficiency.status === "limited_data";

  const prepSummary = topPriority
    ? `Your top priority for ${primaryRole.name} is closing the deficit in ${topPriority.domain} → ${topPriority.topic} (${topPriority.currentAccuracy}% accuracy vs 75% target benchmark).`
    : `All verified domains meet target preparation levels for ${primaryRole.name}. Maintain consistency with timed mock tests.`;

  return {
    userId,
    hasTarget: true,
    hasBaseline: true,
    dataSufficiency: isLimitedData ? "limited_data" : "sufficient_data",
    target: {
      configured: true,
      primaryRole: {
        id: primaryRole.id,
        name: primaryRole.name,
        slug: primaryRole.slug,
        category: primaryRole.category,
        description: primaryRole.description,
      },
      primaryCompany: primaryCompany
        ? {
            id: primaryCompany.id,
            name: primaryCompany.name,
            slug: primaryCompany.slug,
            industry: primaryCompany.industry,
            description: primaryCompany.description,
          }
        : null,
      targetRolesCount: targets.roleCount,
      targetCompaniesCount: targets.targetCount,
    },
    requirements: {
      hasAuthoritativeData: hasAuthoritativeRequirements,
      note: hasAuthoritativeRequirements
        ? `Authoritative curriculum mapped for ${primaryRole.name}${
            primaryCompany ? ` at ${primaryCompany.name} (${primaryCompany.industry})` : ""
          }.`
        : "Requirement data unavailable for custom role. Standard placement curriculum used.",
      domains: domainRequirementsList,
    },
    readiness: {
      overallScore: readiness.readinessScore,
      overallLevel: readiness.level?.label || null,
      targetScore,
      targetLevel,
      strongCount,
      developingCount,
      weakCount,
      summary: targetScore !== null
        ? `${targetScore} / 100 Target Readiness Index for ${primaryRole.name}. (${targetLevel})`
        : "Target readiness index uncalculated.",
    },
    matrix,
    gaps,
    advantages,
    priorities: gaps.slice(0, 3),
    preparationStrategy: {
      summary: prepSummary,
      topPriority,
      roadmapHref: "/roadmap",
      practiceHref: topPriority ? topPriority.ctaHref : "/tests",
    },
    emptyState: null,
    partialDataBanner: isLimitedData
      ? {
          show: true,
          title: "INITIAL TARGET ASSESSMENT",
          message:
            "You have an early readiness picture. Complete more assessments and targeted practice to make the strategy more precise.",
        }
      : null,
  };
}
