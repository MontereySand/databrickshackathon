import { cellToBoundary, cellToLatLng, latLngToCell } from "h3-js"
import { config } from "../config"
import type { Db } from "../db"
import {
  findSyncEvent,
  getCase,
  getSystem,
  getTask,
  insertCase,
  insertEvidence,
  insertSignal,
  insertSyncEvent,
  insertTask,
  listContractorQueue,
  listWaterPoints,
  updateCase,
  updateTask,
  writeAuditEvent,
} from "../db/repositories"
import { retrieveRagContext } from "../databricks/aiSearch"
import { parseSignalWithModel } from "../databricks/modelServing"
import {
  getH3MapFromUnityCatalog,
  providerDashboardFromUnityCatalog,
} from "../databricks/unityCatalog"
import { BadRequestError, NotFoundError } from "../lib/errors"
import { CONTAMINANT_THRESHOLDS } from "../../shared/constants"
import type { Severity } from "../../shared/constants"
import type {
  AssignTaskInput,
  CompleteTaskInput,
  H3MapQuery,
  ReviewCaseInput,
  SyncBatchInput,
  UpiCallbackInput,
  VoiceSignalInput,
} from "../../shared/schemas"
import type {
  CaseDetail,
  ContractorQueueItem,
  H3MapCell,
  H3MapResponse,
  ProviderDashboard,
  SyncBatchResult,
  UpiCallbackResult,
} from "../../shared/types"
import { getCaseDetail } from "./caseDetail"

const QUALITY_SCORE = {
  clean: 0.15,
  caution: 0.55,
  contaminated: 0.95,
} as const

let providerDashboardCache:
  | { expiresAt: number; value: ProviderDashboard }
  | null = null

const PROVIDER_DASHBOARD_CACHE_MS = 60_000

function isVoiceInput(input: unknown): input is VoiceSignalInput {
  return (
    typeof input === "object" &&
    input !== null &&
    "transcript" in input &&
    (!("testType" in input) || (input as { mode?: unknown }).mode === "voice")
  )
}

function memoParts(memo: string): { systemId: string; severity: Severity } {
  const match = memo.match(
    /^SYS_([A-Za-z0-9-]+)_REPORT_(LOW|MODERATE|HIGH|URGENT)$/u
  )
  if (!match) {
    throw new BadRequestError(
      "UPI transaction memo must match SYS_[SYSTEM_ID]_REPORT_[SEVERITY]"
    )
  }
  return {
    systemId: match[1],
    severity: match[2].toLowerCase() as Severity,
  }
}

export async function submitVoiceSignal(
  db: Db,
  input: VoiceSignalInput
): Promise<CaseDetail> {
  const rag = await retrieveRagContext(input.transcript, { limit: 4 })
  const parsedResult = await parseSignalWithModel({
    transcript: input.transcript,
    systemId: input.systemId,
    contextSnippets: rag.results.map((result) => result.snippet),
  })
  if (!parsedResult.available) {
    throw new BadRequestError(parsedResult.reason)
  }

  const parsed = parsedResult.parsed
  const system = await getSystem(db, parsed.systemId)
  if (!system) throw new NotFoundError(`System ${parsed.systemId} not found`)
  const threshold = CONTAMINANT_THRESHOLDS[parsed.testType]
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
      h3Cell:
        input.h3Cell ??
        (input.latitude != null && input.longitude != null
          ? latLngToCell(input.latitude, input.longitude, 8)
          : null),
    },
  })
  await writeAuditEvent(db, {
    entityType: "signal",
    entityId: signal.signalId,
    actor: input.actor,
    action: "signal_submitted",
    after: signal,
  })
  await writeAuditEvent(db, {
    entityType: "signal",
    entityId: signal.signalId,
    actor: "voice-extraction-agent",
    action: "voice_signal_parsed",
    after: parsed,
  })

  const theCase = await insertCase(db, {
    systemId: parsed.systemId,
    signalId: signal.signalId,
    status: "awaiting_approval",
    severity: parsed.severity,
    contaminant: parsed.contaminant,
    summary: parsed.summary,
    uncertainty: parsed.uncertainty,
  })
  await writeAuditEvent(db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: "voice-extraction-agent",
    action: "case_created",
    after: theCase,
  })

  const task = await insertTask(db, {
    caseId: theCase.caseId,
    title: `Inspect ${system.name}`,
    description: [
      `Citizen voice report: ${parsed.summary}`,
      parsed.symptoms.length ? `Reported symptoms: ${parsed.symptoms.join(", ")}` : null,
      `Suspected issue: ${parsed.contaminant}`,
    ]
      .filter(Boolean)
      .join("\n"),
    owner: "contractor-triage",
    status: "open",
  })
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: "voice-extraction-agent",
    action: "tasks_created",
    after: task,
  })

  await insertEvidence(db, {
    caseId: theCase.caseId,
    evidenceType: "voice_note",
    title: "Citizen voice transcript",
    body: input.transcript,
    sourceName: "Citizen mobile portal",
    confidence: parsed.confidence,
  })
  await writeAuditEvent(db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: "vector-search-rag",
    action: "guidance_retrieved",
    after: rag,
  })

  const detail = await getCaseDetail(db, theCase.caseId)
  if (!detail) throw new NotFoundError(`Case ${theCase.caseId} not found`)
  return detail
}

