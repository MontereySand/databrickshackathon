/**
 * Agent tool catalog. Each tool is a small, typed operation the orchestrator (or
 * a future model-driven loop) composes. Tools that mutate state also write the
 * corresponding audit_events row so every transition is recorded.
 */

import type { Db } from "../server/db";
import {
  insertApproval,
  insertCase,
  insertEvidence,
  insertFinding,
  insertTask,
  updateCase,
  writeAuditEvent,
  type InsertEvidenceInput,
} from "../server/db/repositories";
import { lookupSiteProfile } from "../server/databricks/unityCatalog";
import type { SiteProfile } from "../server/databricks/unityCatalog";
import { searchGuidance } from "../server/databricks/aiSearch";
import type { RetrievalResponse, SearchOptions } from "../server/databricks/aiSearch";
import { generateFindingWithModel } from "../server/databricks/modelServing";
import { classifySignalDeterministic } from "./fallbackFindings";
import type { Classification } from "./fallbackFindings";
import { checkFindingSafety } from "./safety";
import type {
  AgentFinding,
  Approval,
  AuditEvent,
  Case,
  EvidenceItem,
  Signal,
  Task,
  WaterSystem,
} from "../shared/types";
import type {
  ApprovalDecision,
  CaseStatus,
  EntityType,
} from "../shared/constants";

export const AGENT_NAME = "neelu-water-agent";

export interface ToolContext {
  db: Db;
  actor: string;
}

export async function toolLookupSiteProfile(
  ctx: ToolContext,
  systemId: string,
): Promise<SiteProfile | null> {
  return lookupSiteProfile(ctx.db, systemId);
}

export async function toolSearchGuidance(
  ctx: ToolContext,
  query: string,
  options?: SearchOptions,
): Promise<RetrievalResponse> {
  void ctx;
  return searchGuidance(query, options);
}

/**
 * Classify a signal. Prefers a model finding (DATABRICKS) but always falls back
 * to the deterministic classifier, then enforces the safety contract.
 */
export async function toolClassifySignal(
  ctx: ToolContext,
  signal: Signal,
  system: WaterSystem,
  retrieval: RetrievalResponse,
): Promise<Classification> {
  void ctx;
  const deterministic = classifySignalDeterministic(
    signal,
    system,
    retrieval.results,
  );

  const model = await generateFindingWithModel({
    prompt: "",
    signalSummary: deterministic.summary,
    guidanceSnippets: retrieval.results.map((r) => r.snippet),
  });

  const classification: Classification = model.available
    ? {
        ...deterministic,
        severity: model.finding.severity,
        uncertainty: model.finding.uncertainty,
        findingText: model.finding.classification,
        recommendation: model.finding.recommendation,
        confidence: model.finding.confidence,
        source: "model",
      }
    : deterministic;

  // Hard safety gate: never persist a finding that fails the contract.
  const safety = checkFindingSafety({
    findingText: classification.findingText,
    recommendation: classification.recommendation,
    uncertainty: classification.uncertainty,
    citations: classification.citations,
  });
  if (!safety.ok) {
    // Fall back to the deterministic finding (constructed to satisfy safety).
    return deterministic;
  }
  return classification;
}

export async function toolCreateCase(
  ctx: ToolContext,
  signal: Signal,
  classification: Classification,
): Promise<Case> {
  const created = await insertCase(ctx.db, {
    systemId: signal.systemId,
    signalId: signal.signalId,
    status: "new",
    severity: classification.severity,
    contaminant: classification.contaminant,
    summary: classification.summary,
    uncertainty: classification.uncertainty,
    assignedTo: "Operations",
  });
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: created.caseId,
    actor: ctx.actor,
    action: "case_created",
    after: created,
  });
  return created;
}

export async function toolCreateFinding(
  ctx: ToolContext,
  caseId: string,
  classification: Classification,
  traceId: string,
): Promise<AgentFinding> {
  const finding = await insertFinding(ctx.db, {
    caseId,
    agentName: AGENT_NAME,
    findingType: "classification",
    findingText: classification.findingText,
    recommendation: classification.recommendation,
    uncertainty: classification.uncertainty,
    citations: classification.citations,
    confidence: classification.confidence,
    traceId,
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
      citations: classification.citations.length,
    },
  });
  return finding;
}

export async function toolAttachEvidence(
  ctx: ToolContext,
  caseId: string,
  items: Omit<InsertEvidenceInput, "caseId">[],
): Promise<EvidenceItem[]> {
  const created: EvidenceItem[] = [];
  for (const item of items) {
    created.push(await insertEvidence(ctx.db, { ...item, caseId }));
  }
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: caseId,
    actor: AGENT_NAME,
    action: "evidence_attached",
    after: { count: created.length, types: created.map((e) => e.evidenceType) },
  });
  return created;
}

