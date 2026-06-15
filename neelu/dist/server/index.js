// src/server/index.ts
import express2 from "express";
import path from "node:path";

// src/server/config.ts
import dotenv from "dotenv";
dotenv.config({ quiet: true });
var APP_VERSION = "0.1.0";
function bool(value, fallback) {
  if (value === void 0) return fallback;
  return value !== "false" && value !== "0" && value !== "";
}
var localSim = bool(process.env.LOCAL_SIM, true);
var mode = localSim ? "LOCAL_SIM" : "DATABRICKS";
var nodeEnv = process.env.NODE_ENV ?? "development";
var config = {
  mode,
  localSim,
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: Number(
    process.env.PORT ?? process.env.DATABRICKS_APP_PORT ?? 8e3
  ),
  version: APP_VERSION,
  databaseUrl: process.env.DATABASE_URL,
  pgliteDir: process.env.PGLITE_DATA_DIR ?? "./.data/pglite",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  databricks: {
    host: process.env.DATABRICKS_HOST,
    token: process.env.DATABRICKS_TOKEN,
    profile: process.env.DATABRICKS_PROFILE,
    warehouseId: process.env.DATABRICKS_WAREHOUSE_ID,
    modelEndpoint: process.env.MODEL_ENDPOINT_NAME,
    embeddingEndpoint: process.env.EMBEDDING_ENDPOINT_NAME ?? "databricks-gte-large-en",
    aiSearchIndex: process.env.AI_SEARCH_INDEX_NAME,
    aiSearchEndpoint: process.env.AI_SEARCH_ENDPOINT_NAME,
    ucCatalog: process.env.UC_CATALOG,
    ucSchema: process.env.UC_SCHEMA,
    mlflowExperiment: process.env.MLFLOW_EXPERIMENT_NAME
  }
};
function hasPostgres() {
  return Boolean(config.databaseUrl);
}

// src/server/db/index.ts
import { PGlite } from "@electric-sql/pglite";
import { createLakebasePool } from "@databricks/lakebase";
import pg from "pg";

// src/server/db/schema.ts
var TABLE_NAMES = [
  "systems",
  "signals",
  "cases",
  "evidence_items",
  "agent_findings",
  "tasks",
  "approvals",
  "audit_events",
  "water_points",
  "sync_events",
  "demo_runs"
];
var SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS neelu_app;
SET search_path TO neelu_app;

