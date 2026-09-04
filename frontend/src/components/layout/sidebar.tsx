"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { DevModal } from "@/components/layout/dev-modal";

interface SidebarProps {
  baselineTestId?: string | null;
}

export function Sidebar({ baselineTestId }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [devModalOpen, setDevModalOpen] = useState(false);

  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin;

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: "dashboard" },
    { label: "Tests", href: "/tests", icon: "quiz" },
    { label: "Analytics", href: "/analytics", icon: "insights" },
    { label: "Profile", href: "/profile", icon: "person" },
    { label: "Assessment", href: "/assessment", icon: "assignment" },
  ];

  if (isAdmin) {
    navItems.push(
      { label: "Question Bank", href: "/admin/questions", icon: "database" },
      { label: "Test Builder", href: "/admin/tests/new", icon: "build" }
    );
  }

  const handleStartAssessment = () => {
    if (baselineTestId) {
      router.push(`/tests/${baselineTestId}`);
    } else {
      router.push("/assessment");
    }
  };

  const navContent = (
    <div className="flex flex-col h-full py-6 px-3 justify-between">
      <div>
        {/* Brand/Header */}
        <Link href="/dashboard" className="px-3 mb-8 flex items-center space-x-3 group">
          <div className="w-10 h-10 rounded-full bg-surface-high flex items-center justify-center border border-border group-hover:border-primary-text transition-colors">
            <span className="material-symbols-outlined text-primary-text">terminal</span>
          </div>
          <div>
            <h1 className="text-title-md font-bold text-text-primary leading-tight">Placement OS</h1>
            <p className="text-label-xs text-text-muted">Expert-Modular Prep</p>
          </div>
        </Link>

        {/* Navigation Links */}
        <div className="flex flex-col space-y-1 mt-6">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center px-4 py-3 rounded text-body-sm transition-all ${
                  isActive
                    ? "text-primary-text font-semibold bg-surface-high border-r-2 border-primary-text shadow-sm"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-high/60"
                }`}
              >
                <span className="material-symbols-outlined mr-3 text-[20px]">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* User Info & Actions */}
      <div className="mt-auto pt-4 border-t border-border space-y-3 px-2">
        {session?.user && (
          <div className="flex items-center justify-between px-2 py-1">
            <div className="overflow-hidden">
              <p className="text-body-sm font-medium text-text-primary truncate">
                {session.user.name || session.user.email}
              </p>
              <p className="text-label-xs text-text-muted truncate">{session.user.email}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/auth/login" })}
              title="Sign Out"
              className="p-1.5 rounded hover:bg-surface-high text-text-muted hover:text-error transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        )}

        <button
          onClick={handleStartAssessment}
          className="w-full bg-primary text-text-inverse font-medium text-body-sm py-2.5 px-4 rounded hover:bg-primary-text transition-colors flex justify-center items-center gap-2 cursor-pointer shadow-sm mb-4"
        >
          <span className="material-symbols-outlined text-[18px]">play_arrow</span>
          Start Assessment
        </button>

        {/* Developer Info Badge */}
        <div className="pt-3 border-t border-border/80 flex flex-col gap-2">
          <div className="flex items-center justify-between text-label-xs text-text-muted">
            <span className="font-mono text-[11px]">Developer</span>
            <button
              onClick={() => setDevModalOpen(true)}
              className="font-medium text-primary-text text-[11px] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Jarjis Alam</span>
              <span className="material-symbols-outlined text-[12px]">open_in_new</span>
            </button>
          </div>

          <button
            onClick={() => setDevModalOpen(true)}
            className="w-full py-1.5 px-3 rounded-lg bg-surface-high border border-primary/30 hover:border-primary text-primary-text hover:text-white transition-all text-center text-label-xs font-mono font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span>DEVELOPER PORTFOLIO</span>
          </button>

          <div className="flex items-center justify-between gap-1.5 pt-0.5">
            <a
              href="https://github.com/Jarjis-Alam"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-1.5 px-2 rounded bg-surface-high border border-border/80 hover:border-white/40 hover:text-white transition-all text-center text-label-xs text-text-muted flex items-center justify-center gap-1 group"
              title="GitHub"
            >
              <svg className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>Git</span>
            </a>
            <a
              href="https://www.linkedin.com/in/jarjisalam/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-1.5 px-2 rounded bg-surface-high border border-border/80 hover:border-[#0a66c2]/40 hover:text-[#0a66c2] transition-all text-center text-label-xs text-text-muted flex items-center justify-center gap-1 group"
              title="LinkedIn"
            >
              <svg className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c.97 0 1.75-.79 1.75-1.76s-.78-1.75-1.75-1.75a1.75 1.75 0 0 0-1.75 1.75c0 .97.78 1.76 1.75 1.76m1.4 9.74v-8.37H5.06v8.37h2.8z" />
              </svg>
              <span>In</span>
            </a>
            <a
              href="https://www.instagram.com/jarvis._exe_"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-1.5 px-2 rounded bg-surface-high border border-border/80 hover:border-[#e1306c]/40 hover:text-[#e1306c] transition-all text-center text-label-xs text-text-muted flex items-center justify-center gap-1 group"
              title="Instagram"
            >
              <svg className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
              <span>Insta</span>
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
          <span className="font-bold text-text-primary text-title-md">Placement OS</span>
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
