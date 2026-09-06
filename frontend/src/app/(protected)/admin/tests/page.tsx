import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tests, testQuestions, questionPools } from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { AdminTestList } from "@/components/admin/test-list";
import { getEffectiveTestStatus } from "@/lib/lifecycle";

export default async function AdminTestsPage() {
  const session = await auth();
  const isAdmin = (session?.user as any)?.isAdmin;

  if (!isAdmin) {
    redirect("/dashboard");
  }

  const now = new Date();

  // Fetch all tests with question counts and lifecycle
  const allTests = await db
    .select({
      id: tests.id,
      title: tests.title,
      description: tests.description,
      type: tests.type,
      duration: tests.duration,
      difficulty: tests.difficulty,
      totalMarks: tests.totalMarks,
      status: tests.status,
      scheduledStartAt: tests.scheduledStartAt,
      scheduledEndAt: tests.scheduledEndAt,
      scheduleTimezone: tests.scheduleTimezone,
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
      const poolCountRes = await db
        .select({ sum: sql<number>`COALESCE(sum(${questionPools.selectionCount}), 0)` })
        .from(questionPools)
        .where(eq(questionPools.testId, t.id));
      const questionCount =
        Number(qCountRes[0]?.count || 0) + Number(poolCountRes[0]?.sum || 0);

      const effectiveStatus = getEffectiveTestStatus(t, now);

      return {
        ...t,
        effectiveStatus,
        questionCount,
      };
    })
  );

  return (
    <div className="space-y-8 pb-28 pr-28 lg:pr-0">
      <div>
        <p className="text-label-xs font-mono uppercase tracking-wider text-primary-text">Assessment Operations</p>
        <h1 className="mt-2 text-headline-lg font-bold text-text-primary">Test Management</h1>
        <p className="text-body-md text-text-secondary mt-1">
          Curate, configure, and publish assessments across technical placement tracks.
        </p>
      </div>

      <AdminTestList initialTests={testsWithStats} />
    </div>
  );
}