export interface TaskTemplate {
  title: string;
  description: string;
  owner: string;
  dueOffsetDays: number;
}

export function toolDraftActionPlan(
  classification: Classification,
): TaskTemplate[] {
  if (!classification.exceeds) {
    return [
      {
        title: "Document result and continue routine monitoring",
        description: "Log the within-reference result and keep the system on the routine monitoring schedule.",
        owner: "Field team",
        dueOffsetDays: 7,
      },
      {
        title: "Record final decision and rationale",
        description: "Record the reviewer's decision and rationale for the case file.",
        owner: "Approver",
        dueOffsetDays: 7,
      },
    ];
  }
  return [
    {
      title: "Request confirmatory laboratory sample",
      description: `Collect an accredited confirmatory laboratory sample for ${classification.contaminant} following chain-of-custody.`,
      owner: "Field team",
      dueOffsetDays: 2,
    },
    {
      title: "Notify supervisor / program lead",
      description: "Notify the supervisor / program lead of the provisional exceedance for situational awareness.",
      owner: "Operations",
      dueOffsetDays: 1,
    },
    {
      title: "Review public-health notice draft",
      description: "Review the DRAFT public-health notice. It must not be released without human/regulatory approval.",
      owner: "Public health officer",
      dueOffsetDays: 2,
    },
    {
      title: "Document follow-up sample",
      description: "Record the follow-up/confirmatory sample result once available and update the case.",
      owner: "Field team",
      dueOffsetDays: 5,
    },
    {
      title: "Record final decision and rationale",
      description: "Record the reviewer's final decision (approve/override) and rationale for the audit trail.",
      owner: "Approver",
      dueOffsetDays: 5,
    },
  ];
}

function addDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function toolCreateTasks(
  ctx: ToolContext,
  caseId: string,
  templates: TaskTemplate[],
): Promise<Task[]> {
  const created: Task[] = [];
  for (const template of templates) {
    created.push(
      await insertTask(ctx.db, {
        caseId,
        title: template.title,
        description: template.description,
        owner: template.owner,
        status: "open",
        dueAt: addDays(template.dueOffsetDays),
      }),
    );
  }
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: caseId,
    actor: AGENT_NAME,
    action: "tasks_created",
    after: { count: created.length, titles: created.map((t) => t.title) },
  });
  return created;
}

export async function toolDraftNotice(
  ctx: ToolContext,
  caseId: string,
  languages: string[],
): Promise<void> {
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: caseId,
    actor: AGENT_NAME,
    action: "notice_drafted",
    after: { languages, released: false },
  });
}

export async function toolRequestHumanApproval(
  ctx: ToolContext,
  theCase: Case,
): Promise<Case> {
  const updated = await updateCase(ctx.db, theCase.caseId, {
    status: "awaiting_approval",
  });
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: AGENT_NAME,
    action: "status_changed",
    before: { status: theCase.status },
    after: { status: updated.status, requiresHumanApproval: true },
  });
  return updated;
}

export async function toolRecordApproval(
  ctx: ToolContext,
  theCase: Case,
  approver: string,
  decision: ApprovalDecision,
  rationale: string,
  nextStatus: CaseStatus,
): Promise<{ approval: Approval; updated: Case }> {
  const approval = await insertApproval(ctx.db, {
    caseId: theCase.caseId,
    approver,
    decision,
    rationale,
  });
  await writeAuditEvent(ctx.db, {
    entityType: "approval",
    entityId: approval.approvalId,
    actor: approver,
    action: decision === "overridden" ? "override_recorded" : "approval_recorded",
    after: { decision, rationale },
  });
  const updated = await updateCase(ctx.db, theCase.caseId, {
    status: nextStatus,
  });
  await writeAuditEvent(ctx.db, {
    entityType: "case",
    entityId: theCase.caseId,
    actor: approver,
    action: "status_changed",
    before: { status: theCase.status },
    after: { status: updated.status },
  });
  return { approval, updated };
}

export async function toolWriteAuditEvent(
  ctx: ToolContext,
  entityType: EntityType,
  entityId: string,
  action: Parameters<typeof writeAuditEvent>[1]["action"],
  before?: unknown,
  after?: unknown,
): Promise<AuditEvent> {
  return writeAuditEvent(ctx.db, {
    entityType,
    entityId,
    actor: ctx.actor,
    action,
    before,
    after,
  });
}
