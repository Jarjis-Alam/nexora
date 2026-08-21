"use client";

import React, { useRef, useState, useCallback } from "react";

export interface ProfileCardProps {
  name?: string;
  handle?: string;
  role?: string;
  bio?: string;
  avatarUrl?: string;
  location?: string;
  status?: string;
  tags?: string[];
  githubUrl?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  className?: string;
  glowColor?: string;
}

export function ProfileCard({
  name = "Jarjis Alam",
  handle = "@Jarjis-Alam",
  role = "Full Stack & Systems Engineer",
  bio = "Building high-precision assessment systems, algorithmic engines, and modern developer platforms.",
  avatarUrl,
  status = "Active & Building",
  tags = ["TypeScript", "Next.js", "Python", "FastAPI", "PostgreSQL", "Drizzle ORM", "DSA"],
  githubUrl = "https://github.com/Jarjis-Alam",
  linkedinUrl = "https://www.linkedin.com/in/jarjisalam/",
  instagramUrl = "https://www.instagram.com/jarvis._exe_",
  className = "",
  glowColor = "rgba(77, 142, 255, 0.35)",
}: ProfileCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate rotation (-15 to +15 deg)
    const rotateX = ((y - centerY) / centerY) * -12;
    const rotateY = ((x - centerX) / centerX) * 12;

    // Calculate glare position in percent
    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;

    setRotation({ x: rotateX, y: rotateY });
    setGlare({ x: glareX, y: glareY, opacity: 0.75 });
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setRotation({ x: 0, y: 0 });
    setGlare((prev) => ({ ...prev, opacity: 0 }));
    setIsHovered(false);
  }, []);

  return (
    <div
      className={`perspective-1000 select-none ${className}`}
      style={{ perspective: "1200px" }}
    >
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="relative w-full max-w-[420px] rounded-2xl p-6 sm:p-7 transition-all duration-200 ease-out border border-white/15 bg-surface/90 backdrop-blur-xl shadow-2xl overflow-hidden"
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) ${
            isHovered ? "scale3d(1.02, 1.02, 1.02)" : "scale3d(1, 1, 1)"
          }`,
          transformStyle: "preserve-3d",
          boxShadow: isHovered
            ? `0 25px 50px -12px ${glowColor}, 0 0 30px 2px ${glowColor}`
            : "0 20px 40px -15px rgba(0, 0, 0, 0.7)",
        }}
      >
        {/* Holographic / Dynamic Light Glare */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300 z-30"
          style={{
            opacity: glare.opacity,
            background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,0.22) 0%, rgba(173,198,255,0.12) 30%, transparent 65%)`,
          }}
        />

        {/* Subtle Iridescent Border Foil Line */}
        <div
          className="pointer-events-none absolute inset-0 rounded-2xl z-20 transition-opacity duration-300"
          style={{
            opacity: isHovered ? 0.6 : 0.2,
            background: `linear-gradient(${glare.x * 3.6}deg, rgba(77,142,255,0.4), rgba(78,222,163,0.4), rgba(255,183,134,0.4), transparent 70%)`,
            mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            padding: "1px",
          }}
        />

        {/* Ambient Top Glow */}
        <div
          className="pointer-events-none absolute -top-24 -left-24 w-56 h-56 rounded-full blur-3xl transition-opacity duration-500 z-0"
          style={{
            background: "radial-gradient(circle, rgba(77, 142, 255, 0.4) 0%, transparent 70%)",
            opacity: isHovered ? 0.9 : 0.4,
          }}
        />

        {/* Card Header & Status */}
        <div
          className="relative z-10 flex items-center justify-between pb-4 border-b border-border/80"
          style={{ transform: "translateZ(20px)" }}
        >
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-secondary animate-pulse" />
            <span className="text-[11px] font-mono font-medium text-secondary uppercase tracking-wider">
              {status}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-high border border-border text-label-xs font-mono text-text-muted">
            <span className="material-symbols-outlined text-[14px] text-primary">terminal</span>
            <span>DEV PROFILE</span>
          </div>
        </div>

        {/* Main Avatar & Identity */}
        <div
          className="relative z-10 pt-5 pb-4 flex items-center gap-4"
          style={{ transform: "translateZ(35px)" }}
        >
          <div className="relative group/avatar">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-primary/30 via-surface-high to-secondary/30 p-[2px] shadow-lg">
              <div className="w-full h-full rounded-2xl bg-surface-higher flex items-center justify-center border border-white/10 overflow-hidden">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-bold font-mono text-primary-text">
                      JA
                    </span>
                    <span className="text-[9px] font-mono text-secondary">DEV</span>
                  </div>
                )}
              </div>
            </div>

            {/* Verified Badge */}
            <div
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-text-inverse shadow-md"
              title="Verified Creator"
            >
              <span className="material-symbols-outlined text-[14px]">check</span>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-xl font-bold text-text-primary truncate">{name}</h3>
            </div>
            <p className="text-label-xs font-mono text-primary-text mt-0.5">{handle}</p>
            <p className="text-body-sm text-text-secondary font-medium mt-1 truncate">
              {role}
            </p>
          </div>
        </div>

        {/* Bio */}
        <div
          className="relative z-10 py-3"
          style={{ transform: "translateZ(25px)" }}
        >
          <p className="text-body-sm text-text-secondary leading-relaxed bg-surface-high/60 border border-border/60 rounded-xl p-3.5">
            {bio}
          </p>
        </div>

        {/* Tech Stack Pills */}
        <div
          className="relative z-10 py-2.5"
          style={{ transform: "translateZ(28px)" }}
        >
          <div className="text-[11px] font-mono text-text-muted uppercase tracking-wider mb-2">
            Engineered With
          </div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-md bg-surface-highest/70 border border-border/80 text-[11px] font-mono text-text-primary hover:border-primary/50 transition-colors"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Social Links & Connections */}
        <div
          className="relative z-10 pt-4 mt-3 border-t border-border/80 flex items-center justify-between gap-2"
          style={{ transform: "translateZ(30px)" }}
        >
          {/* GitHub */}
          {githubUrl && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 px-3 rounded-lg bg-surface-high border border-border hover:border-white/50 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center gap-2 text-label-xs font-medium text-text-primary group/link"
              title="GitHub Profile"
            >
              <svg className="w-4 h-4 group-hover/link:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>GitHub</span>
            </a>
          )}

          {/* LinkedIn */}
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 px-3 rounded-lg bg-surface-high border border-border hover:border-[#0a66c2]/60 hover:bg-[#0a66c2]/10 hover:text-[#38bdf8] transition-all flex items-center justify-center gap-2 text-label-xs font-medium text-text-primary group/link"
              title="LinkedIn Profile"
            >
              <svg className="w-4 h-4 text-[#0a66c2] group-hover/link:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76c.97 0 1.75-.79 1.75-1.76s-.78-1.75-1.75-1.75a1.75 1.75 0 0 0-1.75 1.75c0 .97.78 1.76 1.75 1.76m1.4 9.74v-8.37H5.06v8.37h2.8z" />
              </svg>
              <span>LinkedIn</span>
            </a>
          )}

          {/* Instagram */}
          {instagramUrl && (
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 px-3 rounded-lg bg-surface-high border border-border hover:border-[#e1306c]/60 hover:bg-[#e1306c]/10 hover:text-[#f472b6] transition-all flex items-center justify-center gap-2 text-label-xs font-medium text-text-primary group/link"
              title="Instagram Profile"
            >
              <svg className="w-4 h-4 text-[#e1306c] group-hover/link:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
              <span>Insta</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfileCard;
