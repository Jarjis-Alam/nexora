import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  numeric,
  pgEnum,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// === Enums ===
export const difficultyEnum = pgEnum("difficulty", [
  "easy",
  "medium",
  "hard",
]);

export const questionTypeEnum = pgEnum("question_type", [
  "single_choice",
  "multiple_choice",
]);

export const testTypeEnum = pgEnum("test_type", [
  "aptitude",
  "cs_fundamentals",
  "mixed",
  "baseline",
]);

export const testStatusEnum = pgEnum("test_status", [
  "draft",
  "published",
  "closed",
  "archived",
]);

export const attemptStatusEnum = pgEnum("attempt_status", [
  "in_progress",
  "submitted",
  "expired",
]);

// === Users ===
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// === Profiles ===
export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),
  name: varchar("name", { length: 255 }).notNull(),
  avatarUrl: text("avatar_url"),
  college: varchar("college", { length: 255 }),
  branch: varchar("branch", { length: 255 }),
  graduationYear: integer("graduation_year"),
  preferredLanguage: varchar("preferred_language", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// === Subjects ===
export const subjects = pgTable("subjects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  category: varchar("category", { length: 50 }).notNull(), // 'aptitude' or 'cs'
  displayOrder: integer("display_order").notNull().default(0),
});

// === Topics ===
export const topics = pgTable(
  "topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (table) => [index("topics_subject_id_idx").on(table.subjectId)]
);

// === Questions ===
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    question: text("question").notNull(),
    questionType: questionTypeEnum("question_type").notNull(),
    options: jsonb("options").notNull(), // string[]
    correctAnswer: jsonb("correct_answer").notNull(), // string or string[]
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id),
    difficulty: difficultyEnum("difficulty").notNull(),
    marks: integer("marks").notNull().default(2),
    explanation: text("explanation"),
    expectedTime: integer("expected_time"), // seconds
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("questions_subject_id_idx").on(table.subjectId),
    index("questions_topic_id_idx").on(table.topicId),
    index("questions_difficulty_idx").on(table.difficulty),
  ]
);

// === Tests ===
export const tests = pgTable(
  "tests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    instructions: text("instructions"), // nullable plain-text pre-start instructions; NULL/empty = none
    type: testTypeEnum("type").notNull(),
    duration: integer("duration").notNull(), // minutes
    difficulty: difficultyEnum("difficulty"),
    totalMarks: integer("total_marks").notNull(),
    negativeMarkingEnabled: boolean("negative_marking_enabled").notNull().default(false),
    negativeMarkRate: numeric("negative_mark_rate", { precision: 5, scale: 2 }).notNull().default("0.00"),
    randomizeQuestions: boolean("randomize_questions").notNull().default(false),
    randomizeOptions: boolean("randomize_options").notNull().default(false),
    attemptLimit: integer("attempt_limit"), // NULL = unlimited; >= 1 = max submitted attempts per user/test
    status: testStatusEnum("status").notNull().default("draft"),
    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
    scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
    scheduleTimezone: varchar("schedule_timezone", { length: 100 }),
    isPublished: boolean("is_published").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "tests_schedule_range_check",
      sql`${table.scheduledEndAt} IS NULL OR ${table.scheduledStartAt} IS NULL OR ${table.scheduledEndAt} > ${table.scheduledStartAt}`
    ),
    index("tests_status_idx").on(table.status),
    index("tests_type_status_idx").on(table.type, table.status),
    index("tests_schedule_window_idx").on(table.scheduledStartAt, table.scheduledEndAt),
  ]
);

// === Test Sections ===
export const testSections = pgTable(
  "test_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    sectionOrder: integer("section_order").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("test_sections_test_id_idx").on(table.testId),
    uniqueIndex("test_sections_test_order_idx").on(table.testId, table.sectionOrder),
  ]
);

// === Test Questions (join table) ===
export const testQuestions = pgTable(
  "test_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => testSections.id, { onDelete: "cascade" }),
    questionOrder: integer("question_order").notNull(),
  },
  (table) => [
    uniqueIndex("test_questions_unique_idx").on(table.testId, table.questionId),
    index("test_questions_test_id_idx").on(table.testId),
    index("test_questions_section_id_idx").on(table.sectionId),
  ]
);

// === Question Pools ===
export const questionPools = pgTable(
  "question_pools",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => testSections.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    selectionCount: integer("selection_count").notNull(),
    poolOrder: integer("pool_order").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("question_pools_selection_count_check", sql`${table.selectionCount} >= 1`),
    index("question_pools_test_id_idx").on(table.testId),
    index("question_pools_section_id_idx").on(table.sectionId),
    uniqueIndex("question_pools_section_pool_order_idx").on(table.sectionId, table.poolOrder),
  ]
);

