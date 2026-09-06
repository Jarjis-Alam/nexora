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
} from "./schema";
import bcrypt from "bcryptjs";
import crypto from "crypto";
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

async function bootstrap() {
  console.log("==================================================");
  console.log("🚀 NEXORA — PRODUCTION REFERENCE DATA BOOTSTRAP");
  console.log("==================================================\n");

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  try {
    // ==========================================
    // 1. SUBJECTS (Idempotent: Create only if missing)
    // ==========================================
    console.log("📚 Checking subjects...");
    const existingSubjects = await db.select({ id: subjects.id, code: subjects.code }).from(subjects);
    const existingCodes = new Set(existingSubjects.map((s) => s.code));

    const missingSubjects = subjectData.filter((s) => !existingCodes.has(s.code));
    if (missingSubjects.length > 0) {
      await db.insert(subjects).values(missingSubjects);
      console.log(`  ✓ Inserted ${missingSubjects.length} missing subjects`);
    } else {
      console.log(`  ✓ All ${existingSubjects.length} subjects already present`);
    }

    // Refresh subject mapping: code -> id
    const currentSubjects = await db.select({ id: subjects.id, code: subjects.code }).from(subjects);
    const subjectMap: Record<string, string> = {};
    currentSubjects.forEach((s) => {
      subjectMap[s.code] = s.id;
    });

    // ==========================================
    // 2. TOPICS (Idempotent: Create only if missing)
    // ==========================================
    console.log("\n📖 Checking syllabus topics...");
    const existingTopics = await db
      .select({ id: topics.id, subjectId: topics.subjectId, name: topics.name })
      .from(topics);
    const existingTopicKeys = new Set(existingTopics.map((t) => `${t.subjectId}:::${t.name.toLowerCase()}`));

    const missingTopics = topicData.filter((t) => {
      const subId = subjectMap[t.subjectCode];
      return subId && !existingTopicKeys.has(`${subId}:::${t.name.toLowerCase()}`);
    });

    if (missingTopics.length > 0) {
      await db.insert(topics).values(
        missingTopics.map((t) => ({
          subjectId: subjectMap[t.subjectCode],
          name: t.name,
          displayOrder: t.displayOrder,
        }))
      );
      console.log(`  ✓ Inserted ${missingTopics.length} missing topics`);
    } else {
      console.log(`  ✓ All ${existingTopics.length} topics already present`);
    }

    // Refresh topic lookup: "SUBJECT_CODE:TopicName" -> id
    const currentTopics = await db
      .select({ id: topics.id, subjectId: topics.subjectId, name: topics.name })
      .from(topics);
    const topicMap: Record<string, string> = {};
    for (const sub of currentSubjects) {
      const subTopics = currentTopics.filter((t) => t.subjectId === sub.id);
      subTopics.forEach((t) => {
        topicMap[`${sub.code}:${t.name}`] = t.id;
      });
    }

    // ==========================================
    // 3. QUESTIONS (Idempotent: Create only if missing)
    // ==========================================
    console.log("\n❓ Checking question bank...");
    const existingQuestions = await db
      .select({ id: questions.id, question: questions.question, subjectId: questions.subjectId })
      .from(questions);
    const existingQuestionKeys = new Set(
      existingQuestions.map((q) => `${q.subjectId}:::${q.question.trim()}`)
    );

    const missingQuestions = allQuestions.filter((q) => {
      const subId = subjectMap[q.subjectCode];
      return subId && !existingQuestionKeys.has(`${subId}:::${q.question.trim()}`);
    });

    if (missingQuestions.length > 0) {
      await db.insert(questions).values(
        missingQuestions.map((q) => ({
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
      );
      console.log(`  ✓ Inserted ${missingQuestions.length} missing questions`);
    } else {
      console.log(`  ✓ All ${existingQuestions.length} questions already present`);
    }

    // ==========================================
    // 4. TESTS & QUESTION LINKS (Idempotent)
    // ==========================================
    console.log("\n📝 Checking assessments catalog...");
    const allDbQuestions = await db
      .select({ id: questions.id, question: questions.question, subjectId: questions.subjectId })
      .from(questions);

    // Group questions by subject code
    const subjectIdToCode: Record<string, string> = {};
    Object.entries(subjectMap).forEach(([code, id]) => {
      subjectIdToCode[id] = code;
    });

    const questionsBySubject: Record<string, typeof allDbQuestions> = {};
    allDbQuestions.forEach((q) => {
      const code = subjectIdToCode[q.subjectId];
      if (code) {
        if (!questionsBySubject[code]) questionsBySubject[code] = [];
        questionsBySubject[code].push(q);
      }
    });

    for (const def of testDefinitions) {
      const existingTest = await db
        .select({ id: tests.id })
        .from(tests)
        .where(eq(tests.type, def.type))
        .limit(1);

      if (existingTest.length > 0) {
        console.log(`  ✓ Test "${def.title}" already exists (type: ${def.type}), skipping`);
      } else {
        const [newTest] = await db
          .insert(tests)
          .values({
            title: def.title,
            description: def.description,
            type: def.type,
            duration: def.duration,
            difficulty: def.difficulty,
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
        console.log(`  ✓ Created test "${def.title}" with ${selectedQuestions.length} questions`);
      }
    }

    // ==========================================
    // 5. OPT-IN ADMIN ACCOUNT CREATION
    // ==========================================
    const shouldCreateAdmin =
      process.env.BOOTSTRAP_ADMIN === "true" ||
      process.env.CREATE_ADMIN === "true" ||
      process.argv.includes("--admin");

    if (shouldCreateAdmin) {
      console.log("\n👤 Checking administrator account...");
      const existingAdmin = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.isAdmin, true))
        .limit(1);

      if (existingAdmin.length > 0) {
        console.log(`  ℹ️  Admin user already exists (${existingAdmin[0].email}). Skipping creation.`);
      } else {
        const adminEmail = process.env.ADMIN_EMAIL || "admin@nexora.internal";
        const envPassword = process.env.ADMIN_PASSWORD;
        const isGenerated = !envPassword;
        const adminPassword = envPassword || crypto.randomBytes(18).toString("base64url");
        const passwordHash = await bcrypt.hash(adminPassword, 12);

        const [newAdmin] = await db
          .insert(users)
          .values({
            email: adminEmail,
            passwordHash,
            isAdmin: true,
          })
          .returning();

        await db.insert(profiles).values({
          userId: newAdmin.id,
          name: "Platform Administrator",
          college: "Nexora",
          branch: "Platform Engineering",
          graduationYear: 2025,
          preferredLanguage: "TypeScript",
        });

        console.log(`\n👑 Initial Administrator Account Created:`);
        console.log(`   Email:    ${adminEmail}`);
        if (isGenerated) {
          console.log(`   Password: ${adminPassword}`);
          console.log(`   ⚠️  SAVE THIS PASSWORD NOW. It is generated once and will not be displayed again.\n`);
        } else {
          console.log(`   Password: [Configured from environment variable]\n`);
        }
      }
    } else {
      console.log("\nℹ️  Admin creation skipped (BOOTSTRAP_ADMIN=true not specified).");
    }

    // ==========================================
    // 5. CANONICAL PLACEMENT DATA (Roles & Companies)
    // ==========================================
    console.log("🏢 Checking canonical placement companies & roles...");
    const { seedCanonicalPlacementData } = await import("@/server/company-role-intelligence");
    const seedRes = await seedCanonicalPlacementData();
    console.log(`  ✓ Canonical placement catalog verified (new roles: ${seedRes.rolesSeeded}, new companies: ${seedRes.companiesSeeded})`);

    console.log("\n==================================================");
    console.log("✅ PRODUCTION BOOTSTRAP COMPLETE");
    console.log("==================================================\n");
  } finally {
    await pool.end();
  }
}

bootstrap().catch((err) => {
  console.error("❌ Bootstrap failed:", err);
  process.exit(1);
});
