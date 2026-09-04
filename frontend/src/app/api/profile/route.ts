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

    // 1. Name validation
    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Full Name cannot be empty." },
        { status: 400 }
      );
    }
    const cleanName = name.trim();
    if (cleanName.length > 100) {
      return NextResponse.json(
        { error: "Full Name cannot exceed 100 characters." },
        { status: 400 }
      );
    }

    // 2. Length limits for optional strings
    const cleanCollege = college ? String(college).trim() : null;
    if (cleanCollege && cleanCollege.length > 200) {
      return NextResponse.json(
        { error: "College name cannot exceed 200 characters." },
        { status: 400 }
      );
    }

    const cleanBranch = branch ? String(branch).trim() : null;
    if (cleanBranch && cleanBranch.length > 200) {
      return NextResponse.json(
        { error: "Branch name cannot exceed 200 characters." },
        { status: 400 }
      );
    }

    // 3. Graduation Year validation
    let validGradYear: number | null = null;
    if (graduationYear !== null && graduationYear !== undefined && graduationYear !== "") {
      const yearNum = Number(graduationYear);
      if (isNaN(yearNum) || !Number.isInteger(yearNum) || yearNum < 1980 || yearNum > 2040) {
        return NextResponse.json(
          { error: "Graduation year must be a valid year between 1980 and 2040." },
          { status: 400 }
        );
      }
      validGradYear = yearNum;
    }

    // 4. Preferred Language validation
    const allowedLanguages = ["C++", "Java", "Python", "TypeScript", "JavaScript", "Go", "Rust"];
    let validLanguage = preferredLanguage ? String(preferredLanguage).trim() : "C++";
    if (!allowedLanguages.includes(validLanguage)) {
      return NextResponse.json(
        { error: `Preferred language must be one of: ${allowedLanguages.join(", ")}.` },
        { status: 400 }
      );
    }

    await db
      .update(profiles)
      .set({
        name: cleanName,
        college: cleanCollege,
        branch: cleanBranch,
        graduationYear: validGradYear,
        preferredLanguage: validLanguage,
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
