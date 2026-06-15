/**
 * Human-decision services: approve, override, and request more evidence. Each
 * enforces valid state transitions and writes approvals/tasks/audit rows as
 * applicable. Every decision always writes audit events.
 */

import type { Db } from "../db";
import {
  getCase,
  insertApproval,
  insertTask,
  updateCase,
  writeAuditEvent,
} from "../db/repositories";
import { getCaseDetail } from "./caseDetail";
import { toolRecordApproval, type ToolContext } from "../../agents/tools";
import { BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { DEFAULT_OPS_ACTOR } from "../../shared/constants";
import type {
  ApproveInput,
  OverrideInput,
  RequestMoreEvidenceInput,
} from "../../shared/schemas";
import type { CaseDetail } from "../../shared/types";

const DECIDED_STATUSES = new Set(["approved", "overridden", "closed"]);

async function loadDecidableCase(db: Db, caseId: string) {
  const theCase = await getCase(db, caseId);
  if (!theCase) throw new NotFoundError(`Case ${caseId} not found`);
  if (DECIDED_STATUSES.has(theCase.status)) {
    throw new ConflictError(
      `Case ${caseId} is already ${theCase.status}; reopen is not supported in this demo.`,
    );
  }
  return theCase;
}

export async function approveCase(
  db: Db,
  caseId: string,
  input: ApproveInput,
): Promise<CaseDetail> {
  const theCase = await loadDecidableCase(db, caseId);
  const ctx: ToolContext = { db, actor: input.approver };
  await toolRecordApproval(
    ctx,
    theCase,
    input.approver,
    "approved",
    input.rationale,
    "approved",
  );
  const detail = await getCaseDetail(db, caseId);
  if (!detail) throw new NotFoundError(`Case ${caseId} not found`);
  return detail;
}

export async function overrideCase(
  db: Db,
  caseId: string,
  input: OverrideInput,
): Promise<CaseDetail> {
  const theCase = await loadDecidableCase(db, caseId);
  const ctx: ToolContext = { db, actor: input.approver };
  const rationale = `${input.rationale}\n\nReplacement action: ${input.replacementAction}`;
  await toolRecordApproval(
    ctx,
    theCase,
    input.approver,
    "overridden",
    rationale,
    "overridden",
  );

  // An override defines a replacement action -> create a task for it.
  const task = await insertTask(db, {
    caseId,
    title: "Carry out override replacement action",
    description: input.replacementAction,
    owner: input.approver,
    status: "open",
    dueAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: input.approver,
    action: "tasks_created",
    after: { title: task.title, replacementAction: input.replacementAction },
  });

  const detail = await getCaseDetail(db, caseId);
  if (!detail) throw new NotFoundError(`Case ${caseId} not found`);
  return detail;
}

export async function requestMoreEvidence(
  db: Db,
  caseId: string,
  input: RequestMoreEvidenceInput,
): Promise<CaseDetail> {
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

  // Approvals row (decision = more_evidence_requested).
  const approval = await insertApproval(db, {
    caseId,
    approver,
    decision: "more_evidence_requested",
    rationale: input.requestedEvidence,
  });
  await writeAuditEvent(db, {
    entityType: "approval",
    entityId: approval.approvalId,
    actor: approver,
    action: "evidence_requested",
    after: {
      requestedEvidence: input.requestedEvidence,
      owner: input.owner,
      dueAt: dueIso.toISOString(),
    },
  });

  // Tasks row for the requested evidence.
  const task = await insertTask(db, {
    caseId,
    title: "Provide requested evidence",
    description: input.requestedEvidence,
    owner: input.owner,
    status: "open",
    dueAt: dueIso.toISOString(),
  });
  await writeAuditEvent(db, {
    entityType: "task",
    entityId: task.taskId,
    actor: approver,
    action: "tasks_created",
    after: { title: task.title, owner: input.owner },
  });

  // Status transition.
  const updated = await updateCase(db, caseId, { status: "needs_more_evidence" });
  await writeAuditEvent(db, {
    entityType: "case",
    entityId: caseId,
    actor: approver,
    action: "status_changed",
    before: { status: theCase.status },
    after: { status: updated.status },
  });

  const detail = await getCaseDetail(db, caseId);
  if (!detail) throw new NotFoundError(`Case ${caseId} not found`);
  return detail;
}
