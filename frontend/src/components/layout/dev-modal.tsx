"use client";

import React, { useState, useEffect } from "react";
import { ProfileCard } from "@/components/ui/profile-card";

interface DevModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DevModal({ isOpen, onClose }: DevModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Dark backdrop with blur */}
      <div
        className="fixed inset-0 bg-base/80 backdrop-blur-md transition-opacity animate-fade-in cursor-pointer"
        onClick={onClose}
      />

      {/* Modal Dialog Content */}
      <div className="relative z-10 w-full max-w-[440px] my-auto flex flex-col items-center animate-fade-in">
        {/* Close Button top-right */}
        <button
          onClick={onClose}
          className="absolute -top-3 -right-3 z-30 w-9 h-9 rounded-full bg-surface-highest/90 border border-white/20 text-text-primary hover:text-error hover:border-error/50 transition-all flex items-center justify-center shadow-lg hover:scale-110 cursor-pointer"
          title="Close (Esc)"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        {/* The 3D Interactive ProfileCard */}
        <ProfileCard />

        {/* Helper text */}
        <p className="text-label-xs font-mono text-text-muted mt-3 text-center tracking-wider">
          PRESS ESC OR CLICK OUTSIDE TO CLOSE • HOVER TO 3D TILT
        </p>
      </div>
    </div>
  );
}

/**
 * Interactive DEV Trigger Button
 */
export function DevButton({
  variant = "pill",
  className = "",
}: {
  variant?: "pill" | "floating" | "icon" | "nav";
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (variant === "floating") {
    return (
      <>
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-6 right-6 z-40 group flex items-center gap-2 px-3.5 py-2 rounded-full bg-surface-high/90 border border-primary/40 hover:border-primary text-text-primary hover:text-white backdrop-blur-lg shadow-xl shadow-primary/10 hover:shadow-primary/25 hover:scale-105 transition-all duration-300 cursor-pointer ${className}`}
          title="View Developer Profile"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-secondary"></span>
          </span>
          <span className="text-[12px] font-mono font-bold tracking-wider text-primary-text group-hover:text-white">
            DEV
          </span>
          <span className="material-symbols-outlined text-[16px] text-text-muted group-hover:text-primary-text transition-colors">
            badge
          </span>
        </button>
        <DevModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  if (variant === "nav") {
    return (
      <>
        <button
          onClick={() => setIsOpen(true)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-high/80 border border-primary/30 hover:border-primary hover:bg-primary/10 text-primary-text hover:text-white transition-all text-label-xs font-mono font-semibold cursor-pointer shadow-sm ${className}`}
          title="Developer Profile"
        >
          <span className="material-symbols-outlined text-[14px] text-primary">terminal</span>
          <span>DEV</span>
        </button>
        <DevModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-high/80 border border-border hover:border-primary/50 hover:bg-primary/10 text-text-secondary hover:text-primary-text transition-all text-label-xs font-mono cursor-pointer ${className}`}
        title="View Developer Profile"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
        <span className="font-semibold text-primary-text">DEV</span>
        <span className="text-text-muted">Profile</span>
      </button>
      <DevModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
