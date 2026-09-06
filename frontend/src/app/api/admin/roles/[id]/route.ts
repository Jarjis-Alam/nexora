import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { adminUpdateRole } from "@/server/company-role-intelligence";

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
    return NextResponse.json({ error: "Role ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const updated = await adminUpdateRole(id, body);
    return NextResponse.json({ success: true, role: updated });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Failed to update role";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
