import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlacementIntelligence } from "@/server/placement-intelligence";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Security barrier: Derive student identity strictly from authenticated server session
  const userId = session.user.id;

  try {
    const intelligence = await getPlacementIntelligence(userId);
    return NextResponse.json(intelligence);
  } catch (error) {
    console.error("Failed to generate placement intelligence:", error);
    return NextResponse.json(
      { error: "Failed to generate placement intelligence" },
      { status: 500 }
    );
  }
}
