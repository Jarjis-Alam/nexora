import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminTestPreview } from "@/components/admin/admin-test-preview";

export default async function AdminTestPreviewPage() {
  const session = await auth();
  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin ?? false;

  if (!session?.user?.id) redirect("/auth/login?callbackUrl=/admin/tests/preview");
  if (!isAdmin) redirect("/dashboard");

  return <AdminTestPreview />;
}
