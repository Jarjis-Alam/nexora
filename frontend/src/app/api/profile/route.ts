import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, college, branch, graduationYear, preferredLanguage } = body;

    await db
      .update(profiles)
      .set({
        name,
        college,
        branch,
        graduationYear: graduationYear ? Number(graduationYear) : null,
        preferredLanguage,
        updatedAt: new Date(),
      })
      .where(eq(profiles.userId, session.user.id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
