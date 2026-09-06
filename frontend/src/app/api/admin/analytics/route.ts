import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getAdminOverviewAnalytics,
  getAdminTestPerformanceList,
  getAdminQuestionAnalytics,
  getAdminActiveAttempts,
  compareAdminTests,
  type AdminAnalyticsFilters,
  type AdminQuestionFilters,
} from "@/server/admin-analytics";

export async function GET(request: NextRequest) {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;

  if (!isAdmin) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view") || "overview";

    const baseFilters: AdminAnalyticsFilters = {
      testId: searchParams.get("testId") || undefined,
      subjectId: searchParams.get("subjectId") || undefined,
      topicId: searchParams.get("topicId") || undefined,
      status: searchParams.get("status") || undefined,
      dateRange: searchParams.get("dateRange") || undefined,
      startDate: searchParams.get("startDate") || undefined,
      endDate: searchParams.get("endDate") || undefined,
    };

    if (view === "tests") {
      const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
      const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 20;
      const sortBy = searchParams.get("sortBy") || undefined;
      const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || "desc";

      const data = await getAdminTestPerformanceList({
        ...baseFilters,
        page,
        limit,
        sortBy,
        sortOrder,
      });
      return NextResponse.json({ success: true, data });
    }

    if (view === "questions") {
      const page = searchParams.get("page") ? parseInt(searchParams.get("page")!, 10) : 1;
      const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50;
      const sortBy = searchParams.get("sortBy") || undefined;
      const sortOrder = (searchParams.get("sortOrder") as "asc" | "desc") || "desc";
      const difficulty = (searchParams.get("difficulty") as any) || undefined;
      const qualitySignal = (searchParams.get("qualitySignal") as any) || undefined;
      const search = searchParams.get("search") || undefined;

      const qFilters: AdminQuestionFilters = {
        ...baseFilters,
        difficulty,
        qualitySignal,
        search,
      };

      const data = await getAdminQuestionAnalytics({
        ...qFilters,
        page,
        limit,
        sortBy,
        sortOrder,
      });
      return NextResponse.json({ success: true, data });
    }

    if (view === "active_attempts") {
      const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit")!, 10) : 50;
      const data = await getAdminActiveAttempts(limit);
      return NextResponse.json({ success: true, data });
    }

    if (view === "compare") {
      const testIdA = searchParams.get("testIdA");
      const testIdB = searchParams.get("testIdB");

      if (!testIdA || !testIdB) {
        return NextResponse.json(
          { error: "Both testIdA and testIdB parameters are required for test comparison." },
          { status: 400 }
        );
      }

      const data = await compareAdminTests(testIdA, testIdB);
      if (!data) {
        return NextResponse.json(
          { error: "One or both tests could not be located." },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, data });
    }

    // Default: overview
    const data = await getAdminOverviewAnalytics(baseFilters);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Admin Analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to process admin analytics request" },
      { status: 500 }
    );
  }
}
