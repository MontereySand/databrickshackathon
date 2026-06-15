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
} from "./constants"

// --- Core rows --------------------------------------------------------------

export interface WaterSystem {
  systemId: string
  name: string
  region: string | null
  country: string | null
  populationServed: number | null
  systemType: string | null
  sourceWaterType: string | null
  latitude: number | null
  longitude: number | null
  createdAt: string
}

export interface Signal {
  signalId: string
  systemId: string
  signalType: string
  testType: TestType | null
  resultValue: number | null
  unit: string | null
  thresholdValue: number | null
  thresholdUnit: string | null
  kitId: string | null
  kitExpiresAt: string | null
  locationLabel: string | null
  notes: string | null
  photoRef: string | null
  synthetic: boolean
  receivedAt: string
  payloadJson: Record<string, unknown> | null
}

export interface Case {
  caseId: string
  systemId: string
  signalId: string
  status: CaseStatus
  severity: Severity | null
  contaminant: string | null
  summary: string | null
  uncertainty: UncertaintyLevel | null
  assignedTo: string | null
  dueAt: string | null
  createdAt: string
  updatedAt: string
}

export interface EvidenceItem {
  evidenceId: string
  caseId: string
  evidenceType: EvidenceType | null
  title: string | null
  body: string | null
  sourceName: string | null
  sourceUri: string | null
  citationText: string | null
  confidence: number | null
  createdAt: string
}

export interface Citation {
  label: string
  sourceName: string
  sourceUri: string | null
  snippet: string
}

export interface AgentFinding {
  findingId: string
  caseId: string
  agentName: string | null
  findingType: string | null
  findingText: string | null
  recommendation: string | null
  uncertainty: UncertaintyLevel | null
  citationsJson: Citation[]
  confidence: number | null
  traceId: string | null
  createdAt: string
}

export interface Task {
  taskId: string
  caseId: string
  title: string
  description: string | null
  owner: string | null
  status: TaskStatus
  dueAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Approval {
  approvalId: string
  caseId: string
  approver: string
  decision: ApprovalDecision
  rationale: string
  approvedAt: string
}

export interface AuditEvent {
  auditId: string
  entityType: EntityType
  entityId: string
  actor: string
  action: AuditAction
  beforeJson: Record<string, unknown> | null
  afterJson: Record<string, unknown> | null
  createdAt: string
}

export interface WaterPoint {
  pointId: string
  systemId: string | null
  name: string
  latitude: number
  longitude: number
  h3Cell: string
  quality: "clean" | "caution" | "contaminated"
  contaminant: string | null
  populationServed: number | null
  createdAt: string
}

export interface H3MapCell {
  h3Cell: string
  boundary: [number, number][]
  center: { latitude: number; longitude: number }
  quality: "clean" | "caution" | "contaminated"
  waterContaminationScore: number
  medicalDesertScore: number
  vulnerabilityIndex: number
  waterPointCount: number
  facilityCount: number
  districtName: string
  stateName: string
  dataCompletenessScore: number
}

export interface H3MapResponse {
  cells: H3MapCell[]
  generatedAt: string
  source: "local_sim" | "databricks_tables"
}

export interface ContractorQueueItem extends Task {
  caseStatus: CaseStatus
  severity: Severity | null
  contaminant: string | null
  systemName: string
  latitude: number | null
  longitude: number | null
  h3Cell: string | null
  distanceKm: number | null
}

export interface SyncBatchResult {
  batchId: string
  accepted: number
  skipped: number
  results: Array<{
    clientId: string
    status: "processed" | "skipped"
    entityId: string | null
  }>
}

export interface UpiCallbackResult {
  transactionId: string
  systemId: string
  severity: Severity
  caseId: string
  signalId: string
}

export interface ProviderDashboard {
  metrics: {
    districtsTracked: number
    affectedHabitations: number
    facilityCount: number
    hospitalCount: number
    priorityAverage: number
    waterBurdenAverage: number
    medicalDesertAverage: number
    dataCompletenessAverage: number
  }
  priorityGeographies: Array<{
    stateName: string
    districtName: string
    neeluPriorityScore: number
    normalizedPriorityScore: number
    dataCompletenessScore: number
    joinStatus: string
    waterBurdenScore: number
    medicalDesertScore: number
    affectedHabitationCount: number
    facilityCount: number
    hospitalCount: number
    dominantQualityParameter: string
  }>
  symptomCorrelations: Array<{
    symptom: string
    contaminant: string
    reports: number
    verifiedSignals: number
  }>
  contaminantBurden: Array<{
    contaminant: string
    reports: number
    districts: number
  }>
  facilityAccess: Array<{
    stateName: string
    districtName: string
    facilities: number
    hospitals: number
    medicalDesertScore: number
  }>
  coverage: Array<{
    label: string
    value: number
  }>
}

export interface ProviderInsight {
  headline: string
  summary: string
  recommendedActions: string[]
  watchlistDistricts: string[]
  modelEndpoint: string
  generatedAt: string
}

export interface ClientConfig {
  googleMapsApiKey: string | null
}

export interface DemoRun {
  runId: string
  scenarioName: string | null
  resetAt: string
  seed: number | null
}

// --- Notice draft (derived, stored on the case payload) ---------------------

export interface NoticeDraft {
  language: "en" | "hi"
  title: string
  body: string
}

// --- Trace + eval -----------------------------------------------------------

export interface TraceToolCall {
  tool: string
  input: Record<string, unknown>
  summary: string
  fallback: boolean
  durationMs: number
}

export interface EvalScorerResult {
  scorer: EvalScorerName
  passed: boolean
  detail: string
}

export interface CaseTrace {
  traceId: string
  caseId: string
  source: "mlflow" | "local_fallback"
  toolCalls: TraceToolCall[]
  retrievedGuidanceCount: number
  citationsUsed: number
  evalResults: EvalScorerResult[]
  createdAt: string
}

// --- Health / capability probe ----------------------------------------------

export interface ServiceCapability {
  service: ServiceName
  status: ServiceStatus
  detail: string
}

export interface HealthInfo {
  ok: boolean
  mode: RuntimeMode
  version: string
  services: ServiceCapability[]
  time: string
}

// --- Composite DTOs ---------------------------------------------------------

export interface SignalDTO extends Signal {
  status: SignalDerivedStatus
  caseId: string | null
  systemName: string
}

export interface CaseListItem {
  caseId: string
  systemId: string
  systemName: string
  signalId: string
  status: CaseStatus
  severity: Severity | null
  contaminant: string | null
  summary: string | null
  uncertainty: UncertaintyLevel | null
  assignedTo: string | null
  dueAt: string | null
  openTaskCount: number
  missingEvidence: boolean
  pendingApproval: boolean
  createdAt: string
  updatedAt: string
}

export interface CaseDetail {
  case: Case
  system: WaterSystem
  signal: Signal
  evidence: EvidenceItem[]
  finding: AgentFinding | null
  tasks: Task[]
  approvals: Approval[]
  notices: NoticeDraft[]
  trace: CaseTrace | null
  pendingApproval: boolean
  missingEvidence: boolean
}

export interface DemoResetSummary {
  systems: number
  signals: number
  scenarioName: string
  seed: number
}

// --- Generic API envelope ---------------------------------------------------

export interface ApiError {
  error: string
  message: string
  details?: unknown
}

export type ApiResult<T> = { data: T } | ApiError
