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

export function PlacementTargetsEditor({
  initialTargets,
  allRoles,
  allCompanies,
}: PlacementTargetsEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleSelectId = useId();
  const companySearchId = useId();

  // Form State
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(
    initialTargets.primaryRole?.id || null
  );
  const [selectedCompanies, setSelectedCompanies] = useState<CompanyItem[]>(
    initialTargets.targetCompanies.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      industry: c.industry,
      description: c.description,
      website: c.website,
      isActive: c.isActive,
    }))
  );

  // Search & Filter State
  const [companySearchQuery, setCompanySearchQuery] = useState("");

  const openEditor = () => {
    setSelectedRoleId(initialTargets.primaryRole?.id || null);
    setSelectedCompanies(
      initialTargets.targetCompanies.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        industry: c.industry,
        description: c.description,
        website: c.website,
        isActive: c.isActive,
      }))
    );
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

  const activeRoles = allRoles.filter((r) => r.isActive || r.id === selectedRoleId);

  const activeCompanies = allCompanies.filter(
    (c) => c.isActive || selectedCompanies.some((sc) => sc.id === c.id)
  );
  const availableCompanies = activeCompanies.filter(
    (c) => !selectedCompanies.some((sc) => sc.id === c.id)
  );
  const filteredCompanies = availableCompanies.filter(
    (c) =>
      c.name.toLowerCase().includes(companySearchQuery.toLowerCase()) ||
      c.industry.toLowerCase().includes(companySearchQuery.toLowerCase())
  );

  const handleAddCompany = (company: CompanyItem) => {
    if (selectedCompanies.length >= 10) {
      setError("Maximum 10 target companies allowed.");
      return;
    }
    setError(null);
    setSelectedCompanies([...selectedCompanies, company]);
    setCompanySearchQuery("");
  };

  const handleRemoveCompany = (companyId: string) => {
    setSelectedCompanies(selectedCompanies.filter((c) => c.id !== companyId));
    setError(null);
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/student/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryRoleId: selectedRoleId,
          companyIds: selectedCompanies.map((c) => c.id),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update placement targets");
      }

      setIsEditing(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to save targets");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setSelectedRoleId(initialTargets.primaryRole?.id || null);
    setSelectedCompanies(
      initialTargets.targetCompanies.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        industry: c.industry,
        description: c.description,
        website: c.website,
        isActive: c.isActive,
      }))
    );
    setError(null);
    setIsEditing(false);
  };

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
          <span>{initialTargets.configured ? "Edit Targets" : "Set Placement Target"}</span>
        </button>
      </div>

      {/* Targets View State */}
      {initialTargets.configured ? (
        <div className="space-y-4">
          {/* Primary Role */}
          <div>
            <span className="text-label-xs font-mono text-text-muted uppercase block mb-1.5">
              Primary Role
            </span>
            {initialTargets.primaryRole ? (
              <div className="p-3.5 rounded-lg bg-surface-high/70 border border-border flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-body-md font-bold text-text-primary">
                      {initialTargets.primaryRole.name}
                    </span>
                    {!initialTargets.primaryRole.isActive && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-tertiary/20 text-tertiary border border-tertiary/30">
                        Archived Role
                      </span>
                    )}
                  </div>
                  <span className="text-label-xs font-mono text-text-muted mt-0.5 block">
                    Category: {initialTargets.primaryRole.category}
                  </span>
                  {initialTargets.primaryRole.description && (
                    <p className="text-body-sm text-text-secondary mt-1 text-[13px] leading-relaxed">
                      {initialTargets.primaryRole.description}
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

          {/* Target Companies */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-label-xs font-mono text-text-muted uppercase">
                Target Companies
              </span>
              <span className="text-[11px] font-mono text-text-muted">
                {initialTargets.targetCompanies.length} / 10 selected
              </span>
            </div>

            {initialTargets.targetCompanies.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {initialTargets.targetCompanies.map((c) => (
                  <div
                    key={c.id}
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-high border border-border text-body-sm font-medium text-text-primary"
                  >
                    <span className="material-symbols-outlined text-[16px] text-primary">domain</span>
                    <span>{c.name}</span>
                    <span className="text-[11px] font-mono text-text-muted uppercase px-1.5 py-0.5 rounded bg-surface border border-border/60">
                      {c.industry}
                    </span>
                    {!c.isActive && (
                      <span className="text-[9px] font-mono text-tertiary bg-tertiary/10 px-1 rounded">
                        Archived
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-body-sm text-text-muted font-mono italic">
                No target companies selected yet.
              </p>
            )}
          </div>
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
              Choose a target role and companies to unlock more personalized placement guidance.
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
                  Configure primary role & target organizations
                </p>
              </div>
              <button
                onClick={handleCancel}
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

              {/* 1. Primary Role Selection */}
              <div>
                <label htmlFor={roleSelectId} className="block text-label-xs font-mono text-text-muted uppercase mb-1.5">
                  Primary Role
                </label>
                <div className="space-y-2">
                  <select
                    id={roleSelectId}
                    value={selectedRoleId || ""}
                    onChange={(e) => {
                      setSelectedRoleId(e.target.value || null);
                      setError(null);
                    }}
                    className="w-full bg-surface-high border border-border rounded-lg p-2.5 text-body-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">-- Select Primary Role --</option>
                    {activeRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.category}){!r.isActive ? " [Archived]" : ""}
                      </option>
                    ))}
                  </select>

                  {selectedRoleId && (
                    <div className="p-2.5 rounded-lg bg-surface-high/60 border border-border/80 flex items-center justify-between text-body-sm">
                      <span className="text-text-secondary text-[13px]">
                        Selected:{" "}
                        <strong className="text-text-primary">
                          {activeRoles.find((r) => r.id === selectedRoleId)?.name}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedRoleId(null)}
                        className="text-text-muted hover:text-error text-label-xs font-mono underline cursor-pointer"
                      >
                        Clear Selection
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 2. Target Companies Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor={companySearchId} className="text-label-xs font-mono text-text-muted uppercase">
                    Target Companies
                  </label>
                  <span className="text-[11px] font-mono text-text-muted">
                    {selectedCompanies.length} / 10 maximum
                  </span>
                </div>

                {/* Selected Company Chips */}
                {selectedCompanies.length > 0 ? (
                  <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-surface-high/40 border border-border mb-3 min-h-[50px]">
                    {selectedCompanies.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-primary/30 text-text-primary text-body-sm shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[15px] text-primary">domain</span>
                        <span>{c.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCompany(c.id)}
                          aria-label={`Remove ${c.name}`}
                          className="hover:text-error text-text-muted ml-1 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-surface-high/20 border border-border text-center text-text-muted text-body-sm font-mono text-[12px] mb-3">
                    No companies selected yet. Use the search below to add up to 10 companies.
                  </div>
                )}

                {/* Company Search & Add */}
                {selectedCompanies.length < 10 && (
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

                    {/* Suggestions dropdown list */}
                    {companySearchQuery.trim().length > 0 && (
                      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-high divide-y divide-border/60">
                        {filteredCompanies.length > 0 ? (
                          filteredCompanies.map((comp) => (
                            <button
                              key={comp.id}
                              type="button"
                              onClick={() => handleAddCompany(comp)}
                              className="w-full text-left px-3.5 py-2 hover:bg-surface-highest flex items-center justify-between transition-colors cursor-pointer"
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
                onClick={handleCancel}
                disabled={loading}
                className="px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface-high text-text-secondary text-body-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="px-5 py-2 rounded-lg bg-primary text-text-inverse hover:bg-primary-text text-body-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {loading && <span className="w-4 h-4 rounded-full border-2 border-text-inverse border-t-transparent animate-spin" />}
                <span>Save Targets</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
