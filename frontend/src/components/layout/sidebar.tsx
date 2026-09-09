"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { DevModal } from "@/components/layout/dev-modal";

interface SidebarProps {
  baselineTestId?: string | null;
  isAdmin?: boolean;
}

export function Sidebar({ baselineTestId, isAdmin: initialIsAdmin }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [devModalOpen, setDevModalOpen] = useState(false);

  const isAdmin =
    initialIsAdmin ??
    (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin ??
    false;

  const assessmentHref = baselineTestId ? `/tests/${baselineTestId}` : "/assessment";
  const mainNavItems = [
    { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
    { label: "Target Strategy", href: "/target", icon: "track_changes" },
    { label: "Assessment", href: assessmentHref, icon: "assignment" },
    { label: "Tests", href: "/tests", icon: "quiz" },
    { label: "Roadmap", href: "/roadmap", icon: "alt_route" },
    { label: "Analytics", href: "/analytics", icon: "insights" },
    { label: "Profile", href: "/profile", icon: "person" },
  ];

  const adminNavItems = [
    { label: "Question Bank", href: "/admin/questions", icon: "database" },
    { label: "Test Builder", href: "/admin/tests/new", icon: "build" },
    { label: "Analytics", href: "/admin/analytics", icon: "monitoring" },
    { label: "Companies", href: "/admin/companies", icon: "domain" },
    { label: "Roles", href: "/admin/roles", icon: "badge" },
  ];

  const handleStartAssessment = () => {
    if (baselineTestId) {
      router.push(`/tests/${baselineTestId}`);
    } else {
      router.push("/assessment");
    }
  };

  const navContent = (
    <div className="flex flex-col h-full py-5 px-3 justify-between">
      <div>
        {/* Brand / Logo */}
        <Link href="/dashboard" className="px-3 mb-6 flex items-center space-x-3 group">
          <div className="w-9 h-9 rounded-xl bg-surface-high flex items-center justify-center border border-border group-hover:border-primary/50 transition-colors">
            <span className="material-symbols-outlined text-primary-text text-[18px]">terminal</span>
          </div>
          <div>
            <span className="text-title-md font-bold text-text-primary leading-tight tracking-tight block">
              Nexora
            </span>
            <span className="text-[10px] text-text-muted font-mono tracking-wider block">
              Your OS for Placements
            </span>
          </div>
        </Link>

        {/* Navigation Groups */}
        <div className="space-y-6">
          {/* MAIN Navigation Group */}
          <div>
            <div className="px-3 mb-2 text-[10px] font-mono tracking-widest text-text-muted/60 uppercase">
              Main
            </div>
            <nav className="flex flex-col space-y-0.5">
              {mainNavItems.map((item) => {
                const isBaselineRoute = baselineTestId
                  ? pathname.startsWith(`/tests/${baselineTestId}`)
                  : false;
                const isActive =
                  pathname === item.href ||
                  (item.label === "Tests"
                    ? pathname === "/tests" ||
                      (pathname.startsWith("/tests/") && !isBaselineRoute)
                    : item.href !== "/dashboard" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center px-3 py-2 rounded-lg text-body-sm transition-all duration-150 ${
                      isActive
                        ? "text-primary-text font-semibold bg-primary/10 border-l-2 border-primary pl-2.5 shadow-sm"
                        : "text-text-secondary hover:text-text-primary hover:bg-surface-high/60 border-l-2 border-transparent pl-2.5"
                    }`}
                  >
                    <span
                      className={`material-symbols-outlined mr-3 text-[18px] ${
                        isActive ? "text-primary" : "text-text-muted"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* ADMIN Navigation Group (Authorized only) */}
          {isAdmin && (
            <div>
              <div className="px-3 mb-2 text-[10px] font-mono tracking-widest text-text-muted/60 uppercase">
                Admin
              </div>
              <nav className="flex flex-col space-y-0.5">
                {adminNavItems.map((item) => {
                  const isActive =
                    pathname === item.href || pathname.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center px-3 py-2 rounded-lg text-body-sm transition-all duration-150 ${
                        isActive
                          ? "text-primary-text font-semibold bg-primary/10 border-l-2 border-primary pl-2.5 shadow-sm"
                          : "text-text-secondary hover:text-text-primary hover:bg-surface-high/60 border-l-2 border-transparent pl-2.5"
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined mr-3 text-[18px] ${
                          isActive ? "text-primary" : "text-text-muted"
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
          )}
        </div>
      </div>

      {/* User Info & Actions */}
      <div className="mt-auto pt-4 border-t border-border space-y-3 px-1">
        {session?.user && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-surface-high/40 border border-border/60">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary-text font-mono text-[11px] font-semibold flex-shrink-0">
                {(session.user.name || session.user.email || "U").slice(0, 2).toUpperCase()}
              </div>
              <div className="overflow-hidden min-w-0">
                <p className="text-body-sm font-medium text-text-primary truncate">
                  {session.user.name || session.user.email}
                </p>
                <p className="text-[11px] text-text-muted font-mono truncate">
                  {session.user.email}
                </p>
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              title="Sign Out"
              aria-label="Sign Out"
              className="p-1.5 rounded-md hover:bg-surface-highest text-text-muted hover:text-error transition-colors focus:outline-none focus:ring-2 focus:ring-error/40 flex-shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        )}

        <button
          onClick={handleStartAssessment}
          className="w-full bg-primary text-text-inverse font-medium text-body-sm py-2.5 px-4 rounded-lg hover:bg-primary-text transition-colors flex justify-center items-center gap-2 cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <span className="material-symbols-outlined text-[18px]">play_arrow</span>
          Start Assessment
        </button>

        {/* Developer Info Badge */}
        <div className="pt-2.5 border-t border-border/60 flex flex-col gap-2">
          <div className="flex items-center justify-between text-label-xs text-text-muted">
            <span className="font-mono text-[10px] uppercase tracking-wider">Engineering</span>
            <button
              onClick={() => setDevModalOpen(true)}
              className="text-primary-text text-[11px] hover:underline flex items-center gap-1 cursor-pointer font-mono"
            >
              <span>DEV Card</span>
              <span className="material-symbols-outlined text-[12px]">badge</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-1.5">
            <button
              onClick={() => setDevModalOpen(true)}
              className="flex-1 py-1.5 px-2 rounded-md bg-surface-high/80 border border-primary/25 hover:border-primary/60 text-primary-text text-[11px] font-mono font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              title="Developer Profile"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
              <span>Portfolio</span>
            </button>
            <a
              href="https://github.com/Jarjis-Alam"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md bg-surface-high/80 border border-border/80 hover:border-white/40 text-text-muted hover:text-white transition-colors flex items-center justify-center"
              title="GitHub @Jarjis-Alam"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
            </a>
            <a
              href="https://www.linkedin.com/in/jarjisalam/"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md bg-surface-high/80 border border-border/80 hover:border-[#0a66c2]/50 text-text-muted hover:text-[#38bdf8] transition-colors flex items-center justify-center"
              title="LinkedIn in/jarjisalam"
            >
              <svg className="w-3.5 h-3.5 text-[#0a66c2]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c.97 0 1.75-.79 1.75-1.76s-.78-1.75-1.75-1.75a1.75 1.75 0 0 0-1.75 1.75c0 .97.78 1.76 1.75 1.76m1.4 9.74v-8.37H5.06v8.37h2.8z" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-surface border-b border-border sticky top-0 z-40">
        <Link href="/dashboard" className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-full bg-surface-high flex items-center justify-center border border-border">
            <span className="material-symbols-outlined text-primary-text text-[18px]">terminal</span>
          </div>
          <span className="font-bold text-text-primary text-title-md">Nexora</span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-text-secondary hover:text-text-primary"
        >
          <span className="material-symbols-outlined">{mobileMenuOpen ? "close" : "menu"}</span>
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[65px] z-50 bg-base/95 backdrop-blur-sm p-4 overflow-y-auto">
          {navContent}
        </div>
      )}

      {/* Desktop Fixed SideNav */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-screen z-30 bg-surface border-r border-border w-64">
        {navContent}
      </aside>

      {/* 3D Developer Profile Modal */}
      <DevModal isOpen={devModalOpen} onClose={() => setDevModalOpen(false)} />
    </>
  );
}
