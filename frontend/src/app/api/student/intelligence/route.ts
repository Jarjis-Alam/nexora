import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStudentIntelligence } from "@/server/student-intelligence";

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Security barrier: Students can ONLY request their own intelligence.
  // Query parameter spoofing/impersonation is strictly rejected.
  const userId = session.user.id;

  try {
    const intelligence = await getStudentIntelligence(userId);
    return NextResponse.json(intelligence);
  } catch (error) {
    console.error("Failed to generate student intelligence:", error);
    return NextResponse.json(
      { error: "Failed to generate student intelligence" },
      { status: 500 }
    );
  }
}
