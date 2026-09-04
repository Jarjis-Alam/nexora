import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { questions, subjects, topics } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { QuestionBankTable } from "@/components/admin/question-bank-table";

export default async function AdminQuestionsPage() {
  const session = await auth();
  const isAdmin = (session?.user as any)?.isAdmin;

  if (!isAdmin) {
    redirect("/dashboard");
  }

  // Fetch all questions with subjects & topics
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

  const allSubjects = await db.select({ id: subjects.id, name: subjects.name }).from(subjects);

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-headline-lg font-bold text-text-primary">
            Question Bank
          </h1>
          <p className="text-body-md text-text-secondary mt-1">
            Author and manage technical assessments in the repository.
          </p>
        </div>

        <Link
          href="/admin/questions/new"
          className="bg-primary text-text-inverse font-semibold text-body-sm px-5 py-2.5 rounded hover:bg-primary-text transition-colors inline-flex items-center gap-2 shadow-sm self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Add Question
        </Link>
      </div>

      <QuestionBankTable questions={allQuestions} subjects={allSubjects} />
    </div>
  );
}
