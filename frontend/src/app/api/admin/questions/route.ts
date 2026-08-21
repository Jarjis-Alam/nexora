import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { questions } from "@/db/schema";

export async function POST(request: NextRequest) {
  const session = await auth();
  const isAdmin = (session?.user as any)?.isAdmin;

  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      question,
      questionType,
      options,
      correctAnswer,
      subjectId,
      topicId,
      difficulty,
      marks,
      expectedTime,
      explanation,
    } = body;

    const newQ = await db
      .insert(questions)
      .values({
        question,
        questionType: questionType || "single_choice",
        options,
        correctAnswer,
        subjectId,
        topicId,
        difficulty: difficulty || "medium",
        marks: marks || 2,
        expectedTime: expectedTime || 60,
        explanation: explanation || null,
      })
      .returning();

    return NextResponse.json({ success: true, question: newQ[0] });
  } catch (error) {
    console.error("Failed to create question:", error);
    return NextResponse.json(
      { error: "Failed to create question" },
      { status: 500 }
    );
  }
}
