import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { questions, subjects, topics } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { TestBuilder } from "@/components/admin/test-builder";

export default async function NewTestPage() {
  const session = await auth();
  const isAdmin = (session?.user as any)?.isAdmin;

  if (!isAdmin) {
    redirect("/dashboard");
  }

  const allQuestions = await db
    .select({
      id: questions.id,
      question: questions.question,
      difficulty: questions.difficulty,
      marks: questions.marks,
      subjectName: subjects.name,
      subjectCode: subjects.code,
      topicName: topics.name,
    })
    .from(questions)
    .innerJoin(subjects, eq(questions.subjectId, subjects.id))
    .innerJoin(topics, eq(questions.topicId, topics.id))
    .orderBy(desc(questions.createdAt))
    .limit(100);

  return (
    <div className="space-y-8 pb-20">
      <div>
        <h1 className="text-headline-lg font-bold text-text-primary">
          Test Builder
        </h1>
        <p className="text-body-md text-text-secondary mt-1">
          Configure modular placement exams and curate question payloads.
        </p>
      </div>

      <TestBuilder repositoryQuestions={allQuestions} />
    </div>
  );
}
