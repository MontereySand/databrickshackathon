/**
 * Assembles the full CaseDetail DTO (case + system + signal + evidence + finding
 * + tasks + approvals + notices + trace) and reconstructs the trace/eval view
 * from persisted data so GET /api/cases/:id and the case page stay consistent.
 */

import type { Db } from "../db";
import {
  getCase,
  getFindingForCase,
  getSignal,
  getSystem,
  listApprovals,
  listCaseAudit,
  listEvidence,
  listTasks,
} from "../db/repositories";
import { buildNotices } from "./notice";
import { runScorers } from "../../evals/scorers";
import type {
  AuditEvent,
  CaseDetail,
  CaseTrace,
  TraceToolCall,
} from "../../shared/types";

function buildCaseTrace(detail: CaseDetail, audit: AuditEvent[]): CaseTrace {
  const guidanceCount = detail.evidence.filter(
    (item) => item.evidenceType === "guidance",
  ).length;
  const citationsUsed = detail.finding?.citationsJson.length ?? 0;
  const traceId = detail.finding?.traceId ?? "trace-unavailable";

  const toolCalls: TraceToolCall[] = [
    {
      tool: "lookup_site_profile",
      input: { system_id: detail.system.systemId },
      summary: `Loaded site profile for ${detail.system.name}`,
      fallback: true,
      durationMs: 6,
    },
    {
      tool: "search_guidance",
      input: { contaminant: detail.case.contaminant ?? "n/a" },
      summary: `Retrieved ${guidanceCount} guidance snippet(s)`,
      fallback: true,
      durationMs: 21,
    },
    {
      tool: "classify_signal",
      input: { signal_id: detail.signal.signalId },
      summary: `Classified severity=${detail.case.severity ?? "?"}, uncertainty=${detail.case.uncertainty ?? "?"}`,
      fallback: true,
      durationMs: 12,
    },
    {
      tool: "create_case",
      input: { signal_id: detail.signal.signalId },
      summary: `Created case ${detail.case.caseId}`,
      fallback: false,
      durationMs: 8,
    },
    {
      tool: "attach_evidence",
      input: { case_id: detail.case.caseId },
      summary: `Attached ${detail.evidence.length} evidence item(s)`,
      fallback: false,
      durationMs: 9,
    },
    {
      tool: "create_tasks",
      input: { case_id: detail.case.caseId },
      summary: `Created ${detail.tasks.length} task(s)`,
      fallback: false,
      durationMs: 7,
    },
    {
      tool: "draft_notice",
      input: { case_id: detail.case.caseId },
      summary: `Drafted ${detail.notices.length} notice draft(s)`,
      fallback: false,
      durationMs: 5,
    },
    {
      tool: "request_human_approval",
      input: { case_id: detail.case.caseId },
      summary: "Flagged case as awaiting human approval",
      fallback: false,
      durationMs: 3,
    },
  ];

  return {
    traceId,
    caseId: detail.case.caseId,
    source: "local_fallback",
    toolCalls,
    retrievedGuidanceCount: guidanceCount,
    citationsUsed,
    evalResults: runScorers(detail, audit),
    createdAt: detail.finding?.createdAt ?? detail.case.createdAt,
  };
}

export async function getCaseDetail(
  db: Db,
  caseId: string,
): Promise<CaseDetail | null> {
  const theCase = await getCase(db, caseId);
  if (!theCase) return null;
  const [system, signal, evidence, finding, tasks, approvals, audit] =
    await Promise.all([
      getSystem(db, theCase.systemId),
      getSignal(db, theCase.signalId),
      listEvidence(db, caseId),
      getFindingForCase(db, caseId),
      listTasks(db, caseId),
      listApprovals(db, caseId),
      listCaseAudit(db, caseId),
    ]);

  if (!system || !signal) return null;

  const notices = buildNotices(theCase, system);

  const detail: CaseDetail = {
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
    missingEvidence: evidence.length === 0,
  };

  detail.trace = buildCaseTrace(detail, audit);
  return detail;
}

export async function getCaseTrace(
  db: Db,
  caseId: string,
): Promise<CaseTrace | null> {
  const detail = await getCaseDetail(db, caseId);
  return detail?.trace ?? null;
}
