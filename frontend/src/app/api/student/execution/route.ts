import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDailyExecutionPlan } from "@/server/placement-execution";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Security barrier: Derive student identity strictly from authenticated server session
  const userId = session.user.id;

  try {
    const plan = await getDailyExecutionPlan(userId);
    return NextResponse.json(plan);
  } catch (error) {
    console.error("Failed to generate execution plan:", error);
    return NextResponse.json(
      { error: "Failed to generate execution plan" },
      { status: 500 }
    );
  }
}
