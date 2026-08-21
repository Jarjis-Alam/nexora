"use server";

import { auth } from "@/lib/auth";
import {
  startOrResumeAttempt,
  saveAnswer,
  toggleReviewMark,
  updateCurrentQuestionIndex,
} from "./tests";
import { gradeAttempt } from "./grading";
import { revalidatePath } from "next/cache";

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
  selectedAnswer: any,
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
  revalidatePath("/analytics");
  revalidatePath("/profile");
  revalidatePath("/tests");
  return result;
}