CREATE TABLE IF NOT EXISTS systems (
  system_id         text PRIMARY KEY,
  name              text NOT NULL,
  region            text,
  country           text,
  population_served integer,
  system_type       text,
  source_water_type text,
  latitude          numeric,
  longitude         numeric,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signals (
  signal_id      text PRIMARY KEY,
  system_id      text REFERENCES systems(system_id),
  signal_type    text NOT NULL,
  test_type      text,
  result_value   numeric,
  unit           text,
  threshold_value numeric,
  threshold_unit text,
  kit_id         text,
  kit_expires_at date,
  location_label text,
  notes          text,
  photo_ref      text,
  synthetic      boolean NOT NULL DEFAULT true,
  received_at    timestamptz NOT NULL DEFAULT now(),
  payload_json   jsonb
);

CREATE TABLE IF NOT EXISTS cases (
  case_id      text PRIMARY KEY,
  system_id    text REFERENCES systems(system_id),
  signal_id    text REFERENCES signals(signal_id),
  status       text NOT NULL,
  severity     text,
  contaminant  text,
  summary      text,
  uncertainty  text,
  assigned_to  text,
  due_at       timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence_items (
  evidence_id   text PRIMARY KEY,
  case_id       text REFERENCES cases(case_id),
  evidence_type text,
  title         text,
  body          text,
  source_name   text,
  source_uri    text,
  citation_text text,
  confidence    numeric,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_findings (
  finding_id     text PRIMARY KEY,
  case_id        text REFERENCES cases(case_id),
  agent_name     text,
  finding_type   text,
  finding_text   text,
  recommendation text,
  uncertainty    text,
  citations_json jsonb,
  confidence     numeric,
  trace_id       text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id     text PRIMARY KEY,
  case_id     text REFERENCES cases(case_id),
  title       text NOT NULL,
  description text,
  owner       text,
  status      text NOT NULL,
  due_at      timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS approvals (
  approval_id text PRIMARY KEY,
  case_id     text REFERENCES cases(case_id),
  approver    text NOT NULL,
  decision    text NOT NULL,
  rationale   text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  audit_id    text PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id   text NOT NULL,
  actor       text NOT NULL,
  action      text NOT NULL,
  before_json jsonb,
  after_json  jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS water_points (
  point_id          text PRIMARY KEY,
  system_id         text REFERENCES systems(system_id),
  name              text NOT NULL,
  latitude          numeric NOT NULL,
  longitude         numeric NOT NULL,
  h3_cell           text NOT NULL,
  quality           text NOT NULL,
  contaminant       text,
  population_served integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_events (
  sync_id      text PRIMARY KEY,
  batch_id     text NOT NULL,
  client_id    text NOT NULL,
  item_kind    text NOT NULL,
  entity_id    text,
  payload_json jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, client_id)
);

CREATE TABLE IF NOT EXISTS demo_runs (
  run_id        text PRIMARY KEY,
  scenario_name text,
  reset_at      timestamptz NOT NULL DEFAULT now(),
  seed          integer
);

CREATE INDEX IF NOT EXISTS idx_signals_system  ON signals(system_id);
CREATE INDEX IF NOT EXISTS idx_signals_received ON signals(received_at);
CREATE INDEX IF NOT EXISTS idx_cases_system    ON cases(system_id);
CREATE INDEX IF NOT EXISTS idx_cases_status    ON cases(status);
CREATE INDEX IF NOT EXISTS idx_evidence_case   ON evidence_items(case_id);
CREATE INDEX IF NOT EXISTS idx_findings_case   ON agent_findings(case_id);
CREATE INDEX IF NOT EXISTS idx_tasks_case      ON tasks(case_id);
CREATE INDEX IF NOT EXISTS idx_approvals_case  ON approvals(case_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity    ON audit_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_water_points_h3 ON water_points(h3_cell);
CREATE INDEX IF NOT EXISTS idx_sync_events_batch ON sync_events(batch_id);
`;

// src/server/db/index.ts
function createPglite() {
  const dir = config.pgliteDir;
  const inMemory = dir === "memory" || dir === "memory://";
  const instance = new PGlite(inMemory ? void 0 : dir);
  return {
    kind: "pglite",
    async query(text, params = []) {
      const result2 = await instance.query(text, params);
      return { rows: result2.rows };
    },
    async exec(sql) {
      await instance.exec(sql);
    },
    async close() {
      await instance.close();
    }
  };
}
function createPoolDb(kind, pool) {
  return {
    kind,
    async query(text, params = []) {
      const client2 = await pool.connect();
      try {
        await client2.query("SET search_path TO neelu_app");
        const result2 = await client2.query(text, params);
        return { rows: result2.rows };
      } finally {
        client2.release();
      }
    },
    async exec(sql) {
      const client2 = await pool.connect();
      try {
        await client2.query("SET search_path TO neelu_app");
        await client2.query(sql);
      } finally {
        client2.release();
      }
    },
    async close() {
      await pool.end();
    }
  };
}
function createPostgres() {
  return createPoolDb(
    "postgres",
    new pg.Pool({ connectionString: config.databaseUrl })
  );
}
function hasLakebaseResource() {
  return Boolean(
    process.env.LAKEBASE_ENDPOINT && process.env.PGHOST && process.env.PGDATABASE
  );
}
function createLakebase() {
  return createPoolDb("lakebase", createLakebasePool());
}
function createDb() {
  if (hasLakebaseResource()) return createLakebase();
  return hasPostgres() ? createPostgres() : createPglite();
}
var dbPromise = null;
async function createAndInit() {
  const db = createDb();
  await db.exec(SCHEMA_SQL);
  return db;
}
function getDb() {
  if (!dbPromise) {
    dbPromise = createAndInit();
  }
  return dbPromise;
}

// src/server/services/demo.ts
import { latLngToCell } from "h3-js";

// src/server/db/mappers.ts
function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return (/* @__PURE__ */ new Date()).toISOString();
}
function toIsoOrNull(value) {
  if (value === null || value === void 0) return null;
  return toIso(value);
}
function toDateStr(value) {
  if (value === null || value === void 0) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return null;
}
function toNum(value) {
  if (value === null || value === void 0) return null;
  const num2 = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num2) ? num2 : null;
}
function toInt(value) {
  const num2 = toNum(value);
  return num2 === null ? null : Math.trunc(num2);
}
function toBool(value) {
  return value === true || value === "t" || value === "true" || value === 1;
}
function toJsonObject(value) {
  if (value === null || value === void 0) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return value;
  return null;
}
function toCitations(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? parsed : [];
}
function str(value) {
  return value === null || value === void 0 ? null : String(value);
}
function mapSystem(row) {
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
    createdAt: toIso(row.created_at)
  };
}
function mapSignal(row) {
  return {
    signalId: String(row.signal_id),
    systemId: String(row.system_id),
    signalType: String(row.signal_type),
    testType: str(row.test_type) ?? null,
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
    payloadJson: toJsonObject(row.payload_json)
  };
}
function mapCase(row) {
  return {
    caseId: String(row.case_id),
    systemId: String(row.system_id),
    signalId: String(row.signal_id),
    status: String(row.status),
    severity: str(row.severity) ?? null,
    contaminant: str(row.contaminant),
    summary: str(row.summary),
    uncertainty: str(row.uncertainty) ?? null,
    assignedTo: str(row.assigned_to),
    dueAt: toIsoOrNull(row.due_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}
function mapEvidence(row) {
  return {
    evidenceId: String(row.evidence_id),
    caseId: String(row.case_id),
    evidenceType: str(row.evidence_type) ?? null,
    title: str(row.title),
    body: str(row.body),
    sourceName: str(row.source_name),
    sourceUri: str(row.source_uri),
    citationText: str(row.citation_text),
    confidence: toNum(row.confidence),
    createdAt: toIso(row.created_at)
  };
}
function mapFinding(row) {
  return {
    findingId: String(row.finding_id),
    caseId: String(row.case_id),
    agentName: str(row.agent_name),
    findingType: str(row.finding_type),
    findingText: str(row.finding_text),
    recommendation: str(row.recommendation),
    uncertainty: str(row.uncertainty) ?? null,
    citationsJson: toCitations(row.citations_json),
    confidence: toNum(row.confidence),
    traceId: str(row.trace_id),
    createdAt: toIso(row.created_at)
  };
}
function mapTask(row) {
  return {
    taskId: String(row.task_id),
    caseId: String(row.case_id),
    title: String(row.title),
    description: str(row.description),
    owner: str(row.owner),
    status: String(row.status),
    dueAt: toIsoOrNull(row.due_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}
function mapApproval(row) {
  return {
    approvalId: String(row.approval_id),
    caseId: String(row.case_id),
    approver: String(row.approver),
    decision: String(row.decision),
    rationale: String(row.rationale),
    approvedAt: toIso(row.approved_at)
  };
}
function mapAudit(row) {
  return {
    auditId: String(row.audit_id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    actor: String(row.actor),
    action: String(row.action),
    beforeJson: toJsonObject(row.before_json),
    afterJson: toJsonObject(row.after_json),
    createdAt: toIso(row.created_at)
  };
}
function mapDemoRun(row) {
  return {
    runId: String(row.run_id),
    scenarioName: str(row.scenario_name),
    resetAt: toIso(row.reset_at),
    seed: toInt(row.seed)
  };
}

// src/server/lib/ids.ts
import { randomUUID } from "node:crypto";
function newId(prefix) {
  return `${prefix}-${randomUUID().replace(/-/gu, "").slice(0, 10).toUpperCase()}`;
}

// src/server/db/repositories.ts
function jsonParam(value) {
  return value === null || value === void 0 ? null : JSON.stringify(value);
}
function num(value) {
  if (value === null || value === void 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
async function listSystems(db) {
  const { rows } = await db.query(
    "SELECT * FROM systems ORDER BY name ASC"
  );
  return rows.map(mapSystem);
}
async function getSystem(db, systemId) {
  const { rows } = await db.query(
    "SELECT * FROM systems WHERE system_id = $1",
    [systemId]
  );
  return rows[0] ? mapSystem(rows[0]) : null;
}
async function insertSystem(db, input) {
  const systemId = input.systemId ?? newId("SYS");
  const { rows } = await db.query(
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
      input.longitude ?? null
    ]
  );
  return mapSystem(rows[0]);
}
async function insertSignal(db, input) {
  const signalId = input.signalId ?? newId("SIG");
  const { rows } = await db.query(
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
      jsonParam(input.payloadJson ?? null)
    ]
  );
  return mapSignal(rows[0]);
}
async function getSignal(db, signalId) {
  const { rows } = await db.query(
    "SELECT * FROM signals WHERE signal_id = $1",
    [signalId]
  );
  return rows[0] ? mapSignal(rows[0]) : null;
}
async function listSignals(db) {
  const { rows } = await db.query(
    `SELECT s.*, sys.name AS system_name, c.case_id AS case_id
       FROM signals s
       JOIN systems sys ON sys.system_id = s.system_id
       LEFT JOIN cases c ON c.signal_id = s.signal_id
      ORDER BY s.received_at DESC`
  );
  return rows.map((row) => {
    const signal = mapSignal(row);
    const caseId = row.case_id ? String(row.case_id) : null;
    const dto = {
      ...signal,
      caseId,
      status: caseId ? "analyzed" : "received",
      systemName: String(row.system_name)
    };
    return dto;
  });
}
async function insertCase(db, input) {
  const caseId = input.caseId ?? newId("CASE");
  const { rows } = await db.query(
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
      input.dueAt ?? null
    ]
  );
  return mapCase(rows[0]);
}
async function getCase(db, caseId) {
  const { rows } = await db.query(
    "SELECT * FROM cases WHERE case_id = $1",
    [caseId]
  );
  return rows[0] ? mapCase(rows[0]) : null;
}
async function getCaseBySignal(db, signalId) {
  const { rows } = await db.query(
    "SELECT * FROM cases WHERE signal_id = $1 ORDER BY created_at ASC LIMIT 1",
    [signalId]
  );
  return rows[0] ? mapCase(rows[0]) : null;
}
async function updateCase(db, caseId, fields) {
  const sets = [];
  const params = [];
  let i = 1;
  const push = (col, value, cast = "") => {
    sets.push(`${col} = $${i}${cast}`);
    params.push(value);
    i += 1;
  };
  if (fields.status !== void 0) push("status", fields.status);
  if (fields.severity !== void 0) push("severity", fields.severity);
  if (fields.contaminant !== void 0) push("contaminant", fields.contaminant);
  if (fields.summary !== void 0) push("summary", fields.summary);
  if (fields.uncertainty !== void 0) push("uncertainty", fields.uncertainty);
  if (fields.assignedTo !== void 0) push("assigned_to", fields.assignedTo);
  if (fields.dueAt !== void 0) push("due_at", fields.dueAt, "::timestamptz");
  sets.push("updated_at = now()");
  params.push(caseId);
  const { rows } = await db.query(
    `UPDATE cases SET ${sets.join(", ")} WHERE case_id = $${i} RETURNING *`,
    params
  );
  return mapCase(rows[0]);
}
async function listCases(db) {
  const { rows } = await db.query(
    `SELECT c.*, sys.name AS system_name,
        (SELECT count(*) FROM tasks t WHERE t.case_id = c.case_id AND t.status <> 'done') AS open_task_count,
        (SELECT count(*) FROM evidence_items e WHERE e.case_id = c.case_id) AS evidence_count
       FROM cases c
       JOIN systems sys ON sys.system_id = c.system_id
      ORDER BY c.created_at DESC`
  );
  return rows.map((row) => {
    const base = mapCase(row);
    const evidenceCount = Number(row.evidence_count ?? 0);
    const item = {
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
      updatedAt: base.updatedAt
    };
    return item;
  });
}
async function insertEvidence(db, input) {
  const evidenceId = input.evidenceId ?? newId("EV");
  const { rows } = await db.query(
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
      input.confidence ?? null
    ]
  );
  return mapEvidence(rows[0]);
}
async function listEvidence(db, caseId) {
  const { rows } = await db.query(
    "SELECT * FROM evidence_items WHERE case_id = $1 ORDER BY created_at ASC",
    [caseId]
  );
  return rows.map(mapEvidence);
}
async function insertFinding(db, input) {
  const findingId = input.findingId ?? newId("FND");
  const { rows } = await db.query(
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
      input.traceId
    ]
  );
  return mapFinding(rows[0]);
}
async function getFindingForCase(db, caseId) {
  const { rows } = await db.query(
    "SELECT * FROM agent_findings WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1",
    [caseId]
  );
  return rows[0] ? mapFinding(rows[0]) : null;
}
async function insertTask(db, input) {
  const taskId = input.taskId ?? newId("TSK");
  const { rows } = await db.query(
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
      input.dueAt ?? null
    ]
  );
  return mapTask(rows[0]);
}
async function listTasks(db, caseId) {
  const { rows } = await db.query(
    "SELECT * FROM tasks WHERE case_id = $1 ORDER BY created_at ASC",
    [caseId]
  );
  return rows.map(mapTask);
}
async function updateTask(db, taskId, fields) {
  const sets = [];
  const params = [];
  let i = 1;
  const push = (col, value) => {
    sets.push(`${col} = $${i}`);
    params.push(value);
    i += 1;
  };
  if (fields.owner !== void 0) push("owner", fields.owner);
  if (fields.status !== void 0) push("status", fields.status);
  if (fields.description !== void 0) push("description", fields.description);
  sets.push("updated_at = now()");
  params.push(taskId);
  const { rows } = await db.query(
    `UPDATE tasks SET ${sets.join(", ")} WHERE task_id = $${i} RETURNING *`,
    params
  );
  return mapTask(rows[0]);
}
async function getTask(db, taskId) {
  const { rows } = await db.query(
    "SELECT * FROM tasks WHERE task_id = $1",
    [taskId]
  );
  return rows[0] ? mapTask(rows[0]) : null;
}
async function listContractorQueue(db) {
  const { rows } = await db.query(
    `SELECT t.*, c.status AS case_status, c.severity, c.contaminant,
            sys.name AS system_name, sys.latitude, sys.longitude, wp.h3_cell
       FROM tasks t
       JOIN cases c ON c.case_id = t.case_id
       JOIN systems sys ON sys.system_id = c.system_id
       LEFT JOIN water_points wp ON wp.system_id = sys.system_id
      WHERE t.status <> 'done'
      ORDER BY
        CASE c.severity
          WHEN 'urgent' THEN 0
          WHEN 'high' THEN 1
          WHEN 'moderate' THEN 2
          ELSE 3
        END,
        t.created_at ASC`
  );
  return rows.map((row) => ({
    ...mapTask(row),
    caseStatus: String(row.case_status),
    severity: row.severity ? String(row.severity) : null,
    contaminant: row.contaminant ? String(row.contaminant) : null,
    systemName: String(row.system_name),
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    h3Cell: row.h3_cell ? String(row.h3_cell) : null,
    distanceKm: null
  }));
}
async function insertWaterPoint(db, input) {
  const pointId = input.pointId ?? newId("WPT");
  const { rows } = await db.query(
    `INSERT INTO water_points
      (point_id, system_id, name, latitude, longitude, h3_cell, quality, contaminant, population_served)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (point_id) DO UPDATE SET
       system_id = EXCLUDED.system_id,
       name = EXCLUDED.name,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       h3_cell = EXCLUDED.h3_cell,
       quality = EXCLUDED.quality,
       contaminant = EXCLUDED.contaminant,
       population_served = EXCLUDED.population_served
     RETURNING *`,
    [
      pointId,
      input.systemId ?? null,
      input.name,
      input.latitude,
      input.longitude,
      input.h3Cell,
      input.quality,
      input.contaminant ?? null,
      input.populationServed ?? null
    ]
  );
  const row = rows[0];
  return {
    pointId: String(row.point_id),
    systemId: row.system_id ? String(row.system_id) : null,
    name: String(row.name),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    h3Cell: String(row.h3_cell),
    quality: String(row.quality),
    contaminant: row.contaminant ? String(row.contaminant) : null,
    populationServed: num(row.population_served),
    createdAt: String(row.created_at)
  };
}
async function listWaterPoints(db) {
  const { rows } = await db.query(
    "SELECT * FROM water_points ORDER BY created_at ASC"
  );
  return rows.map((row) => ({
    pointId: String(row.point_id),
    systemId: row.system_id ? String(row.system_id) : null,
    name: String(row.name),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    h3Cell: String(row.h3_cell),
    quality: String(row.quality),
    contaminant: row.contaminant ? String(row.contaminant) : null,
    populationServed: num(row.population_served),
    createdAt: String(row.created_at)
  }));
}
async function insertApproval(db, input) {
  const approvalId = input.approvalId ?? newId("APR");
  const { rows } = await db.query(
    `INSERT INTO approvals
      (approval_id, case_id, approver, decision, rationale)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [approvalId, input.caseId, input.approver, input.decision, input.rationale]
  );
  return mapApproval(rows[0]);
}
async function listApprovals(db, caseId) {
  const { rows } = await db.query(
    "SELECT * FROM approvals WHERE case_id = $1 ORDER BY approved_at ASC",
    [caseId]
  );
  return rows.map(mapApproval);
}
async function writeAuditEvent(db, input) {
  const auditId = newId("AUD");
  const { rows } = await db.query(
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
      jsonParam(input.after ?? null)
    ]
  );
  return mapAudit(rows[0]);
}
async function listCaseAudit(db, caseId) {
  const theCase = await getCase(db, caseId);
  if (!theCase) return [];
  const ids = /* @__PURE__ */ new Set([caseId, theCase.signalId]);
  const collect = async (sql, key) => {
    const { rows: rows2 } = await db.query(sql, [caseId]);
    for (const row of rows2) ids.add(String(row[key]));
  };
  await collect(
    "SELECT evidence_id FROM evidence_items WHERE case_id = $1",
    "evidence_id"
  );
  await collect(
    "SELECT finding_id FROM agent_findings WHERE case_id = $1",
    "finding_id"
  );
  await collect("SELECT task_id FROM tasks WHERE case_id = $1", "task_id");
  await collect(
    "SELECT approval_id FROM approvals WHERE case_id = $1",
    "approval_id"
  );
  const idList = [...ids];
  const placeholders = idList.map((_, idx) => `$${idx + 1}`).join(", ");
  const { rows } = await db.query(
    `SELECT * FROM audit_events
      WHERE entity_id IN (${placeholders})
      ORDER BY created_at ASC, audit_id ASC`,
    idList
  );
  return rows.map(mapAudit);
}
async function findSyncEvent(db, batchId, clientId) {
  const { rows } = await db.query(
    "SELECT entity_id FROM sync_events WHERE batch_id = $1 AND client_id = $2",
    [batchId, clientId]
  );
  return rows[0] ? { entityId: rows[0].entity_id ? String(rows[0].entity_id) : null } : null;
}
async function insertSyncEvent(db, input) {
  await db.query(
    `INSERT INTO sync_events
      (sync_id, batch_id, client_id, item_kind, entity_id, payload_json)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT (batch_id, client_id) DO NOTHING`,
    [
      newId("SYN"),
      input.batchId,
      input.clientId,
      input.itemKind,
      input.entityId ?? null,
      jsonParam(input.payloadJson ?? null)
    ]
  );
}
async function insertDemoRun(db, scenarioName, seed) {
  const runId = newId("RUN");
  const { rows } = await db.query(
    `INSERT INTO demo_runs (run_id, scenario_name, seed)
     VALUES ($1,$2,$3) RETURNING *`,
    [runId, scenarioName, seed]
  );
  return mapDemoRun(rows[0]);
}
async function countSystems(db) {
  const { rows } = await db.query("SELECT count(*) AS n FROM systems");
  return Number(rows[0]?.n ?? 0);
}
async function deleteAllData(db) {
  const order = [
    "audit_events",
    "approvals",
    "tasks",
    "agent_findings",
    "evidence_items",
    "cases",
    "signals",
    "sync_events",
    "water_points",
    "demo_runs",
    "systems"
  ];
  for (const table of order) {
    if (!TABLE_NAMES.includes(table)) continue;
    await db.query(`DELETE FROM ${table}`);
  }
}

// src/shared/constants.ts
var SEVERITIES = ["low", "moderate", "high", "urgent"];
var SEVERITY_LABELS = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  urgent: "Needs urgent review"
};
var UNCERTAINTY_LEVELS = ["low", "medium", "high"];
var EVAL_SCORERS = [
  "has_citations",
  "requires_human_approval",
  "flags_uncertainty",
  "creates_required_tasks",
  "no_certified_compliance_claim",
  "writes_audit_events"
];
var TEST_TYPES = [
  "nitrate",
  "total_coliform",
  "turbidity",
  "ph",
  "arsenic",
  "free_chlorine"
];
var CONTAMINANT_THRESHOLDS = {
  nitrate: {
    testType: "nitrate",
    label: "Nitrate (as N)",
    contaminant: "nitrate",
    unit: "mg/L",
    thresholdValue: 10,
    thresholdUnit: "mg/L",
    direction: "above",
    severityWhenExceeded: "high",
    guidanceId: "guidance-nitrate"
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
    guidanceId: "guidance-coliform"
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
    guidanceId: "guidance-turbidity"
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
    guidanceId: "guidance-ph"
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
    guidanceId: "guidance-arsenic"
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
    guidanceId: "guidance-chlorine"
  }
};
var SCENARIO_IDS = [
  "nitrate_school",
  "coliform_expired_kit",
  "turbidity_pipe_repair"
];
var DEFAULT_DEMO_SEED = 42;
var DEFAULT_DEMO_SCENARIO_NAME = "neelu-default";
var DEFAULT_FIELD_ACTOR = "field-worker";
var DEFAULT_OPS_ACTOR = "ops-user";

// src/server/data/scenarios.ts
var SYSTEMS = [
  {
    systemId: "sys-village",
    name: "Neelu Demo Village Water Point",
    region: "Maharashtra",
    country: "IN",
    populationServed: 2400,
    systemType: "community handpump + storage",
    sourceWaterType: "groundwater",
    latitude: 19.7515,
    longitude: 75.7139,
    riskNotes: "Shallow groundwater source; recurring turbidity complaints after monsoon and pipe work."
  },
  {
    systemId: "sys-school",
    name: "North School Tap",
    region: "Maharashtra",
    country: "IN",
    populationServed: 680,
    systemType: "school supply tap",
    sourceWaterType: "groundwater (borewell)",
    latitude: 19.8762,
    longitude: 75.3433,
    riskNotes: "Serves a primary school with children under 6; agricultural runoff nearby raises nitrate risk."
  },
  {
    systemId: "sys-clinic",
    name: "Hill Clinic Supply",
    region: "Himachal Pradesh",
    country: "IN",
    populationServed: 320,
    systemType: "clinic rooftop tank",
    sourceWaterType: "spring-fed",
    latitude: 31.1048,
    longitude: 77.1734,
    riskNotes: "Critical facility (clinic). Intermittent chlorination; spring source vulnerable to fecal ingress."
  }
];
var SCENARIOS = [
  {
    id: "nitrate_school",
    name: "High nitrate field result near school",
    description: "A field nitrate reading well above the 10 mg/L reference value at a tap serving a primary school with young children.",
    isPrimary: true,
    signalId: "SIG-NITRATE-SCHOOL",
    systemId: "sys-school",
    testType: "nitrate",
    resultValue: 18.4,
    unit: "mg/L",
    kitId: "KIT-NA-2207",
    kitExpiryOffsetDays: 120,
    locationLabel: "Tap beside primary school kitchen",
    notes: "Routine screening flagged high nitrate. School serves children under 6. Requesting urgent review.",
    submittedBy: "field-worker (Asha)",
    receivedMinutesAgo: 12
  },
  {
    id: "coliform_expired_kit",
    name: "Positive coliform with expired kit uncertainty",
    description: "A presence/absence coliform kit returned positive, but the test kit was past its expiration date, raising uncertainty.",
    isPrimary: false,
    signalId: "SIG-COLIFORM-CLINIC",
    systemId: "sys-clinic",
    testType: "total_coliform",
    resultValue: 1,
    unit: "CFU/100mL",
    kitId: "KIT-CO-1185",
    kitExpiryOffsetDays: -38,
    locationLabel: "Clinic rooftop tank outlet",
    notes: "Presence detected. Kit expiration date appears to have passed; please confirm before action.",
    submittedBy: "field-worker (Vikram)",
    receivedMinutesAgo: 47
  },
  {
    id: "turbidity_pipe_repair",
    name: "Turbidity complaints after pipe repair",
    description: "Elevated turbidity following a distribution pipe repair, with no confirmatory microbiological sample collected yet.",
    isPrimary: false,
    signalId: "SIG-TURBIDITY-VILLAGE",
    systemId: "sys-village",
    testType: "turbidity",
    resultValue: 7.2,
    unit: "NTU",
    kitId: "KIT-TU-3390",
    kitExpiryOffsetDays: 210,
    locationLabel: "Main storage tank outlet (post-repair)",
    notes: "Residents report cloudy water after yesterday's pipe repair. No confirmatory lab sample collected yet.",
    submittedBy: "field-worker (Meena)",
    receivedMinutesAgo: 95
  }
];

// src/server/services/demo.ts
function dateStringFromOffset(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
}
function isoFromMinutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1e3).toISOString();
}
async function seedDemo(db, options = {}) {
  const seed = options.seed ?? DEFAULT_DEMO_SEED;
  const scenarioName = options.scenarioName ?? DEFAULT_DEMO_SCENARIO_NAME;
  for (const system of SYSTEMS) {
    await insertSystem(db, {
      systemId: system.systemId,
      name: system.name,
      region: system.region,
      country: system.country,
      populationServed: system.populationServed,
      systemType: system.systemType,
      sourceWaterType: system.sourceWaterType,
      latitude: system.latitude,
      longitude: system.longitude
    });
    const quality = system.systemId === "sys-school" ? "contaminated" : system.systemId === "sys-clinic" ? "caution" : "clean";
    await insertWaterPoint(db, {
      pointId: `WPT-${system.systemId.toUpperCase()}`,
      systemId: system.systemId,
      name: `${system.name} source`,
      latitude: system.latitude ?? 0,
      longitude: system.longitude ?? 0,
      h3Cell: latLngToCell(system.latitude ?? 0, system.longitude ?? 0, 8),
      quality,
      contaminant: quality === "contaminated" ? "nitrate" : quality === "caution" ? "coliform bacteria" : null,
      populationServed: system.populationServed
    });
  }
  for (const scenario of SCENARIOS) {
    const threshold = CONTAMINANT_THRESHOLDS[scenario.testType];
    const signal = await insertSignal(db, {
      signalId: scenario.signalId,
      systemId: scenario.systemId,
      signalType: "field_test",
      testType: scenario.testType,
      resultValue: scenario.resultValue,
      unit: scenario.unit,
      thresholdValue: threshold.thresholdValue,
      thresholdUnit: threshold.thresholdUnit,
      kitId: scenario.kitId,
      kitExpiresAt: dateStringFromOffset(scenario.kitExpiryOffsetDays),
      locationLabel: scenario.locationLabel,
      notes: scenario.notes,
      photoRef: null,
      synthetic: true,
      receivedAt: isoFromMinutesAgo(scenario.receivedMinutesAgo),
      payloadJson: { scenarioId: scenario.id, seeded: true }
    });
    await writeAuditEvent(db, {
      entityType: "signal",
      entityId: signal.signalId,
      actor: scenario.submittedBy,
      action: "signal_submitted",
      after: signal
    });
  }
  const run = await insertDemoRun(db, scenarioName, seed);
  await writeAuditEvent(db, {
    entityType: "demo_run",
    entityId: run.runId,
    actor: "system",
    action: "demo_reset",
    after: {
      scenarioName,
      seed,
      systems: SYSTEMS.length,
      signals: SCENARIOS.length
    }
  });
  return {
    systems: SYSTEMS.length,
    signals: SCENARIOS.length,
    scenarioName,
    seed
  };
}
async function ensureSeeded(db) {
  const count = await countSystems(db);
  if (count > 0) return false;
  await seedDemo(db);
  return true;
}
async function resetDemo(db, input = {}) {
  await deleteAllData(db);
  return seedDemo(db, { seed: input.seed, scenarioName: input.scenario });
}

// src/server/app.ts
import express from "express";

// src/server/routes/api.ts
import { Router } from "express";

