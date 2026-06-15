/** Human-readable labels for audit actions shown in the case timeline. */

import type { AuditAction } from "@/shared/constants";

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  signal_submitted: "Field signal submitted",
  case_created: "Case opened",
  guidance_retrieved: "Guidance retrieved",
  finding_generated: "Agent finding generated",
  tasks_created: "Tasks created",
  notice_drafted: "Notice drafted",
  evidence_attached: "Evidence attached",
  approval_recorded: "Approval recorded",
  override_recorded: "Override recorded",
  evidence_requested: "More evidence requested",
  status_changed: "Status changed",
  demo_reset: "Demo reset",
};
