import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  users,
  profiles,
  subjects,
  topics,
  questions,
  tests,
  testSections,
  testQuestions,
  skillScores,
  attempts,
  answers,
  attemptQuestions,
} from "./schema";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import {
  subjectData,
  topicData,
  allQuestions,
  testDefinitions,
  pickQuestions,
} from "./reference-data";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/placement_os";

async function seed() {
  // ==========================================
  // PRODUCTION SAFETY GUARD
  // ==========================================
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DESTRUCTIVE_SEED !== "true") {
    console.error("❌ CRITICAL ERROR: seed.ts contains destructive table wipes and is blocked in production.");
    console.error("To initialize production catalogs safely without deleting data, use: npm run db:bootstrap");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  console.log("🌱 Seeding Placement OS development database...\n");

  // ==========================================
  // 0. CLEANUP (Idempotent dev re-seeding)
  // ==========================================
  console.log("🧹 Cleaning previous assessment and catalog records...");
  await db.delete(testQuestions);
  await db.delete(answers);
  await db.delete(attemptQuestions);
  await db.delete(skillScores);
  await db.delete(attempts);
  await db.delete(questions);
  await db.delete(topics);
  await db.delete(tests);
  await db.delete(subjects);
  await db.delete(users).where(eq(users.email, "admin@placementos.dev"));
  await db.delete(users).where(eq(users.email, "alex.chen@placementos.dev"));
  console.log("  ✓ Cleaned up existing assessment records");

  // ==========================================
  // 1. SUBJECTS (Stable UUIDs across re-seeds)
  // ==========================================
  console.log("📚 Creating subjects...");
  const insertedSubjects = await db
    .insert(subjects)
    .values(subjectData)
    .returning();
  const subjectMap: Record<string, string> = {};
  insertedSubjects.forEach((s) => {
    subjectMap[s.code] = s.id;
  });
  console.log(`  ✓ ${insertedSubjects.length} subjects created`);

  // ==========================================
  // 2. TOPICS
  // ==========================================
  console.log("📖 Creating topics...");
  const insertedTopics = await db
    .insert(topics)
    .values(
      topicData.map((t) => ({
        subjectId: subjectMap[t.subjectCode],
        name: t.name,
        displayOrder: t.displayOrder,
      }))
    )
    .returning();

  const topicMap: Record<string, string> = {};
  insertedTopics.forEach((t, i) => {
    const key = `${topicData[i].subjectCode}:${topicData[i].name}`;
    topicMap[key] = t.id;
  });
  console.log(`  ✓ ${insertedTopics.length} topics created`);

  // ==========================================
  // 3. QUESTIONS (160 original questions)
  // ==========================================
  console.log("❓ Creating questions...");
  const insertedQuestions = await db
    .insert(questions)
    .values(
      allQuestions.map((q) => ({
        question: q.question,
        questionType: q.questionType,
        options: q.options,
        correctAnswer: q.correctAnswer,
        subjectId: subjectMap[q.subjectCode],
        topicId: topicMap[`${q.subjectCode}:${q.topicName}`],
        difficulty: q.difficulty,
        marks: q.marks,
        explanation: q.explanation,
        expectedTime: q.expectedTime,
      }))
    )
    .returning();

  console.log(`  ✓ ${insertedQuestions.length} questions created`);

  // ==========================================
  // 4. TESTS & TEST-QUESTION ASSIGNMENTS
  // ==========================================
  console.log("📝 Creating tests & linking questions...");
  const questionsBySubject: Record<string, typeof insertedQuestions> = {};
  insertedQuestions.forEach((q, i) => {
    const code = allQuestions[i].subjectCode;
    if (!questionsBySubject[code]) questionsBySubject[code] = [];
    questionsBySubject[code].push(q);
  });

  for (const def of testDefinitions) {
    const [newTest] = await db
      .insert(tests)
      .values({
        title: def.title,
        description: def.description,
        type: def.type as any,
        duration: def.duration,
        difficulty: def.difficulty as any,
        totalMarks: def.totalMarks,
        isPublished: def.isPublished,
      })
      .returning();

    const [defaultSection] = await db
      .insert(testSections)
      .values({
        testId: newTest.id,
        title: "General",
        sectionOrder: 1,
      })
      .returning();

    const selectedQuestions = pickQuestions(
      questionsBySubject,
      def.subjectCodes,
      def.questionCount,
      def.seedOffset,
      def.allFromSubject
    );

    await db.insert(testQuestions).values(
      selectedQuestions.map((q, i) => ({
        testId: newTest.id,
        sectionId: defaultSection.id,
        questionId: q.id,
        questionOrder: i + 1,
      }))
    );
  }
  console.log(`  ✓ ${testDefinitions.length} tests and question links created`);

  // ==========================================
  // 5. SEED USERS (Development Only)
  // ==========================================
  console.log("👤 Creating seed users with stable UUIDs...");
  const adminPasswordHash = await bcrypt.hash("admin123", 12);
  const adminUser = await db
    .insert(users)
    .values({
      id: "672c0461-07da-48e6-94b1-a816d4d9eac4",
      email: "admin@placementos.dev",
      passwordHash: adminPasswordHash,
      isAdmin: true,
    })
    .returning();

  await db.insert(profiles).values({
    userId: adminUser[0].id,
    name: "Admin",
    college: "Placement OS",
    branch: "Platform Engineering",
    graduationYear: 2025,
    preferredLanguage: "TypeScript",
  });

  const studentPasswordHash = await bcrypt.hash("alex123", 10);
  const studentUser = await db
    .insert(users)
    .values({
      id: "00000000-0000-0000-0000-000000000002",
      email: "alex.chen@placementos.dev",
      passwordHash: studentPasswordHash,
      isAdmin: false,
    })
    .returning();

  await db.insert(profiles).values({
    userId: studentUser[0].id,
    name: "Alex Chen",
    college: "Apex Institute of Technology",
    branch: "Computer Science",
    graduationYear: 2025,
    preferredLanguage: "C++",
  });

  console.log("  ✓ Admin & student users created with stable UUIDs");

  // ==========================================
  // DONE
  // ==========================================
  console.log("\n✅ Seeding complete!");
  console.log(`   ${insertedSubjects.length} subjects`);
  console.log(`   ${insertedTopics.length} topics`);
  console.log(`   ${insertedQuestions.length} questions`);
  console.log(`   ${testDefinitions.length} tests`);
  console.log(`   1 dev admin user`);
  console.log(`   1 dev student user`);

  await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
