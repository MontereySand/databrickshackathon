/**
 * Domain types shared between server and client. Row types mirror the Lakebase /
 * Postgres schema in sql/lakebase_schema.sql (snake_case columns are mapped to
 * camelCase here by the repository layer). DTOs are the shapes returned by the
 * API and consumed by the React client.
 */

import type {
  ApprovalDecision,
  AuditAction,
  CaseStatus,
  EntityType,
  EvalScorerName,
  EvidenceType,
  RuntimeMode,
  ServiceName,
  ServiceStatus,
  Severity,
  SignalDerivedStatus,
  TaskStatus,
  TestType,
  UncertaintyLevel,
} from "./constants";

// --- Core rows --------------------------------------------------------------

export interface WaterSystem {
  systemId: string;
  name: string;
  region: string | null;
  country: string | null;
  populationServed: number | null;
  systemType: string | null;
  sourceWaterType: string | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface Signal {
  signalId: string;
  systemId: string;
  signalType: string;
  testType: TestType | null;
  resultValue: number | null;
  unit: string | null;
  thresholdValue: number | null;
  thresholdUnit: string | null;
  kitId: string | null;
  kitExpiresAt: string | null;
  locationLabel: string | null;
  notes: string | null;
  photoRef: string | null;
  synthetic: boolean;
  receivedAt: string;
  payloadJson: Record<string, unknown> | null;
}

export interface Case {
  caseId: string;
  systemId: string;
  signalId: string;
  status: CaseStatus;
  severity: Severity | null;
  contaminant: string | null;
  summary: string | null;
  uncertainty: UncertaintyLevel | null;
  assignedTo: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceItem {
  evidenceId: string;
  caseId: string;
  evidenceType: EvidenceType | null;
  title: string | null;
  body: string | null;
  sourceName: string | null;
  sourceUri: string | null;
  citationText: string | null;
  confidence: number | null;
  createdAt: string;
}

export interface Citation {
  label: string;
  sourceName: string;
  sourceUri: string | null;
  snippet: string;
}

export interface AgentFinding {
  findingId: string;
  caseId: string;
  agentName: string | null;
  findingType: string | null;
  findingText: string | null;
  recommendation: string | null;
  uncertainty: UncertaintyLevel | null;
  citationsJson: Citation[];
  confidence: number | null;
  traceId: string | null;
  createdAt: string;
}

export interface Task {
  taskId: string;
  caseId: string;
  title: string;
  description: string | null;
  owner: string | null;
  status: TaskStatus;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  approvalId: string;
  caseId: string;
  approver: string;
  decision: ApprovalDecision;
  rationale: string;
  approvedAt: string;
}

export interface AuditEvent {
  auditId: string;
  entityType: EntityType;
  entityId: string;
  actor: string;
  action: AuditAction;
  beforeJson: Record<string, unknown> | null;
  afterJson: Record<string, unknown> | null;
  createdAt: string;
}

export interface DemoRun {
  runId: string;
  scenarioName: string | null;
  resetAt: string;
  seed: number | null;
}

// --- Notice draft (derived, stored on the case payload) ---------------------

export interface NoticeDraft {
  language: "en" | "hi";
  title: string;
  body: string;
}

// --- Trace + eval -----------------------------------------------------------

export interface TraceToolCall {
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  fallback: boolean;
  durationMs: number;
}

export interface EvalScorerResult {
  scorer: EvalScorerName;
  passed: boolean;
  detail: string;
}

export interface CaseTrace {
  traceId: string;
  caseId: string;
  source: "mlflow" | "local_fallback";
  toolCalls: TraceToolCall[];
  retrievedGuidanceCount: number;
  citationsUsed: number;
  evalResults: EvalScorerResult[];
  createdAt: string;
}

// --- Health / capability probe ----------------------------------------------

export interface ServiceCapability {
  service: ServiceName;
  status: ServiceStatus;
  detail: string;
}

export interface HealthInfo {
  ok: boolean;
  mode: RuntimeMode;
  version: string;
  services: ServiceCapability[];
  time: string;
}

// --- Composite DTOs ---------------------------------------------------------

export interface SignalDTO extends Signal {
  status: SignalDerivedStatus;
  caseId: string | null;
  systemName: string;
}

export interface CaseListItem {
  caseId: string;
  systemId: string;
  systemName: string;
  signalId: string;
  status: CaseStatus;
  severity: Severity | null;
  contaminant: string | null;
  summary: string | null;
  uncertainty: UncertaintyLevel | null;
  assignedTo: string | null;
  dueAt: string | null;
  openTaskCount: number;
  missingEvidence: boolean;
  pendingApproval: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CaseDetail {
  case: Case;
  system: WaterSystem;
  signal: Signal;
  evidence: EvidenceItem[];
  finding: AgentFinding | null;
  tasks: Task[];
  approvals: Approval[];
  notices: NoticeDraft[];
  trace: CaseTrace | null;
  pendingApproval: boolean;
  missingEvidence: boolean;
}

export interface DemoResetSummary {
  systems: number;
  signals: number;
  scenarioName: string;
  seed: number;
}

// --- Generic API envelope ---------------------------------------------------

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export type ApiResult<T> = { data: T } | ApiError;
