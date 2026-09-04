import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-base tech-grid flex items-center justify-center p-6 text-text-primary">
      <div className="max-w-md w-full bg-surface border border-border rounded-xl p-8 text-center space-y-6 shadow-2xl">
        <div className="w-14 h-14 rounded-full bg-surface-high border border-border flex items-center justify-center text-primary-text mx-auto">
          <span className="material-symbols-outlined text-[28px]">error_outline</span>
        </div>

        <div className="space-y-2">
          <span className="text-label-xs font-mono text-error uppercase tracking-wider block">
            ERR_404_NOT_FOUND
          </span>
          <h1 className="text-headline-lg font-bold text-text-primary">
            Resource Not Found
          </h1>
          <p className="text-body-sm text-text-secondary leading-relaxed">
            The requested assessment, attempt, or system route does not exist or is no longer accessible.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row gap-3">
          <Link
            href="/dashboard"
            className="flex-1 bg-primary text-text-inverse font-semibold text-body-sm py-2.5 px-4 rounded hover:bg-primary-text transition-colors inline-flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">dashboard</span>
            Dashboard
          </Link>
          <Link
            href="/tests"
            className="flex-1 bg-surface-high border border-border text-text-primary font-medium text-body-sm py-2.5 px-4 rounded hover:bg-surface-highest transition-colors inline-flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">assignment</span>
            Tests Catalog
          </Link>
        </div>
      </div>
    </div>
  );
}
