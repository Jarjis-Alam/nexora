import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function formatTimerDisplay(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function formatDate(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let dayPart: string;
  if (diffDays === 0) {
    dayPart = "Today";
  } else if (diffDays === 1) {
    dayPart = "Yesterday";
  } else {
    dayPart = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  const timePart = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `${dayPart}, ${timePart}`;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function getReadinessLevel(score: number): {
  label: string;
  color: string;
} {
  if (score >= 90) return { label: "ELITE", color: "text-secondary" };
  if (score >= 75) return { label: "PLACEMENT READY", color: "text-secondary" };
  if (score >= 60) return { label: "COMPETITIVE", color: "text-primary-text" };
  if (score >= 40) return { label: "DEVELOPING", color: "text-tertiary" };
  return { label: "BEGINNER", color: "text-error" };
}

export function getSkillLevel(score: number): {
  label: string;
  colorClass: string;
  bgClass: string;
} {
  if (score >= 80)
    return {
      label: "STRONG",
      colorClass: "text-secondary",
      bgClass: "bg-secondary/10",
    };
  if (score >= 60)
    return {
      label: "COMPETITIVE",
      colorClass: "text-primary-text",
      bgClass: "bg-primary-text/10",
    };
  if (score >= 40)
    return {
      label: "NEEDS WORK",
      colorClass: "text-tertiary",
      bgClass: "bg-tertiary/10",
    };
  return {
    label: "WEAK",
    colorClass: "text-error",
    bgClass: "bg-error/10",
  };
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "text-secondary";
  if (score >= 60) return "text-primary-text";
  if (score >= 40) return "text-tertiary";
  return "text-error";
}