export async function handleUpiCallback(
  db: Db,
  input: UpiCallbackInput
): Promise<UpiCallbackResult> {
  const memo = input.memo ?? input.tn ?? ""
  const parsed = memoParts(memo)
  const system = await getSystem(db, parsed.systemId)
  if (!system) throw new NotFoundError(`System ${parsed.systemId} not found`)
  const threshold = CONTAMINANT_THRESHOLDS.total_coliform
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
      amount: input.amount ?? null,
    },
  })
  const theCase = await insertCase(db, {
    systemId: parsed.systemId,
    signalId: signal.signalId,
    status: "awaiting_approval",
    severity: parsed.severity,
    contaminant: "unverified citizen water quality report",
    summary: `UPI scan-to-report created a ${parsed.severity} review case for ${system.name}.`,
    uncertainty: "high",
  })
  const task = await insertTask(db, {
    caseId: theCase.caseId,
    title: `Inspect ${system.name}`,
    description:
      "Physical fountain QR scan opened an unverified citizen water-quality issue. Inspect the point, capture a field note, and route findings to provider review.",
    owner: "contractor-triage",
    status: "open",
  })
  await writeAuditEvent(db, {
    entityType: "signal",
    entityId: signal.signalId,
    actor: input.actor,
    action: "upi_callback_received",
    after: {
      transactionId: input.transactionId,
      memo,
      signalId: signal.signalId,
    },
  })
  await writeAuditEvent(db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: input.actor,
    action: "case_created",
    after: theCase,
  })
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: input.actor,
    action: "tasks_created",
    after: task,
  })
  return {
    transactionId: input.transactionId,
    systemId: parsed.systemId,
    severity: parsed.severity,
    caseId: theCase.caseId,
    signalId: signal.signalId,
  }
}

export async function contractorQueue(db: Db): Promise<ContractorQueueItem[]> {
  return listContractorQueue(db)
}

export async function completeTask(
  db: Db,
  taskId: string,
  input: CompleteTaskInput
): Promise<CaseDetail> {
  const beforeTask = await getTask(db, taskId)
  if (!beforeTask) throw new NotFoundError(`Task ${taskId} not found`)
  const beforeCase = await getCase(db, beforeTask.caseId)
  if (!beforeCase)
    throw new NotFoundError(`Case ${beforeTask.caseId} not found`)
  const task = await updateTask(db, taskId, {
    status: "done",
    description:
      [beforeTask.description, input.notes].filter(Boolean).join("\n\n") ||
      null,
  })
  const theCase = await updateCase(db, beforeTask.caseId, {
    status: "awaiting_approval",
  })
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: input.actor,
    action: "task_completed",
    before: beforeTask,
    after: { ...task, photoRef: input.photoRef ?? null },
  })
  await writeAuditEvent(db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: input.actor,
    action: "status_changed",
    before: beforeCase,
    after: theCase,
  })
  const detail = await getCaseDetail(db, beforeTask.caseId)
  if (!detail) throw new NotFoundError(`Case ${beforeTask.caseId} not found`)
  return detail
}

