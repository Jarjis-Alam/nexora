import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getOrCreateTargetedPracticeTest } from "@/server/placement-intelligence";

export default async function PracticeLauncherPage({
  searchParams,
}: {
  searchParams: Promise<{ topicId?: string; subjectCode?: string; testId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?callbackUrl=/practice");
  }

  const { topicId, subjectCode, testId } = await searchParams;

  if (testId) {
    redirect(`/tests/${testId}`);
  }

  try {
    const targetedTest = await getOrCreateTargetedPracticeTest({
      topicId,
      subjectCode,
    });
    redirect(`/tests/${targetedTest.id}`);
  } catch (error) {
    console.error("Failed to resolve targeted practice test:", error);
    return (
      <div className="max-w-lg mx-auto py-16 text-center space-y-6">
        <div className="w-14 h-14 rounded-full bg-surface-high border border-border flex items-center justify-center text-primary-text mx-auto">
          <span className="material-symbols-outlined text-[28px]">quiz</span>
        </div>
        <div>
          <h1 className="text-headline-sm font-bold text-text-primary">
            Practice Session Unavailable
          </h1>
          <p className="text-body-sm text-text-secondary mt-2 leading-relaxed">
            The requested practice module could not be initialized at this time. You can choose from the assessment catalog.
          </p>
        </div>
        <div className="pt-2 flex justify-center gap-3">
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-lg border border-border bg-surface hover:bg-surface-high text-body-sm font-semibold text-text-primary transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/tests"
            className="px-5 py-2.5 rounded-lg bg-primary hover:bg-primary-text text-body-sm font-semibold text-text-inverse transition-colors"
          >
            View Catalog
          </Link>
        </div>
      </div>
    );
  }
}
