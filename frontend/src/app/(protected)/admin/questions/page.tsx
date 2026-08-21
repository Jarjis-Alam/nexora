import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { questions, subjects, topics } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

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
    .limit(50);

  const allSubjects = await db.select().from(subjects);

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

      {/* Filter Toolbar */}
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="Search questions by text or keywords..."
            className="w-full bg-base border border-border rounded px-4 py-2 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none"
          />
          <span className="material-symbols-outlined absolute right-3 top-2.5 text-text-muted text-[18px]">
            search
          </span>
        </div>

        <select className="bg-base border border-border text-text-primary text-label-xs font-mono px-3 py-2 rounded focus:border-primary focus:outline-none">
          <option value="">All Subjects</option>
          {allSubjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select className="bg-base border border-border text-text-primary text-label-xs font-mono px-3 py-2 rounded focus:border-primary focus:outline-none">
          <option value="">All Difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>

      {/* Question Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-surface-high border-b border-border text-label-xs font-mono text-text-muted uppercase">
          <div className="col-span-1">ID</div>
          <div className="col-span-6">Question Preview</div>
          <div className="col-span-2">Subject</div>
          <div className="col-span-2">Topic</div>
          <div className="col-span-1 text-right">Diff</div>
        </div>

        <div className="divide-y divide-border">
          {allQuestions.map((q, idx) => (
            <div
              key={q.id}
              className="grid grid-cols-12 gap-4 px-5 py-4 items-center text-body-sm hover:bg-surface-high/40 transition-colors"
            >
              <div className="col-span-1 font-mono text-label-xs text-text-muted">
                Q-{String(idx + 1).padStart(3, "0")}
              </div>

              <div className="col-span-6 truncate font-medium text-text-primary">
                {q.question}
              </div>

              <div className="col-span-2 text-label-xs font-mono text-primary-text truncate">
                {q.subjectName}
              </div>

              <div className="col-span-2 text-label-xs font-mono text-text-secondary truncate">
                {q.topicName}
              </div>

              <div className="col-span-1 text-right">
                <span
                  className={`text-label-xs px-2 py-0.5 rounded font-mono uppercase ${
                    q.difficulty === "easy"
                      ? "bg-secondary/10 text-secondary"
                      : q.difficulty === "medium"
                      ? "bg-primary/10 text-primary-text"
                      : "bg-error/10 text-error"
                  }`}
                >
                  {q.difficulty}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-between text-label-xs font-mono text-text-muted">
          <span>Showing 1 to {allQuestions.length} entries</span>
        </div>
      </div>
    </div>
  );
}
