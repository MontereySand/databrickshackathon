/**
 * Repository layer: the only place that issues SQL. Every mutation is wrapped in
 * a named function, and audit-relevant transitions are paired with
 * writeAuditEvent calls by the service layer. All queries use parameterized SQL
 * ($1, $2, ...) to prevent injection.
 */

import type { Db } from "./index";
import {
  mapApproval,
  mapAudit,
  mapCase,
  mapDemoRun,
  mapEvidence,
  mapFinding,
  mapSignal,
  mapSystem,
  mapTask,
} from "./mappers";
import { newId } from "../lib/ids";
import { TABLE_NAMES } from "./schema";
import type {
  AgentFinding,
  Approval,
  AuditEvent,
  Case,
  CaseListItem,
  Citation,
  DemoRun,
  EvidenceItem,
  Signal,
  SignalDTO,
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

function jsonParam(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

// --- Systems ----------------------------------------------------------------

export async function listSystems(db: Db): Promise<WaterSystem[]> {
  const { rows } = await db.query<Row>(
    "SELECT * FROM systems ORDER BY name ASC",
  );
  return rows.map(mapSystem);
}

export async function getSystem(
  db: Db,
  systemId: string,
): Promise<WaterSystem | null> {
  const { rows } = await db.query<Row>(
    "SELECT * FROM systems WHERE system_id = $1",
    [systemId],
  );
  return rows[0] ? mapSystem(rows[0]) : null;
}

export interface InsertSystemInput {
  systemId?: string;
  name: string;
  region?: string | null;
  country?: string | null;
  populationServed?: number | null;
  systemType?: string | null;
  sourceWaterType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export async function insertSystem(
  db: Db,
  input: InsertSystemInput,
): Promise<WaterSystem> {
  const systemId = input.systemId ?? newId("SYS");
  const { rows } = await db.query<Row>(
    `INSERT INTO systems
      (system_id, name, region, country, population_served, system_type, source_water_type, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      systemId,
      input.name,
      input.region ?? null,
      input.country ?? null,
      input.populationServed ?? null,
      input.systemType ?? null,
      input.sourceWaterType ?? null,
      input.latitude ?? null,
      input.longitude ?? null,
    ],
  );
  return mapSystem(rows[0]);
}

// --- Signals ----------------------------------------------------------------

export interface InsertSignalInput {
  signalId?: string;
  systemId: string;
  signalType: string;
  testType: TestType | null;
  resultValue: number | null;
  unit: string | null;
  thresholdValue?: number | null;
  thresholdUnit?: string | null;
  kitId?: string | null;
  kitExpiresAt?: string | null;
  locationLabel?: string | null;
  notes?: string | null;
  photoRef?: string | null;
  synthetic?: boolean;
  receivedAt?: string | null;
  payloadJson?: Record<string, unknown> | null;
}

export async function insertSignal(
  db: Db,
  input: InsertSignalInput,
): Promise<Signal> {
  const signalId = input.signalId ?? newId("SIG");
  const { rows } = await db.query<Row>(
    `INSERT INTO signals
      (signal_id, system_id, signal_type, test_type, result_value, unit,
       threshold_value, threshold_unit, kit_id, kit_expires_at, location_label,
       notes, photo_ref, synthetic, received_at, payload_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
             COALESCE($15::timestamptz, now()), $16::jsonb)
     RETURNING *`,
    [
      signalId,
      input.systemId,
      input.signalType,
      input.testType,
      input.resultValue,
      input.unit,
      input.thresholdValue ?? null,
      input.thresholdUnit ?? null,
      input.kitId ?? null,
      input.kitExpiresAt ?? null,
      input.locationLabel ?? null,
      input.notes ?? null,
      input.photoRef ?? null,
      input.synthetic ?? true,
      input.receivedAt ?? null,
      jsonParam(input.payloadJson ?? null),
    ],
  );
  return mapSignal(rows[0]);
}

export async function getSignal(
  db: Db,
  signalId: string,
): Promise<Signal | null> {
  const { rows } = await db.query<Row>(
    "SELECT * FROM signals WHERE signal_id = $1",
    [signalId],
  );
  return rows[0] ? mapSignal(rows[0]) : null;
}

export async function listSignals(db: Db): Promise<SignalDTO[]> {
  const { rows } = await db.query<Row>(
    `SELECT s.*, sys.name AS system_name, c.case_id AS case_id
       FROM signals s
       JOIN systems sys ON sys.system_id = s.system_id
       LEFT JOIN cases c ON c.signal_id = s.signal_id
      ORDER BY s.received_at DESC`,
  );
  return rows.map((row) => {
    const signal = mapSignal(row);
    const caseId = row.case_id ? String(row.case_id) : null;
    const dto: SignalDTO = {
      ...signal,
      caseId,
      status: caseId ? "analyzed" : "received",
      systemName: String(row.system_name),
    };
    return dto;
  });
}

// --- Cases ------------------------------------------------------------------

export interface InsertCaseInput {
  caseId?: string;
  systemId: string;
  signalId: string;
  status: CaseStatus;
  severity?: Severity | null;
  contaminant?: string | null;
  summary?: string | null;
  uncertainty?: UncertaintyLevel | null;
  assignedTo?: string | null;
  dueAt?: string | null;
}

export async function insertCase(
  db: Db,
  input: InsertCaseInput,
): Promise<Case> {
  const caseId = input.caseId ?? newId("CASE");
  const { rows } = await db.query<Row>(
    `INSERT INTO cases
      (case_id, system_id, signal_id, status, severity, contaminant, summary,
       uncertainty, assigned_to, due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz)
     RETURNING *`,
    [
      caseId,
      input.systemId,
      input.signalId,
      input.status,
      input.severity ?? null,
      input.contaminant ?? null,
      input.summary ?? null,
      input.uncertainty ?? null,
      input.assignedTo ?? null,
      input.dueAt ?? null,
    ],
  );
  return mapCase(rows[0]);
}

export async function getCase(db: Db, caseId: string): Promise<Case | null> {
  const { rows } = await db.query<Row>(
    "SELECT * FROM cases WHERE case_id = $1",
    [caseId],
  );
  return rows[0] ? mapCase(rows[0]) : null;
}

export async function getCaseBySignal(
  db: Db,
  signalId: string,
): Promise<Case | null> {
  const { rows } = await db.query<Row>(
    "SELECT * FROM cases WHERE signal_id = $1 ORDER BY created_at ASC LIMIT 1",
    [signalId],
  );
  return rows[0] ? mapCase(rows[0]) : null;
}

export interface UpdateCaseFields {
  status?: CaseStatus;
  severity?: Severity | null;
  contaminant?: string | null;
  summary?: string | null;
  uncertainty?: UncertaintyLevel | null;
  assignedTo?: string | null;
  dueAt?: string | null;
}

export async function updateCase(
  db: Db,
  caseId: string,
  fields: UpdateCaseFields,
): Promise<Case> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  const push = (col: string, value: unknown, cast = "") => {
    sets.push(`${col} = $${i}${cast}`);
    params.push(value);
    i += 1;
  };
  if (fields.status !== undefined) push("status", fields.status);
  if (fields.severity !== undefined) push("severity", fields.severity);
  if (fields.contaminant !== undefined) push("contaminant", fields.contaminant);
  if (fields.summary !== undefined) push("summary", fields.summary);
  if (fields.uncertainty !== undefined) push("uncertainty", fields.uncertainty);
  if (fields.assignedTo !== undefined) push("assigned_to", fields.assignedTo);
  if (fields.dueAt !== undefined) push("due_at", fields.dueAt, "::timestamptz");
  sets.push("updated_at = now()");
  params.push(caseId);
  const { rows } = await db.query<Row>(
    `UPDATE cases SET ${sets.join(", ")} WHERE case_id = $${i} RETURNING *`,
    params,
  );
  return mapCase(rows[0]);
}

export async function listCases(db: Db): Promise<CaseListItem[]> {
  const { rows } = await db.query<Row>(
    `SELECT c.*, sys.name AS system_name,
        (SELECT count(*) FROM tasks t WHERE t.case_id = c.case_id AND t.status <> 'done') AS open_task_count,
        (SELECT count(*) FROM evidence_items e WHERE e.case_id = c.case_id) AS evidence_count
       FROM cases c
       JOIN systems sys ON sys.system_id = c.system_id
      ORDER BY c.created_at DESC`,
  );
  return rows.map((row) => {
    const base = mapCase(row);
    const evidenceCount = Number(row.evidence_count ?? 0);
    const item: CaseListItem = {
      caseId: base.caseId,
      systemId: base.systemId,
      systemName: String(row.system_name),
      signalId: base.signalId,
      status: base.status,
      severity: base.severity,
      contaminant: base.contaminant,
      summary: base.summary,
      uncertainty: base.uncertainty,
      assignedTo: base.assignedTo,
      dueAt: base.dueAt,
      openTaskCount: Number(row.open_task_count ?? 0),
      missingEvidence: evidenceCount === 0,
      pendingApproval: base.status === "awaiting_approval",
      createdAt: base.createdAt,
      updatedAt: base.updatedAt,
    };
    return item;
  });
}

// --- Evidence ---------------------------------------------------------------

export interface InsertEvidenceInput {
  evidenceId?: string;
  caseId: string;
  evidenceType: EvidenceType | null;
  title: string | null;
  body: string | null;
  sourceName?: string | null;
  sourceUri?: string | null;
  citationText?: string | null;
  confidence?: number | null;
}

export async function insertEvidence(
  db: Db,
  input: InsertEvidenceInput,
): Promise<EvidenceItem> {
  const evidenceId = input.evidenceId ?? newId("EV");
  const { rows } = await db.query<Row>(
    `INSERT INTO evidence_items
      (evidence_id, case_id, evidence_type, title, body, source_name, source_uri,
       citation_text, confidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      evidenceId,
      input.caseId,
      input.evidenceType,
      input.title,
      input.body,
      input.sourceName ?? null,
      input.sourceUri ?? null,
      input.citationText ?? null,
      input.confidence ?? null,
    ],
  );
  return mapEvidence(rows[0]);
}

export async function listEvidence(
  db: Db,
  caseId: string,
): Promise<EvidenceItem[]> {
  const { rows } = await db.query<Row>(
    "SELECT * FROM evidence_items WHERE case_id = $1 ORDER BY created_at ASC",
    [caseId],
  );
  return rows.map(mapEvidence);
}

// --- Agent findings ---------------------------------------------------------

export interface InsertFindingInput {
  findingId?: string;
  caseId: string;
  agentName: string;
  findingType: string;
  findingText: string;
  recommendation: string;
  uncertainty: UncertaintyLevel;
  citations: Citation[];
  confidence: number;
  traceId: string;
}

export async function insertFinding(
  db: Db,
  input: InsertFindingInput,
): Promise<AgentFinding> {
  const findingId = input.findingId ?? newId("FND");
  const { rows } = await db.query<Row>(
    `INSERT INTO agent_findings
      (finding_id, case_id, agent_name, finding_type, finding_text, recommendation,
       uncertainty, citations_json, confidence, trace_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)
     RETURNING *`,
    [
      findingId,
      input.caseId,
      input.agentName,
      input.findingType,
      input.findingText,
      input.recommendation,
      input.uncertainty,
      jsonParam(input.citations),
      input.confidence,
      input.traceId,
    ],
  );
  return mapFinding(rows[0]);
}

export async function getFindingForCase(
  db: Db,
  caseId: string,
): Promise<AgentFinding | null> {
  const { rows } = await db.query<Row>(
    "SELECT * FROM agent_findings WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1",
    [caseId],
  );
  return rows[0] ? mapFinding(rows[0]) : null;
}

// --- Tasks ------------------------------------------------------------------

export interface InsertTaskInput {
  taskId?: string;
  caseId: string;
  title: string;
  description?: string | null;
  owner?: string | null;
  status?: TaskStatus;
  dueAt?: string | null;
}

export async function insertTask(
  db: Db,
  input: InsertTaskInput,
): Promise<Task> {
  const taskId = input.taskId ?? newId("TSK");
  const { rows } = await db.query<Row>(
    `INSERT INTO tasks
      (task_id, case_id, title, description, owner, status, due_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz)
     RETURNING *`,
    [
      taskId,
      input.caseId,
      input.title,
      input.description ?? null,
      input.owner ?? null,
      input.status ?? "open",
      input.dueAt ?? null,
    ],
  );
  return mapTask(rows[0]);
}

export async function listTasks(db: Db, caseId: string): Promise<Task[]> {
  const { rows } = await db.query<Row>(
    "SELECT * FROM tasks WHERE case_id = $1 ORDER BY created_at ASC",
    [caseId],
  );
  return rows.map(mapTask);
}

// --- Approvals --------------------------------------------------------------

export interface InsertApprovalInput {
  approvalId?: string;
  caseId: string;
  approver: string;
  decision: ApprovalDecision;
  rationale: string;
}

export async function insertApproval(
  db: Db,
  input: InsertApprovalInput,
): Promise<Approval> {
  const approvalId = input.approvalId ?? newId("APR");
  const { rows } = await db.query<Row>(
    `INSERT INTO approvals
      (approval_id, case_id, approver, decision, rationale)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [
      approvalId,
      input.caseId,
      input.approver,
      input.decision,
      input.rationale,
    ],
  );
  return mapApproval(rows[0]);
}

export async function listApprovals(
  db: Db,
  caseId: string,
): Promise<Approval[]> {
  const { rows } = await db.query<Row>(
    "SELECT * FROM approvals WHERE case_id = $1 ORDER BY approved_at ASC",
    [caseId],
  );
  return rows.map(mapApproval);
}

// --- Audit ------------------------------------------------------------------

export interface AuditInput {
  entityType: EntityType;
  entityId: string;
  actor: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
}

export async function writeAuditEvent(
  db: Db,
  input: AuditInput,
): Promise<AuditEvent> {
  const auditId = newId("AUD");
  const { rows } = await db.query<Row>(
    `INSERT INTO audit_events
      (audit_id, entity_type, entity_id, actor, action, before_json, after_json)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
     RETURNING *`,
    [
      auditId,
      input.entityType,
      input.entityId,
      input.actor,
      input.action,
      jsonParam(input.before ?? null),
      jsonParam(input.after ?? null),
    ],
  );
  return mapAudit(rows[0]);
}

/**
 * Full immutable timeline for a case: every audit event whose entity is the
 * case, its originating signal, or any evidence/finding/task/approval belonging
 * to the case. Returned oldest-first.
 */
export async function listCaseAudit(
  db: Db,
  caseId: string,
): Promise<AuditEvent[]> {
  const theCase = await getCase(db, caseId);
  if (!theCase) return [];
  const ids = new Set<string>([caseId, theCase.signalId]);
  const collect = async (sql: string, key: string) => {
    const { rows } = await db.query<Row>(sql, [caseId]);
    for (const row of rows) ids.add(String(row[key]));
  };
  await collect("SELECT evidence_id FROM evidence_items WHERE case_id = $1", "evidence_id");
  await collect("SELECT finding_id FROM agent_findings WHERE case_id = $1", "finding_id");
  await collect("SELECT task_id FROM tasks WHERE case_id = $1", "task_id");
  await collect("SELECT approval_id FROM approvals WHERE case_id = $1", "approval_id");

  const idList = [...ids];
  const placeholders = idList.map((_, idx) => `$${idx + 1}`).join(", ");
  const { rows } = await db.query<Row>(
    `SELECT * FROM audit_events
      WHERE entity_id IN (${placeholders})
      ORDER BY created_at ASC, audit_id ASC`,
    idList,
  );
  return rows.map(mapAudit);
}

// --- Demo runs --------------------------------------------------------------

export async function insertDemoRun(
  db: Db,
  scenarioName: string,
  seed: number,
): Promise<DemoRun> {
  const runId = newId("RUN");
  const { rows } = await db.query<Row>(
    `INSERT INTO demo_runs (run_id, scenario_name, seed)
     VALUES ($1,$2,$3) RETURNING *`,
    [runId, scenarioName, seed],
  );
  return mapDemoRun(rows[0]);
}

export async function getLatestDemoRun(db: Db): Promise<DemoRun | null> {
  const { rows } = await db.query<Row>(
    "SELECT * FROM demo_runs ORDER BY reset_at DESC LIMIT 1",
  );
  return rows[0] ? mapDemoRun(rows[0]) : null;
}

// --- Maintenance ------------------------------------------------------------

export async function countSystems(db: Db): Promise<number> {
  const { rows } = await db.query<Row>("SELECT count(*) AS n FROM systems");
  return Number(rows[0]?.n ?? 0);
}

/** Delete all operational rows in FK-safe order (keeps schema intact). */
export async function deleteAllData(db: Db): Promise<void> {
  const order = [
    "audit_events",
    "approvals",
    "tasks",
    "agent_findings",
    "evidence_items",
    "cases",
    "signals",
    "demo_runs",
    "systems",
  ];
  // Sanity: only delete tables we own.
  for (const table of order) {
    if (!TABLE_NAMES.includes(table as (typeof TABLE_NAMES)[number])) continue;
    await db.query(`DELETE FROM ${table}`);
  }
}
