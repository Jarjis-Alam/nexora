import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { adminUpdateCompany } from "@/server/company-role-intelligence";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(session.user as any).isAdmin) {
    return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Company ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const updated = await adminUpdateCompany(id, body);
    return NextResponse.json({ success: true, company: updated });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Failed to update company";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
