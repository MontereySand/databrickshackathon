/**
 * Analyze orchestrator. Composes the agent tools into the deterministic, robust
 * Analyze pipeline:
 *
 *   guidance retrieval -> classify -> create case -> finding -> evidence ->
 *   tasks -> notice draft -> request human approval -> trace
 *
 * Every step writes audit events; the pipeline never throws because a Databricks
 * service is unavailable (retrieval/model/MLflow degrade to local fallbacks).
 */

import type { Db } from "../server/db";
import {
  getCase,
  getCaseBySignal,
  getFindingForCase,
  getSignal,
  getSystem,
  writeAuditEvent,
} from "../server/db/repositories";
import { getCaseDetail } from "../server/services/caseDetail";
import { newTraceId, logTrace } from "../server/databricks/mlflow";
import { NotFoundError } from "../server/lib/errors";
import { CONTAMINANT_THRESHOLDS } from "../shared/constants";
import type { CaseDetail, Case, Signal, WaterSystem } from "../shared/types";
import type { InsertEvidenceInput } from "../server/db/repositories";
import {
  toolAttachEvidence,
  toolClassifySignal,
  toolCreateCase,
  toolCreateFinding,
  toolCreateTasks,
  toolDraftActionPlan,
  toolDraftNotice,
  toolLookupSiteProfile,
  toolRequestHumanApproval,
  toolSearchGuidance,
  type ToolContext,
} from "./tools";

function buildGuidanceQuery(signal: Signal): string {
  const contaminant = signal.testType
    ? CONTAMINANT_THRESHOLDS[signal.testType].contaminant
    : "water quality";
  return `${contaminant} ${signal.testType ?? ""} drinking water guidance ${signal.notes ?? ""}`.trim();
}

/**
 * Run the full analysis. If `existingCase` is provided the case row is reused
 * (re-analysis); otherwise a new case is created from the classification.
 */
async function runFullAnalysis(
  ctx: ToolContext,
  signal: Signal,
  system: WaterSystem,
  existingCase?: Case,
): Promise<Case> {
  // 1. Site profile (Unity Catalog / seeded).
  const siteProfile = await toolLookupSiteProfile(ctx, system.systemId);

  // 2. Guidance retrieval (AI Search / local fallback).
  const retrieval = await toolSearchGuidance(ctx, buildGuidanceQuery(signal), {
    testType: signal.testType ?? undefined,
  });

  // 3. Classify (model or deterministic) + safety gate.
  const classification = await toolClassifySignal(ctx, signal, system, retrieval);

  // 4. Create (or reuse) the case.
  const theCaseInitial =
    existingCase ?? (await toolCreateCase(ctx, signal, classification));

  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: theCaseInitial.caseId,
    actor: ctx.actor,
    action: "guidance_retrieved",
    after: {
      count: retrieval.results.length,
      source: retrieval.source,
      fallback: retrieval.fallback,
      ids: retrieval.results.map((r) => r.guidanceId),
    },
  });

  // 5. Finding with a trace id.
  const traceId = newTraceId();
  await toolCreateFinding(ctx, theCaseInitial.caseId, classification, traceId);

  // 6. Evidence: field result + site profile + each guidance citation.
  const evidence: Omit<InsertEvidenceInput, "caseId">[] = [];
  evidence.push({
    evidenceType: "field_result",
    title: `Field ${signal.testType ?? "test"} result`,
    body: `${signal.resultValue ?? "?"} ${signal.unit ?? ""} measured with kit ${signal.kitId ?? "unknown"} (received ${signal.receivedAt.slice(0, 10)}).`,
    sourceName: `Field test kit ${signal.kitId ?? ""}`.trim(),
    sourceUri: null,
    citationText: `Field-measured ${classification.contaminant}: ${signal.resultValue ?? "?"} ${signal.unit ?? ""}`,
    confidence: classification.confidence,
  });
  if (siteProfile) {
    evidence.push({
      evidenceType: "site_profile",
      title: `Site profile: ${siteProfile.system.name}`,
      body: `${siteProfile.riskNotes} Serves ${siteProfile.system.populationServed ?? "?"} people; source: ${siteProfile.system.sourceWaterType ?? "unknown"}.`,
      sourceName: "Unity Catalog (seeded site profile)",
      sourceUri: null,
      citationText: `${siteProfile.system.name}, ${siteProfile.system.region ?? ""}`,
      confidence: 0.9,
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
      confidence: Math.min(0.95, 0.6 + (retrieval.results.length - index) * 0.05),
    });
  });
  await toolAttachEvidence(ctx, theCaseInitial.caseId, evidence);

  // 7. Tasks.
  const plan = toolDraftActionPlan(classification);
  await toolCreateTasks(ctx, theCaseInitial.caseId, plan);

  // 8. Notice draft (derived; audit records that drafts exist, never sent).
  await toolDraftNotice(ctx, theCaseInitial.caseId, ["en", "hi"]);

  // 9. Require human approval.
  const theCase = await toolRequestHumanApproval(ctx, theCaseInitial);

  // 10. Persist/log trace (MLflow or local fallback).
  const detail = await getCaseDetail(ctx.db, theCase.caseId);
  if (detail?.trace) await logTrace(detail.trace);

  return theCase;
}

export async function analyzeSignal(
  db: Db,
  signalId: string,
  actor: string,
): Promise<CaseDetail> {
  const signal = await getSignal(db, signalId);
  if (!signal) throw new NotFoundError(`Signal ${signalId} not found`);

  const existing = await getCaseBySignal(db, signalId);
  if (existing) {
    const detail = await getCaseDetail(db, existing.caseId);
    if (!detail) throw new NotFoundError(`Case ${existing.caseId} not found`);
    return detail;
  }

  const system = await getSystem(db, signal.systemId);
  if (!system) throw new NotFoundError(`System ${signal.systemId} not found`);

  const theCase = await runFullAnalysis({ db, actor }, signal, system);

  const detail = await getCaseDetail(db, theCase.caseId);
  if (!detail) throw new NotFoundError(`Case ${theCase.caseId} not found`);
  return detail;
}

export async function analyzeCase(
  db: Db,
  caseId: string,
  actor: string,
): Promise<CaseDetail> {
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
