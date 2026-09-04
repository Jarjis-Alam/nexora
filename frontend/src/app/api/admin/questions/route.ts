import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { questions } from "@/db/schema";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const session = await auth();
  const isAdmin = (session?.user as any)?.isAdmin;

  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`admin_q_${ip}`, { limit: 60, windowMs: 60 * 1000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please slow down authoring actions." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
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

    // Validate question
    if (typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "Question content is required." },
        { status: 400 }
      );
    }

    // Validate options
    if (!Array.isArray(options) || options.filter((o: any) => typeof o === "string" && o.trim().length > 0).length < 2) {
      return NextResponse.json(
        { error: "At least two valid option strings are required." },
        { status: 400 }
      );
    }
    const cleanOptions = options.map((o: any) => String(o).trim()).filter((o: string) => o.length > 0);

    // Validate correct answer
    if (!correctAnswer) {
      return NextResponse.json(
        { error: "Correct answer key is required." },
        { status: 400 }
      );
    }
    const cleanAnswer = typeof correctAnswer === "string" ? correctAnswer.trim() : correctAnswer;
    if (typeof cleanAnswer === "string" && !cleanOptions.includes(cleanAnswer)) {
      return NextResponse.json(
        { error: "Correct answer must match one of the provided options exactly." },
        { status: 400 }
      );
    }

    // Validate subject & topic
    if (!subjectId || !topicId) {
      return NextResponse.json(
        { error: "Subject and Topic are required." },
        { status: 400 }
      );
    }

    const qType = questionType === "multiple_choice" ? "multiple_choice" : "single_choice";
    const diff = ["easy", "medium", "hard"].includes(difficulty) ? difficulty : "medium";
    const qMarks = Number(marks) > 0 ? Number(marks) : 2;
    const qTime = Number(expectedTime) > 0 ? Number(expectedTime) : 60;

    const newQ = await db
      .insert(questions)
      .values({
        question: question.trim(),
        questionType: qType,
        options: cleanOptions,
        correctAnswer: cleanAnswer,
        subjectId,
        topicId,
        difficulty: diff,
        marks: qMarks,
        expectedTime: qTime,
        explanation: explanation ? String(explanation).trim() : null,
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
