import { Sidebar } from "@/components/layout/sidebar";
import { DeveloperFooter } from "@/components/layout/developer-footer";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tests } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin ?? false;

  // Fetch baseline test ID if available
  const baseline = await db
    .select({ id: tests.id })
    .from(tests)
    .where(eq(tests.type, "baseline"))
    .limit(1);

  const baselineTestId = baseline[0]?.id || null;

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-transparent text-text-primary tech-grid">
      <Sidebar baselineTestId={baselineTestId} isAdmin={isAdmin} />
      <main className="flex-1 md:ml-64 min-h-screen flex flex-col justify-between overflow-y-auto">
        <div className="container-fluid py-6 md:py-10 flex-1">
          {children}
        </div>
        <DeveloperFooter />
      </main>
    </div>
  );
}
