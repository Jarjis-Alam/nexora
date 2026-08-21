import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { subjects, topics } from "@/db/schema";
import { QuestionForm } from "@/components/admin/question-form";

export default async function NewQuestionPage() {
  const session = await auth();
  const isAdmin = (session?.user as any)?.isAdmin;

  if (!isAdmin) {
    redirect("/dashboard");
  }

  const allSubjects = await db.select().from(subjects);
  const allTopics = await db.select().from(topics);

  return (
    <div className="space-y-8 pb-20 container-narrow">
      <div>
        <h1 className="text-headline-lg font-bold text-text-primary">
          Author New Question
        </h1>
        <p className="text-body-md text-text-secondary mt-1">
          Add an assessment item to the central question repository.
        </p>
      </div>

      <QuestionForm subjects={allSubjects} topics={allTopics} />
    </div>
  );
}