// src/server/lib/errors.ts
var AppError = class extends Error {
  status;
  code;
  details;
  constructor(status, code, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
};
var BadRequestError = class extends AppError {
  constructor(message, details) {
    super(400, "bad_request", message, details);
    this.name = "BadRequestError";
  }
};
var NotFoundError = class extends AppError {
  constructor(message) {
    super(404, "not_found", message);
    this.name = "NotFoundError";
  }
};
var ConflictError = class extends AppError {
  constructor(message) {
    super(409, "conflict", message);
    this.name = "ConflictError";
  }
};
var ServiceUnavailableError = class extends AppError {
  constructor(message, details) {
    super(503, "service_unavailable", message, details);
    this.name = "ServiceUnavailableError";
  }
};

// src/server/http/respond.ts
function ok(res, data, status = 200) {
  res.status(status).json({ data });
}
function parse(schema, value) {
  const result2 = schema.safeParse(value);
  if (!result2.success) {
    const details = result2.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));
    throw new BadRequestError("Validation failed", details);
  }
  return result2.data;
}

// src/server/data/guidance.ts
var GUIDANCE_DOCS = [
  {
    id: "guidance-nitrate",
    title: "Nitrate in drinking water (reference value 10 mg/L as N)",
    sourceName: "EPA \u2014 Ground Water and Drinking Water",
    sourceUri: "https://www.epa.gov/ground-water-and-drinking-water/national-primary-drinking-water-regulations",
    appliesTo: ["nitrate"],
    text: 'The commonly cited maximum contaminant level for nitrate is 10 mg/L (as nitrogen). Levels above this reference value are of particular concern for infants under six months and pregnant people, where nitrate can cause methemoglobinemia ("blue baby syndrome"). A field-kit exceedance should be treated as provisional and confirmed with an accredited laboratory sample before public-health action.',
    tags: ["nitrate", "infant", "school", "mcl", "confirm"]
  },
  {
    id: "guidance-coliform",
    title: "Total coliform and E. coli detections",
    sourceName: "WHO \u2014 Guidelines for Drinking-water Quality",
    sourceUri: "https://www.who.int/publications/i/item/9789241549950",
    appliesTo: ["total_coliform"],
    text: "Total coliform bacteria should not be detectable in treated drinking water; E. coli indicates recent fecal contamination and requires immediate investigation, resampling, and consideration of a boil-water advisory by the responsible authority. Detections from expired or improperly stored test kits carry elevated uncertainty and must be confirmed.",
    tags: ["coliform", "ecoli", "boil-water", "confirm", "uncertainty"]
  },
  {
    id: "guidance-turbidity",
    title: "Turbidity after distribution disturbances",
    sourceName: "WHO \u2014 Guidelines for Drinking-water Quality",
    sourceUri: "https://www.who.int/publications/i/item/9789241549950",
    appliesTo: ["turbidity"],
    text: "Turbidity should ideally be below 1 NTU and not exceed 5 NTU; elevated turbidity can shield pathogens from disinfection. Following pipe repairs or main breaks, distribution lines should be flushed and re-tested, and confirmatory microbiological sampling is recommended before clearing a site.",
    tags: ["turbidity", "pipe-repair", "flush", "confirm"]
  },
  {
    id: "guidance-ph",
    title: "pH operational range",
    sourceName: "WHO \u2014 Guidelines for Drinking-water Quality",
    sourceUri: "https://www.who.int/publications/i/item/9789241549950",
    appliesTo: ["ph"],
    text: "A pH in the range 6.5 to 8.5 is generally recommended for drinking water; values outside this range can impair disinfection effectiveness and increase pipe corrosion and metal leaching.",
    tags: ["ph", "corrosion", "disinfection"]
  },
  {
    id: "guidance-arsenic",
    title: "Arsenic in drinking water (reference value 0.01 mg/L)",
    sourceName: "WHO \u2014 Arsenic Fact Sheet",
    sourceUri: "https://www.who.int/news-room/fact-sheets/detail/arsenic",
    appliesTo: ["arsenic"],
    text: "The provisional guideline value for arsenic is 0.01 mg/L. Chronic exposure is associated with skin lesions and cancers. Exceedances warrant urgent confirmatory testing and identification of alternative water sources for affected populations.",
    tags: ["arsenic", "chronic", "urgent", "confirm"]
  },
  {
    id: "guidance-chlorine",
    title: "Free chlorine residual maintenance",
    sourceName: "WHO \u2014 Guidelines for Drinking-water Quality",
    sourceUri: "https://www.who.int/publications/i/item/9789241549950",
    appliesTo: ["free_chlorine"],
    text: "A free chlorine residual of at least 0.2 mg/L at the point of delivery is commonly recommended to limit microbial regrowth in the distribution network. Low residuals can indicate contamination ingress or excessive demand and warrant investigation.",
    tags: ["chlorine", "residual", "regrowth"]
  },
  {
    id: "guidance-confirmatory-sampling",
    title: "Confirmatory laboratory sampling for field-kit exceedances",
    sourceName: "Neelu synthetic operations handbook",
    sourceUri: "https://developers.databricks.com",
    appliesTo: "all",
    text: "Field test kits are a screening tool. Any exceedance detected by a field kit should be confirmed with an accredited laboratory sample collected following chain-of-custody procedures before issuing public-health notices or compliance determinations.",
    tags: ["confirm", "lab", "chain-of-custody", "process"]
  },
  {
    id: "guidance-public-notice",
    title: "Public notification responsibilities",
    sourceName: "Neelu synthetic operations handbook",
    sourceUri: "https://developers.databricks.com",
    appliesTo: "all",
    text: "Public notifications must be issued by an authorized public-health or water-system authority. Draft notices generated for review do not constitute official notification and require human and regulatory approval before any release.",
    tags: ["notice", "approval", "human-in-the-loop", "process"]
  }
];

// src/server/databricks/workspace.ts
import { WorkspaceClient } from "@databricks/sdk-experimental";
var client = null;
function getWorkspaceClient() {
  if (client) return client;
  client = new WorkspaceClient({
    host: config.databricks.host,
    token: config.databricks.token,
    profile: config.databricks.profile,
    warehouseId: config.databricks.warehouseId
  });
  return client;
}
function missingDatabricksDetail(service, envName) {
  return `${service} is not connected: ${envName} is required when LOCAL_SIM=false`;
}
function assertSucceeded(response) {
  const state = response.status?.state;
  if (state === "FAILED" || state === "CANCELED" || state === "CLOSED") {
    const message = response.status?.error?.message ?? response.status?.error?.error_code ?? `SQL statement ended with state ${state}`;
    throw new Error(message);
  }
}
async function runSqlRows(statement, options = {}) {
  const { warehouseId, ucCatalog, ucSchema } = config.databricks;
  if (!warehouseId) {
    throw new Error(missingDatabricksDetail("Unity Catalog", "DATABRICKS_WAREHOUSE_ID"));
  }
  const response = await getWorkspaceClient().statementExecution.executeStatement({
    statement,
    warehouse_id: warehouseId,
    catalog: ucCatalog,
    schema: ucSchema,
    wait_timeout: "30s",
    on_wait_timeout: "CANCEL",
    disposition: "INLINE",
    format: "JSON_ARRAY",
    row_limit: options.rowLimit,
    parameters: options.parameters
  });
  assertSucceeded(response);
  const columns = response.manifest?.schema?.columns ?? [];
  const names = columns.map((column, index) => column.name ?? `_c${index}`);
  const rows = response.result?.data_array ?? [];
  return rows.map(
    (row) => Object.fromEntries(names.map((name, index) => [name, row[index] ?? null]))
  );
}
function tableName(table) {
  const { ucCatalog, ucSchema } = config.databricks;
  if (!ucCatalog || !ucSchema) {
    throw new Error(missingDatabricksDetail("Unity Catalog", "UC_CATALOG and UC_SCHEMA"));
  }
  return `\`${ucCatalog}\`.\`${ucSchema}\`.\`${table}\``;
}
function numberValue(row, key, fallback = 0) {
  const value = row[key];
  if (value === null || value === void 0 || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function stringValue(row, key, fallback = "") {
  return row[key] ?? fallback;
}

// src/server/databricks/aiSearch.ts
function snippet(text, max = 260) {
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}\u2026`;
}
function appliesToTest(doc, testType) {
  if (!testType) return false;
  return doc.appliesTo === "all" || doc.appliesTo.includes(testType);
}
function scoreDoc(doc, terms, testType) {
  const haystack = `${doc.title} ${doc.text} ${doc.tags.join(" ")}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (term.length >= 3 && haystack.includes(term)) score += 1;
  }
  if (appliesToTest(doc, testType)) score += 3;
  return score;
}
function localSearch(query, testType, limit) {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
  const scored = GUIDANCE_DOCS.map((doc) => ({
    doc,
    score: scoreDoc(doc, terms, testType)
  })).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  return scored.map(({ doc, score }) => ({
    guidanceId: doc.id,
    title: doc.title,
    sourceName: doc.sourceName,
    sourceUri: doc.sourceUri,
    snippet: snippet(doc.text),
    score
  }));
}
function resultFromVectorRow(row, index) {
  const [id, title, sourceName, sourceUri, content, score] = row;
  return {
    guidanceId: id ?? `vector-${index}`,
    title: title ?? "Databricks Vector Search result",
    sourceName: sourceName ?? "Unity Catalog Vector Search",
    sourceUri: sourceUri ?? "",
    snippet: snippet(content ?? ""),
    score: Number(score ?? 0)
  };
}
async function liveSearch(query, options, limit) {
  const index = config.databricks.aiSearchIndex;
  if (!index) {
    throw new ServiceUnavailableError(
      missingDatabricksDetail("Vector Search", "AI_SEARCH_INDEX_NAME")
    );
  }
  const filters = options.testType === void 0 ? void 0 : JSON.stringify({ applies_to: ["all", options.testType] });
  const response = await getWorkspaceClient().vectorSearchIndexes.queryIndex({
    index_name: index,
    columns: ["id", "title", "source_name", "source_uri", "content"],
    query_text: query,
    query_type: "HYBRID",
    filters_json: filters,
    num_results: limit
  });
  return (response.result?.data_array ?? []).map(resultFromVectorRow);
}
async function searchGuidance(query, options = {}) {
  const limit = options.limit ?? 4;
  if (!config.localSim) {
    const results2 = await liveSearch(query, options, limit);
    return { results: results2, fallback: false, source: "ai_search" };
  }
  const results = localSearch(query, options.testType, limit);
  return { results, fallback: true, source: "local_fallback" };
}
async function retrieveRagContext(query, options = {}) {
  const response = await searchGuidance(query, options);
  return {
    query,
    results: response.results,
    source: response.source === "ai_search" ? "vector_search" : "local_fallback",
    fallback: response.fallback
  };
}
function aiSearchCapability() {
  const index = config.databricks.aiSearchIndex;
  if (config.localSim) {
    return {
      service: "ai_search",
      status: "local_fallback",
      detail: "LOCAL_SIM=true; local keyword retrieval over seeded guidance corpus"
    };
  }
  if (!index) {
    return {
      service: "ai_search",
      status: "error",
      detail: missingDatabricksDetail("Vector Search", "AI_SEARCH_INDEX_NAME")
    };
  }
  return {
    service: "ai_search",
    status: "connected",
    detail: `Querying Databricks Vector Search index ${index}`
  };
}

// src/shared/schemas.ts
import { z } from "zod";
var isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected a YYYY-MM-DD date");
var dateOrDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Expected a valid date");
var createSignalSchema = z.object({
  systemId: z.string().min(1, "Select a water system"),
  signalType: z.string().min(1).max(60).default("field_test"),
  testType: z.enum(TEST_TYPES),
  resultValue: z.coerce.number().refine((value) => Number.isFinite(value), "Enter a numeric result"),
  unit: z.string().min(1, "Unit is required").max(20),
  kitId: z.string().max(60).optional().nullable(),
  kitExpiresAt: isoDate.optional().nullable(),
  locationLabel: z.string().max(200).optional().nullable(),
  notes: z.string().max(2e3).optional().nullable(),
  photoRef: z.string().max(300).optional().nullable(),
  submittedBy: z.string().min(1).max(120).optional()
});
var parsedSignalSchema = z.object({
  systemId: z.string().min(1),
  testType: z.enum(TEST_TYPES),
  resultValue: z.coerce.number().finite(),
  unit: z.string().min(1).max(20),
  severity: z.enum(SEVERITIES),
  contaminant: z.string().min(1).max(120),
  summary: z.string().min(1).max(600),
  uncertainty: z.enum(UNCERTAINTY_LEVELS),
  confidence: z.number().min(0).max(1),
  locationLabel: z.string().max(200).nullable().optional(),
  symptoms: z.array(z.string().min(1).max(80)).default([]),
  missingFields: z.array(z.string().min(1).max(80)).default([])
}).strict();
var voiceSignalSchema = z.object({
  mode: z.literal("voice").default("voice"),
  transcript: z.string().min(3).max(5e3),
  systemId: z.string().min(1).optional(),
  actor: z.string().min(1).max(120).default("citizen"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  h3Cell: z.string().min(1).max(32).optional(),
  photoRef: z.string().max(300).optional().nullable()
}).strict();
var signalIntakeSchema = z.union([
  createSignalSchema,
  voiceSignalSchema
]);
var upiCallbackSchema = z.object({
  transactionId: z.string().min(1).max(120).default(() => `upi-${Date.now()}`),
  memo: z.string().min(1).max(240).optional(),
  tn: z.string().min(1).max(240).optional(),
  amount: z.coerce.number().nonnegative().optional(),
  actor: z.string().min(1).max(120).default("upi-webhook")
}).strict().refine((value) => Boolean(value.memo ?? value.tn), {
  message: "memo or tn is required",
  path: ["memo"]
});
var contractorTaskDoneSchema = z.object({
  kind: z.literal("contractor_task_done"),
  clientId: z.string().min(1).max(120),
  taskId: z.string().min(1).max(120),
  actor: z.string().min(1).max(120).default("contractor"),
  notes: z.string().max(2e3).optional().nullable(),
  photoRef: z.string().max(300).optional().nullable(),
  completedAt: dateOrDateTime.optional()
}).strict();
var citizenReportSyncSchema = z.object({
  kind: z.literal("citizen_report"),
  clientId: z.string().min(1).max(120),
  transcript: z.string().min(3).max(5e3),
  systemId: z.string().min(1).optional(),
  actor: z.string().min(1).max(120).default("citizen"),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  h3Cell: z.string().min(1).max(32).optional()
}).strict();
var syncBatchSchema = z.object({
  batchId: z.string().min(1).max(120),
  source: z.enum(["citizen", "contractor"]).default("citizen"),
  items: z.array(
    z.discriminatedUnion("kind", [
      citizenReportSyncSchema,
      contractorTaskDoneSchema
    ])
  ).min(1).max(50)
}).strict();
var assignTaskSchema = z.object({
  owner: z.string().min(1).max(120),
  actor: z.string().min(1).max(120).default("provider")
}).strict();
var completeTaskSchema = z.object({
  actor: z.string().min(1).max(120).default("contractor"),
  notes: z.string().max(2e3).optional().nullable(),
  photoRef: z.string().max(300).optional().nullable()
}).strict();
var reviewCaseSchema = z.object({
  actor: z.string().min(1).max(120).default("provider"),
  severity: z.enum(SEVERITIES).optional(),
  recommendation: z.string().max(2e3).optional(),
  rationale: z.string().min(1).max(2e3),
  assignTo: z.string().min(1).max(120).optional()
}).strict();
var h3MapQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  limit: z.coerce.number().int().min(1).max(250).default(80)
}).strict();
var analyzeSchema = z.object({
  actor: z.string().min(1).max(120).optional()
}).default({});
var approveSchema = z.object({
  approver: z.string().min(1, "Approver name is required").max(120),
  rationale: z.string().min(1, "A rationale is required").max(2e3)
});
var overrideSchema = z.object({
  approver: z.string().min(1, "Approver name is required").max(120),
  rationale: z.string().min(1, "An override rationale is required").max(2e3),
  replacementAction: z.string().min(1, "A replacement action is required").max(2e3)
});
var requestMoreEvidenceSchema = z.object({
  approver: z.string().min(1).max(120).optional(),
  requestedEvidence: z.string().min(1, "Describe the evidence you need").max(2e3),
  owner: z.string().min(1, "Assign an owner").max(120),
  dueAt: dateOrDateTime
});
var demoResetSchema = z.object({
  scenario: z.string().min(1).max(120).optional(),
  seed: z.coerce.number().int().optional(),
  focusScenario: z.enum(SCENARIO_IDS).optional()
}).default({});

// src/server/databricks/modelServing.ts
import { z as z2 } from "zod";

