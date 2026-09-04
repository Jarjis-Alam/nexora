"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const registered = searchParams.get("registered");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email: email.toLowerCase().trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error === "Configuration" || result.status === 500) {
          setError("Authentication is temporarily unavailable.");
        } else {
          setError("Invalid email or password.");
        }
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("Authentication is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-surface/80 backdrop-blur-md border border-border/80 rounded-lg p-8 shadow-2xl">
      <h2 className="text-title-md text-text-primary mb-1">Welcome back</h2>
      <p className="text-body-sm text-text-secondary mb-8">
        Sign in to continue your preparation
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {registered && !error && (
          <div className="bg-primary/10 border border-primary/20 rounded px-4 py-3 text-body-sm text-primary-text">
            Account created successfully. Please sign in.
          </div>
        )}

        {error && (
          <div className="bg-error/10 border border-error/20 rounded px-4 py-3 text-body-sm text-error">
            {error}
          </div>
        )}

        <div>
          <label className="text-label-xs text-text-muted uppercase block mb-2">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full bg-base/80 border border-border rounded px-4 py-3 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none transition-colors"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="text-label-xs text-text-muted uppercase block mb-2">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full bg-base/80 border border-border rounded px-4 py-3 text-body-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none transition-colors"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-primary text-text-inverse font-medium py-3 px-4 rounded hover:bg-primary-text transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-body-sm cursor-pointer"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="text-body-sm text-text-secondary text-center mt-6">
        Don&apos;t have an account?{" "}
        <Link
          href="/auth/register"
          className="text-primary-text hover:text-primary transition-colors"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent tech-grid px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="text-headline-lg text-text-primary font-bold">
            Placement OS
          </h1>
          <p className="text-label-xs text-text-muted mt-2 uppercase tracking-wider font-mono">
            Expert-Modular Prep
          </p>
        </div>

        <Suspense fallback={<div className="text-center text-text-muted">Loading...</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
