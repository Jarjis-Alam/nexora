import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAdminTestDetailAnalytics } from "@/server/admin-analytics";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;

  if (!isAdmin) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Test ID is required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const dateRange = searchParams.get("dateRange") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    const data = await getAdminTestDetailAnalytics(id, {
      dateRange,
      startDate,
      endDate,
    });

    if (!data) {
      return NextResponse.json(
        { error: "Assessment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Admin Test Detail Analytics API error:", error);
    return NextResponse.json(
      { error: "Failed to load test detail analytics" },
      { status: 500 }
    );
  }
}
