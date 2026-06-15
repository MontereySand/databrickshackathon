/**
 * Shared constants and string-literal unions used across client, server, agents,
 * and evals. Arrays are declared `as const` so the derived unions stay in sync
 * with the runtime values (no drift between validation, DB, and UI).
 */

// --- Runtime mode -----------------------------------------------------------

export const RUNTIME_MODES = ["LOCAL_SIM", "DATABRICKS"] as const;
export type RuntimeMode = (typeof RUNTIME_MODES)[number];

// --- Databricks-facing services (proof panel) -------------------------------

export const SERVICES = [
  "lakebase",
  "unity_catalog",
  "ai_search",
  "model_serving",
  "mlflow",
] as const;
export type ServiceName = (typeof SERVICES)[number];

export const SERVICE_LABELS: Record<ServiceName, string> = {
  lakebase: "Lakebase (Postgres)",
  unity_catalog: "Unity Catalog",
  ai_search: "AI Search / Vector Search",
  model_serving: "Model Serving / AI Gateway",
  mlflow: "MLflow tracing & eval",
};

export const SERVICE_STATUSES = ["connected", "local_fallback", "error"] as const;
export type ServiceStatus = (typeof SERVICE_STATUSES)[number];

// --- Case lifecycle ---------------------------------------------------------

export const CASE_STATUSES = [
  "new",
  "awaiting_approval",
  "approved",
  "overridden",
  "needs_more_evidence",
  "closed",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  new: "New",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  overridden: "Overridden",
  needs_more_evidence: "Needs more evidence",
  closed: "Closed",
};

export const SEVERITIES = ["low", "moderate", "high", "urgent"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABELS: Record<Severity, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  urgent: "Needs urgent review",
};

export const UNCERTAINTY_LEVELS = ["low", "medium", "high"] as const;
export type UncertaintyLevel = (typeof UNCERTAINTY_LEVELS)[number];

// --- Signals ----------------------------------------------------------------

// Signals have no persisted status column; status is derived from whether a
// case has been created for the signal yet.
export const SIGNAL_DERIVED_STATUSES = ["received", "analyzed"] as const;
export type SignalDerivedStatus = (typeof SIGNAL_DERIVED_STATUSES)[number];

// --- Tasks ------------------------------------------------------------------

