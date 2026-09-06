import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getStudentPlacementTargets,
  updateStudentPlacementTargets,
} from "@/server/company-role-intelligence";

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const targets = await getStudentPlacementTargets(session.user.id);
    return NextResponse.json(targets);
  } catch (error) {
    console.error("Failed to fetch placement targets:", error);
    return NextResponse.json(
      { error: "Failed to fetch placement targets" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Security check: Ignore any client-sent userId; use authenticated session userId exclusively
    const updated = await updateStudentPlacementTargets(session.user.id, body);
    return NextResponse.json({ success: true, targets: updated });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : "Failed to update targets";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
