/** Presentation helpers: dates and status/severity styling. */

import type {
  CaseStatus,
  ServiceStatus,
  Severity,
  TaskStatus,
} from "@/shared/constants";

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function severityClasses(severity: Severity | null): string {
  switch (severity) {
    case "urgent":
      return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
    case "high":
      return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30";
    case "moderate":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "low":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function statusClasses(status: CaseStatus): string {
  switch (status) {
    case "awaiting_approval":
      return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30";
    case "approved":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    case "overridden":
      return "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30";
    case "needs_more_evidence":
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "closed":
      return "bg-muted text-muted-foreground border-border";
    case "new":
    default:
      return "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30";
  }
}

export function taskStatusClasses(status: TaskStatus): string {
  switch (status) {
    case "done":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    case "in_progress":
      return "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30";
    case "blocked":
      return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
    case "open":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function serviceStatusColor(status: ServiceStatus): string {
  switch (status) {
    case "connected":
      return "bg-emerald-500";
    case "error":
      return "bg-red-500";
    case "local_fallback":
    default:
      return "bg-amber-500";
  }
}

export function serviceStatusLabel(status: ServiceStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "error":
      return "Error";
    case "local_fallback":
    default:
      return "Local fallback";
  }
}