// === Question Pool Questions (membership join table) ===
export const questionPoolQuestions = pgTable(
  "question_pool_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    poolId: uuid("pool_id")
      .notNull()
      .references(() => questionPools.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    questionOrder: integer("question_order").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("question_pool_questions_unique_idx").on(table.poolId, table.questionId),
    index("question_pool_questions_pool_id_idx").on(table.poolId),
    index("question_pool_questions_question_id_idx").on(table.questionId),
  ]
);

// === Attempts ===
export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    status: attemptStatusEnum("status").notNull().default("in_progress"),
    negativeMarkingEnabled: boolean("negative_marking_enabled"),
    negativeMarkRate: numeric("negative_mark_rate", { precision: 5, scale: 2 }),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    score: real("score"),
    accuracy: real("accuracy"),
    timeTaken: integer("time_taken"), // seconds
    currentQuestion: integer("current_question").notNull().default(0),
    remainingTime: integer("remaining_time"), // seconds (synced periodically)
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("attempts_user_id_idx").on(table.userId),
    index("attempts_test_id_idx").on(table.testId),
    index("attempts_status_idx").on(table.status),
    index("attempts_submitted_at_idx").on(table.submittedAt),
    index("attempts_test_status_submitted_idx").on(table.testId, table.status, table.submittedAt),
  ]
);

// === Attempt Questions (resolved question order per attempt) ===
export const attemptQuestions = pgTable(
  "attempt_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => testSections.id, { onDelete: "cascade" }),
    questionOrder: integer("question_order").notNull(),
    optionOrder: jsonb("option_order"),
    questionTextSnapshot: text("question_text_snapshot"),
    questionTypeSnapshot: questionTypeEnum("question_type_snapshot"),
    marksSnapshot: integer("marks_snapshot"),
    optionsSnapshot: jsonb("options_snapshot"),
    correctAnswerSnapshot: jsonb("correct_answer_snapshot"),
    poolId: uuid("pool_id").references(() => questionPools.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("attempt_questions_unique_idx").on(table.attemptId, table.questionId),
    uniqueIndex("attempt_questions_order_idx").on(table.attemptId, table.questionOrder),
    index("attempt_questions_attempt_id_idx").on(table.attemptId),
    index("attempt_questions_section_id_idx").on(table.sectionId),
    index("attempt_questions_pool_id_idx").on(table.poolId),
    index("attempt_questions_question_id_idx").on(table.questionId),
  ]
);

// === Answers ===
export const answers = pgTable(
  "answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    selectedAnswer: jsonb("selected_answer"), // string or string[] or null
    isCorrect: boolean("is_correct"),
    timeSpent: integer("time_spent").default(0), // seconds
    markedForReview: boolean("marked_for_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("answers_attempt_question_idx").on(
      table.attemptId,
      table.questionId
    ),
    index("answers_attempt_id_idx").on(table.attemptId),
    index("answers_question_id_idx").on(table.questionId),
    index("answers_question_is_correct_idx").on(table.questionId, table.isCorrect),
  ]
);

// === Skill Scores (per attempt, per subject/topic) ===
export const skillScores = pgTable(
  "skill_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id")
      .notNull()
      .references(() => subjects.id),
    topicId: uuid("topic_id").references(() => topics.id),
    score: real("score").notNull(),
    total: real("total").notNull(),
    accuracy: real("accuracy").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("skill_scores_attempt_id_idx").on(table.attemptId),
    index("skill_scores_subject_id_idx").on(table.subjectId),
  ]
);

// === Companies (Phase 11A) ===
export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    industry: varchar("industry", { length: 100 }).notNull(),
    description: text("description"),
    website: varchar("website", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("companies_normalized_name_idx").on(table.normalizedName),
    uniqueIndex("companies_slug_idx").on(table.slug),
    index("companies_industry_idx").on(table.industry),
    index("companies_is_active_idx").on(table.isActive),
  ]
);

// === Roles (Phase 11A) ===
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("roles_normalized_name_idx").on(table.normalizedName),
    uniqueIndex("roles_slug_idx").on(table.slug),
    index("roles_category_idx").on(table.category),
    index("roles_is_active_idx").on(table.isActive),
  ]
);

// === Student Target Roles (Phase 11A) ===
export const studentTargetRoles = pgTable(
  "student_target_roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    isPrimary: boolean("is_primary").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("student_target_roles_user_id_unique_idx").on(table.userId),
    index("student_target_roles_role_id_idx").on(table.roleId),
  ]
);

// === Student Target Companies (Phase 11A) ===
export const studentTargetCompanies = pgTable(
  "student_target_companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    priority: integer("priority").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("student_target_companies_user_company_idx").on(
      table.userId,
      table.companyId
    ),
    index("student_target_companies_user_id_idx").on(table.userId),
    index("student_target_companies_company_id_idx").on(table.companyId),
  ]
);
