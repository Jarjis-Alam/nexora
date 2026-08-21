import { redirect } from "next/navigation";
import { db } from "@/db";
import { tests } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function AssessmentPage() {
  // Find the baseline assessment
  const baseline = await db
    .select({ id: tests.id })
    .from(tests)
    .where(eq(tests.type, "baseline"))
    .limit(1);

  if (baseline.length > 0) {
    redirect(`/tests/${baseline[0].id}`);
  } else {
    redirect("/tests");
  }
}
