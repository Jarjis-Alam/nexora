import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAdminTestDetailAnalytics } from "@/server/admin-analytics";
import { TestDetailAnalyticsView } from "@/components/admin/analytics/test-detail-analytics-view";

export const metadata = {
  title: "Assessment Telemetry & Item Analysis | Nexora",
  description: "Granular question performance, sectional breakdowns, and test difficulty analytics.",
};

export default async function AdminTestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;

  if (!isAdmin) {
    redirect("/dashboard");
  }

  const { id } = await params;
  if (!id) {
    notFound();
  }

  const data = await getAdminTestDetailAnalytics(id);
  if (!data) {
    notFound();
  }

  return (
    <div className="pb-28 pr-28 lg:pr-0">
      <TestDetailAnalyticsView data={data} />
    </div>
  );
}
