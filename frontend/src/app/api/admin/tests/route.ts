import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  tests,
  testSections,
  testQuestions,
  questions,
  questionPools,
  questionPoolQuestions,
  attempts,
} from "@/db/schema";
import { eq, inArray, count } from "drizzle-orm";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { duplicateTest } from "@/server/tests";
import { parseTestInstructions } from "@/lib/instructions";
import {
  validateLifecycleTransition,
  validateSchedule,
  type TestStatus,
} from "@/lib/lifecycle";

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

    if (body?.action === "duplicate") {
      if (typeof body.id !== "string" || !body.id.trim()) {
        return NextResponse.json({ error: "Test ID required" }, { status: 400 });
      }

      try {
        const duplicated = await duplicateTest(body.id.trim());
        return NextResponse.json({
          success: true,
          test: duplicated.test,
          questionCount: duplicated.questionCount,
        });
      } catch (dupError) {
        if (dupError instanceof Error && dupError.message === "SOURCE_TEST_NOT_FOUND") {
          return NextResponse.json({ error: "Test not found" }, { status: 404 });
        }
        console.error("Failed to duplicate test:", dupError);
        return NextResponse.json(
          { error: "Unable to duplicate this test. Please try again." },
          { status: 500 }
        );
      }
    }

    const {
      title,
      description,
      duration,
      type,
      totalMarks,
      status,
      scheduledStartAt,
      scheduledEndAt,
      scheduleTimezone,
      isPublished,
      negativeMarkingEnabled,
      negativeMarkRate,
      randomizeQuestions,
      randomizeOptions,
      attemptLimit,
      instructions,
      sections: rawSections,
      questions: questionItems,
    } = body;

    const validatedSchedule = validateSchedule(scheduledStartAt, scheduledEndAt, scheduleTimezone);
    if (!validatedSchedule.ok) {
      return NextResponse.json({ error: validatedSchedule.error }, { status: 400 });
    }

    const finalStatus: TestStatus =
      status === "draft" || status === "published" || status === "closed" || status === "archived"
        ? status
        : isPublished === false
        ? "draft"
        : "published";

    const isRandomizeQuestions = Boolean(randomizeQuestions);
    const isRandomizeOptions = Boolean(randomizeOptions);

    // Attempt limit: null/empty = unlimited; otherwise a whole number 1-100.
    let parsedAttemptLimit: number | null = null;
    if (attemptLimit !== undefined && attemptLimit !== null && attemptLimit !== "") {
      if (
        typeof attemptLimit !== "number" ||
        !Number.isInteger(attemptLimit) ||
        attemptLimit < 1 ||
        attemptLimit > 100
      ) {
        return NextResponse.json(
          { error: "Attempt limit must be a whole number between 1 and 100, or left empty for unlimited." },
          { status: 400 }
        );
      }
      parsedAttemptLimit = attemptLimit;
    }

    // Test instructions: plain text, null/empty/whitespace = no instructions.
    const parsedInstructions = parseTestInstructions(instructions);
    if (!parsedInstructions.ok) {
      return NextResponse.json({ error: parsedInstructions.error }, { status: 400 });
    }

    const isNegativeMarkingEnabled = Boolean(negativeMarkingEnabled);
    let parsedNegativeMarkRate = 0;
    if (isNegativeMarkingEnabled && negativeMarkRate !== undefined && negativeMarkRate !== null) {
      const rateNum = Number(negativeMarkRate);
      if (isNaN(rateNum) || rateNum < 0 || rateNum > 1) {
        return NextResponse.json(
          { error: "Negative mark rate must be a valid number between 0.00 and 1.00." },
          { status: 400 }
        );
      }
      parsedNegativeMarkRate = Math.round((rateNum + Number.EPSILON) * 100) / 100;
    }

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

    // Process sections or fallback to legacy flat questions
    interface NormalizedPool {
      title: string;
      description?: string | null;
      selectionCount: number;
      poolOrder: number;
      questions: { questionId: string; questionOrder: number }[];
    }

    interface NormalizedSection {
      title: string;
      description?: string | null;
      sectionOrder: number;
      questions: { questionId: string; questionOrder: number }[];
      pools: NormalizedPool[];
    }

    const normalizedSections: NormalizedSection[] = [];
    const allSeenQuestionIds = new Set<string>();

    if (Array.isArray(rawSections) && rawSections.length > 0) {
      for (let sIdx = 0; sIdx < rawSections.length; sIdx++) {
        const s = rawSections[sIdx];
        if (!s || typeof s.title !== "string" || !s.title.trim()) {
          return NextResponse.json(
            { error: `Section ${sIdx + 1} must have a valid title.` },
            { status: 400 }
          );
        }
        const sOrder =
          typeof s.sectionOrder === "number" && s.sectionOrder > 0
            ? s.sectionOrder
            : sIdx + 1;
        const sQuestions: { questionId: string; questionOrder: number }[] = [];

        if (Array.isArray(s.questions)) {
          for (let qIdx = 0; qIdx < s.questions.length; qIdx++) {
            const q = s.questions[qIdx];
            if (q?.questionId) {
              if (allSeenQuestionIds.has(q.questionId)) {
                return NextResponse.json(
                  {
                    error: `Duplicate question detected across sections or pools: ${q.questionId}`,
                  },
                  { status: 400 }
                );
              }
              allSeenQuestionIds.add(q.questionId);
              sQuestions.push({
                questionId: q.questionId,
                questionOrder:
                  typeof q.questionOrder === "number" && q.questionOrder > 0
                    ? q.questionOrder
                    : qIdx + 1,
              });
            }
          }
        }

        // Phase 7F: Parse pools within section
        const sPools: NormalizedPool[] = [];
        if (Array.isArray(s.pools)) {
          for (let pIdx = 0; pIdx < s.pools.length; pIdx++) {
            const p = s.pools[pIdx];
            if (!p || typeof p.title !== "string" || !p.title.trim()) {
              return NextResponse.json(
                {
                  error: `Pool ${pIdx + 1} in section "${s.title}" must have a valid title.`,
                },
                { status: 400 }
              );
            }

            const cleanPoolTitle = p.title.trim();
            const selectionCount = Number(p.selectionCount);
            if (
              isNaN(selectionCount) ||
              !Number.isInteger(selectionCount) ||
              selectionCount < 1
            ) {
              return NextResponse.json(
                {
                  error: `Pool "${cleanPoolTitle}" selection count must be a positive integer >= 1.`,
                },
                { status: 400 }
              );
            }

            const pQuestions: { questionId: string; questionOrder: number }[] = [];
            if (Array.isArray(p.questions)) {
              for (let pqIdx = 0; pqIdx < p.questions.length; pqIdx++) {
                const pq = p.questions[pqIdx];
                const qId = typeof pq === "string" ? pq : pq?.questionId;
                if (qId) {
                  if (allSeenQuestionIds.has(qId)) {
                    return NextResponse.json(
                      {
                        error: `Duplicate question detected in pool "${cleanPoolTitle}": question ${qId} is already assigned elsewhere in this test.`,
                      },
                      { status: 400 }
                    );
                  }
                  allSeenQuestionIds.add(qId);
                  pQuestions.push({
                    questionId: qId,
                    questionOrder:
                      typeof pq?.questionOrder === "number" && pq.questionOrder > 0
                        ? pq.questionOrder
                        : pqIdx + 1,
                  });
                }
              }
            }

            if (pQuestions.length < selectionCount) {
              return NextResponse.json(
                {
                  error: `Pool "${cleanPoolTitle}" requires ${selectionCount} question${
                    selectionCount === 1 ? "" : "s"
                  } to be selected, but only has ${pQuestions.length} question${
                    pQuestions.length === 1 ? "" : "s"
                  } assigned.`,
                },
                { status: 400 }
              );
            }

            sPools.push({
              title: cleanPoolTitle,
              description: p.description
                ? String(p.description).slice(0, 2000)
                : null,
              selectionCount,
              poolOrder:
                typeof p.poolOrder === "number" && p.poolOrder > 0
                  ? p.poolOrder
                  : pIdx + 1,
              questions: pQuestions,
            });
          }
        }

        normalizedSections.push({
          title: s.title.trim(),
          description: s.description
            ? String(s.description).slice(0, 2000)
            : null,
          sectionOrder: sOrder,
          questions: sQuestions,
          pools: sPools,
        });
      }
    } else if (Array.isArray(questionItems) && questionItems.length > 0) {
      // Legacy format: create default 'General' section
      const defaultQuestions: { questionId: string; questionOrder: number }[] = [];
      questionItems.forEach((q: any, idx: number) => {
        if (q?.questionId && !allSeenQuestionIds.has(q.questionId)) {
          allSeenQuestionIds.add(q.questionId);
          defaultQuestions.push({
            questionId: q.questionId,
            questionOrder: q.questionOrder ?? idx + 1,
          });
        }
      });
      normalizedSections.push({
        title: "General",
        description: null,
        sectionOrder: 1,
        questions: defaultQuestions,
        pools: [],
      });
    }

    if (normalizedSections.length === 0) {
      return NextResponse.json(
        { error: "At least one section is required." },
        { status: 400 }
      );
    }

    const totalQuestionsCount = normalizedSections.reduce(
      (sum, s) =>
        sum +
        s.questions.length +
        s.pools.reduce((pSum, p) => pSum + p.selectionCount, 0),
      0
    );
    if (totalQuestionsCount === 0) {
      return NextResponse.json(
        {
          error:
            "At least one question must be selected for the test (either fixed or via a pool).",
        },
        { status: 400 }
      );
    }

    // Verify all question IDs exist in DB and fetch their marks
    const existingQRows = await db
      .select({ id: questions.id, marks: questions.marks })
      .from(questions)
      .where(inArray(questions.id, Array.from(allSeenQuestionIds)));

    if (existingQRows.length !== allSeenQuestionIds.size) {
      return NextResponse.json(
        {
          error:
            "One or more selected questions do not exist in the question repository.",
        },
        { status: 400 }
      );
    }

    // Uniform Marks validation per pool
    const questionMarksMap = new Map(existingQRows.map((q) => [q.id, q.marks]));
    for (const sec of normalizedSections) {
      for (const pool of sec.pools) {
        const poolMarks = pool.questions.map((pq) =>
          questionMarksMap.get(pq.questionId)
        );
        const distinctMarks = new Set(poolMarks);
        if (distinctMarks.size > 1) {
          return NextResponse.json(
            {
              error: `All questions in pool "${pool.title}" must have the same marks value for deterministic scoring. Found conflicting marks: ${Array.from(
                distinctMarks
              ).join(", ")}.`,
            },
            { status: 400 }
          );
        }
      }
    }

    // Transactionally save test, sections, questions, and pools
    const createdTest = await db.transaction(async (tx) => {
      const [newTest] = await tx
        .insert(tests)
        .values({
          title: cleanTitle,
          description: description ? String(description).slice(0, 2000) : null,
          duration: numDuration,
          type: testType,
          totalMarks: validMarks,
          negativeMarkingEnabled: isNegativeMarkingEnabled,
          negativeMarkRate: parsedNegativeMarkRate.toFixed(2),
          randomizeQuestions: isRandomizeQuestions,
          randomizeOptions: isRandomizeOptions,
          attemptLimit: parsedAttemptLimit,
          instructions: parsedInstructions.value,
          status: finalStatus,
          scheduledStartAt: validatedSchedule.startUtc,
          scheduledEndAt: validatedSchedule.endUtc,
          scheduleTimezone: validatedSchedule.timezone,
          isPublished: finalStatus === "published",
        })
        .returning();

      for (const sec of normalizedSections) {
        const [insertedSec] = await tx
          .insert(testSections)
          .values({
            testId: newTest.id,
            title: sec.title,
            description: sec.description,
            sectionOrder: sec.sectionOrder,
          })
          .returning();

        if (sec.questions.length > 0) {
          await tx.insert(testQuestions).values(
            sec.questions.map((q) => ({
              testId: newTest.id,
              sectionId: insertedSec.id,
              questionId: q.questionId,
              questionOrder: q.questionOrder,
            }))
          );
        }

        for (const pool of sec.pools) {
          const [insertedPool] = await tx
            .insert(questionPools)
            .values({
              testId: newTest.id,
              sectionId: insertedSec.id,
              title: pool.title,
              description: pool.description,
              selectionCount: pool.selectionCount,
              poolOrder: pool.poolOrder,
            })
            .returning();

          if (pool.questions.length > 0) {
            await tx.insert(questionPoolQuestions).values(
              pool.questions.map((pq) => ({
                poolId: insertedPool.id,
                questionId: pq.questionId,
                questionOrder: pq.questionOrder,
              }))
            );
          }
        }
      }

      return newTest;
    });

    return NextResponse.json({ success: true, test: createdTest });
  } catch (error) {
    if (error instanceof Error && error.message === "SOURCE_TEST_NOT_FOUND") {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }
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
    const {
      id,
      status,
      scheduledStartAt,
      scheduledEndAt,
      scheduleTimezone,
      isPublished,
      title,
      description,
      duration,
      negativeMarkingEnabled,
      negativeMarkRate,
      randomizeQuestions,
      randomizeOptions,
      attemptLimit,
      instructions,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "Test ID required" }, { status: 400 });
    }

    const currentTests = await db
      .select()
      .from(tests)
      .where(eq(tests.id, id))
      .limit(1);

    if (currentTests.length === 0) {
      return NextResponse.json({ error: "Test not found" }, { status: 404 });
    }
    const currentTest = currentTests[0];

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    let targetStatus: TestStatus | undefined = undefined;
    if (status !== undefined) {
      if (
        status !== "draft" &&
        status !== "published" &&
        status !== "closed" &&
        status !== "archived"
      ) {
        return NextResponse.json(
          { error: "Invalid status value." },
          { status: 400 }
        );
      }
      targetStatus = status;
    } else if (typeof isPublished === "boolean") {
      targetStatus = isPublished ? "published" : "draft";
    }

    if (targetStatus !== undefined) {
      let hasAttempts = false;
      if (currentTest.status === "published" && targetStatus === "draft") {
        const attCountRes = await db
          .select({ count: count() })
          .from(attempts)
          .where(eq(attempts.testId, id));
        hasAttempts = Number(attCountRes[0]?.count || 0) > 0;
      }

      const transition = validateLifecycleTransition(
        currentTest.status,
        targetStatus,
        hasAttempts
      );
      if (!transition.ok) {
        return NextResponse.json({ error: transition.error }, { status: 400 });
      }

      updateData.status = targetStatus;
      updateData.isPublished = targetStatus === "published";
    }

    if (
      scheduledStartAt !== undefined ||
      scheduledEndAt !== undefined ||
      scheduleTimezone !== undefined
    ) {
      const sStart =
        scheduledStartAt !== undefined
          ? scheduledStartAt
          : currentTest.scheduledStartAt;
      const sEnd =
        scheduledEndAt !== undefined
          ? scheduledEndAt
          : currentTest.scheduledEndAt;
      const sTz =
        scheduleTimezone !== undefined
          ? scheduleTimezone
          : currentTest.scheduleTimezone;

      const schedVal = validateSchedule(sStart, sEnd, sTz);
      if (!schedVal.ok) {
        return NextResponse.json({ error: schedVal.error }, { status: 400 });
      }
      if (scheduledStartAt !== undefined)
        updateData.scheduledStartAt = schedVal.startUtc;
      if (scheduledEndAt !== undefined)
        updateData.scheduledEndAt = schedVal.endUtc;
      if (scheduleTimezone !== undefined)
        updateData.scheduleTimezone = schedVal.timezone;
    }
    if (typeof randomizeQuestions === "boolean") {
      updateData.randomizeQuestions = randomizeQuestions;
    }
    if (typeof randomizeOptions === "boolean") {
      updateData.randomizeOptions = randomizeOptions;
    }
    if (attemptLimit !== undefined) {
      if (attemptLimit === null || attemptLimit === "") {
        updateData.attemptLimit = null;
      } else if (
        typeof attemptLimit === "number" &&
        Number.isInteger(attemptLimit) &&
        attemptLimit >= 1 &&
        attemptLimit <= 100
      ) {
        updateData.attemptLimit = attemptLimit;
      } else {
        return NextResponse.json(
          { error: "Attempt limit must be a whole number between 1 and 100, or null for unlimited." },
          { status: 400 }
        );
      }
    }
    if (instructions !== undefined) {
      const parsedInstr = parseTestInstructions(instructions);
      if (!parsedInstr.ok) {
        return NextResponse.json({ error: parsedInstr.error }, { status: 400 });
      }
      updateData.instructions = parsedInstr.value;
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
    if (typeof negativeMarkingEnabled === "boolean") {
      updateData.negativeMarkingEnabled = negativeMarkingEnabled;
    }
    if (negativeMarkRate !== undefined && negativeMarkRate !== null) {
      const rateNum = Number(negativeMarkRate);
      if (isNaN(rateNum) || rateNum < 0 || rateNum > 1) {
        return NextResponse.json(
          { error: "Negative mark rate must be a valid number between 0.00 and 1.00." },
          { status: 400 }
        );
      }
      updateData.negativeMarkRate = (Math.round((rateNum + Number.EPSILON) * 100) / 100).toFixed(2);
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
