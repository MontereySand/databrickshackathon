/** Human-readable labels for audit actions shown in the case timeline. */

import type { AuditAction } from "@/shared/constants"

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  signal_submitted: "Field signal submitted",
  voice_signal_parsed: "Voice signal parsed",
  upi_callback_received: "UPI callback received",
  case_created: "Case opened",
  guidance_retrieved: "Guidance retrieved",
  finding_generated: "Agent finding generated",
  tasks_created: "Tasks created",
  task_assigned: "Task assigned",
  task_completed: "Task completed",
  notice_drafted: "Notice drafted",
  evidence_attached: "Evidence attached",
  approval_recorded: "Approval recorded",
  override_recorded: "Override recorded",
  severity_adjusted: "Severity adjusted",
  health_review_recorded: "Health review recorded",
  evidence_requested: "More evidence requested",
  status_changed: "Status changed",
  sync_batch_processed: "Sync batch processed",
  demo_reset: "Demo reset",
}
