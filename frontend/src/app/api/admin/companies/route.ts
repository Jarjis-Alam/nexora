import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  searchCompanies,
  adminCreateCompany,
} from "@/server/company-role-intelligence";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(session.user as any).isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  const searchParams = request.nextUrl.searchParams;
  const q = searchParams.get("q") || undefined;
  const industry = searchParams.get("industry") || undefined;
  const includeInactive = searchParams.get("includeInactive") !== "false"; // Default true for admin
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 100), 200) : 100;

  try {
    const results = await searchCompanies({
      query: q,
      industry,
      includeInactive,
      limit,
    });
    return NextResponse.json(results);
  } catch (error) {
    console.error("Failed to list admin companies:", error);
    return NextResponse.json(
      { error: "Failed to list companies" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(session.user as any).isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const company = await adminCreateCompany(body);
    return NextResponse.json({ success: true, company }, { status: 201 });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Failed to create company";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
