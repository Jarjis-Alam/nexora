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
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

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
export const tests = pgTable("tests", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  type: testTypeEnum("type").notNull(),
  duration: integer("duration").notNull(), // minutes
  difficulty: difficultyEnum("difficulty"),
  totalMarks: integer("total_marks").notNull(),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

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
    questionOrder: integer("question_order").notNull(),
  },
  (table) => [
    uniqueIndex("test_questions_unique_idx").on(table.testId, table.questionId),
    index("test_questions_test_id_idx").on(table.testId),
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
