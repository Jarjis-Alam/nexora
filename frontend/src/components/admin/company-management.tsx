"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AdminCompany {
  id: string;
  name: string;
  normalizedName: string;
  slug: string;
  industry: string;
  description: string | null;
  website: string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface CompanyManagementProps {
  initialCompanies: AdminCompany[];
}

export function CompanyManagement({ initialCompanies }: CompanyManagementProps) {
  const router = useRouter();
  const [companies, setCompanies] = useState<AdminCompany[]>(initialCompanies);
  const [searchQuery, setSearchQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<AdminCompany | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formIndustry, setFormIndustry] = useState("");
  const [formWebsite, setFormWebsite] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const industries = Array.from(new Set(companies.map((c) => c.industry))).sort();

  const filtered = companies.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.industry.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesIndustry =
      industryFilter === "all" || c.industry === industryFilter;
    return matchesSearch && matchesIndustry;
  });

  const openCreateModal = () => {
    setFormName("");
    setFormIndustry("");
    setFormWebsite("");
    setFormDescription("");
    setFormIsActive(true);
    setError(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (c: AdminCompany) => {
    setEditingCompany(c);
    setFormName(c.name);
    setFormIndustry(c.industry);
    setFormWebsite(c.website || "");
    setFormDescription(c.description || "");
    setFormIsActive(c.isActive);
    setError(null);
  };

  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          industry: formIndustry.trim(),
          website: formWebsite.trim() || null,
          description: formDescription.trim() || null,
          isActive: formIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create company");
      }

      setCompanies([data.company, ...companies]);
      setIsCreateOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to create company");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCompany) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/companies/${editingCompany.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          industry: formIndustry.trim(),
          website: formWebsite.trim() || null,
          description: formDescription.trim() || null,
          isActive: formIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update company");
      }

      setCompanies(
        companies.map((c) => (c.id === editingCompany.id ? data.company : c))
      );
      setEditingCompany(null);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to update company");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (company: AdminCompany) => {
    try {
      const res = await fetch(`/api/admin/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !company.isActive }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to toggle status");
        return;
      }

      setCompanies(
        companies.map((c) => (c.id === company.id ? data.company : c))
      );
      router.refresh();
    } catch (err: any) {
      alert(err.message || "Network error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Action Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-surface p-4 rounded-xl border border-border">
        <div className="flex flex-col sm:flex-row items-center gap-3 flex-1">
          <div className="relative w-full sm:w-72">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-text-muted">
              search
            </span>
            <input
              type="text"
              placeholder="Search companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-high border border-border rounded-lg pl-9 pr-3 py-2 text-body-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <select
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            className="w-full sm:w-48 bg-surface-high border border-border rounded-lg px-3 py-2 text-body-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="all">All Industries ({companies.length})</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={openCreateModal}
          className="bg-primary text-text-inverse font-semibold text-body-sm px-4 py-2 rounded-lg hover:bg-primary-text transition-colors inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>Add Company</span>
        </button>
      </div>

      {/* Companies Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="border-b border-border bg-surface-high/50 font-mono text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="py-3 px-4">Company Name</th>
                <th className="py-3 px-4">Industry</th>
                <th className="py-3 px-4">Website</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.length > 0 ? (
                filtered.map((company) => (
                  <tr key={company.id} className="hover:bg-surface-high/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div>
                        <span className="font-semibold text-text-primary block">
                          {company.name}
                        </span>
                        {company.description && (
                          <span className="text-[12px] text-text-muted line-clamp-1 max-w-md">
                            {company.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[12px] text-text-secondary">
                      {company.industry}
                    </td>
                    <td className="py-3.5 px-4">
                      {company.website ? (
                        <a
                          href={company.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-text hover:underline text-[12px] font-mono inline-flex items-center gap-1"
                        >
                          <span className="truncate max-w-[150px]">{company.website.replace(/^https?:\/\//, "")}</span>
                          <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                        </a>
                      ) : (
                        <span className="text-text-muted text-[12px] font-mono">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wider uppercase ${
                          company.isActive
                            ? "bg-secondary/15 text-secondary border border-secondary/25"
                            : "bg-tertiary/15 text-tertiary border border-tertiary/25"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            company.isActive ? "bg-secondary" : "bg-tertiary"
                          }`}
                        />
                        <span>{company.isActive ? "Active" : "Archived"}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(company)}
                          className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-highest transition-colors cursor-pointer"
                          title="Edit Company"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          onClick={() => handleToggleActive(company)}
                          className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition-colors cursor-pointer border ${
                            company.isActive
                              ? "border-border hover:border-tertiary/50 text-text-muted hover:text-tertiary"
                              : "border-secondary/40 text-secondary hover:bg-secondary/10"
                          }`}
                        >
                          {company.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-muted font-mono text-body-sm">
                    No companies matching filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {(isCreateOpen || editingCompany) && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <form onSubmit={isCreateOpen ? handleSaveCreate : handleSaveEdit}>
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h3 className="text-title-md font-bold text-text-primary">
                  {isCreateOpen ? "Create Placement Company" : `Edit Company: ${editingCompany?.name}`}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingCompany(null);
                  }}
                  className="p-1 rounded text-text-muted hover:text-text-primary cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <div className="p-5 space-y-4">
                {error && (
                  <div className="p-3 rounded-lg bg-error/10 border border-error/30 text-error text-body-sm">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-label-xs font-mono text-text-muted uppercase mb-1">
                    Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Google, Microsoft"
                    className="w-full bg-surface-high border border-border rounded-lg px-3 py-2 text-body-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-label-xs font-mono text-text-muted uppercase mb-1">
                    Industry *
                  </label>
                  <input
                    type="text"
                    required
                    value={formIndustry}
                    onChange={(e) => setFormIndustry(e.target.value)}
                    placeholder="e.g. Technology, IT Services, Financial Services"
                    className="w-full bg-surface-high border border-border rounded-lg px-3 py-2 text-body-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-label-xs font-mono text-text-muted uppercase mb-1">
                    Careers Website URL
                  </label>
                  <input
                    type="url"
                    value={formWebsite}
                    onChange={(e) => setFormWebsite(e.target.value)}
                    placeholder="https://careers.example.com"
                    className="w-full bg-surface-high border border-border rounded-lg px-3 py-2 text-body-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-label-xs font-mono text-text-muted uppercase mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Brief description of the organization..."
                    className="w-full bg-surface-high border border-border rounded-lg px-3 py-2 text-body-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    id="comp-active-chk"
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
                  />
                  <label htmlFor="comp-active-chk" className="text-body-sm text-text-primary cursor-pointer">
                    Active (Selectable by students for placement targets)
                  </label>
                </div>
              </div>

              <div className="p-4 border-t border-border bg-surface-high/30 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingCompany(null);
                  }}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg border border-border bg-surface text-text-secondary text-body-sm font-medium hover:bg-surface-high transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 rounded-lg bg-primary text-text-inverse hover:bg-primary-text text-body-sm font-semibold transition-colors flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  {loading && <span className="w-4 h-4 rounded-full border-2 border-text-inverse border-t-transparent animate-spin" />}
                  <span>{isCreateOpen ? "Create Company" : "Save Changes"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
