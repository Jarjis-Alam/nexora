import { auth } from "@/lib/auth";
import { getPublishedTests } from "@/server/tests";
import { TestCatalog } from "@/components/tests/test-catalog";

export default async function TestCatalogPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const allTests = await getPublishedTests(session.user.id);

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div>
        <h2 className="text-headline-lg font-bold text-text-primary">
          Placement Tests
        </h2>
        <p className="text-body-md text-text-secondary mt-1">
          Practice under realistic placement conditions.
        </p>
      </div>

      <TestCatalog tests={allTests} />
    </div>
  );
}
