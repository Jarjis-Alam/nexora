export const SUBJECTS = [
  "Aptitude",
  "DSA",
  "DBMS",
  "OS",
  "CN",
  "OOP",
  "SQL",
] as const;

export const APTITUDE_SUBCATEGORIES = [
  "Quantitative Aptitude",
  "Logical Reasoning",
  "Verbal Ability",
] as const;

export const CS_SUBJECTS = ["DSA", "DBMS", "OS", "CN", "OOP", "SQL"] as const;

export const CORE_CS_SUBJECTS = ["DBMS", "OS", "CN", "OOP"] as const;

export const DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

export const QUESTION_TYPES = ["single_choice", "multiple_choice"] as const;

export const TEST_TYPES = [
  "aptitude",
  "cs_fundamentals",
  "mixed",
  "baseline",
] as const;

export const ATTEMPT_STATUSES = [
  "in_progress",
  "submitted",
  "expired",
] as const;

export const READINESS_WEIGHTS = {
  aptitude: 0.2,
  dsa: 0.2,
  core_cs: 0.3,
  sql: 0.1,
  overall_test: 0.1,
  consistency: 0.1,
} as const;

export const READINESS_LEVELS = [
  { min: 90, max: 100, label: "Elite" },
  { min: 75, max: 89, label: "Placement Ready" },
  { min: 60, max: 74, label: "Competitive" },
  { min: 40, max: 59, label: "Developing" },
  { min: 0, max: 39, label: "Beginner" },
] as const;

export const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
  { label: "Tests", href: "/tests", icon: "quiz" },
  { label: "Analytics", href: "/analytics", icon: "analytics" },
  { label: "Profile", href: "/profile", icon: "person" },
  { label: "Assessment", href: "/assessment", icon: "assignment" },
] as const;

export const WEAK_AREA_MIN_ATTEMPTS = 10;