// src/agents/safety.ts
var SAFETY_DISCLAIMER = "Advisory only. Neelu does not certify legal or regulatory compliance and sends no notifications. A human must review and approve any public-health action.";
var HUMAN_APPROVAL_STATEMENT = "Human approval is required before any action is taken.";
var FORBIDDEN_COMPLIANCE_PATTERNS = [
  /certif\w*\s+complian/iu,
  /compliance\s+certif/iu,
  /legally\s+complian/iu,
  /guarantee[sd]?\s+complian/iu,
  /meets\s+all\s+(regulations|requirements)/iu,
  /officially\s+(safe|compliant)/iu
];
function containsComplianceClaim(text) {
  return FORBIDDEN_COMPLIANCE_PATTERNS.some((pattern) => pattern.test(text));
}
function checkFindingSafety(input) {
  const violations = [];
  if (input.citations.length === 0) {
    violations.push("Finding has no supporting citations.");
  }
  if (!input.recommendation.includes(HUMAN_APPROVAL_STATEMENT)) {
    violations.push("Recommendation does not state human approval is required.");
  }
  const combined = `${input.findingText} ${input.recommendation}`;
  if (containsComplianceClaim(combined)) {
    violations.push("Finding contains a prohibited compliance certification claim.");
  }
  return { ok: violations.length === 0, violations };
}
function withApprovalStatement(recommendation) {
  if (recommendation.includes(HUMAN_APPROVAL_STATEMENT)) return recommendation;
  const trimmed = recommendation.trim();
  const sep = trimmed.endsWith(".") ? " " : ". ";
  return `${trimmed}${sep}${HUMAN_APPROVAL_STATEMENT}`;
}

// src/agents/prompts.ts
var SYSTEM_PROMPT = `You are Neelu, a cautious water-quality analysis assistant.
Rules you must always follow:
- ${SAFETY_DISCLAIMER}
- ${HUMAN_APPROVAL_STATEMENT}
- Every claim must cite one of the provided guidance snippets, or be explicitly marked as unsupported.
- Always flag uncertainty for field-kit results and recommend confirmatory laboratory sampling.
- Never state that water is safe/unsafe as a legal determination and never certify compliance.
Return strict JSON: { "classification": string, "recommendation": string, "severity": "low|moderate|high|urgent", "uncertainty": "low|medium|high", "confidence": number }`;