export async function assignTask(
  db: Db,
  taskId: string,
  input: AssignTaskInput
): Promise<CaseDetail> {
  const beforeTask = await getTask(db, taskId)
  if (!beforeTask) throw new NotFoundError(`Task ${taskId} not found`)
  const task = await updateTask(db, taskId, {
    owner: input.owner,
    status: "in_progress",
  })
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: input.actor,
    action: "task_assigned",
    before: beforeTask,
    after: task,
  })
  const detail = await getCaseDetail(db, task.caseId)
  if (!detail) throw new NotFoundError(`Case ${task.caseId} not found`)
  return detail
}

export async function reviewCase(
  db: Db,
  caseId: string,
  input: ReviewCaseInput
): Promise<CaseDetail> {
  const before = await getCase(db, caseId)
  if (!before) throw new NotFoundError(`Case ${caseId} not found`)
  const updated = await updateCase(db, caseId, {
    severity: input.severity ?? before.severity,
    assignedTo: input.assignTo ?? before.assignedTo,
  })
  await writeAuditEvent(db, {
    entityType: "health_review",
    entityId: caseId,
    actor: input.actor,
    action:
      input.severity && input.severity !== before.severity
        ? "severity_adjusted"
        : "health_review_recorded",
    before,
    after: {
      updated,
      rationale: input.rationale,
      recommendation: input.recommendation ?? null,
    },
  })
  if (input.assignTo) {
    await insertTask(db, {
      caseId,
      title: "Provider-assigned repair follow-up",
      description:
        input.recommendation ??
        "Review provider notes and complete assigned repair.",
      owner: input.assignTo,
      status: "open",
    })
  }
  const detail = await getCaseDetail(db, caseId)
  if (!detail) throw new NotFoundError(`Case ${caseId} not found`)
  return detail
}

export async function processSyncBatch(
  db: Db,
  input: SyncBatchInput
): Promise<SyncBatchResult> {
  const results: SyncBatchResult["results"] = []
  let accepted = 0
  let skipped = 0
  for (const item of input.items) {
    const existing = await findSyncEvent(db, input.batchId, item.clientId)
    if (existing) {
      skipped += 1
      results.push({
        clientId: item.clientId,
        status: "skipped",
        entityId: existing.entityId,
      })
      continue
    }
    if (item.kind === "citizen_report") {
      const detail = await submitVoiceSignal(db, { mode: "voice", ...item })
      await insertSyncEvent(db, {
        batchId: input.batchId,
        clientId: item.clientId,
        itemKind: item.kind,
        entityId: detail.case.caseId,
        payloadJson: item,
      })
      results.push({
        clientId: item.clientId,
        status: "processed",
        entityId: detail.case.caseId,
      })
    } else {
      const detail = await completeTask(db, item.taskId, item)
      await insertSyncEvent(db, {
        batchId: input.batchId,
        clientId: item.clientId,
        itemKind: item.kind,
        entityId: item.taskId,
        payloadJson: item,
      })
      results.push({
        clientId: item.clientId,
        status: "processed",
        entityId: detail.case.caseId,
      })
    }
    accepted += 1
  }
  await writeAuditEvent(db, {
    entityType: "sync_batch",
    entityId: input.batchId,
    actor: input.source,
    action: "sync_batch_processed",
    after: { accepted, skipped, count: input.items.length },
  })
  return { batchId: input.batchId, accepted, skipped, results }
}

function medicalDesertScore(latitude: number): number {
  return Math.min(0.95, Math.max(0.25, 0.35 + Math.abs(latitude - 23) / 32))
}

