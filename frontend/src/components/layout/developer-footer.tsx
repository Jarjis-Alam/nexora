"use client";

import React, { useState } from "react";
import LogoLoop, { LogoItem } from "@/components/ui/logo-loop";
import { DevModal } from "@/components/layout/dev-modal";

export function DeveloperFooter() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loopItems: LogoItem[] = [
    {
      href: "https://github.com/Jarjis-Alam",
      title: "Jarjis Alam on GitHub",
      node: (
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-surface/90 border border-border hover:border-white/40 hover:bg-white/10 transition-all duration-300 shadow-sm cursor-pointer group">
          <svg className="w-4 h-4 text-white/80 group-hover:text-white group-hover:scale-110 transition-all" fill="currentColor" viewBox="0 0 24 24">
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
            />
          </svg>
          <div className="flex flex-col text-left">
            <span className="text-[12px] font-semibold text-text-primary group-hover:text-white leading-tight">GitHub</span>
            <span className="text-[10px] font-mono text-text-muted">@Jarjis-Alam</span>
          </div>
        </div>
      ),
    },
    {
      href: "https://www.linkedin.com/in/jarjisalam/",
      title: "Jarjis Alam on LinkedIn",
      node: (
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-surface/90 border border-border hover:border-[#0a66c2]/50 hover:bg-[#0a66c2]/10 transition-all duration-300 shadow-sm cursor-pointer group">
          <svg className="w-4 h-4 text-[#0a66c2] group-hover:scale-110 transition-all" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c.97 0 1.75-.79 1.75-1.76s-.78-1.75-1.75-1.75a1.75 1.75 0 0 0-1.75 1.75c0 .97.78 1.76 1.75 1.76m1.4 9.74v-8.37H5.06v8.37h2.8z" />
          </svg>
          <div className="flex flex-col text-left">
            <span className="text-[12px] font-semibold text-text-primary group-hover:text-[#38bdf8] leading-tight">LinkedIn</span>
            <span className="text-[10px] font-mono text-text-muted">in/jarjisalam</span>
          </div>
        </div>
      ),
    },
    {
      href: "https://www.instagram.com/jarvis._exe_",
      title: "Jarjis Alam on Instagram",
      node: (
        <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-surface/90 border border-border hover:border-[#e1306c]/50 hover:bg-[#e1306c]/10 transition-all duration-300 shadow-sm cursor-pointer group">
          <svg className="w-4 h-4 text-[#e1306c] group-hover:scale-110 transition-all" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
          </svg>
          <div className="flex flex-col text-left">
            <span className="text-[12px] font-semibold text-text-primary group-hover:text-[#f472b6] leading-tight">Instagram</span>
            <span className="text-[10px] font-mono text-text-muted">@jarvis._exe_</span>
          </div>
        </div>
      ),
    },
    {
      href: "https://github.com/Jarjis-Alam",
      title: "Lead Developer",
      node: (
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary-text hover:bg-primary/20 transition-all duration-300 shadow-sm cursor-pointer">
          <span className="material-symbols-outlined text-[16px] text-primary">terminal</span>
          <span className="text-[12px] font-mono font-medium">Developer: Jarjis Alam</span>
        </div>
      ),
    },
    {
      href: "https://github.com/Jarjis-Alam/nexora",
      title: "Nexora Engine",
      node: (
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-surface/90 border border-border text-text-secondary hover:text-text-primary transition-all duration-300 shadow-sm cursor-pointer">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span className="text-[12px] font-mono">Nexora • Precision Prep</span>
        </div>
      ),
    },
  ];

  return (
    <>
      <footer className="border-t border-border/80 bg-base/80 backdrop-blur-md pt-8 pb-10 mt-16 transition-colors overflow-hidden w-full">
        {/* Infinite LogoLoop Bar */}
        <div className="container-fluid mb-8">
          <div className="flex items-center justify-between mb-4">
            <span className="text-label-xs font-mono text-text-muted tracking-widest uppercase">
              Developer & Platform Links
            </span>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 hover:bg-primary/20 text-primary-text text-label-xs font-mono transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">badge</span>
              <span>Open 3D Dev Card</span>
            </button>
          </div>
          <div className="py-2 w-full">
            <LogoLoop
              logos={loopItems}
              speed={50}
              gap={24}
              logoHeight={42}
              pauseOnHover={true}
              fadeOut={true}
              scaleOnHover={true}
              className="w-full"
            />
          </div>
        </div>

        <div className="container-fluid pt-6 border-t border-border/40 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="w-8 h-8 rounded-full bg-surface-high border border-border hover:border-primary flex items-center justify-center text-primary transition-colors cursor-pointer"
              title="Click to view 3D Dev Card"
            >
              <span className="material-symbols-outlined text-[16px]">code</span>
            </button>
            <p className="text-body-sm text-text-secondary">
              Built with technical precision by{" "}
              <button
                onClick={() => setIsModalOpen(true)}
                className="text-primary-text hover:text-primary font-medium underline underline-offset-4 decoration-primary/40 hover:decoration-primary transition-colors cursor-pointer inline"
              >
                Jarjis Alam
              </button>
            </p>
          </div>

          <p className="text-label-xs text-text-muted font-mono">
            Nexora © {new Date().getFullYear()} • Your Operating System for Placements
          </p>
        </div>
      </footer>

      {/* 3D Profile Card Modal */}
      <DevModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
}
