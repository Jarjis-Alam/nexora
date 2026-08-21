import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAttemptExamState } from "@/server/tests";
import { ExamEngine } from "@/components/assessment/exam-engine";

export default async function TestAttemptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ attemptId?: string }>;
}) {
  const { id: testId } = await params;
  const { attemptId } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login");

  if (!attemptId) {
    redirect(`/tests/${testId}`);
  }

  const examState = await getAttemptExamState(attemptId, session.user.id);

  if (!examState) notFound();

  // If already expired or submitted, redirect to results
  if (examState.isExpired || examState.status === "submitted" || !examState.questions) {
    redirect(`/tests/${testId}/result?attemptId=${attemptId}`);
  }

  return (
    <ExamEngine
      initialState={{
        attemptId: examState.attemptId,
        testId: examState.testId,
        testTitle: examState.testTitle!,
        testType: examState.testType!,
        status: examState.status,
        totalDurationSeconds: examState.totalDurationSeconds!,
        remainingSeconds: examState.remainingSeconds!,
        currentQuestionIndex: examState.currentQuestionIndex!,
        questions: examState.questions,
        answers: examState.answers!,
      }}
    />
  );
}
