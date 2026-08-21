import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tests, testQuestions } from "@/db/schema";

export async function POST(request: NextRequest) {
  const session = await auth();
  const isAdmin = (session?.user as any)?.isAdmin;

  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      title,
      description,
      duration,
      type,
      totalMarks,
      isPublished,
      questions: questionItems,
    } = body;

    // 1. Insert test
    const newTest = await db
      .insert(tests)
      .values({
        title,
        description,
        duration: duration || 60,
        type: type || "mixed",
        totalMarks: totalMarks || 100,
        isPublished: isPublished ?? true,
      })
      .returning();

    const createdTestId = newTest[0].id;

    // 2. Insert test-question links
    if (Array.isArray(questionItems) && questionItems.length > 0) {
      await db.insert(testQuestions).values(
        questionItems.map((q: any) => ({
          testId: createdTestId,
          questionId: q.questionId,
          questionOrder: q.questionOrder,
        }))
      );
    }

    return NextResponse.json({ success: true, test: newTest[0] });
  } catch (error) {
    console.error("Failed to create test:", error);
    return NextResponse.json(
      { error: "Failed to create test" },
      { status: 500 }
    );
  }
}
