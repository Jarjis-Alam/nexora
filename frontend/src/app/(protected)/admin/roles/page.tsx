import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { searchRoles } from "@/server/company-role-intelligence";
import { RoleManagement } from "@/components/admin/role-management";

export default async function AdminRolesPage() {
  const session = await auth();
  const isAdmin = (session?.user as any)?.isAdmin;

  if (!isAdmin) {
    redirect("/dashboard");
  }

  const allRoles = await searchRoles({ includeInactive: true, limit: 200 });

  return (
    <div className="space-y-8 pb-28 pr-28 lg:pr-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-6">
        <div>
          <span className="text-label-xs font-mono uppercase tracking-wider text-primary-text">
            Admin Catalog
          </span>
          <h1 className="mt-1 text-headline-lg font-bold text-text-primary">
            Job Roles
          </h1>
          <p className="text-body-md text-text-secondary mt-1">
            Configure canonical career roles, placement tracks, and industry specializations.
          </p>
        </div>
      </div>

      <RoleManagement initialRoles={allRoles} />
    </div>
  );
}