export const TASK_STATUSES = ["open", "in_progress", "blocked", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// --- Approvals --------------------------------------------------------------

export const APPROVAL_DECISIONS = [
  "approved",
  "overridden",
  "more_evidence_requested",
] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

// --- Evidence ---------------------------------------------------------------

export const EVIDENCE_TYPES = [
  "field_result",
  "lab_result",
  "site_profile",
  "guidance",
  "prior_case",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

// --- Audit ------------------------------------------------------------------

export const ENTITY_TYPES = [
  "signal",
  "case",
  "evidence_item",
  "agent_finding",
  "task",
  "approval",
  "demo_run",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  "signal_submitted",
  "case_created",
  "guidance_retrieved",
  "finding_generated",
  "tasks_created",
  "notice_drafted",
  "evidence_attached",
  "approval_recorded",
  "override_recorded",
  "evidence_requested",
  "status_changed",
  "demo_reset",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

// --- Eval scorers -----------------------------------------------------------

export const EVAL_SCORERS = [
  "has_citations",
  "requires_human_approval",
  "flags_uncertainty",
  "creates_required_tasks",
  "no_certified_compliance_claim",
  "writes_audit_events",
] as const;
export type EvalScorerName = (typeof EVAL_SCORERS)[number];

// --- Water test types and thresholds ----------------------------------------

export const TEST_TYPES = [
  "nitrate",
  "total_coliform",
  "turbidity",
  "ph",
  "arsenic",
  "free_chlorine",
] as const;
export type TestType = (typeof TEST_TYPES)[number];

export type ThresholdDirection = "above" | "below" | "presence";

export interface ContaminantThreshold {
  testType: TestType;
  label: string;
  contaminant: string;
  unit: string;
  /** Health-based reference value. For "presence" tests this is informational. */
  thresholdValue: number;
  thresholdUnit: string;
  /** Which side of the threshold is unsafe. */
  direction: ThresholdDirection;
  /** Severity assigned when the reference value is exceeded. */
  severityWhenExceeded: Severity;
  /** Stable guidance doc id this test maps to (see server/data/guidance.ts). */
  guidanceId: string;
}

/**
 * Reference thresholds used by the deterministic analyzer. Values reflect widely
 * cited drinking-water references (e.g. EPA MCLs / WHO guideline values) and are
 * for synthetic demo reasoning only — Neelu never certifies legal compliance.
 */
export const CONTAMINANT_THRESHOLDS: Record<TestType, ContaminantThreshold> = {
  nitrate: {
    testType: "nitrate",
    label: "Nitrate (as N)",
    contaminant: "nitrate",
    unit: "mg/L",
    thresholdValue: 10,
    thresholdUnit: "mg/L",
    direction: "above",
    severityWhenExceeded: "high",
    guidanceId: "guidance-nitrate",
  },
  total_coliform: {
    testType: "total_coliform",
    label: "Total coliform / E. coli",
    contaminant: "coliform bacteria",
    unit: "CFU/100mL",
    thresholdValue: 1,
    thresholdUnit: "CFU/100mL",
    direction: "presence",
    severityWhenExceeded: "high",
    guidanceId: "guidance-coliform",
  },
  turbidity: {
    testType: "turbidity",
    label: "Turbidity",
    contaminant: "turbidity",
    unit: "NTU",
    thresholdValue: 5,
    thresholdUnit: "NTU",
    direction: "above",
    severityWhenExceeded: "moderate",
    guidanceId: "guidance-turbidity",
  },
  ph: {
    testType: "ph",
    label: "pH",
    contaminant: "pH",
    unit: "pH",
    thresholdValue: 6.5,
    thresholdUnit: "pH",
    direction: "below",
    severityWhenExceeded: "moderate",
    guidanceId: "guidance-ph",
  },
  arsenic: {
    testType: "arsenic",
    label: "Arsenic",
    contaminant: "arsenic",
    unit: "mg/L",
    thresholdValue: 0.01,
    thresholdUnit: "mg/L",
    direction: "above",
    severityWhenExceeded: "urgent",
    guidanceId: "guidance-arsenic",
  },
  free_chlorine: {
    testType: "free_chlorine",
    label: "Free chlorine residual",
    contaminant: "low chlorine residual",
    unit: "mg/L",
    thresholdValue: 0.2,
    thresholdUnit: "mg/L",
    direction: "below",
    severityWhenExceeded: "moderate",
    guidanceId: "guidance-chlorine",
  },
};

export const TEST_TYPE_LABELS: Record<TestType, string> = {
  nitrate: "Nitrate (as N)",
  total_coliform: "Total coliform / E. coli",
  turbidity: "Turbidity",
  ph: "pH",
  arsenic: "Arsenic",
  free_chlorine: "Free chlorine residual",
};

export const COMMON_UNITS = ["mg/L", "NTU", "CFU/100mL", "pH"] as const;

// --- Scenario ids -----------------------------------------------------------

export const SCENARIO_IDS = [
  "nitrate_school",
  "coliform_expired_kit",
  "turbidity_pipe_repair",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const PRIMARY_SCENARIO_ID: ScenarioId = "nitrate_school";

// --- Demo defaults ----------------------------------------------------------

export const DEFAULT_DEMO_SEED = 42;
export const DEFAULT_DEMO_SCENARIO_NAME = "neelu-default";

// --- Actors -----------------------------------------------------------------

export const SYSTEM_ACTOR = "system";
export const DEFAULT_FIELD_ACTOR = "field-worker";
export const DEFAULT_OPS_ACTOR = "ops-user";
