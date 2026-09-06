import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tests, subjects } from "@/db/schema";
import {
  getAdminOverviewAnalytics,
  getAdminTestPerformanceList,
  getAdminQuestionAnalytics,
  getAdminActiveAttempts,
} from "@/server/admin-analytics";
import { AdminAnalyticsDashboard } from "@/components/admin/analytics/admin-analytics-dashboard";

export const metadata = {
  title: "Admin Analytics & Telemetry | Nexora",
  description: "Comprehensive institutional analytics, difficulty distributions, and test telemetry.",
};

export default async function AdminAnalyticsPage() {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;

  if (!isAdmin) {
    redirect("/dashboard");
  }

  // Fetch initial datasets in parallel
  const [overview, testPerf, questionPerf, activeAttempts, rawTests, rawSubjects] =
    await Promise.all([
      getAdminOverviewAnalytics(),
      getAdminTestPerformanceList({ limit: 50 }),
      getAdminQuestionAnalytics({ limit: 100 }),
      getAdminActiveAttempts(50),
      db.select({ id: tests.id, title: tests.title }).from(tests),
      db.select({ id: subjects.id, name: subjects.name, code: subjects.code }).from(subjects),
    ]);

  return (
    <div className="pb-28 pr-28 lg:pr-0">
      <AdminAnalyticsDashboard
        initialOverview={overview}
        initialTests={testPerf.tests}
        initialQuestions={questionPerf.questions}
        initialActiveAttempts={activeAttempts}
        testsList={rawTests}
        subjectsList={rawSubjects}
      />
    </div>
  );
}
