"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AdminRole {
  id: string;
  name: string;
  normalizedName: string;
  slug: string;
  category: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface RoleManagementProps {
  initialRoles: AdminRole[];
}

export function RoleManagement({ initialRoles }: RoleManagementProps) {
  const router = useRouter();
  const [roles, setRoles] = useState<AdminRole[]>(initialRoles);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<AdminRole | null>(null);

  // Form State
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("Software Engineering");
  const [formDescription, setFormDescription] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const standardCategories = [
    "Software Engineering",
    "Data",
    "Cloud/Infrastructure",
    "Security",
    "Testing/QA",
    "Product/Technology",
    "Analytics",
  ];

  const categories = Array.from(
    new Set([...standardCategories, ...roles.map((r) => r.category)])
  ).sort();

  const filtered = roles.filter((r) => {
    const matchesSearch =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      categoryFilter === "all" || r.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const openCreateModal = () => {
    setFormName("");
    setFormCategory("Software Engineering");
    setFormDescription("");
    setFormIsActive(true);
    setError(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (r: AdminRole) => {
    setEditingRole(r);
    setFormName(r.name);
    setFormCategory(r.category);
    setFormDescription(r.description || "");
    setFormIsActive(r.isActive);
    setError(null);
  };

  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          category: formCategory.trim(),
          description: formDescription.trim() || null,
          isActive: formIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to create role");
      }

      setRoles([data.role, ...roles]);
      setIsCreateOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to create role");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/roles/${editingRole.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          category: formCategory.trim(),
          description: formDescription.trim() || null,
          isActive: formIsActive,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update role");
      }

      setRoles(
        roles.map((r) => (r.id === editingRole.id ? data.role : r))
      );
      setEditingRole(null);
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to update role");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (role: AdminRole) => {
    try {
      const res = await fetch(`/api/admin/roles/${role.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !role.isActive }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to toggle status");
        return;
      }

      setRoles(
        roles.map((r) => (r.id === role.id ? data.role : r))
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
              placeholder="Search roles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-high border border-border rounded-lg pl-9 pr-3 py-2 text-body-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="w-full sm:w-56 bg-surface-high border border-border rounded-lg px-3 py-2 text-body-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="all">All Categories ({roles.length})</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={openCreateModal}
          className="bg-primary text-text-inverse font-semibold text-body-sm px-4 py-2 rounded-lg hover:bg-primary-text transition-colors inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          <span>Add Role</span>
        </button>
      </div>

      {/* Roles Table */}
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-sm">
            <thead className="border-b border-border bg-surface-high/50 font-mono text-[11px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="py-3 px-4">Role Title</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.length > 0 ? (
                filtered.map((role) => (
                  <tr key={role.id} className="hover:bg-surface-high/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-text-primary">
                      {role.name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[12px] text-text-secondary">
                      <span className="px-2 py-0.5 rounded bg-surface-high border border-border">
                        {role.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-[13px] text-text-muted max-w-md">
                      {role.description || "—"}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wider uppercase ${
                          role.isActive
                            ? "bg-secondary/15 text-secondary border border-secondary/25"
                            : "bg-tertiary/15 text-tertiary border border-tertiary/25"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            role.isActive ? "bg-secondary" : "bg-tertiary"
                          }`}
                        />
                        <span>{role.isActive ? "Active" : "Archived"}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => openEditModal(role)}
                          className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-surface-highest transition-colors cursor-pointer"
                          title="Edit Role"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button
                          onClick={() => handleToggleActive(role)}
                          className={`px-2 py-1 rounded text-[11px] font-mono font-medium transition-colors cursor-pointer border ${
                            role.isActive
                              ? "border-border hover:border-tertiary/50 text-text-muted hover:text-tertiary"
                              : "border-secondary/40 text-secondary hover:bg-secondary/10"
                          }`}
                        >
                          {role.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-text-muted font-mono text-body-sm">
                    No roles matching filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {(isCreateOpen || editingRole) && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
        >
          <div className="bg-surface border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <form onSubmit={isCreateOpen ? handleSaveCreate : handleSaveEdit}>
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h3 className="text-title-md font-bold text-text-primary">
                  {isCreateOpen ? "Create Placement Role" : `Edit Role: ${editingRole?.name}`}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingRole(null);
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
                    Role Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Software Engineer, Data Analyst"
                    className="w-full bg-surface-high border border-border rounded-lg px-3 py-2 text-body-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div>
                  <label className="block text-label-xs font-mono text-text-muted uppercase mb-1">
                    Role Category *
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full bg-surface-high border border-border rounded-lg px-3 py-2 text-body-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {standardCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-label-xs font-mono text-text-muted uppercase mb-1">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="General description of role responsibilities and domain expectations..."
                    className="w-full bg-surface-high border border-border rounded-lg px-3 py-2 text-body-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    id="role-active-chk"
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    className="w-4 h-4 rounded border-border text-primary focus:ring-primary/50"
                  />
                  <label htmlFor="role-active-chk" className="text-body-sm text-text-primary cursor-pointer">
                    Active (Selectable by students for primary role targets)
                  </label>
                </div>
              </div>

              <div className="p-4 border-t border-border bg-surface-high/30 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateOpen(false);
                    setEditingRole(null);
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
                  <span>{isCreateOpen ? "Create Role" : "Save Changes"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
