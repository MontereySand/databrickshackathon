/**
 * Operational schema, embedded as a string so it can be applied on boot under
 * both `tsx` (dev) and the bundled production server without filesystem lookups.
 *
 * This MUST stay identical to sql/lakebase_schema.sql (the canonical artifact you
 * run against Lakebase in DATABRICKS mode). scripts/checkScope.ts verifies that
 * every table below also exists in the .sql file.
 */

export const TABLE_NAMES = [
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
  "demo_runs",
] as const

export const SCHEMA_SQL = `
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
`