export async function getH3Map(
  db: Db,
  query: H3MapQuery
): Promise<H3MapResponse> {
  if (!config.localSim) {
    return getH3MapFromUnityCatalog(query.limit ?? 80)
  }

  const points = await listWaterPoints(db)
  const grouped = new Map<string, typeof points>()
  for (const point of points) {
    grouped.set(point.h3Cell, [...(grouped.get(point.h3Cell) ?? []), point])
  }
  const cells: H3MapCell[] = [...grouped.entries()].map(
    ([h3Cell, cellPoints]) => {
      const [latitude, longitude] = cellToLatLng(h3Cell)
      const contamination = Math.max(
        ...cellPoints.map((point) => QUALITY_SCORE[point.quality]),
        0.15
      )
      const desert = medicalDesertScore(latitude)
      const quality =
        contamination > 0.75
          ? "contaminated"
          : contamination > 0.35
            ? "caution"
            : "clean"
      return {
        h3Cell,
        boundary: cellToBoundary(h3Cell).map(
          ([lat, lng]) => [lat, lng] as [number, number]
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
        dataCompletenessScore: 1,
      }
    }
  )
  return { cells, generatedAt: new Date().toISOString(), source: "local_sim" }
}

export async function providerDashboard(db: Db): Promise<ProviderDashboard> {
  const now = Date.now()
  if (providerDashboardCache && providerDashboardCache.expiresAt > now) {
    return providerDashboardCache.value
  }

  if (!config.localSim) {
    const value = await providerDashboardFromUnityCatalog()
    providerDashboardCache = {
      value,
      expiresAt: now + PROVIDER_DASHBOARD_CACHE_MS,
    }
    return value
  }

  const h3 = await getH3Map(db, { limit: 20 })
  const totalHabitations = h3.cells.reduce(
    (sum, cell) => sum + cell.waterPointCount,
    0
  )
  const totalFacilities = h3.cells.reduce(
    (sum, cell) => sum + cell.facilityCount,
    0
  )
  const average = (values: number[]) =>
    values.length
      ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3))
      : 0
  const value: ProviderDashboard = {
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
      dataCompletenessAverage: 1,
    },
    priorityGeographies: h3.cells
      .sort((a, b) => b.vulnerabilityIndex - a.vulnerabilityIndex)
      .slice(0, 8)
      .map((cell) => ({
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
        dominantQualityParameter: cell.quality,
      })),
    symptomCorrelations: [
      {
        symptom: "diarrhea",
        contaminant: "coliform bacteria",
        reports: 18,
        verifiedSignals: 9,
      },
      {
        symptom: "skin lesions",
        contaminant: "arsenic",
        reports: 7,
        verifiedSignals: 3,
      },
      {
        symptom: "stomach pain",
        contaminant: "turbidity",
        reports: 11,
        verifiedSignals: 4,
      },
    ],
    contaminantBurden: [
      { contaminant: "Iron", reports: 302242, districts: 348 },
      { contaminant: "Fluoride", reports: 101040, districts: 308 },
      { contaminant: "Arsenic", reports: 25705, districts: 83 },
    ],
    facilityAccess: h3.cells.slice(0, 8).map((cell) => ({
      stateName: cell.stateName,
      districtName: cell.districtName,
      facilities: cell.facilityCount,
      hospitals: Math.round(cell.facilityCount * 0.35),
      medicalDesertScore: cell.medicalDesertScore,
    })),
    coverage: [
      { label: "Data completeness", value: 1 },
      { label: "Water burden", value: average(h3.cells.map((cell) => cell.waterContaminationScore)) },
      { label: "Medical desert", value: average(h3.cells.map((cell) => cell.medicalDesertScore)) },
      { label: "Priority index", value: average(h3.cells.map((cell) => cell.vulnerabilityIndex)) },
    ],
  }
  providerDashboardCache = {
    value,
    expiresAt: now + PROVIDER_DASHBOARD_CACHE_MS,
  }
  return value
}

export { isVoiceInput }
