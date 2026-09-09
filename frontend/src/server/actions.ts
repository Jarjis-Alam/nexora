"use server";

import { auth } from "@/lib/auth";
import {
  startOrResumeAttempt,
  saveAnswer,
  toggleReviewMark,
  updateCurrentQuestionIndex,
  duplicateTest,
} from "./tests";
import { gradeAttempt } from "./grading";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { tests, attempts } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import {
  validateLifecycleTransition,
  validateSchedule,
  type TestStatus,
} from "@/lib/lifecycle";

export async function startAttemptAction(testId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const res = await startOrResumeAttempt(testId, session.user.id);
  return res;
}

export async function saveAnswerAction(
  attemptId: string,
  questionId: string,
  selectedAnswer: unknown,
  timeSpentSec: number = 0
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return await saveAnswer(
    attemptId,
    session.user.id,
    questionId,
    selectedAnswer,
    timeSpentSec
  );
}

export async function toggleReviewAction(
  attemptId: string,
  questionId: string
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return await toggleReviewMark(attemptId, session.user.id, questionId);
}

export async function setQuestionIndexAction(
  attemptId: string,
  index: number
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return await updateCurrentQuestionIndex(attemptId, session.user.id, index);
}

export async function submitTestAttemptAction(attemptId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const result = await gradeAttempt(attemptId, session.user.id);
  revalidatePath("/dashboard");
  revalidatePath("/roadmap");
  revalidatePath("/analytics");
  revalidatePath("/profile");
  revalidatePath("/tests");
  return result;
}

export async function startTargetedPracticeAction(topicId?: string, subjectCode?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const { getOrCreateTargetedPracticeTest } = await import("./placement-intelligence");
  const practiceTest = await getOrCreateTargetedPracticeTest({ topicId, subjectCode });
  return practiceTest;
}

export async function duplicateTestAction(sourceTestId: string) {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  if (!isAdmin) {
    throw new Error("Unauthorized");
  }

  if (typeof sourceTestId !== "string" || !sourceTestId.trim()) {
    throw new Error("Invalid test ID");
  }

  const result = await duplicateTest(sourceTestId.trim());
  revalidatePath("/admin/tests");
  return result;
}

export async function updateTestLifecycleAction(
  testId: string,
  payload: {
    status?: TestStatus;
    scheduledStartAt?: string | null;
    scheduledEndAt?: string | null;
    scheduleTimezone?: string | null;
  }
) {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;
  if (!isAdmin) {
    throw new Error("Unauthorized");
  }

  if (typeof testId !== "string" || !testId.trim()) {
    throw new Error("Invalid test ID");
  }

  const currentTests = await db
    .select()
    .from(tests)
    .where(eq(tests.id, testId.trim()))
    .limit(1);

  if (currentTests.length === 0) {
    throw new Error("Test not found");
  }
  const currentTest = currentTests[0];

  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (payload.status !== undefined) {
    let hasAttempts = false;
    if (currentTest.status === "published" && payload.status === "draft") {
      const attCountRes = await db
        .select({ count: count() })
        .from(attempts)
        .where(eq(attempts.testId, currentTest.id));
      hasAttempts = Number(attCountRes[0]?.count || 0) > 0;
    }

    const transition = validateLifecycleTransition(
      currentTest.status,
      payload.status,
      hasAttempts
    );
    if (!transition.ok) {
      throw new Error(transition.error);
    }

    updateData.status = payload.status;
    updateData.isPublished = payload.status === "published";
  }

  if (
    payload.scheduledStartAt !== undefined ||
    payload.scheduledEndAt !== undefined ||
    payload.scheduleTimezone !== undefined
  ) {
    const sStart =
      payload.scheduledStartAt !== undefined
        ? payload.scheduledStartAt
        : currentTest.scheduledStartAt;
    const sEnd =
      payload.scheduledEndAt !== undefined
        ? payload.scheduledEndAt
        : currentTest.scheduledEndAt;
    const sTz =
      payload.scheduleTimezone !== undefined
        ? payload.scheduleTimezone
        : currentTest.scheduleTimezone;

    const schedVal = validateSchedule(sStart, sEnd, sTz);
    if (!schedVal.ok) {
      throw new Error(schedVal.error);
    }
    if (payload.scheduledStartAt !== undefined)
      updateData.scheduledStartAt = schedVal.startUtc;
    if (payload.scheduledEndAt !== undefined)
      updateData.scheduledEndAt = schedVal.endUtc;
    if (payload.scheduleTimezone !== undefined)
      updateData.scheduleTimezone = schedVal.timezone;
  }

  const [updated] = await db
    .update(tests)
    .set(updateData)
    .where(eq(tests.id, currentTest.id))
    .returning();

  revalidatePath("/admin/tests");
  revalidatePath("/tests");
  revalidatePath(`/tests/${currentTest.id}`);
  return updated;
}
