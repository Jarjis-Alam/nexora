import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlacementTargetStrategy } from "@/server/placement-target-strategy";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Security barrier: Derive student identity strictly from authenticated server session
  const userId = session.user.id;

  try {
    const strategy = await getPlacementTargetStrategy(userId);
    return NextResponse.json(strategy);
  } catch (error) {
    console.error("Failed to generate placement target strategy:", error);
    return NextResponse.json(
      { error: "Failed to generate placement target strategy" },
      { status: 500 }
    );
  }
}
