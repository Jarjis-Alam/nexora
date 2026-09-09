"use client";

import { useState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import type { StudentPlacementTargets } from "@/server/company-role-intelligence";

interface CompanyItem {
  id: string;
  name: string;
  slug: string;
  industry: string;
  description: string | null;
  website: string | null;
  isActive: boolean;
}

interface RoleItem {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  isActive: boolean;
}

interface PlacementTargetsEditorProps {
  initialTargets: StudentPlacementTargets;
  allRoles: RoleItem[];
  allCompanies: CompanyItem[];
}

const MAX_ROLES = 10;
const MAX_COMPANIES = 10;

export function PlacementTargetsEditor({
  initialTargets,
  allRoles,
  allCompanies,
}: PlacementTargetsEditorProps) {
  const router = useRouter();
  const [targets, setTargets] = useState<StudentPlacementTargets>(initialTargets);
  const [isEditing, setIsEditing] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const roleSearchId = useId();
  const companySearchId = useId();

  // Search & Filter State
  const [roleSearchQuery, setRoleSearchQuery] = useState("");
  const [companySearchQuery, setCompanySearchQuery] = useState("");

  const openEditor = () => {
    setTargets(initialTargets);
    setRoleSearchQuery("");
    setCompanySearchQuery("");
    setError(null);
    setIsEditing(true);
  };

  // Handle ESC key for modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isEditing) {
        setIsEditing(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditing]);

  const selectedRoleIds = new Set(targets.targetRoles.map((r) => r.id));
  const selectedCompanyIds = new Set(targets.targetCompanies.map((c) => c.id));

  const displayRoles = allRoles.filter(
    (r) => r.isActive || selectedRoleIds.has(r.id)
  );
  const availableRoles = displayRoles.filter(
    (r) => !selectedRoleIds.has(r.id) && r.isActive
  );
  const filteredRoles = availableRoles.filter(
    (r) =>
      r.name.toLowerCase().includes(roleSearchQuery.toLowerCase()) ||
      r.category.toLowerCase().includes(roleSearchQuery.toLowerCase())
  );

  const displayCompanies = allCompanies.filter(
    (c) => c.isActive || selectedCompanyIds.has(c.id)
  );
  const availableCompanies = displayCompanies.filter(
    (c) => !selectedCompanyIds.has(c.id) && c.isActive
  );
  const filteredCompanies = availableCompanies.filter(
    (c) =>
      c.name.toLowerCase().includes(companySearchQuery.toLowerCase()) ||
      c.industry.toLowerCase().includes(companySearchQuery.toLowerCase())
  );

  async function runAction(action: {
    action: string;
    roleId?: string;
    companyId?: string;
  }) {
    setPendingAction(`${action.action}:${action.roleId || action.companyId || ""}`);
    setError(null);
    try {
      const res = await fetch("/api/student/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update placement targets");
      }
      setTargets(data.targets);
      setRoleSearchQuery("");
      setCompanySearchQuery("");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to update targets");
    } finally {
      setPendingAction(null);
    }
  }

  const handleAddRole = (roleId: string) =>
    runAction({ action: "addRole", roleId });
  const handleRemoveRole = (roleId: string) =>
    runAction({ action: "removeRole", roleId });
  const handleSetPrimaryRole = (roleId: string) =>
    runAction({ action: "setPrimaryRole", roleId });
  const handleAddCompany = (companyId: string) =>
    runAction({ action: "addCompany", companyId });
  const handleRemoveCompany = (companyId: string) =>
    runAction({ action: "removeCompany", companyId });
  const handleSetPrimaryCompany = (companyId: string) =>
    runAction({ action: "setPrimaryCompany", companyId });

  const isBusy = pendingAction !== null;

  return (
    <div className="rounded-xl border border-border bg-surface p-5 sm:p-6 space-y-5">
      {/* Section Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border/80 pb-4">
        <div className="flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[20px] text-primary">target</span>
          <div>
            <h3 className="text-title-md font-semibold text-text-primary">
              Placement Targets
            </h3>
            <p className="text-label-xs font-mono uppercase text-text-muted">
              Career Trajectory & Company Goals
            </p>
          </div>
        </div>

        <button
          onClick={openEditor}
          className="px-3.5 py-1.5 rounded-lg border border-border bg-surface-high hover:bg-surface-highest text-text-primary text-body-sm font-medium transition-colors flex items-center gap-1.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <span className="material-symbols-outlined text-[16px]">edit</span>
          <span>{targets.configured ? "Edit Targets" : "Set Placement Target"}</span>
        </button>
      </div>

      {/* Targets View State */}
      {targets.configured ? (
        <div className="space-y-4">
          {/* Primary Role */}
          <div>
            <span className="text-label-xs font-mono text-text-muted uppercase block mb-1.5">
              Primary Role
            </span>
            {targets.primaryRole ? (
              <div className="p-3.5 rounded-lg bg-surface-high/70 border border-primary/25 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-body-md font-bold text-text-primary">
                      {targets.primaryRole.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/15 text-primary-text border border-primary/30">
                      PRIMARY
                    </span>
                    {!targets.primaryRole.isActive && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-tertiary/20 text-tertiary border border-tertiary/30">
                        Archived Role
                      </span>
                    )}
                  </div>
                  <span className="text-label-xs font-mono text-text-muted mt-0.5 block">
                    Category: {targets.primaryRole.category}
                  </span>
                  {targets.primaryRole.description && (
                    <p className="text-body-sm text-text-secondary mt-1 text-[13px] leading-relaxed">
                      {targets.primaryRole.description}
                    </p>
                  )}
                </div>
                <span className="material-symbols-outlined text-primary text-[20px]">check_circle</span>
              </div>
            ) : (
              <p className="text-body-sm text-text-muted font-mono italic">
                No primary role specified.
              </p>
            )}
          </div>

          {/* Additional Target Roles */}
          {targets.targetRoles.filter((r) => !r.isPrimary).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-label-xs font-mono text-text-muted uppercase">
                  Additional Target Roles
                </span>
                <span className="text-[11px] font-mono text-text-muted">
                  {targets.targetRoles.length} / {MAX_ROLES}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {targets.targetRoles
                  .filter((r) => !r.isPrimary)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-high border border-border text-body-sm font-medium text-text-primary"
                    >
                      <span className="material-symbols-outlined text-[16px] text-primary">badge</span>
                      <span>{r.name}</span>
                      <span className="text-[11px] font-mono text-text-muted uppercase px-1.5 py-0.5 rounded bg-surface border border-border/60">
                        {r.category}
                      </span>
                      {!r.isActive && (
                        <span className="text-[9px] font-mono text-tertiary bg-tertiary/10 px-1 rounded">
                          Archived
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Primary Company */}
          <div>
            <span className="text-label-xs font-mono text-text-muted uppercase block mb-1.5">
              Primary Company
            </span>
            {targets.primaryCompany ? (
              <div className="p-3.5 rounded-lg bg-surface-high/70 border border-primary/25 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-body-md font-bold text-text-primary">
                      {targets.primaryCompany.name}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/15 text-primary-text border border-primary/30">
                      PRIMARY
                    </span>
                    {!targets.primaryCompany.isActive && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-tertiary/20 text-tertiary border border-tertiary/30">
                        Archived
                      </span>
                    )}
                  </div>
                  <span className="text-label-xs font-mono text-text-muted mt-0.5 block">
                    Industry: {targets.primaryCompany.industry}
                  </span>
                </div>
                <span className="material-symbols-outlined text-primary text-[20px]">domain</span>
              </div>
            ) : (
              <p className="text-body-sm text-text-muted font-mono italic">
                No primary company selected.
              </p>
            )}
          </div>

          {/* Additional Target Companies */}
          {targets.targetCompanies.length > 1 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-label-xs font-mono text-text-muted uppercase">
                  Additional Target Companies
                </span>
                <span className="text-[11px] font-mono text-text-muted">
                  {targets.targetCompanies.length} / {MAX_COMPANIES}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {targets.targetCompanies.slice(1).map((c, idx) => (
                  <div
                    key={c.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-high border border-border text-body-sm font-medium text-text-primary"
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary">domain</span>
                    <span>{c.name}</span>
                    <span className="text-[11px] font-mono text-text-muted uppercase px-1.5 py-0.5 rounded bg-surface border border-border/60">
                      #{idx + 2} · {c.industry}
                    </span>
                    {!c.isActive && (
                      <span className="text-[9px] font-mono text-tertiary bg-tertiary/10 px-1 rounded">
                        Archived
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty Onboarding State */
        <div className="p-5 rounded-xl bg-surface-high/40 border border-border/80 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[24px]">flag</span>
          </div>
          <div className="max-w-md">
            <h4 className="text-body-md font-bold text-text-primary mb-1">
              Set your placement target
            </h4>
            <p className="text-body-sm text-text-secondary leading-relaxed text-[13px]">
              Choose target roles and companies to unlock more personalized placement guidance.
            </p>
          </div>
          <button
            onClick={openEditor}
            className="mt-1 bg-primary text-text-inverse font-medium text-body-sm px-5 py-2 rounded-lg hover:bg-primary-text transition-all inline-flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <span className="material-symbols-outlined text-[16px]">add_task</span>
            <span>Set Placement Target</span>
          </button>
        </div>
      )}

      {/* Target Selection Modal */}
      {isEditing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-targets-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-surface border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 id="modal-targets-title" className="text-title-md font-bold text-text-primary">
                  Manage Placement Targets
                </h3>
                <p className="text-label-xs font-mono text-text-muted uppercase mt-0.5">
                  Target roles, target companies & primary designations
                </p>
              </div>
              <button
                onClick={() => setIsEditing(false)}
                aria-label="Close dialog"
                className="p-1 rounded-md text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-6 flex-1">
              {error && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-body-sm flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <span>{error}</span>
                </div>
              )}

              {/* 1. Target Roles */}
              <div aria-busy={isBusy}>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor={roleSearchId} className="text-label-xs font-mono text-text-muted uppercase">
                    Target Roles
                  </label>
                  <span className="text-[11px] font-mono text-text-muted">
                    {targets.targetRoles.length} / {MAX_ROLES}
                  </span>
                </div>

                {/* Selected Role Chips */}
                {targets.targetRoles.length > 0 ? (
                  <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-surface-high/40 border border-border mb-3 min-h-[50px]">
                    {targets.targetRoles.map((r) => (
                      <span
                        key={r.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border text-body-sm shadow-sm ${
                          r.isPrimary ? "border-primary/40" : "border-border"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px] text-primary">badge</span>
                        <span className={r.isPrimary ? "text-primary-text font-semibold" : "text-text-primary"}>
                          {r.name}
                        </span>
                        {r.isPrimary ? (
                          <span className="text-[9px] font-mono uppercase text-primary-text bg-primary/15 px-1.5 py-0.5 rounded">
                            Primary
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryRole(r.id)}
                            disabled={isBusy}
                            className="text-[10px] font-mono text-text-muted hover:text-primary-text underline decoration-dotted underline-offset-2 ml-1 transition-colors cursor-pointer disabled:opacity-40"
                          >
                            Make Primary
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveRole(r.id)}
                          disabled={isBusy}
                          aria-label={`Remove ${r.name}`}
                          className="hover:text-error text-text-muted ml-1 transition-colors cursor-pointer disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-surface-high/20 border border-border text-center text-text-muted text-body-sm font-mono text-[12px] mb-3">
                    No target roles yet. Use the search below to add up to {MAX_ROLES} roles.
                  </div>
                )}

                {/* Role Search & Add */}
                {targets.targetRoles.length < MAX_ROLES && (
                  <div className="space-y-2">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-text-muted">
                        search
                      </span>
                      <input
                        id={roleSearchId}
                        type="text"
                        placeholder="Search roles by name or category..."
                        value={roleSearchQuery}
                        onChange={(e) => setRoleSearchQuery(e.target.value)}
                        className="w-full bg-surface-high border border-border rounded-lg pl-9 pr-3 py-2 text-body-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    {roleSearchQuery.trim().length > 0 && (
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-surface-high divide-y divide-border/60">
                        {filteredRoles.length > 0 ? (
                          filteredRoles.map((role) => (
                            <button
                              key={role.id}
                              type="button"
                              onClick={() => handleAddRole(role.id)}
                              disabled={isBusy}
                              className="w-full text-left px-3.5 py-2 hover:bg-surface-highest flex items-center justify-between transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-body-sm font-medium text-text-primary">{role.name}</span>
                                <span className="text-[11px] font-mono text-text-muted uppercase">({role.category})</span>
                              </div>
                              <span className="material-symbols-outlined text-primary text-[18px]">add</span>
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-center text-text-muted text-body-sm font-mono text-[12px]">
                            No matching active roles found.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 2. Target Companies */}
              <div aria-busy={isBusy}>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor={companySearchId} className="text-label-xs font-mono text-text-muted uppercase">
                    Target Companies
                  </label>
                  <span className="text-[11px] font-mono text-text-muted">
                    {targets.targetCompanies.length} / {MAX_COMPANIES}
                  </span>
                </div>

                {/* Selected Company Chips (priority-ordered) */}
                {targets.targetCompanies.length > 0 ? (
                  <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-surface-high/40 border border-border mb-3 min-h-[50px]">
                    {targets.targetCompanies.map((c) => (
                      <span
                        key={c.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border text-body-sm shadow-sm ${
                          c.priority === 1 ? "border-primary/40" : "border-border"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[15px] text-primary">domain</span>
                        <span className={c.priority === 1 ? "text-primary-text font-semibold" : "text-text-primary"}>
                          {c.name}
                        </span>
                        {c.priority === 1 ? (
                          <span className="text-[9px] font-mono uppercase text-primary-text bg-primary/15 px-1.5 py-0.5 rounded">
                            Primary
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetPrimaryCompany(c.id)}
                            disabled={isBusy}
                            className="text-[10px] font-mono text-text-muted hover:text-primary-text underline decoration-dotted underline-offset-2 ml-1 transition-colors cursor-pointer disabled:opacity-40"
                          >
                            Make Primary
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveCompany(c.id)}
                          disabled={isBusy}
                          aria-label={`Remove ${c.name}`}
                          className="hover:text-error text-text-muted ml-1 transition-colors cursor-pointer disabled:opacity-40"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-surface-high/20 border border-border text-center text-text-muted text-body-sm font-mono text-[12px] mb-3">
                    No target companies yet. Use the search below to add up to {MAX_COMPANIES} companies.
                  </div>
                )}

                {/* Company Search & Add */}
                {targets.targetCompanies.length < MAX_COMPANIES && (
                  <div className="space-y-2">
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-text-muted">
                        search
                      </span>
                      <input
                        id={companySearchId}
                        type="text"
                        placeholder="Search companies by name or industry..."
                        value={companySearchQuery}
                        onChange={(e) => setCompanySearchQuery(e.target.value)}
                        className="w-full bg-surface-high border border-border rounded-lg pl-9 pr-3 py-2 text-body-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>

                    {companySearchQuery.trim().length > 0 && (
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-surface-high divide-y divide-border/60">
                        {filteredCompanies.length > 0 ? (
                          filteredCompanies.map((comp) => (
                            <button
                              key={comp.id}
                              type="button"
                              onClick={() => handleAddCompany(comp.id)}
                              disabled={isBusy}
                              className="w-full text-left px-3.5 py-2 hover:bg-surface-highest flex items-center justify-between transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-body-sm font-medium text-text-primary">{comp.name}</span>
                                <span className="text-[11px] font-mono text-text-muted uppercase">({comp.industry})</span>
                              </div>
                              <span className="material-symbols-outlined text-primary text-[18px]">add</span>
                            </button>
                          ))
                        ) : (
                          <div className="p-3 text-center text-text-muted text-body-sm font-mono text-[12px]">
                            No matching active companies found.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-surface-high/30 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface-high text-text-secondary text-body-sm font-medium transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}