// src/server/databricks/modelServing.ts
var modelFindingSchema = z2.object({
  classification: z2.string().min(1),
  recommendation: z2.string().min(1),
  severity: z2.enum(["low", "moderate", "high", "urgent"]),
  uncertainty: z2.enum(["low", "medium", "high"]),
  confidence: z2.number().min(0).max(1)
}).strict();
var providerInsightSchema = z2.object({
  headline: z2.string().min(1),
  summary: z2.string().min(1),
  recommendedActions: z2.array(z2.string().min(1)).min(2).max(6),
  watchlistDistricts: z2.array(z2.string().min(1)).min(1).max(8)
}).strict();
var KEYWORDS = [
  { testType: "arsenic", terms: ["arsenic"] },
  {
    testType: "total_coliform",
    terms: ["coliform", "e coli", "e. coli", "diarrhea", "stomach"]
  },
  { testType: "nitrate", terms: ["nitrate", "fertilizer", "blue baby"] },
  { testType: "turbidity", terms: ["turbid", "cloudy", "muddy", "brown"] },
  { testType: "free_chlorine", terms: ["chlorine", "bleach", "smell"] },
  { testType: "ph", terms: ["ph", "acidic", "bitter"] }
];
function severityFor(testType, transcript) {
  const urgentWords = [
    "urgent",
    "hospital",
    "vomit",
    "infant",
    "children",
    "skin lesions"
  ];
  if (urgentWords.some((term) => transcript.includes(term))) return "urgent";
  return CONTAMINANT_THRESHOLDS[testType].severityWhenExceeded;
}
function pickTestType(transcript) {
  const normalized = transcript.toLowerCase();
  return KEYWORDS.find(
    (entry) => entry.terms.some((term) => normalized.includes(term))
  )?.testType ?? "total_coliform";
}
function symptomsFrom(transcript) {
  const normalized = transcript.toLowerCase();
  return [
    ["diarrhea", "diarrhea"],
    ["vomit", "vomiting"],
    ["skin", "skin lesions"],
    ["fever", "fever"],
    ["stomach", "stomach pain"]
  ].filter(([needle]) => normalized.includes(needle)).map(([, symptom]) => symptom);
}
function extractJsonObject(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return JSON.parse(trimmed);
  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/u);
  if (fenced) return JSON.parse(fenced[1]);
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
  throw new Error("Model response did not contain a JSON object");
}
async function queryChatJson(system, user) {
  const endpoint = config.databricks.modelEndpoint;
  if (!endpoint) {
    throw new ServiceUnavailableError(
      missingDatabricksDetail("Model Serving", "MODEL_ENDPOINT_NAME")
    );
  }
  const response = await getWorkspaceClient().servingEndpoints.query({
    name: endpoint,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0,
    max_tokens: 900
  });
  const content = response.choices?.[0]?.message?.content ?? response.choices?.[0]?.text ?? "";
  return extractJsonObject(content);
}
function parseSignalPrompt(request) {
  return [
    "Extract a structured water-quality citizen signal from this transcript.",
    "Return strict JSON only with this shape:",
    '{"systemId":"string","testType":"nitrate|total_coliform|turbidity|ph|arsenic|free_chlorine","resultValue":number,"unit":"string","severity":"low|moderate|high|urgent","contaminant":"string","summary":"string","uncertainty":"low|medium|high","confidence":number,"locationLabel":string|null,"symptoms":["string"],"missingFields":["string"]}',
    "If a field is missing, infer conservatively and list it in missingFields.",
    request.systemId ? `Known systemId: ${request.systemId}` : "Known systemId: unknown",
    request.contextSnippets?.length ? `RAG context:
${request.contextSnippets.join("\n---\n")}` : "RAG context: none",
    `Transcript: ${request.transcript}`
  ].join("\n");
}
async function parseSignalWithModel(request) {
  const transcript = request.transcript.toLowerCase();
  const testType = pickTestType(transcript);
  const threshold = CONTAMINANT_THRESHOLDS[testType];
  const hasNumber = request.transcript.match(/\b\d+(?:\.\d+)?\b/u);
  const resultValue = hasNumber ? Number(hasNumber[0]) : threshold.thresholdValue + 1;
  const parsed = parsedSignalSchema.parse({
    systemId: request.systemId ?? "sys-village",
    testType,
    resultValue,
    unit: threshold.unit,
    severity: severityFor(testType, transcript),
    contaminant: threshold.contaminant,
    summary: `Citizen voice report suggests ${threshold.contaminant}; provider review required before action.`,
    uncertainty: request.systemId ? "medium" : "high",
    confidence: request.systemId ? 0.74 : 0.52,
    locationLabel: request.systemId ? null : "citizen reported location",
    symptoms: symptomsFrom(transcript),
    missingFields: request.systemId ? [] : ["systemId"]
  });
  if (config.localSim) {
    return { available: true, parsed, source: "local_sim" };
  }
  try {
    const modelJson = await queryChatJson(
      "You are a cautious water-quality intake extraction model. Return JSON only.",
      parseSignalPrompt(request)
    );
    return {
      available: true,
      parsed: parsedSignalSchema.parse(modelJson),
      source: "model_serving"
    };
  } catch {
    return { available: true, parsed, source: "safety_net" };
  }
}
async function generateFindingWithModel(request) {
  if (config.localSim) {
    return {
      available: false,
      reason: "LOCAL_SIM=true; deterministic classifier is active"
    };
  }
  try {
    const modelJson = await queryChatJson(
      SYSTEM_PROMPT,
      [
        request.prompt,
        `Signal summary: ${request.signalSummary}`,
        "Guidance snippets:",
        request.guidanceSnippets.map((item, index) => `[${index + 1}] ${item}`).join("\n"),
        "Return the strict JSON object only."
      ].filter(Boolean).join("\n\n")
    );
    return {
      available: true,
      finding: modelFindingSchema.parse(modelJson)
    };
  } catch (error) {
    return {
      available: false,
      reason: error instanceof Error ? error.message : "Model Serving did not return a usable finding"
    };
  }
}
async function generateProviderInsightWithModel(dashboard, cases) {
  if (config.localSim) {
    return {
      headline: "Local simulation insight",
      summary: "LOCAL_SIM=true; provider insight generation is using the spoofed test path.",
      recommendedActions: [
        "Run the app with LOCAL_SIM=false to use Databricks Model Serving.",
        "Review urgent cases before assigning field follow-up."
      ],
      watchlistDistricts: dashboard.priorityGeographies.slice(0, 3).map((item) => item.districtName),
      modelEndpoint: "local_sim",
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  const endpoint = config.databricks.modelEndpoint;
  if (!endpoint) {
    throw new ServiceUnavailableError(
      missingDatabricksDetail("Model Serving", "MODEL_ENDPOINT_NAME")
    );
  }
  try {
    const modelJson = await queryChatJson(
      "You are a cautious provider operations insight agent for Neelu. Return JSON only. Do not make medical diagnoses or compliance determinations.",
      [
        "Create concise role-specific insights for a healthcare provider reviewing India water-risk and medical-access data.",
        'Return strict JSON: {"headline":"string","summary":"string","recommendedActions":["string"],"watchlistDistricts":["string"]}.',
        "Use only the supplied dashboard/case data. Mention human review where recommendations may affect people.",
        `Dashboard: ${JSON.stringify(dashboard).slice(0, 12e3)}`,
        `Open cases: ${JSON.stringify(cases.slice(0, 20)).slice(0, 6e3)}`
      ].join("\n\n")
    );
    const parsed = providerInsightSchema.parse(modelJson);
    return {
      ...parsed,
      modelEndpoint: endpoint,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (error) {
    return {
      headline: "AI insight unavailable",
      summary: error instanceof Error ? `Databricks Model Serving did not return an insight: ${error.message}` : "Databricks Model Serving did not return an insight.",
      recommendedActions: [
        "Use the ranked geographies and open cases while the endpoint is unavailable.",
        "Retry insight generation after the model endpoint is re-enabled."
      ],
      watchlistDistricts: dashboard.priorityGeographies.slice(0, 3).map((item) => item.districtName),
      modelEndpoint: endpoint,
      generatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
}
function modelCapability() {
  const endpoint = config.databricks.modelEndpoint;
  if (config.localSim) {
    return {
      service: "model_serving",
      status: "local_fallback",
      detail: "LOCAL_SIM=true; deterministic rule-based finding is active"
    };
  }
  if (!endpoint) {
    return {
      service: "model_serving",
      status: "error",
      detail: missingDatabricksDetail("Model Serving", "MODEL_ENDPOINT_NAME")
    };
  }
  return {
    service: "model_serving",
    status: "connected",
    detail: `Querying Databricks Model Serving endpoint ${endpoint}`
  };
}

// src/server/databricks/mlflow.ts
function newTraceId() {
  return newId("trace").toLowerCase();
}
async function getOrCreateExperimentId(name) {
  const experiments = getWorkspaceClient().experiments;
  try {
    const existing = await experiments.getByName({ experiment_name: name });
    if (existing.experiment?.experiment_id) return existing.experiment.experiment_id;
  } catch {
  }
  const created = await experiments.createExperiment({ name });
  if (!created.experiment_id) {
    throw new ServiceUnavailableError(
      `MLflow experiment ${name} could not be created or resolved`
    );
  }
  return created.experiment_id;
}
async function logTrace(trace) {
  if (config.localSim) return { source: "local_fallback" };
  const experimentName = config.databricks.mlflowExperiment;
  if (!experimentName) {
    throw new ServiceUnavailableError(
      missingDatabricksDetail("MLflow", "MLFLOW_EXPERIMENT_NAME")
    );
  }
  const experiments = getWorkspaceClient().experiments;
  const experimentId = await getOrCreateExperimentId(experimentName);
  const startedAt = new Date(trace.createdAt).getTime();
  const run = await experiments.createRun({
    experiment_id: experimentId,
    run_name: `neelu-${trace.caseId}-${trace.traceId}`,
    start_time: Number.isFinite(startedAt) ? startedAt : Date.now(),
    tags: [
      { key: "neelu.trace_id", value: trace.traceId },
      { key: "neelu.case_id", value: trace.caseId },
      { key: "neelu.source", value: "databricks-app" }
    ]
  });
  const runId = run.run?.info?.run_id;
  if (!runId) throw new ServiceUnavailableError("MLflow did not return a run_id");
  const timestamp = Date.now();
  await experiments.logBatch({
    run_id: runId,
    params: [
      { key: "case_id", value: trace.caseId },
      { key: "trace_id", value: trace.traceId }
    ],
    metrics: [
      {
        key: "tool_calls",
        value: trace.toolCalls.length,
        timestamp,
        step: 0
      },
      {
        key: "retrieved_guidance_count",
        value: trace.retrievedGuidanceCount,
        timestamp,
        step: 0
      },
      {
        key: "citations_used",
        value: trace.citationsUsed,
        timestamp,
        step: 0
      },
      ...trace.evalResults.map((result2, index) => ({
        key: `eval_${result2.scorer}`,
        value: result2.passed ? 1 : 0,
        timestamp,
        step: index
      }))
    ],
    tags: trace.toolCalls.slice(0, 20).map((toolCall, index) => ({
      key: `neelu.tool.${index}`,
      value: `${toolCall.tool}:${toolCall.fallback ? "fallback" : "live"}`
    }))
  });
  await experiments.updateRun({
    run_id: runId,
    status: "FINISHED",
    end_time: Date.now()
  });
  return { source: "mlflow" };
}
function mlflowCapability() {
  const experiment = config.databricks.mlflowExperiment;
  if (config.localSim) {
    return {
      service: "mlflow",
      status: "local_fallback",
      detail: "LOCAL_SIM=true; local in-app trace and eval are active"
    };
  }
  if (!experiment) {
    return {
      service: "mlflow",
      status: "error",
      detail: missingDatabricksDetail("MLflow", "MLFLOW_EXPERIMENT_NAME")
    };
  }
  return {
    service: "mlflow",
    status: "connected",
    detail: `Logging traces and eval metrics to MLflow experiment ${experiment}`
  };
}

// src/server/databricks/unityCatalog.ts
import { cellToBoundary, latLngToCell as latLngToCell2 } from "h3-js";
function cleanScore(value) {
  return Number(Math.min(1, Math.max(0, value)).toFixed(3));
}
function qualityFromScore(score) {
  if (score >= 0.7) return "contaminated";
  if (score >= 0.35) return "caution";
  return "clean";
}
async function lookupSiteProfile(db, systemId) {
  const system = await getSystem(db, systemId);
  if (!system) return null;
  if (!config.localSim) {
    const hasCoords = system.latitude != null && system.longitude != null;
    const orderBy = hasCoords ? `pow(centroid_latitude - ${system.latitude}, 2)
             + pow(centroid_longitude - ${system.longitude}, 2) ASC,
        priority_rank ASC` : "priority_rank ASC";
    const rows = await runSqlRows(
      `
      SELECT
        state_name,
        district_name,
        priority_rank,
        neelu_priority_score,
        water_burden_score,
        medical_desert_score,
        dominant_quality_parameter,
        affected_habitation_count,
        facility_count,
        hospital_count,
        priority_reason
      FROM ${tableName("app_priority_geographies")}
      WHERE centroid_latitude IS NOT NULL
        AND centroid_longitude IS NOT NULL
      ORDER BY ${orderBy}
      LIMIT 1
      `,
      { rowLimit: 1 }
    );
    const row = rows[0];
    if (row) {
      const district = stringValue(row, "district_name", "Unknown district");
      const state = stringValue(row, "state_name", "Unknown state");
      const contaminant = stringValue(
        row,
        "dominant_quality_parameter",
        "water quality issue"
      );
      const riskNotes2 = [
        `${district}, ${state} is ranked #${numberValue(row, "priority_rank")} in the Unity Catalog priority geography table.`,
        `Priority score ${cleanScore(numberValue(row, "neelu_priority_score"))}; water burden ${cleanScore(numberValue(row, "water_burden_score"))}; medical desert score ${cleanScore(numberValue(row, "medical_desert_score"))}.`,
        `Dominant parameter: ${contaminant}; affected habitations ${numberValue(row, "affected_habitation_count")}; facilities ${numberValue(row, "facility_count")}; hospitals ${numberValue(row, "hospital_count")}.`,
        stringValue(row, "priority_reason", "")
      ].filter(Boolean).join(" ");
      return { system, riskNotes: riskNotes2, source: "unity_catalog" };
    }
  }
  const seed = SYSTEMS.find((entry) => entry.systemId === systemId);
  const riskNotes = seed?.riskNotes ?? "No additional risk profile on file for this system.";
  return { system, riskNotes, source: "local_fallback" };
}
async function getH3MapFromUnityCatalog(limit = 80) {
  const rows = await runSqlRows(
    `
    SELECT
      state_name,
      district_name,
      centroid_latitude,
      centroid_longitude,
      water_burden_score,
      medical_desert_score,
      neelu_priority_score,
      data_completeness_score,
      affected_habitation_count,
      facility_count
    FROM ${tableName("app_priority_geographies")}
    WHERE centroid_latitude IS NOT NULL
      AND centroid_longitude IS NOT NULL
    ORDER BY priority_rank ASC
    LIMIT ${Math.max(1, Math.min(250, limit))}
    `,
    { rowLimit: Math.max(1, Math.min(250, limit)) }
  );
  return {
    cells: rows.map((row) => {
      const latitude = numberValue(row, "centroid_latitude");
      const longitude = numberValue(row, "centroid_longitude");
      const h3Cell = latLngToCell2(latitude, longitude, 8);
      const waterContaminationScore = cleanScore(
        numberValue(row, "water_burden_score", numberValue(row, "neelu_priority_score"))
      );
      const medicalDesertScore2 = cleanScore(numberValue(row, "medical_desert_score"));
      const vulnerabilityIndex = cleanScore(
        waterContaminationScore * medicalDesertScore2
      );
      return {
        h3Cell,
        boundary: cellToBoundary(h3Cell).map(
          ([lat, lng]) => [lat, lng]
        ),
        center: { latitude, longitude },
        quality: qualityFromScore(waterContaminationScore),
        waterContaminationScore,
        medicalDesertScore: medicalDesertScore2,
        vulnerabilityIndex,
        waterPointCount: numberValue(row, "affected_habitation_count"),
        facilityCount: numberValue(row, "facility_count"),
        districtName: stringValue(row, "district_name", "Unknown district"),
        stateName: stringValue(row, "state_name", "Unknown state"),
        dataCompletenessScore: cleanScore(
          numberValue(row, "data_completeness_score", 1)
        )
      };
    }),
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: "databricks_tables"
  };
}
async function providerDashboardFromUnityCatalog() {
  const [metricRows, priorityRows, symptomRows, contaminantRows, facilityRows] = await Promise.all([
    runSqlRows(
      `
        SELECT
          count(*) AS districts_tracked,
          sum(affected_habitation_count) AS affected_habitations,
          sum(facility_count) AS facility_count,
          sum(hospital_count) AS hospital_count,
          avg(neelu_priority_score) AS priority_average,
          avg(water_burden_score) AS water_burden_average,
          avg(medical_desert_score) AS medical_desert_average,
          avg(data_completeness_score) AS data_completeness_average
        FROM ${tableName("app_priority_geographies")}
        `,
      { rowLimit: 1 }
    ),
    runSqlRows(
      `
      SELECT
        state_name,
        district_name,
        neelu_priority_score,
        normalized_priority_score,
        data_completeness_score,
        join_status,
        water_burden_score,
        medical_desert_score,
        affected_habitation_count,
        facility_count,
        hospital_count,
        dominant_quality_parameter
      FROM ${tableName("app_priority_geographies")}
      ORDER BY priority_rank ASC
      LIMIT 12
      `,
      { rowLimit: 12 }
    ),
    runSqlRows(
      `
      SELECT
        CASE
          WHEN lower(quality_parameter_key) LIKE '%arsenic%' THEN 'skin lesions'
          WHEN lower(quality_parameter_key) LIKE '%fluoride%' THEN 'joint pain'
          WHEN lower(quality_parameter_key) LIKE '%nitrate%' THEN 'infant illness'
          ELSE 'diarrhea'
        END AS symptom,
        coalesce(quality_parameter, quality_parameter_key) AS contaminant,
        count(*) AS reports,
        count(DISTINCT concat_ws('|', state_key, district_key)) AS verified_signals
      FROM ${tableName("app_water_quality_events")}
      WHERE quality_parameter_key IS NOT NULL
      GROUP BY symptom, contaminant
      ORDER BY reports DESC
      LIMIT 10
      `,
      { rowLimit: 10 }
    ),
    runSqlRows(
      `
      SELECT
        coalesce(quality_parameter, quality_parameter_key) AS contaminant,
        count(*) AS reports,
        count(DISTINCT concat_ws('|', state_key, district_key)) AS districts
      FROM ${tableName("app_water_quality_events")}
      WHERE quality_parameter_key IS NOT NULL
      GROUP BY contaminant
      ORDER BY reports DESC
      LIMIT 10
      `,
      { rowLimit: 10 }
    ),
    runSqlRows(
      `
      SELECT
        state_name,
        district_name,
        facility_count,
        hospital_count,
        medical_desert_score
      FROM ${tableName("app_priority_geographies")}
      WHERE facility_count IS NOT NULL
      ORDER BY medical_desert_score DESC, facility_count ASC
      LIMIT 10
      `,
      { rowLimit: 10 }
    )
  ]);
  const metrics = metricRows[0] ?? {};
  return {
    metrics: {
      districtsTracked: numberValue(metrics, "districts_tracked"),
      affectedHabitations: numberValue(metrics, "affected_habitations"),
      facilityCount: numberValue(metrics, "facility_count"),
      hospitalCount: numberValue(metrics, "hospital_count"),
      priorityAverage: cleanScore(numberValue(metrics, "priority_average")),
      waterBurdenAverage: cleanScore(numberValue(metrics, "water_burden_average")),
      medicalDesertAverage: cleanScore(
        numberValue(metrics, "medical_desert_average")
      ),
      dataCompletenessAverage: cleanScore(
        numberValue(metrics, "data_completeness_average", 1)
      )
    },
    priorityGeographies: priorityRows.map((row) => ({
      stateName: stringValue(row, "state_name", "Unknown state"),
      districtName: stringValue(row, "district_name", "Unknown district"),
      neeluPriorityScore: cleanScore(numberValue(row, "neelu_priority_score")),
      normalizedPriorityScore: cleanScore(
        numberValue(row, "normalized_priority_score")
      ),
      dataCompletenessScore: cleanScore(
        numberValue(row, "data_completeness_score", 1)
      ),
      joinStatus: stringValue(row, "join_status", "unknown"),
      waterBurdenScore: cleanScore(numberValue(row, "water_burden_score")),
      medicalDesertScore: cleanScore(numberValue(row, "medical_desert_score")),
      affectedHabitationCount: numberValue(row, "affected_habitation_count"),
      facilityCount: numberValue(row, "facility_count"),
      hospitalCount: numberValue(row, "hospital_count"),
      dominantQualityParameter: stringValue(
        row,
        "dominant_quality_parameter",
        "unknown"
      )
    })),
    symptomCorrelations: symptomRows.map((row) => ({
      symptom: stringValue(row, "symptom", "symptom report"),
      contaminant: stringValue(row, "contaminant", "water contaminant"),
      reports: numberValue(row, "reports"),
      verifiedSignals: numberValue(row, "verified_signals")
    })),
    contaminantBurden: contaminantRows.map((row) => ({
      contaminant: stringValue(row, "contaminant", "water contaminant"),
      reports: numberValue(row, "reports"),
      districts: numberValue(row, "districts")
    })),
    facilityAccess: facilityRows.map((row) => ({
      stateName: stringValue(row, "state_name", "Unknown state"),
      districtName: stringValue(row, "district_name", "Unknown district"),
      facilities: numberValue(row, "facility_count"),
      hospitals: numberValue(row, "hospital_count"),
      medicalDesertScore: cleanScore(numberValue(row, "medical_desert_score"))
    })),
    coverage: [
      {
        label: "Data completeness",
        value: cleanScore(numberValue(metrics, "data_completeness_average", 1))
      },
      {
        label: "Water burden",
        value: cleanScore(numberValue(metrics, "water_burden_average"))
      },
      {
        label: "Medical desert",
        value: cleanScore(numberValue(metrics, "medical_desert_average"))
      },
      {
        label: "Priority index",
        value: cleanScore(numberValue(metrics, "priority_average"))
      }
    ]
  };
}
function unityCatalogCapability() {
  const { ucCatalog, ucSchema, warehouseId } = config.databricks;
  if (config.localSim) {
    return {
      service: "unity_catalog",
      status: "local_fallback",
      detail: "LOCAL_SIM=true; using seeded source data"
    };
  }
  if (!warehouseId) {
    return {
      service: "unity_catalog",
      status: "error",
      detail: missingDatabricksDetail("Unity Catalog", "DATABRICKS_WAREHOUSE_ID")
    };
  }
  if (!ucCatalog || !ucSchema) {
    return {
      service: "unity_catalog",
      status: "error",
      detail: missingDatabricksDetail("Unity Catalog", "UC_CATALOG and UC_SCHEMA")
    };
  }
  return {
    service: "unity_catalog",
    status: "connected",
    detail: `Reading ${ucCatalog}.${ucSchema} through SQL warehouse ${warehouseId}`
  };
}

// src/server/databricks/capabilities.ts
function lakebaseCapability(db) {
  if (db.kind === "lakebase") {
    return {
      service: "lakebase",
      status: "connected",
      detail: "Connected to Lakebase via Databricks App postgres resource"
    };
  }
  if (db.kind === "postgres") {
    return {
      service: "lakebase",
      status: "connected",
      detail: "Connected to Postgres via DATABASE_URL (Lakebase or local Postgres)"
    };
  }
  return {
    service: "lakebase",
    status: "local_fallback",
    detail: "In-process PGlite Postgres (LOCAL_SIM)"
  };
}
async function probeCapabilities(db) {
  return [
    lakebaseCapability(db),
    unityCatalogCapability(),
    aiSearchCapability(),
    modelCapability(),
    mlflowCapability()
  ];
}

// src/server/databricks/secrets.ts
var GOOGLE_MAPS_RESOURCE_ENV = "google-maps-api-key";
var GOOGLE_MAPS_SECRET_SCOPE = process.env.GOOGLE_MAPS_SECRET_SCOPE ?? "neelu";
var GOOGLE_MAPS_SECRET_KEY = process.env.GOOGLE_MAPS_SECRET_KEY ?? "google-maps-api-key";
var cachedGoogleMapsApiKey;
function directGoogleMapsApiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_KEY ?? process.env[GOOGLE_MAPS_RESOURCE_ENV];
  return key?.trim() || void 0;
}
function decodeSecretValue(value) {
  if (!value) return null;
  const decoded = Buffer.from(value, "base64").toString("utf8").trim();
  return decoded || null;
}
async function getGoogleMapsApiKey() {
  if (cachedGoogleMapsApiKey !== void 0) return cachedGoogleMapsApiKey;
  const direct = directGoogleMapsApiKey();
  if (direct) {
    cachedGoogleMapsApiKey = direct;
    return cachedGoogleMapsApiKey;
  }
  if (config.localSim) {
    cachedGoogleMapsApiKey = null;
    return cachedGoogleMapsApiKey;
  }
  const secret = await getWorkspaceClient().secrets.getSecret({
    scope: GOOGLE_MAPS_SECRET_SCOPE,
    key: GOOGLE_MAPS_SECRET_KEY
  });
  cachedGoogleMapsApiKey = decodeSecretValue(secret.value);
  return cachedGoogleMapsApiKey;
}

// src/server/services/signals.ts
async function submitSignal(db, input) {
  const system = await getSystem(db, input.systemId);
  if (!system) {
    throw new NotFoundError(`System ${input.systemId} not found`);
  }
  const threshold = CONTAMINANT_THRESHOLDS[input.testType];
  const actor = input.submittedBy ?? DEFAULT_FIELD_ACTOR;
  const signal = await insertSignal(db, {
    systemId: input.systemId,
    signalType: input.signalType,
    testType: input.testType,
    resultValue: input.resultValue,
    unit: input.unit,
    thresholdValue: threshold.thresholdValue,
    thresholdUnit: threshold.thresholdUnit,
    kitId: input.kitId ?? null,
    kitExpiresAt: input.kitExpiresAt ?? null,
    locationLabel: input.locationLabel ?? null,
    notes: input.notes ?? null,
    photoRef: input.photoRef ?? null,
    synthetic: true,
    payloadJson: { ...input, receivedVia: "field-intake" }
  });
  await writeAuditEvent(db, {
    entityType: "signal",
    entityId: signal.signalId,
    actor,
    action: "signal_submitted",
    after: signal
  });
  return signal;
}

// src/server/services/notice.ts
function buildNotices(theCase, system) {
  if (!theCase.contaminant) return [];
  const severityLabel = theCase.severity ? SEVERITY_LABELS[theCase.severity] : "Under review";
  const contaminant = theCase.contaminant;
  const english = {
    language: "en",
    title: `DRAFT \u2014 Water quality advisory for ${system.name}`,
    body: [
      "[DRAFT \u2014 NOT FOR RELEASE]",
      "",
      `A field screening test at ${system.name} indicated a potential concern related to ${contaminant} (assessed severity: ${severityLabel}).`,
      "This result is provisional and is being confirmed with an accredited laboratory sample. Residents and facility staff may wish to follow precautionary guidance from local health authorities while confirmation is pending.",
      "",
      "This draft is advisory only. It is not an official notification, does not certify legal compliance, and must be reviewed and approved by an authorized public-health/regulatory official before any release."
    ].join("\n")
  };
  const hindi = {
    language: "hi",
    title: `\u092E\u0938\u094C\u0926\u093E \u2014 ${system.name} \u0915\u0947 \u0932\u093F\u090F \u091C\u0932 \u0917\u0941\u0923\u0935\u0924\u094D\u0924\u093E \u092A\u0930\u093E\u092E\u0930\u094D\u0936`,
    body: [
      "[\u092E\u0938\u094C\u0926\u093E \u2014 \u091C\u093E\u0930\u0940 \u0915\u0930\u0928\u0947 \u0915\u0947 \u0932\u093F\u090F \u0928\u0939\u0940\u0902]",
      "",
      `${system.name} \u092A\u0930 \u0915\u093F\u090F \u0917\u090F \u092B\u093C\u0940\u0932\u094D\u0921 \u092A\u0930\u0940\u0915\u094D\u0937\u0923 \u092E\u0947\u0902 ${contaminant} \u0938\u0947 \u0938\u0902\u092C\u0902\u0927\u093F\u0924 \u0938\u0902\u092D\u093E\u0935\u093F\u0924 \u091A\u093F\u0902\u0924\u093E \u0915\u093E \u0938\u0902\u0915\u0947\u0924 \u092E\u093F\u0932\u093E \u0939\u0948 (\u0906\u0915\u0932\u093F\u0924 \u0917\u0902\u092D\u0940\u0930\u0924\u093E: ${severityLabel})\u0964`,
      "\u092F\u0939 \u092A\u0930\u093F\u0923\u093E\u092E \u0905\u0928\u0902\u0924\u093F\u092E \u0939\u0948 \u0914\u0930 \u0907\u0938\u0915\u0940 \u092A\u0941\u0937\u094D\u091F\u093F \u092E\u093E\u0928\u094D\u092F\u0924\u093E \u092A\u094D\u0930\u093E\u092A\u094D\u0924 \u092A\u094D\u0930\u092F\u094B\u0917\u0936\u093E\u0932\u093E \u0928\u092E\u0942\u0928\u0947 \u0938\u0947 \u0915\u0940 \u091C\u093E \u0930\u0939\u0940 \u0939\u0948\u0964 \u092A\u0941\u0937\u094D\u091F\u093F \u0932\u0902\u092C\u093F\u0924 \u0930\u0939\u0928\u0947 \u0924\u0915 \u0928\u093F\u0935\u093E\u0938\u0940 \u0938\u094D\u0925\u093E\u0928\u0940\u092F \u0938\u094D\u0935\u093E\u0938\u094D\u0925\u094D\u092F \u0905\u0927\u093F\u0915\u093E\u0930\u093F\u092F\u094B\u0902 \u0915\u0947 \u090F\u0939\u0924\u093F\u092F\u093E\u0924\u0940 \u092E\u093E\u0930\u094D\u0917\u0926\u0930\u094D\u0936\u0928 \u0915\u093E \u092A\u093E\u0932\u0928 \u0915\u0930 \u0938\u0915\u0924\u0947 \u0939\u0948\u0902\u0964",
      "",
      "\u092F\u0939 \u092E\u0938\u094C\u0926\u093E \u0915\u0947\u0935\u0932 \u0938\u0932\u093E\u0939\u0915\u093E\u0930\u0940 \u0939\u0948\u0964 \u092F\u0939 \u0906\u0927\u093F\u0915\u093E\u0930\u093F\u0915 \u0905\u0927\u093F\u0938\u0942\u091A\u0928\u093E \u0928\u0939\u0940\u0902 \u0939\u0948, \u0915\u093F\u0938\u0940 \u0915\u093E\u0928\u0942\u0928\u0940 \u0905\u0928\u0941\u092A\u093E\u0932\u0928 \u0915\u094B \u092A\u094D\u0930\u092E\u093E\u0923\u093F\u0924 \u0928\u0939\u0940\u0902 \u0915\u0930\u0924\u093E, \u0914\u0930 \u091C\u093E\u0930\u0940 \u0915\u0930\u0928\u0947 \u0938\u0947 \u092A\u0939\u0932\u0947 \u0915\u093F\u0938\u0940 \u0905\u0927\u093F\u0915\u0943\u0924 \u0938\u093E\u0930\u094D\u0935\u091C\u0928\u093F\u0915-\u0938\u094D\u0935\u093E\u0938\u094D\u0925\u094D\u092F/\u0928\u093F\u092F\u093E\u092E\u0915 \u0905\u0927\u093F\u0915\u093E\u0930\u0940 \u0926\u094D\u0935\u093E\u0930\u093E \u0938\u092E\u0940\u0915\u094D\u0937\u093E \u090F\u0935\u0902 \u0905\u0928\u0941\u092E\u094B\u0926\u0928 \u0906\u0935\u0936\u094D\u092F\u0915 \u0939\u0948\u0964"
    ].join("\n")
  };
  return [english, hindi];
}

// src/evals/scorers.ts
var REQUIRED_TASKS = [
  {
    key: "confirmatory_sample",
    label: "Confirmatory lab sample",
    test: (t) => t.includes("confirmatory")
  },
  {
    key: "notify_supervisor",
    label: "Notify supervisor / program lead",
    test: (t) => t.includes("notify") || t.includes("supervisor")
  },
  {
    key: "review_notice",
    label: "Review public-health notice draft",
    test: (t) => t.includes("notice")
  },
  {
    key: "follow_up_sample",
    label: "Document follow-up sample",
    test: (t) => t.includes("follow-up") || t.includes("follow up")
  },
  {
    key: "record_decision",
    label: "Record final decision and rationale",
    test: (t) => t.includes("final decision") || t.includes("record")
  }
];
function result(scorer, passed, detail) {
  return { scorer, passed, detail };
}
function scoreHasCitations(detail) {
  const count = detail.finding?.citationsJson.length ?? 0;
  return result(
    "has_citations",
    count > 0,
    count > 0 ? `${count} citation(s) attached to the finding` : "No citations on finding"
  );
}
function scoreRequiresHumanApproval(detail) {
  const recommendation = detail.finding?.recommendation ?? "";
  const passed = recommendation.includes(HUMAN_APPROVAL_STATEMENT);
  return result(
    "requires_human_approval",
    passed,
    passed ? "Recommendation explicitly requires human approval" : "Recommendation is missing the human-approval requirement"
  );
}
function scoreFlagsUncertainty(detail) {
  const finding = detail.finding;
  const passed = Boolean(
    finding && finding.uncertainty && (finding.findingText ?? "").toLowerCase().includes("uncertainty")
  );
  return result(
    "flags_uncertainty",
    passed,
    passed ? `Uncertainty flagged as ${finding?.uncertainty}` : "Finding does not flag uncertainty"
  );
}
function scoreCreatesRequiredTasks(detail) {
  const titles = detail.tasks.map((t) => t.title.toLowerCase());
  const missing = REQUIRED_TASKS.filter(
    (req) => !titles.some((title) => req.test(title))
  );
  return result(
    "creates_required_tasks",
    missing.length === 0,
    missing.length === 0 ? `All ${REQUIRED_TASKS.length} required tasks present` : `Missing tasks: ${missing.map((m) => m.label).join(", ")}`
  );
}
function scoreNoComplianceClaim(detail) {
  const text = [
    detail.finding?.findingText ?? "",
    detail.finding?.recommendation ?? "",
    ...detail.notices.map((n) => n.body)
  ].join(" ");
  const passed = !containsComplianceClaim(text);
  return result(
    "no_certified_compliance_claim",
    passed,
    passed ? "No compliance-certification language detected" : "Prohibited compliance-certification language detected"
  );
}
function scoreWritesAuditEvents(audit) {
  const actions = new Set(audit.map((event) => event.action));
  const hasCore = actions.has("case_created") && actions.has("finding_generated");
  const passed = audit.length > 0 && hasCore;
  return result(
    "writes_audit_events",
    passed,
    passed ? `${audit.length} audit events incl. case_created + finding_generated` : "Missing required audit events"
  );
}
function runScorers(detail, audit) {
  const byName = {
    has_citations: scoreHasCitations(detail),
    requires_human_approval: scoreRequiresHumanApproval(detail),
    flags_uncertainty: scoreFlagsUncertainty(detail),
    creates_required_tasks: scoreCreatesRequiredTasks(detail),
    no_certified_compliance_claim: scoreNoComplianceClaim(detail),
    writes_audit_events: scoreWritesAuditEvents(audit)
  };
  return EVAL_SCORERS.map((name) => byName[name]);
}

// src/server/services/caseDetail.ts
function buildCaseTrace(detail, audit) {
  const guidanceCount = detail.evidence.filter(
    (item) => item.evidenceType === "guidance"
  ).length;
  const citationsUsed = detail.finding?.citationsJson.length ?? 0;
  const traceId = detail.finding?.traceId ?? "trace-unavailable";
  const databricksLive = !config.localSim;
  const toolCalls = [
    {
      tool: "lookup_site_profile",
      input: { system_id: detail.system.systemId },
      summary: `Loaded site profile for ${detail.system.name}`,
      fallback: !databricksLive,
      durationMs: 6
    },
    {
      tool: "search_guidance",
      input: { contaminant: detail.case.contaminant ?? "n/a" },
      summary: `Retrieved ${guidanceCount} guidance snippet(s)`,
      fallback: !databricksLive,
      durationMs: 21
    },
    {
      tool: "classify_signal",
      input: { signal_id: detail.signal.signalId },
      summary: `Classified severity=${detail.case.severity ?? "?"}, uncertainty=${detail.case.uncertainty ?? "?"}`,
      fallback: !databricksLive,
      durationMs: 12
    },
    {
      tool: "create_case",
      input: { signal_id: detail.signal.signalId },
      summary: `Created case ${detail.case.caseId}`,
      fallback: false,
      durationMs: 8
    },
    {
      tool: "attach_evidence",
      input: { case_id: detail.case.caseId },
      summary: `Attached ${detail.evidence.length} evidence item(s)`,
      fallback: false,
      durationMs: 9
    },
    {
      tool: "create_tasks",
      input: { case_id: detail.case.caseId },
      summary: `Created ${detail.tasks.length} task(s)`,
      fallback: false,
      durationMs: 7
    },
    {
      tool: "draft_notice",
      input: { case_id: detail.case.caseId },
      summary: `Drafted ${detail.notices.length} notice draft(s)`,
      fallback: false,
      durationMs: 5
    },
    {
      tool: "request_human_approval",
      input: { case_id: detail.case.caseId },
      summary: "Flagged case as awaiting human approval",
      fallback: false,
      durationMs: 3
    }
  ];
  return {
    traceId,
    caseId: detail.case.caseId,
    source: databricksLive ? "mlflow" : "local_fallback",
    toolCalls,
    retrievedGuidanceCount: guidanceCount,
    citationsUsed,
    evalResults: runScorers(detail, audit),
    createdAt: detail.finding?.createdAt ?? detail.case.createdAt
  };
}
async function getCaseDetail(db, caseId) {
  const theCase = await getCase(db, caseId);
  if (!theCase) return null;
  const [system, signal, evidence, finding, tasks, approvals, audit] = await Promise.all([
    getSystem(db, theCase.systemId),
    getSignal(db, theCase.signalId),
    listEvidence(db, caseId),
    getFindingForCase(db, caseId),
    listTasks(db, caseId),
    listApprovals(db, caseId),
    listCaseAudit(db, caseId)
  ]);
  if (!system || !signal) return null;
  const notices = buildNotices(theCase, system);
  const detail = {
    case: theCase,
    system,
    signal,
    evidence,
    finding,
    tasks,
    approvals,
    notices,
    trace: null,
    pendingApproval: theCase.status === "awaiting_approval",
    missingEvidence: evidence.length === 0
  };
  detail.trace = buildCaseTrace(detail, audit);
  return detail;
}
async function getCaseTrace(db, caseId) {
  const detail = await getCaseDetail(db, caseId);
  return detail?.trace ?? null;
}

// src/agents/fallbackFindings.ts
function isKitExpired(signal) {
  if (!signal.kitExpiresAt) return false;
  const expires = (/* @__PURE__ */ new Date(`${signal.kitExpiresAt}T23:59:59Z`)).getTime();
  const received = new Date(signal.receivedAt).getTime();
  return Number.isFinite(expires) && expires < received;
}
function mentionsMissingConfirmation(signal) {
  const notes = (signal.notes ?? "").toLowerCase();
  return notes.includes("no confirmatory") || notes.includes("not collected");
}
function evaluateExceedance(signal) {
  if (!signal.testType) return { exceeds: false, thresholdLabel: "n/a" };
  const threshold = CONTAMINANT_THRESHOLDS[signal.testType];
  const value = signal.resultValue ?? 0;
  let exceeds = false;
  if (threshold.direction === "above") exceeds = value > threshold.thresholdValue;
  else if (threshold.direction === "below") exceeds = value < threshold.thresholdValue;
  else exceeds = value >= 1;
  const thresholdLabel = `${threshold.thresholdValue} ${threshold.thresholdUnit}`;
  return { exceeds, thresholdLabel };
}
function citationsFromRetrieval(results) {
  return results.map((result2) => ({
    label: result2.sourceName,
    sourceName: result2.sourceName,
    sourceUri: result2.sourceUri,
    snippet: result2.snippet
  }));
}
function classifySignalDeterministic(signal, system, retrieval) {
  const testType = signal.testType ?? "nitrate";
  const threshold = CONTAMINANT_THRESHOLDS[testType];
  const { exceeds, thresholdLabel } = evaluateExceedance(signal);
  const value = signal.resultValue ?? 0;
  const unit = signal.unit ?? threshold.unit;
  const expired = isKitExpired(signal);
  const missingConfirmation = mentionsMissingConfirmation(signal);
  const severity = exceeds ? threshold.severityWhenExceeded : "low";
  let uncertainty = "medium";
  let uncertaintyReason = "Field-kit screening result; a confirmatory accredited laboratory sample is required before action.";
  if (expired) {
    uncertainty = "high";
    uncertaintyReason = "Test kit appears to be past its expiration date, which lowers confidence; a confirmatory laboratory sample is required.";
  } else if (missingConfirmation) {
    uncertainty = "high";
    uncertaintyReason = "No confirmatory microbiological/laboratory sample has been collected yet; result is provisional.";
  }
  const presence = threshold.direction === "presence";
  const measured = presence ? value >= 1 ? "a positive (presence) result" : "a negative (absence) result" : `${value} ${unit}`;
  const comparison = presence ? exceeds ? "indicates contamination" : "indicates no detection" : exceeds ? `exceeds the reference value of ${thresholdLabel}` : `is within the reference value of ${thresholdLabel}`;
  const findingText = `Field ${threshold.label} test at ${system.name} returned ${measured}, which ${comparison}. Severity assessed as ${severity}. Uncertainty (${uncertainty}): ${uncertaintyReason}`;
  const confidence = exceeds ? expired ? 0.5 : 0.7 : 0.6;
  let recommendation = exceeds ? `Treat as provisional and prioritize a confirmatory laboratory sample for ${threshold.contaminant}, notify the supervisor/program lead, and prepare (do not send) a public-health notice draft for review.` : `Document the result and continue routine monitoring; collect a confirmatory sample if conditions change.`;
  recommendation = withApprovalStatement(recommendation);
  let citations = citationsFromRetrieval(retrieval);
  if (citations.length === 0) {
    citations = [
      {
        label: threshold.label,
        sourceName: "Reference threshold",
        sourceUri: null,
        snippet: `Reference value for ${threshold.contaminant}: ${thresholdLabel}.`
      }
    ];
  }
  const summary = exceeds ? `${threshold.label} ${measured} at ${system.name} ${comparison}.` : `${threshold.label} within reference at ${system.name}.`;
  return {
    contaminant: threshold.contaminant,
    exceeds,
    severity,
    uncertainty,
    uncertaintyReason,
    findingText,
    recommendation,
    confidence,
    citations,
    summary,
    source: "deterministic"
  };
}

// src/agents/tools.ts
var AGENT_NAME = "neelu-water-agent";
async function toolLookupSiteProfile(ctx, systemId) {
  return lookupSiteProfile(ctx.db, systemId);
}
async function toolSearchGuidance(ctx, query, options) {
  void ctx;
  return searchGuidance(query, options);
}
async function toolClassifySignal(ctx, signal, system, retrieval) {
  void ctx;
  const deterministic = classifySignalDeterministic(
    signal,
    system,
    retrieval.results
  );
  const model = await generateFindingWithModel({
    prompt: "",
    signalSummary: deterministic.summary,
    guidanceSnippets: retrieval.results.map((r) => r.snippet)
  });
  const classification = model.available ? {
    ...deterministic,
    severity: model.finding.severity,
    uncertainty: model.finding.uncertainty,
    findingText: model.finding.classification,
    recommendation: model.finding.recommendation,
    confidence: model.finding.confidence,
    source: "model"
  } : deterministic;
  const safety = checkFindingSafety({
    findingText: classification.findingText,
    recommendation: classification.recommendation,
    uncertainty: classification.uncertainty,
    citations: classification.citations
  });
  if (!safety.ok) {
    return deterministic;
  }
  return classification;
}
async function toolCreateCase(ctx, signal, classification) {
  const created = await insertCase(ctx.db, {
    systemId: signal.systemId,
    signalId: signal.signalId,
    status: "new",
    severity: classification.severity,
    contaminant: classification.contaminant,
    summary: classification.summary,
    uncertainty: classification.uncertainty,
    assignedTo: "Operations"
  });
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: created.caseId,
    actor: ctx.actor,
    action: "case_created",
    after: created
  });
  return created;
}
async function toolCreateFinding(ctx, caseId, classification, traceId) {
  const finding = await insertFinding(ctx.db, {
    caseId,
    agentName: AGENT_NAME,
    findingType: "classification",
    findingText: classification.findingText,
    recommendation: classification.recommendation,
    uncertainty: classification.uncertainty,
    citations: classification.citations,
    confidence: classification.confidence,
    traceId
  });
  await writeAuditEvent(ctx.db, {
    entityType: "agent_finding",
    entityId: finding.findingId,
    actor: AGENT_NAME,
    action: "finding_generated",
    after: {
      findingId: finding.findingId,
      severity: classification.severity,
      uncertainty: classification.uncertainty,
      source: classification.source,
      citations: classification.citations.length
    }
  });
  return finding;
}
async function toolAttachEvidence(ctx, caseId, items) {
  const created = [];
  for (const item of items) {
    created.push(await insertEvidence(ctx.db, { ...item, caseId }));
  }
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: caseId,
    actor: AGENT_NAME,
    action: "evidence_attached",
    after: { count: created.length, types: created.map((e) => e.evidenceType) }
  });
  return created;
}
function toolDraftActionPlan(classification) {
  if (!classification.exceeds) {
    return [
      {
        title: "Document result and continue routine monitoring",
        description: "Log the within-reference result and keep the system on the routine monitoring schedule.",
        owner: "Field team",
        dueOffsetDays: 7
      },
      {
        title: "Record final decision and rationale",
        description: "Record the reviewer's decision and rationale for the case file.",
        owner: "Approver",
        dueOffsetDays: 7
      }
    ];
  }
  return [
    {
      title: "Request confirmatory laboratory sample",
      description: `Collect an accredited confirmatory laboratory sample for ${classification.contaminant} following chain-of-custody.`,
      owner: "Field team",
      dueOffsetDays: 2
    },
    {
      title: "Notify supervisor / program lead",
      description: "Notify the supervisor / program lead of the provisional exceedance for situational awareness.",
      owner: "Operations",
      dueOffsetDays: 1
    },
    {
      title: "Review public-health notice draft",
      description: "Review the DRAFT public-health notice. It must not be released without human/regulatory approval.",
      owner: "Public health officer",
      dueOffsetDays: 2
    },
    {
      title: "Document follow-up sample",
      description: "Record the follow-up/confirmatory sample result once available and update the case.",
      owner: "Field team",
      dueOffsetDays: 5
    },
    {
      title: "Record final decision and rationale",
      description: "Record the reviewer's final decision (approve/override) and rationale for the audit trail.",
      owner: "Approver",
      dueOffsetDays: 5
    }
  ];
}
function addDays(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1e3).toISOString();
}
async function toolCreateTasks(ctx, caseId, templates) {
  const created = [];
  for (const template of templates) {
    created.push(
      await insertTask(ctx.db, {
        caseId,
        title: template.title,
        description: template.description,
        owner: template.owner,
        status: "open",
        dueAt: addDays(template.dueOffsetDays)
      })
    );
  }
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: caseId,
    actor: AGENT_NAME,
    action: "tasks_created",
    after: { count: created.length, titles: created.map((t) => t.title) }
  });
  return created;
}
async function toolDraftNotice(ctx, caseId, languages) {
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: caseId,
    actor: AGENT_NAME,
    action: "notice_drafted",
    after: { languages, released: false }
  });
}
async function toolRequestHumanApproval(ctx, theCase) {
  const updated = await updateCase(ctx.db, theCase.caseId, {
    status: "awaiting_approval"
  });
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: AGENT_NAME,
    action: "status_changed",
    before: { status: theCase.status },
    after: { status: updated.status, requiresHumanApproval: true }
  });
  return updated;
}
async function toolRecordApproval(ctx, theCase, approver, decision, rationale, nextStatus) {
  const approval = await insertApproval(ctx.db, {
    caseId: theCase.caseId,
    approver,
    decision,
    rationale
  });
  await writeAuditEvent(ctx.db, {
    entityType: "approval",
    entityId: approval.approvalId,
    actor: approver,
    action: decision === "overridden" ? "override_recorded" : "approval_recorded",
    after: { decision, rationale }
  });
  const updated = await updateCase(ctx.db, theCase.caseId, {
    status: nextStatus
  });
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: approver,
    action: "status_changed",
    before: { status: theCase.status },
    after: { status: updated.status }
  });
  return { approval, updated };
}

