import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getStudentPlacementTargets,
  updateStudentPlacementTargets,
  addStudentTargetRole,
  removeStudentTargetRole,
  setStudentPrimaryRole,
  addStudentTargetCompany,
  removeStudentTargetCompany,
  setStudentPrimaryCompany,
} from "@/server/company-role-intelligence";
import { studentTargetActionSchema } from "@/lib/validations/company-role";

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

    // Security: derive the user exclusively from the authenticated session.
    // Any client-sent userId is ignored.
    const userId = session.user.id;

    // Phase 11B: granular targeting actions
    if (body && typeof body === "object" && "action" in body) {
      const parsed = studentTargetActionSchema.safeParse(body);
      if (!parsed.success) {
        const message =
          parsed.error.issues[0]?.message || "Invalid action payload";
        return NextResponse.json({ error: message }, { status: 400 });
      }

      const action = parsed.data;
      let targets;
      switch (action.action) {
        case "addRole":
          targets = await addStudentTargetRole(userId, action.roleId);
          break;
        case "removeRole":
          targets = await removeStudentTargetRole(userId, action.roleId);
          break;
        case "setPrimaryRole":
          targets = await setStudentPrimaryRole(userId, action.roleId);
          break;
        case "addCompany":
          targets = await addStudentTargetCompany(userId, action.companyId);
          break;
        case "removeCompany":
          targets = await removeStudentTargetCompany(userId, action.companyId);
          break;
        case "setPrimaryCompany":
          targets = await setStudentPrimaryCompany(userId, action.companyId);
          break;
      }

      return NextResponse.json({ success: true, targets });
    }

    // Legacy full-update payload ({ primaryRoleId, companyIds })
    const updated = await updateStudentPlacementTargets(userId, body);
    return NextResponse.json({ success: true, targets: updated });
  } catch (error: any) {
    const message =
      error instanceof Error ? error.message : "Failed to update targets";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}