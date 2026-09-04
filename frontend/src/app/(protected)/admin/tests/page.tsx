import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tests, testQuestions } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { AdminTestList } from "@/components/admin/test-list";

export default async function AdminTestsPage() {
  const session = await auth();
  const isAdmin = (session?.user as any)?.isAdmin;

  if (!isAdmin) {
    redirect("/dashboard");
  }

  // Fetch all tests with question counts
  const allTests = await db
    .select({
      id: tests.id,
      title: tests.title,
      description: tests.description,
      type: tests.type,
      duration: tests.duration,
      difficulty: tests.difficulty,
      totalMarks: tests.totalMarks,
      isPublished: tests.isPublished,
      createdAt: tests.createdAt,
    })
    .from(tests)
    .orderBy(desc(tests.createdAt));

  const testsWithStats = await Promise.all(
    allTests.map(async (t) => {
      const qCountRes = await db
        .select({ count: sql<number>`count(*)` })
        .from(testQuestions)
        .where(eq(testQuestions.testId, t.id));
      return {
        ...t,
        questionCount: Number(qCountRes[0]?.count || 0),
      };
    })
  );

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-headline-lg font-bold text-text-primary">
          Test Management
        </h1>
        <p className="text-body-md text-text-secondary mt-1">
          Curate, configure, and publish assessments across technical placement tracks.
        </p>
      </div>

      <AdminTestList initialTests={testsWithStats} />
    </div>
  );
}
