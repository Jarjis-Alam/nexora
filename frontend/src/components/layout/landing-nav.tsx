"use client";

import React, { useState } from "react";
import GooeyNav, { GooeyNavItem } from "@/components/ui/gooey-nav";

interface LandingNavProps {
  items: GooeyNavItem[];
}

export function LandingNav({ items }: LandingNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleMobileNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    e.preventDefault();
    setMobileMenuOpen(false);

    const targetId = href.replace("#", "");
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth" });
      window.history.pushState(null, "", href);
    }
  };

  return (
    <>
      {/* Desktop Navigation */}
      <div className="hidden md:block">
        <GooeyNav items={items} />
      </div>

      {/* Mobile Menu Toggle Button */}
      <div className="md:hidden">
        <button
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="w-9 h-9 rounded-lg bg-surface border border-border flex items-center justify-center text-text-primary hover:text-primary transition-colors cursor-pointer"
          aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={mobileMenuOpen}
        >
          <span className="material-symbols-outlined text-[20px]">
            {mobileMenuOpen ? "close" : "menu"}
          </span>
        </button>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-16 left-0 right-0 bg-base/95 backdrop-blur-xl border-b border-border shadow-2xl p-4 animate-fade-in z-50">
          <nav className="flex flex-col space-y-2">
            {items.map((item, idx) => (
              <a
                key={idx}
                href={item.href}
                onClick={(e) => handleMobileNavClick(e, item.href)}
                className="px-4 py-3 rounded-lg text-body-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-high border border-transparent hover:border-border transition-all flex items-center justify-between"
              >
                <span>{item.label}</span>
                <span className="material-symbols-outlined text-[16px] text-text-muted">
                  arrow_outward
                </span>
              </a>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
