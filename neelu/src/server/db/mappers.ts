/**
 * Row -> DTO mappers. Adapters return snake_case columns with driver-specific
 * value shapes (numeric as string, timestamptz as Date, jsonb as object or
 * string). These helpers normalize everything to the camelCase domain types.
 */

import type {
  AgentFinding,
  Approval,
  AuditEvent,
  Case,
  Citation,
  DemoRun,
  EvidenceItem,
  Signal,
  Task,
  WaterSystem,
} from "../../shared/types";
import type {
  ApprovalDecision,
  AuditAction,
  CaseStatus,
  EntityType,
  EvidenceType,
  Severity,
  TaskStatus,
  TestType,
  UncertaintyLevel,
} from "../../shared/constants";

type Row = Record<string, unknown>;

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return new Date().toISOString();
}

function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return toIso(value);
}

function toDateStr(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return null;
}

function toNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function toInt(value: unknown): number | null {
  const num = toNum(value);
  return num === null ? null : Math.trunc(num);
}

function toBool(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function toJsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function toCitations(value: unknown): Citation[] {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? (parsed as Citation[]) : [];
}

function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function mapSystem(row: Row): WaterSystem {
  return {
    systemId: String(row.system_id),
    name: String(row.name),
    region: str(row.region),
    country: str(row.country),
    populationServed: toInt(row.population_served),
    systemType: str(row.system_type),
    sourceWaterType: str(row.source_water_type),
    latitude: toNum(row.latitude),
    longitude: toNum(row.longitude),
    createdAt: toIso(row.created_at),
  };
}

export function mapSignal(row: Row): Signal {
  return {
    signalId: String(row.signal_id),
    systemId: String(row.system_id),
    signalType: String(row.signal_type),
    testType: (str(row.test_type) as TestType | null) ?? null,
    resultValue: toNum(row.result_value),
    unit: str(row.unit),
    thresholdValue: toNum(row.threshold_value),
    thresholdUnit: str(row.threshold_unit),
    kitId: str(row.kit_id),
    kitExpiresAt: toDateStr(row.kit_expires_at),
    locationLabel: str(row.location_label),
    notes: str(row.notes),
    photoRef: str(row.photo_ref),
    synthetic: toBool(row.synthetic),
    receivedAt: toIso(row.received_at),
    payloadJson: toJsonObject(row.payload_json),
  };
}

export function mapCase(row: Row): Case {
  return {
    caseId: String(row.case_id),
    systemId: String(row.system_id),
    signalId: String(row.signal_id),
    status: String(row.status) as CaseStatus,
    severity: (str(row.severity) as Severity | null) ?? null,
    contaminant: str(row.contaminant),
    summary: str(row.summary),
    uncertainty: (str(row.uncertainty) as UncertaintyLevel | null) ?? null,
    assignedTo: str(row.assigned_to),
    dueAt: toIsoOrNull(row.due_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapEvidence(row: Row): EvidenceItem {
  return {
    evidenceId: String(row.evidence_id),
    caseId: String(row.case_id),
    evidenceType: (str(row.evidence_type) as EvidenceType | null) ?? null,
    title: str(row.title),
    body: str(row.body),
    sourceName: str(row.source_name),
    sourceUri: str(row.source_uri),
    citationText: str(row.citation_text),
    confidence: toNum(row.confidence),
    createdAt: toIso(row.created_at),
  };
}

export function mapFinding(row: Row): AgentFinding {
  return {
    findingId: String(row.finding_id),
    caseId: String(row.case_id),
    agentName: str(row.agent_name),
    findingType: str(row.finding_type),
    findingText: str(row.finding_text),
    recommendation: str(row.recommendation),
    uncertainty: (str(row.uncertainty) as UncertaintyLevel | null) ?? null,
    citationsJson: toCitations(row.citations_json),
    confidence: toNum(row.confidence),
    traceId: str(row.trace_id),
    createdAt: toIso(row.created_at),
  };
}

export function mapTask(row: Row): Task {
  return {
    taskId: String(row.task_id),
    caseId: String(row.case_id),
    title: String(row.title),
    description: str(row.description),
    owner: str(row.owner),
    status: String(row.status) as TaskStatus,
    dueAt: toIsoOrNull(row.due_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export function mapApproval(row: Row): Approval {
  return {
    approvalId: String(row.approval_id),
    caseId: String(row.case_id),
    approver: String(row.approver),
    decision: String(row.decision) as ApprovalDecision,
    rationale: String(row.rationale),
    approvedAt: toIso(row.approved_at),
  };
}

export function mapAudit(row: Row): AuditEvent {
  return {
    auditId: String(row.audit_id),
    entityType: String(row.entity_type) as EntityType,
    entityId: String(row.entity_id),
    actor: String(row.actor),
    action: String(row.action) as AuditAction,
    beforeJson: toJsonObject(row.before_json),
    afterJson: toJsonObject(row.after_json),
    createdAt: toIso(row.created_at),
  };
}

export function mapDemoRun(row: Row): DemoRun {
  return {
    runId: String(row.run_id),
    scenarioName: str(row.scenario_name),
    resetAt: toIso(row.reset_at),
    seed: toInt(row.seed),
  };
}