// src/server/services/approvals.ts
var DECIDED_STATUSES = /* @__PURE__ */ new Set(["approved", "overridden", "closed"]);
async function loadDecidableCase(db, caseId) {
  const theCase = await getCase(db, caseId);
  if (!theCase) throw new NotFoundError(`Case ${caseId} not found`);
  if (DECIDED_STATUSES.has(theCase.status)) {
    throw new ConflictError(
      `Case ${caseId} is already ${theCase.status}; reopen is not supported in this demo.`
    );
  }
  return theCase;
}
async function approveCase(db, caseId, input) {
  const theCase = await loadDecidableCase(db, caseId);
  const ctx = { db, actor: input.approver };
  await toolRecordApproval(
    ctx,
    theCase,
    input.approver,
    "approved",
    input.rationale,
    "approved"
  );
  const detail = await getCaseDetail(db, caseId);
  if (!detail) throw new NotFoundError(`Case ${caseId} not found`);
  return detail;
}
async function overrideCase(db, caseId, input) {
  const theCase = await loadDecidableCase(db, caseId);
  const ctx = { db, actor: input.approver };
  const rationale = `${input.rationale}

Replacement action: ${input.replacementAction}`;
  await toolRecordApproval(
    ctx,
    theCase,
    input.approver,
    "overridden",
    rationale,
    "overridden"
  );
  const task = await insertTask(db, {
    caseId,
    title: "Carry out override replacement action",
    description: input.replacementAction,
    owner: input.approver,
    status: "open",
    dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1e3).toISOString()
  });
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: input.approver,
    action: "tasks_created",
    after: { title: task.title, replacementAction: input.replacementAction }
  });
  const detail = await getCaseDetail(db, caseId);
  if (!detail) throw new NotFoundError(`Case ${caseId} not found`);
  return detail;
}
async function requestMoreEvidence(db, caseId, input) {
  const theCase = await getCase(db, caseId);
  if (!theCase) throw new NotFoundError(`Case ${caseId} not found`);
  if (DECIDED_STATUSES.has(theCase.status)) {
    throw new ConflictError(`Case ${caseId} is already ${theCase.status}.`);
  }
  const dueIso = new Date(input.dueAt);
  if (Number.isNaN(dueIso.getTime())) {
    throw new BadRequestError("Invalid due date");
  }
  const approver = input.approver ?? DEFAULT_OPS_ACTOR;
  const approval = await insertApproval(db, {
    caseId,
    approver,
    decision: "more_evidence_requested",
    rationale: input.requestedEvidence
  });
  await writeAuditEvent(db, {
    entityType: "approval",
    entityId: approval.approvalId,
    actor: approver,
    action: "evidence_requested",
    after: {
      requestedEvidence: input.requestedEvidence,
      owner: input.owner,
      dueAt: dueIso.toISOString()
    }
  });
  const task = await insertTask(db, {
    caseId,
    title: "Provide requested evidence",
    description: input.requestedEvidence,
    owner: input.owner,
    status: "open",
    dueAt: dueIso.toISOString()
  });
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: approver,
    action: "tasks_created",
    after: { title: task.title, owner: input.owner }
  });
  const updated = await updateCase(db, caseId, { status: "needs_more_evidence" });
  await writeAuditEvent(db, {
    entityType: "case",
    entityId: caseId,
    actor: approver,
    action: "status_changed",
    before: { status: theCase.status },
    after: { status: updated.status }
  });
  const detail = await getCaseDetail(db, caseId);
  if (!detail) throw new NotFoundError(`Case ${caseId} not found`);
  return detail;
}

