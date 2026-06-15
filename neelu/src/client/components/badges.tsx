import { Badge } from "@/client/components/ui/badge";
import { cn } from "@/client/lib/utils";
import {
  CASE_STATUS_LABELS,
  SEVERITY_LABELS,
} from "@/shared/constants";
import type {
  CaseStatus,
  Severity,
  TaskStatus,
  UncertaintyLevel,
} from "@/shared/constants";
import {
  severityClasses,
  statusClasses,
  taskStatusClasses,
} from "@/client/lib/format";

export function SeverityBadge({ severity }: { severity: Severity | null }) {
  return (
    <Badge variant="outline" className={cn("border", severityClasses(severity))}>
      {severity ? SEVERITY_LABELS[severity] : "Unassessed"}
    </Badge>
  );
}

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return (
    <Badge variant="outline" className={cn("border", statusClasses(status))}>
      {CASE_STATUS_LABELS[status]}
    </Badge>
  );
}

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge variant="outline" className={cn("border", taskStatusClasses(status))}>
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}

const UNCERTAINTY_CLASSES: Record<UncertaintyLevel, string> = {
  low: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  high: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
};

export function UncertaintyBadge({ level }: { level: UncertaintyLevel | null }) {
  if (!level) return null;
  return (
    <Badge variant="outline" className={cn("border", UNCERTAINTY_CLASSES[level])}>
      Uncertainty: {level}
    </Badge>
  );
}
