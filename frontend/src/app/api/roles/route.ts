import { NextRequest, NextResponse } from "next/server";
import { searchRoles } from "@/server/company-role-intelligence";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q") || undefined;
  const category = searchParams.get("category") || undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;

  try {
    const results = await searchRoles({
      query: q,
      category,
      includeInactive: false, // Students and public search only get active roles
      limit,
    });
    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to search roles:", error);
    return NextResponse.json(
      { error: "Failed to search roles" },
      { status: 500 }
    );
  }
}