// src/agents/orchestrator.ts
function buildGuidanceQuery(signal) {
  const contaminant = signal.testType ? CONTAMINANT_THRESHOLDS[signal.testType].contaminant : "water quality";
  return `${contaminant} ${signal.testType ?? ""} drinking water guidance ${signal.notes ?? ""}`.trim();
}
async function runFullAnalysis(ctx, signal, system, existingCase) {
  const siteProfile = await toolLookupSiteProfile(ctx, system.systemId);
  const retrieval = await toolSearchGuidance(ctx, buildGuidanceQuery(signal), {
    testType: signal.testType ?? void 0
  });
  const classification = await toolClassifySignal(ctx, signal, system, retrieval);
  const theCaseInitial = existingCase ?? await toolCreateCase(ctx, signal, classification);
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: theCaseInitial.caseId,
    actor: ctx.actor,
    action: "guidance_retrieved",
    after: {
      count: retrieval.results.length,
      source: retrieval.source,
      fallback: retrieval.fallback,
      ids: retrieval.results.map((r) => r.guidanceId)
    }
  });
  const traceId = newTraceId();
  await toolCreateFinding(ctx, theCaseInitial.caseId, classification, traceId);
  const evidence = [];
  evidence.push({
    evidenceType: "field_result",
    title: `Field ${signal.testType ?? "test"} result`,
    body: `${signal.resultValue ?? "?"} ${signal.unit ?? ""} measured with kit ${signal.kitId ?? "unknown"} (received ${signal.receivedAt.slice(0, 10)}).`,
    sourceName: `Field test kit ${signal.kitId ?? ""}`.trim(),
    sourceUri: null,
    citationText: `Field-measured ${classification.contaminant}: ${signal.resultValue ?? "?"} ${signal.unit ?? ""}`,
    confidence: classification.confidence
  });
  if (siteProfile) {
    evidence.push({
      evidenceType: "site_profile",
      title: `Site profile: ${siteProfile.system.name}`,
      body: `${siteProfile.riskNotes} Serves ${siteProfile.system.populationServed ?? "?"} people; source: ${siteProfile.system.sourceWaterType ?? "unknown"}.`,
      sourceName: "Unity Catalog (seeded site profile)",
      sourceUri: null,
      citationText: `${siteProfile.system.name}, ${siteProfile.system.region ?? ""}`,
      confidence: 0.9
    });
  }
  retrieval.results.forEach((r, index) => {
    evidence.push({
      evidenceType: "guidance",
      title: r.title,
      body: r.snippet,
      sourceName: r.sourceName,
      sourceUri: r.sourceUri,
      citationText: r.snippet,
      confidence: Math.min(0.95, 0.6 + (retrieval.results.length - index) * 0.05)
    });
  });
  await toolAttachEvidence(ctx, theCaseInitial.caseId, evidence);
  const plan = toolDraftActionPlan(classification);
  await toolCreateTasks(ctx, theCaseInitial.caseId, plan);
  await toolDraftNotice(ctx, theCaseInitial.caseId, ["en", "hi"]);
  const theCase = await toolRequestHumanApproval(ctx, theCaseInitial);
  const detail = await getCaseDetail(ctx.db, theCase.caseId);
  if (detail?.trace) await logTrace(detail.trace);
  return theCase;
}
async function analyzeSignal(db, signalId, actor) {
  const signal = await getSignal(db, signalId);
  if (!signal) throw new NotFoundError(`Signal ${signalId} not found`);
  const existing = await getCaseBySignal(db, signalId);
  if (existing) {
    const detail2 = await getCaseDetail(db, existing.caseId);
    if (!detail2) throw new NotFoundError(`Case ${existing.caseId} not found`);
    return detail2;
  }
  const system = await getSystem(db, signal.systemId);
  if (!system) throw new NotFoundError(`System ${signal.systemId} not found`);
  const theCase = await runFullAnalysis({ db, actor }, signal, system);
  const detail = await getCaseDetail(db, theCase.caseId);
  if (!detail) throw new NotFoundError(`Case ${theCase.caseId} not found`);
  return detail;
}
async function analyzeCase(db, caseId, actor) {
  const theCase = await getCase(db, caseId);
  if (!theCase) throw new NotFoundError(`Case ${caseId} not found`);
  const finding = await getFindingForCase(db, caseId);
  if (!finding) {
    const signal = await getSignal(db, theCase.signalId);
    const system = await getSystem(db, theCase.systemId);
    if (signal && system) {
      await runFullAnalysis({ db, actor }, signal, system, theCase);
    }
  }
  const detail = await getCaseDetail(db, caseId);
  if (!detail) throw new NotFoundError(`Case ${caseId} not found`);
  return detail;
}

