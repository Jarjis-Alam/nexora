import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tests, testQuestions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const session = await auth();
  const isAdmin = (session?.user as any)?.isAdmin;

  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimit = checkRateLimit(`admin_test_${ip}`, { limit: 30, windowMs: 60 * 1000 });
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait a moment before deploying new assessments." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
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

    // Validate title
    if (typeof title !== "string" || !title.trim()) {
      return NextResponse.json(
        { error: "Test title is required." },
        { status: 400 }
      );
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length > 200) {
      return NextResponse.json(
        { error: "Test title cannot exceed 200 characters." },
        { status: 400 }
      );
    }

    // Validate duration
    const numDuration = Number(duration);
    if (isNaN(numDuration) || numDuration < 1 || numDuration > 600) {
      return NextResponse.json(
        { error: "Duration must be between 1 and 600 minutes." },
        { status: 400 }
      );
    }

    // Validate test type
    const allowedTypes = ["aptitude", "cs_fundamentals", "mixed", "baseline"];
    const testType = type && allowedTypes.includes(type) ? type : "mixed";

    // Validate totalMarks
    const marksNum = Number(totalMarks);
    const validMarks = !isNaN(marksNum) && marksNum > 0 ? marksNum : 100;

    // Deduplicate questions by questionId
    const uniqueQuestions: { questionId: string; questionOrder: number }[] = [];
    const seenIds = new Set<string>();

    if (Array.isArray(questionItems)) {
      questionItems.forEach((q: any, idx: number) => {
        if (q?.questionId && !seenIds.has(q.questionId)) {
          seenIds.add(q.questionId);
          uniqueQuestions.push({
            questionId: q.questionId,
            questionOrder: q.questionOrder ?? idx + 1,
          });
        }
      });
    }

    if (uniqueQuestions.length === 0) {
      return NextResponse.json(
        { error: "At least one question must be selected for the test." },
        { status: 400 }
      );
    }

    // 1. Insert test
    const newTest = await db
      .insert(tests)
      .values({
        title: cleanTitle,
        description: description ? String(description).slice(0, 2000) : null,
        duration: numDuration,
        type: testType,
        totalMarks: validMarks,
        isPublished: isPublished ?? true,
      })
      .returning();

    const createdTestId = newTest[0].id;

    // 2. Insert test-question links respecting questionOrder
    await db.insert(testQuestions).values(
      uniqueQuestions.map((q, idx) => ({
        testId: createdTestId,
        questionId: q.questionId,
        questionOrder: idx + 1,
      }))
    );

    return NextResponse.json({ success: true, test: newTest[0] });
  } catch (error) {
    console.error("Failed to create test:", error);
    return NextResponse.json(
      { error: "Failed to create test" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await auth();
  const isAdmin = (session?.user as any)?.isAdmin;

  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, isPublished, title, description, duration } = body;

    if (!id) {
      return NextResponse.json({ error: "Test ID required" }, { status: 400 });
    }

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (typeof isPublished === "boolean") {
      updateData.isPublished = isPublished;
    }
    if (typeof title === "string" && title.trim()) {
      updateData.title = title.trim();
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (typeof duration === "number") {
      updateData.duration = duration;
    }

    const updated = await db
      .update(tests)
      .set(updateData)
      .where(eq(tests.id, id))
      .returning();

    if (updated.length === 0) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, test: updated[0] });
  } catch (error) {
    console.error("Failed to update test:", error);
    return NextResponse.json(
      { error: "Failed to update test" },
      { status: 500 }
    );
  }
}
