"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface ProfileEditorProps {
  initialProfile: {
    id: string;
    name: string;
    college: string | null;
    branch: string | null;
    graduationYear: number | null;
    preferredLanguage: string | null;
    email: string;
  };
}

export function ProfileEditor({ initialProfile }: ProfileEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: initialProfile.name,
    college: initialProfile.college || "",
    branch: initialProfile.branch || "",
    graduationYear: initialProfile.graduationYear || "",
    preferredLanguage: initialProfile.preferredLanguage || "",
  });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to update profile");
      }

      setIsEditing(false);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save profile changes.";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-label-xs text-text-muted font-mono uppercase">
          <span className="material-symbols-outlined text-[18px]">badge</span>
          Personal Info
        </div>
        <button
          onClick={() => {
            setIsEditing(!isEditing);
            setErrorMsg(null);
          }}
          className="text-label-xs font-mono text-primary-text hover:text-primary transition-colors cursor-pointer"
        >
          {isEditing ? "Cancel" : "Edit Details"}
        </button>
      </div>

      {isEditing ? (
        <form onSubmit={handleSave} className="space-y-3 pt-2 text-label-xs font-mono">
          {errorMsg && (
            <div className="p-3 bg-error/10 border border-error/20 rounded text-error text-label-xs font-mono">
              {errorMsg}
            </div>
          )}
          <div>
            <label htmlFor="profile-name" className="mb-1 block uppercase text-text-muted">Full Name</label>
            <input
              id="profile-name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full rounded border border-border bg-base px-3 py-2 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label htmlFor="profile-college" className="mb-1 block uppercase text-text-muted">College</label>
            <input
              id="profile-college"
              type="text"
              value={formData.college}
              onChange={(e) => setFormData({ ...formData, college: e.target.value })}
              className="w-full rounded border border-border bg-base px-3 py-2 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label htmlFor="profile-branch" className="mb-1 block uppercase text-text-muted">Branch</label>
            <input
              id="profile-branch"
              type="text"
              value={formData.branch}
              onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
              className="w-full rounded border border-border bg-base px-3 py-2 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label htmlFor="profile-grad-year" className="mb-1 block uppercase text-text-muted">Grad Year</label>
            <input
              type="number"
              value={formData.graduationYear}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  graduationYear: e.target.value,
                })
              }
              className="w-full rounded border border-border bg-base px-3 py-2 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label htmlFor="profile-language" className="mb-1 block uppercase text-text-muted">
              Preferred Language
            </label>
            <select
              id="profile-language"
              value={formData.preferredLanguage}
              onChange={(e) =>
                setFormData({ ...formData, preferredLanguage: e.target.value })
              }
              className="w-full rounded border border-border bg-base px-3 py-2 text-text-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Not set</option>
              <option value="C++">C++</option>
              <option value="Java">Java</option>
              <option value="Python">Python</option>
              <option value="TypeScript">TypeScript</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-3 w-full rounded bg-primary py-2 text-body-sm font-semibold text-text-inverse transition-colors hover:bg-primary-text focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save Configuration"}
          </button>
        </form>
      ) : (
        <div className="space-y-3 font-mono text-label-xs">
          <div className="p-2.5 rounded bg-base border border-border">
            <span className="text-text-muted uppercase block text-[10px]">Email</span>
            <span className="text-text-primary">{initialProfile.email}</span>
          </div>

          <div className="p-2.5 rounded bg-base border border-border">
            <span className="text-text-muted uppercase block text-[10px]">College</span>
            <span className={initialProfile.college ? "text-text-primary" : "text-text-muted"}>
              {initialProfile.college || "Not set"}
            </span>
          </div>

          <div className="p-2.5 rounded bg-base border border-border">
            <span className="text-text-muted uppercase block text-[10px]">Branch</span>
            <span className="text-text-primary">
              {initialProfile.branch || "Not set"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
