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
    graduationYear: initialProfile.graduationYear || 2025,
    preferredLanguage: initialProfile.preferredLanguage || "C++",
  });
  const [loading, setLoading] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error("Failed to update profile");
      }

      setIsEditing(false);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to save changes.");
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
          onClick={() => setIsEditing(!isEditing)}
          className="text-label-xs font-mono text-primary-text hover:text-primary transition-colors cursor-pointer"
        >
          {isEditing ? "Cancel" : "Edit Details"}
        </button>
      </div>

      {isEditing ? (
        <form onSubmit={handleSave} className="space-y-3 pt-2 text-label-xs font-mono">
          <div>
            <label className="text-text-muted uppercase block mb-1">Full Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="w-full bg-base border border-border rounded px-3 py-2 text-text-primary focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="text-text-muted uppercase block mb-1">College</label>
            <input
              type="text"
              value={formData.college}
              onChange={(e) => setFormData({ ...formData, college: e.target.value })}
              className="w-full bg-base border border-border rounded px-3 py-2 text-text-primary focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="text-text-muted uppercase block mb-1">Branch</label>
            <input
              type="text"
              value={formData.branch}
              onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
              className="w-full bg-base border border-border rounded px-3 py-2 text-text-primary focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="text-text-muted uppercase block mb-1">Grad Year</label>
            <input
              type="number"
              value={formData.graduationYear}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  graduationYear: Number(e.target.value),
                })
              }
              className="w-full bg-base border border-border rounded px-3 py-2 text-text-primary focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="text-text-muted uppercase block mb-1">
              Preferred Language
            </label>
            <select
              value={formData.preferredLanguage}
              onChange={(e) =>
                setFormData({ ...formData, preferredLanguage: e.target.value })
              }
              className="w-full bg-base border border-border rounded px-3 py-2 text-text-primary focus:border-primary focus:outline-none"
            >
              <option value="C++">C++</option>
              <option value="Java">Java</option>
              <option value="Python">Python</option>
              <option value="TypeScript">TypeScript</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-text-inverse font-semibold text-body-sm py-2 rounded hover:bg-primary-text transition-colors mt-3 cursor-pointer"
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
            <span className="text-text-primary">
              {initialProfile.college || "NIT Silchar"}
            </span>
          </div>

          <div className="p-2.5 rounded bg-base border border-border">
            <span className="text-text-muted uppercase block text-[10px]">Branch</span>
            <span className="text-text-primary">
              {initialProfile.branch || "Computer Science"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