// src/server/services/mobileWorkflows.ts
import { cellToBoundary as cellToBoundary2, cellToLatLng, latLngToCell as latLngToCell3 } from "h3-js";
var QUALITY_SCORE = {
  clean: 0.15,
  caution: 0.55,
  contaminated: 0.95
};
var providerDashboardCache = null;
var PROVIDER_DASHBOARD_CACHE_MS = 6e4;
function isVoiceInput(input) {
  return typeof input === "object" && input !== null && "transcript" in input && (!("testType" in input) || input.mode === "voice");
}
function memoParts(memo) {
  const match = memo.match(
    /^SYS_([A-Za-z0-9-]+)_REPORT_(LOW|MODERATE|HIGH|URGENT)$/u
  );
  if (!match) {
    throw new BadRequestError(
      "UPI transaction memo must match SYS_[SYSTEM_ID]_REPORT_[SEVERITY]"
    );
  }
  return {
    systemId: match[1],
    severity: match[2].toLowerCase()
  };
}
async function submitVoiceSignal(db, input) {
  const rag = await retrieveRagContext(input.transcript, { limit: 4 });
  const parsedResult = await parseSignalWithModel({
    transcript: input.transcript,
    systemId: input.systemId,
    contextSnippets: rag.results.map((result2) => result2.snippet)
  });
  if (!parsedResult.available) {
    throw new BadRequestError(parsedResult.reason);
  }
  const parsed = parsedResult.parsed;
  const system = await getSystem(db, parsed.systemId);
  if (!system) throw new NotFoundError(`System ${parsed.systemId} not found`);
  const threshold = CONTAMINANT_THRESHOLDS[parsed.testType];
  const signal = await insertSignal(db, {
    systemId: parsed.systemId,
    signalType: "voice_report",
    testType: parsed.testType,
    resultValue: parsed.resultValue,
    unit: parsed.unit,
    thresholdValue: threshold.thresholdValue,
    thresholdUnit: threshold.thresholdUnit,
    locationLabel: parsed.locationLabel ?? input.h3Cell ?? null,
    notes: input.transcript,
    photoRef: input.photoRef ?? null,
    synthetic: true,
    payloadJson: {
      receivedVia: "citizen-voice",
      parsed,
      rag,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      h3Cell: input.h3Cell ?? (input.latitude != null && input.longitude != null ? latLngToCell3(input.latitude, input.longitude, 8) : null)
    }
  });
  await writeAuditEvent(db, {
    entityType: "signal",
    entityId: signal.signalId,
    actor: input.actor,
    action: "signal_submitted",
    after: signal
  });
  await writeAuditEvent(db, {
    entityType: "signal",
    entityId: signal.signalId,
    actor: "voice-extraction-agent",
    action: "voice_signal_parsed",
    after: parsed
  });
  const theCase = await insertCase(db, {
    systemId: parsed.systemId,
    signalId: signal.signalId,
    status: "awaiting_approval",
    severity: parsed.severity,
    contaminant: parsed.contaminant,
    summary: parsed.summary,
    uncertainty: parsed.uncertainty
  });
  await writeAuditEvent(db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: "voice-extraction-agent",
    action: "case_created",
    after: theCase
  });
  const task = await insertTask(db, {
    caseId: theCase.caseId,
    title: `Inspect ${system.name}`,
    description: [
      `Citizen voice report: ${parsed.summary}`,
      parsed.symptoms.length ? `Reported symptoms: ${parsed.symptoms.join(", ")}` : null,
      `Suspected issue: ${parsed.contaminant}`
    ].filter(Boolean).join("\n"),
    owner: "contractor-triage",
    status: "open"
  });
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: "voice-extraction-agent",
    action: "tasks_created",
    after: task
  });
  await insertEvidence(db, {
    caseId: theCase.caseId,
    evidenceType: "voice_note",
    title: "Citizen voice transcript",
    body: input.transcript,
    sourceName: "Citizen mobile portal",
    confidence: parsed.confidence
  });
  await writeAuditEvent(db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: "vector-search-rag",
    action: "guidance_retrieved",
    after: rag
  });
  const detail = await getCaseDetail(db, theCase.caseId);
  if (!detail) throw new NotFoundError(`Case ${theCase.caseId} not found`);
  return detail;
}
async function handleUpiCallback(db, input) {
  const memo = input.memo ?? input.tn ?? "";
  const parsed = memoParts(memo);
  const system = await getSystem(db, parsed.systemId);
  if (!system) throw new NotFoundError(`System ${parsed.systemId} not found`);
  const threshold = CONTAMINANT_THRESHOLDS.total_coliform;
  const signal = await insertSignal(db, {
    systemId: parsed.systemId,
    signalType: "upi_report",
    testType: "total_coliform",
    resultValue: 1,
    unit: threshold.unit,
    thresholdValue: threshold.thresholdValue,
    thresholdUnit: threshold.thresholdUnit,
    notes: `UPI scan-to-report memo: ${memo}`,
    synthetic: true,
    payloadJson: {
      transactionId: input.transactionId,
      memo,
      amount: input.amount ?? null
    }
  });
  const theCase = await insertCase(db, {
    systemId: parsed.systemId,
    signalId: signal.signalId,
    status: "awaiting_approval",
    severity: parsed.severity,
    contaminant: "unverified citizen water quality report",
    summary: `UPI scan-to-report created a ${parsed.severity} review case for ${system.name}.`,
    uncertainty: "high"
  });
  const task = await insertTask(db, {
    caseId: theCase.caseId,
    title: `Inspect ${system.name}`,
    description: "Physical fountain QR scan opened an unverified citizen water-quality issue. Inspect the point, capture a field note, and route findings to provider review.",
    owner: "contractor-triage",
    status: "open"
  });
  await writeAuditEvent(db, {
    entityType: "signal",
    entityId: signal.signalId,
    actor: input.actor,
    action: "upi_callback_received",
    after: {
      transactionId: input.transactionId,
      memo,
      signalId: signal.signalId
    }
  });
  await writeAuditEvent(db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: input.actor,
    action: "case_created",
    after: theCase
  });
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: input.actor,
    action: "tasks_created",
    after: task
  });
  return {
    transactionId: input.transactionId,
    systemId: parsed.systemId,
    severity: parsed.severity,
    caseId: theCase.caseId,
    signalId: signal.signalId
  };
}
async function contractorQueue(db) {
  return listContractorQueue(db);
}
async function completeTask(db, taskId, input) {
  const beforeTask = await getTask(db, taskId);
  if (!beforeTask) throw new NotFoundError(`Task ${taskId} not found`);
  const beforeCase = await getCase(db, beforeTask.caseId);
  if (!beforeCase)
    throw new NotFoundError(`Case ${beforeTask.caseId} not found`);
  const task = await updateTask(db, taskId, {
    status: "done",
    description: [beforeTask.description, input.notes].filter(Boolean).join("\n\n") || null
  });
  const theCase = await updateCase(db, beforeTask.caseId, {
    status: "awaiting_approval"
  });
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: input.actor,
    action: "task_completed",
    before: beforeTask,
    after: { ...task, photoRef: input.photoRef ?? null }
  });
  await writeAuditEvent(db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: input.actor,
    action: "status_changed",
    before: beforeCase,
    after: theCase
  });
  const detail = await getCaseDetail(db, beforeTask.caseId);
  if (!detail) throw new NotFoundError(`Case ${beforeTask.caseId} not found`);
  return detail;
}
async function assignTask(db, taskId, input) {
  const beforeTask = await getTask(db, taskId);
  if (!beforeTask) throw new NotFoundError(`Task ${taskId} not found`);
  const task = await updateTask(db, taskId, {
    owner: input.owner,
    status: "in_progress"
  });
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: input.actor,
    action: "task_assigned",
    before: beforeTask,
    after: task
  });
  const detail = await getCaseDetail(db, task.caseId);
  if (!detail) throw new NotFoundError(`Case ${task.caseId} not found`);
  return detail;
}
async function reviewCase(db, caseId, input) {
  const before = await getCase(db, caseId);
  if (!before) throw new NotFoundError(`Case ${caseId} not found`);
  const updated = await updateCase(db, caseId, {
    severity: input.severity ?? before.severity,
    assignedTo: input.assignTo ?? before.assignedTo
  });
  await writeAuditEvent(db, {
    entityType: "health_review",
    entityId: caseId,
    actor: input.actor,
    action: input.severity && input.severity !== before.severity ? "severity_adjusted" : "health_review_recorded",
    before,
    after: {
      updated,
      rationale: input.rationale,
      recommendation: input.recommendation ?? null
    }
  });
  if (input.assignTo) {
    await insertTask(db, {
      caseId,
      title: "Provider-assigned repair follow-up",
      description: input.recommendation ?? "Review provider notes and complete assigned repair.",
      owner: input.assignTo,
      status: "open"
    });
  }
  const detail = await getCaseDetail(db, caseId);
  if (!detail) throw new NotFoundError(`Case ${caseId} not found`);
  return detail;
}
async function processSyncBatch(db, input) {
  const results = [];
  let accepted = 0;
  let skipped = 0;
  for (const item of input.items) {
    const existing = await findSyncEvent(db, input.batchId, item.clientId);
    if (existing) {
      skipped += 1;
      results.push({
        clientId: item.clientId,
        status: "skipped",
        entityId: existing.entityId
      });
      continue;
    }
    if (item.kind === "citizen_report") {
      const detail = await submitVoiceSignal(db, { mode: "voice", ...item });
      await insertSyncEvent(db, {
        batchId: input.batchId,
        clientId: item.clientId,
        itemKind: item.kind,
        entityId: detail.case.caseId,
        payloadJson: item
      });
      results.push({
        clientId: item.clientId,
        status: "processed",
        entityId: detail.case.caseId
      });
    } else {
      const detail = await completeTask(db, item.taskId, item);
      await insertSyncEvent(db, {
        batchId: input.batchId,
        clientId: item.clientId,
        itemKind: item.kind,
        entityId: item.taskId,
        payloadJson: item
      });
      results.push({
        clientId: item.clientId,
        status: "processed",
        entityId: detail.case.caseId
      });
    }
    accepted += 1;
  }
  await writeAuditEvent(db, {
    entityType: "sync_batch",
    entityId: input.batchId,
    actor: input.source,
    action: "sync_batch_processed",
    after: { accepted, skipped, count: input.items.length }
  });
  return { batchId: input.batchId, accepted, skipped, results };
}
function medicalDesertScore(latitude) {
  return Math.min(0.95, Math.max(0.25, 0.35 + Math.abs(latitude - 23) / 32));
}
async function getH3Map(db, query) {
  if (!config.localSim) {
    return getH3MapFromUnityCatalog(query.limit ?? 80);
  }
  const points = await listWaterPoints(db);
  const grouped = /* @__PURE__ */ new Map();
  for (const point of points) {
    grouped.set(point.h3Cell, [...grouped.get(point.h3Cell) ?? [], point]);
  }
  const cells = [...grouped.entries()].map(
    ([h3Cell, cellPoints]) => {
      const [latitude, longitude] = cellToLatLng(h3Cell);
      const contamination = Math.max(
        ...cellPoints.map((point) => QUALITY_SCORE[point.quality]),
        0.15
      );
      const desert = medicalDesertScore(latitude);
      const quality = contamination > 0.75 ? "contaminated" : contamination > 0.35 ? "caution" : "clean";
      return {
        h3Cell,
        boundary: cellToBoundary2(h3Cell).map(
          ([lat, lng]) => [lat, lng]
        ),
        center: { latitude, longitude },
        quality,
        waterContaminationScore: Number(contamination.toFixed(3)),
        medicalDesertScore: Number(desert.toFixed(3)),
        vulnerabilityIndex: Number((contamination * desert).toFixed(3)),
        waterPointCount: cellPoints.length,
        facilityCount: quality === "contaminated" ? 0 : 1,
        districtName: cellPoints[0]?.name.split(" ")[0] ?? "Spoof district",
        stateName: "India spoof",
        dataCompletenessScore: 1
      };
    }
  );
  return { cells, generatedAt: (/* @__PURE__ */ new Date()).toISOString(), source: "local_sim" };
}
async function providerDashboard(db) {
  const now = Date.now();
  if (providerDashboardCache && providerDashboardCache.expiresAt > now) {
    return providerDashboardCache.value;
  }
  if (!config.localSim) {
    const value2 = await providerDashboardFromUnityCatalog();
    providerDashboardCache = {
      value: value2,
      expiresAt: now + PROVIDER_DASHBOARD_CACHE_MS
    };
    return value2;
  }
  const h3 = await getH3Map(db, { limit: 20 });
  const totalHabitations = h3.cells.reduce(
    (sum, cell) => sum + cell.waterPointCount,
    0
  );
  const totalFacilities = h3.cells.reduce(
    (sum, cell) => sum + cell.facilityCount,
    0
  );
  const average = (values) => values.length ? Number((values.reduce((sum, value2) => sum + value2, 0) / values.length).toFixed(3)) : 0;
  const value = {
    metrics: {
      districtsTracked: h3.cells.length,
      affectedHabitations: totalHabitations,
      facilityCount: totalFacilities,
      hospitalCount: Math.round(totalFacilities * 0.35),
      priorityAverage: average(h3.cells.map((cell) => cell.vulnerabilityIndex)),
      waterBurdenAverage: average(
        h3.cells.map((cell) => cell.waterContaminationScore)
      ),
      medicalDesertAverage: average(
        h3.cells.map((cell) => cell.medicalDesertScore)
      ),
      dataCompletenessAverage: 1
    },
    priorityGeographies: h3.cells.sort((a, b) => b.vulnerabilityIndex - a.vulnerabilityIndex).slice(0, 8).map((cell) => ({
      stateName: cell.stateName,
      districtName: cell.districtName,
      neeluPriorityScore: cell.vulnerabilityIndex,
      normalizedPriorityScore: cell.waterContaminationScore,
      dataCompletenessScore: cell.dataCompletenessScore,
      joinStatus: "spoof_complete",
      waterBurdenScore: cell.waterContaminationScore,
      medicalDesertScore: cell.medicalDesertScore,
      affectedHabitationCount: cell.waterPointCount,
      facilityCount: cell.facilityCount,
      hospitalCount: Math.round(cell.facilityCount * 0.35),
      dominantQualityParameter: cell.quality
    })),
    symptomCorrelations: [
      {
        symptom: "diarrhea",
        contaminant: "coliform bacteria",
        reports: 18,
        verifiedSignals: 9
      },
      {
        symptom: "skin lesions",
        contaminant: "arsenic",
        reports: 7,
        verifiedSignals: 3
      },
      {
        symptom: "stomach pain",
        contaminant: "turbidity",
        reports: 11,
        verifiedSignals: 4
      }
    ],
    contaminantBurden: [
      { contaminant: "Iron", reports: 302242, districts: 348 },
      { contaminant: "Fluoride", reports: 101040, districts: 308 },
      { contaminant: "Arsenic", reports: 25705, districts: 83 }
    ],
    facilityAccess: h3.cells.slice(0, 8).map((cell) => ({
      stateName: cell.stateName,
      districtName: cell.districtName,
      facilities: cell.facilityCount,
      hospitals: Math.round(cell.facilityCount * 0.35),
      medicalDesertScore: cell.medicalDesertScore
    })),
    coverage: [
      { label: "Data completeness", value: 1 },
      { label: "Water burden", value: average(h3.cells.map((cell) => cell.waterContaminationScore)) },
      { label: "Medical desert", value: average(h3.cells.map((cell) => cell.medicalDesertScore)) },
      { label: "Priority index", value: average(h3.cells.map((cell) => cell.vulnerabilityIndex)) }
    ]
  };
  providerDashboardCache = {
    value,
    expiresAt: now + PROVIDER_DASHBOARD_CACHE_MS
  };
  return value;
}

// src/server/routes/api.ts
var apiRouter = Router();
apiRouter.get("/client-config", async (_req, res) => {
  ok(res, {
    googleMapsApiKey: await getGoogleMapsApiKey()
  });
});
apiRouter.get("/health", async (_req, res) => {
  const db = await getDb();
  const services = await probeCapabilities(db);
  const health = {
    ok: !services.some((service) => service.status === "error"),
    mode: config.mode,
    version: config.version,
    services,
    time: (/* @__PURE__ */ new Date()).toISOString()
  };
  ok(res, health);
});
apiRouter.get("/systems", async (_req, res) => {
  const db = await getDb();
  ok(res, await listSystems(db));
});
apiRouter.get("/signals", async (_req, res) => {
  const db = await getDb();
  ok(res, await listSignals(db));
});
apiRouter.post("/signals", async (req, res) => {
  const db = await getDb();
  const input = parse(signalIntakeSchema, req.body);
  if (isVoiceInput(input)) {
    ok(res, await submitVoiceSignal(db, input), 201);
    return;
  }
  const signal = await submitSignal(db, parse(createSignalSchema, input));
  ok(res, signal, 201);
});
apiRouter.get("/signals/:id", async (req, res) => {
  const db = await getDb();
  const signal = await getSignal(db, req.params.id);
  if (!signal) throw new NotFoundError(`Signal ${req.params.id} not found`);
  const [theCase, system] = await Promise.all([
    getCaseBySignal(db, signal.signalId),
    getSystem(db, signal.systemId)
  ]);
  const dto = {
    ...signal,
    caseId: theCase?.caseId ?? null,
    status: theCase ? "analyzed" : "received",
    systemName: system?.name ?? signal.systemId
  };
  ok(res, dto);
});
apiRouter.post("/signals/:id/analyze", async (req, res) => {
  const db = await getDb();
  const { actor } = parse(analyzeSchema, req.body ?? {});
  const detail = await analyzeSignal(
    db,
    req.params.id,
    actor ?? DEFAULT_OPS_ACTOR
  );
  ok(res, detail, 201);
});
apiRouter.get("/cases", async (_req, res) => {
  const db = await getDb();
  ok(res, await listCases(db));
});
apiRouter.get("/cases/:id", async (req, res) => {
  const db = await getDb();
  const detail = await getCaseDetail(db, req.params.id);
  if (!detail) throw new NotFoundError(`Case ${req.params.id} not found`);
  ok(res, detail);
});
apiRouter.post("/cases/:id/analyze", async (req, res) => {
  const db = await getDb();
  const { actor } = parse(analyzeSchema, req.body ?? {});
  const detail = await analyzeCase(
    db,
    req.params.id,
    actor ?? DEFAULT_OPS_ACTOR
  );
  ok(res, detail);
});
apiRouter.post("/cases/:id/approve", async (req, res) => {
  const db = await getDb();
  const input = parse(approveSchema, req.body);
  ok(res, await approveCase(db, req.params.id, input));
});
apiRouter.post("/cases/:id/override", async (req, res) => {
  const db = await getDb();
  const input = parse(overrideSchema, req.body);
  ok(res, await overrideCase(db, req.params.id, input));
});
apiRouter.post("/cases/:id/request-more-evidence", async (req, res) => {
  const db = await getDb();
  const input = parse(requestMoreEvidenceSchema, req.body);
  ok(res, await requestMoreEvidence(db, req.params.id, input));
});
apiRouter.post("/cases/:id/review", async (req, res) => {
  const db = await getDb();
  const input = parse(reviewCaseSchema, req.body);
  ok(res, await reviewCase(db, req.params.id, input));
});
apiRouter.get("/cases/:id/audit", async (req, res) => {
  const db = await getDb();
  const detail = await getCaseDetail(db, req.params.id);
  if (!detail) throw new NotFoundError(`Case ${req.params.id} not found`);
  ok(res, await listCaseAudit(db, req.params.id));
});
apiRouter.get("/cases/:id/trace", async (req, res) => {
  const db = await getDb();
  const trace = await getCaseTrace(db, req.params.id);
  if (!trace) throw new NotFoundError(`Case ${req.params.id} not found`);
  ok(res, trace);
});
apiRouter.post("/upi/callback", async (req, res) => {
  const db = await getDb();
  const input = parse(upiCallbackSchema, req.body);
  ok(res, await handleUpiCallback(db, input), 201);
});
apiRouter.post("/sync", async (req, res) => {
  const db = await getDb();
  const input = parse(syncBatchSchema, req.body);
  ok(res, await processSyncBatch(db, input), 201);
});
apiRouter.get("/h3-map", async (req, res) => {
  const db = await getDb();
  const input = parse(h3MapQuerySchema, req.query);
  ok(res, await getH3Map(db, input));
});
apiRouter.get("/contractor/tasks", async (_req, res) => {
  const db = await getDb();
  ok(res, await contractorQueue(db));
});
apiRouter.post("/contractor/tasks/:id/done", async (req, res) => {
  const db = await getDb();
  const input = parse(completeTaskSchema, req.body);
  ok(res, await completeTask(db, req.params.id, input));
});
apiRouter.post("/contractor/tasks/:id/assign", async (req, res) => {
  const db = await getDb();
  const input = parse(assignTaskSchema, req.body);
  ok(res, await assignTask(db, req.params.id, input));
});
apiRouter.get("/provider/dashboard", async (_req, res) => {
  const db = await getDb();
  ok(res, await providerDashboard(db));
});
apiRouter.get("/provider/insights", async (_req, res) => {
  const db = await getDb();
  const [dashboard, cases] = await Promise.all([
    providerDashboard(db),
    listCases(db)
  ]);
  ok(res, await generateProviderInsightWithModel(dashboard, cases));
});
apiRouter.post("/demo/reset", async (req, res) => {
  const db = await getDb();
  const input = parse(demoResetSchema, req.body ?? {});
  ok(res, await resetDemo(db, input));
});

// src/server/app.ts
var errorHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    const body = {
      error: err.code,
      message: err.message,
      details: err.details
    };
    res.status(err.status).json(body);
    return;
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "internal_error", message: "Internal server error" });
};
async function createApp(options = {}) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", apiRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "not_found", message: "Unknown API route" });
  });
  if (options.attachClient) {
    await options.attachClient(app);
  }
  app.use(errorHandler);
  return app;
}

// src/server/index.ts
async function attachClient(app) {
  if (config.isProduction) {
    const clientDir = path.resolve(process.cwd(), "dist/client");
    app.use(express2.static(clientDir));
    app.use((req, res, next) => {
      if (req.path.startsWith("/api")) {
        next();
        return;
      }
      res.sendFile(path.join(clientDir, "index.html"));
    });
    return;
  }
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
}
async function main() {
  const db = await getDb();
  const seeded = await ensureSeeded(db);
  const app = await createApp({ attachClient });
  app.listen(config.port, () => {
    const seedNote = seeded ? " (seeded demo data)" : "";
    console.log(
      `Neelu [${config.mode}] listening on http://localhost:${config.port}${seedNote}`
    );
  });
}
main().catch((error) => {
  console.error("Failed to start Neelu:", error);
  process.exit(1);
});
