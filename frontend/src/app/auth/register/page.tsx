"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    college: "",
    branch: "",
    graduationYear: new Date().getFullYear() + 1,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          email: formData.email.toLowerCase().trim(),
          graduationYear: formData.graduationYear ? Number(formData.graduationYear) : null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      // Auto sign in
      const signInResult = await signIn("credentials", {
        email: formData.email.toLowerCase().trim(),
        password: formData.password,
        redirect: false,
      });

      if (signInResult?.error) {
        router.push("/auth/login?registered=true");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent tech-grid px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-headline-lg text-text-primary font-bold">
            Nexora
          </h1>
          <p className="text-label-xs text-text-muted mt-2 tracking-wider font-mono">
            Your Operating System for Placements
          </p>
        </div>

        {/* Card */}
        <div className="bg-surface/80 backdrop-blur-md border border-border/80 rounded-lg p-8 shadow-2xl">
          <h2 className="text-title-md text-text-primary mb-1">Create Account</h2>
          <p className="text-body-sm text-text-secondary mb-6">
            Get started with your placement preparation
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-error/10 border border-error/20 rounded px-4 py-3 text-body-sm text-error">
                {error}
              </div>
            )}

            <div>
              <label className="text-label-xs text-text-muted uppercase block mb-1">
                Full Name *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none transition-colors"
                placeholder="Jarjis Alam"
              />
            </div>

            <div>
              <label className="text-label-xs text-text-muted uppercase block mb-1">
                Email *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none transition-colors"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="text-label-xs text-text-muted uppercase block mb-1">
                Password *
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                minLength={6}
                className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none transition-colors"
                placeholder="••••••••"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-label-xs text-text-muted uppercase block mb-1">
                  College
                </label>
                <input
                  type="text"
                  value={formData.college}
                  onChange={(e) => setFormData({ ...formData, college: e.target.value })}
                  className="w-full bg-base border border-border rounded px-3 py-2 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none transition-colors"
                  placeholder="NIT Silchar"
                />
              </div>

              <div>
                <label className="text-label-xs text-text-muted uppercase block mb-1">
                  Branch
                </label>
                <input
                  type="text"
                  value={formData.branch}
                  onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                  className="w-full bg-base border border-border rounded px-3 py-2 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none transition-colors"
                  placeholder="Computer Science"
                />
              </div>
            </div>

            <div>
              <label className="text-label-xs text-text-muted uppercase block mb-1">
                Graduation Year
              </label>
              <input
                type="number"
                value={formData.graduationYear}
                onChange={(e) => setFormData({ ...formData, graduationYear: Number(e.target.value) })}
                className="w-full bg-base border border-border rounded px-4 py-2.5 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white font-medium py-3 px-4 rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-body-sm mt-2"
            >
              {loading ? "Creating Account..." : "Create Account"}
            </button>
          </form>

          <p className="text-body-sm text-text-secondary text-center mt-6">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="text-primary-text hover:text-primary transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
