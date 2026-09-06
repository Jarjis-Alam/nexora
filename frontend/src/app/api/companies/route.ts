import { NextRequest, NextResponse } from "next/server";
import { searchCompanies } from "@/server/company-role-intelligence";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q") || undefined;
  const industry = searchParams.get("industry") || undefined;
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;

  try {
    const results = await searchCompanies({
      query: q,
      industry,
      includeInactive: false, // Students and public search only get active companies
      limit,
    });
    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to search companies:", error);
    return NextResponse.json(
      { error: "Failed to search companies" },
      { status: 500 }
    );
  }
}
