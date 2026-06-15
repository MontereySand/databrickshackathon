/**
 * All Neelu API routes. Every input is validated with Zod; every mutation flows
 * through the service/agent layer which writes audit events. Errors are thrown
 * as typed AppErrors and translated by the error middleware in app.ts.
 */

import { Router } from "express";
import { getDb } from "../db";
import {
  getCaseBySignal,
  getSignal,
  getSystem,
  listCaseAudit,
  listCases,
  listSignals,
  listSystems,
} from "../db/repositories";
import { ok, parse } from "../http/respond";
import { NotFoundError } from "../lib/errors";
import { probeCapabilities } from "../databricks/capabilities";
import { config } from "../config";
import { submitSignal } from "../services/signals";
import {
  approveCase,
  overrideCase,
  requestMoreEvidence,
} from "../services/approvals";
import { resetDemo } from "../services/demo";
import { getCaseDetail, getCaseTrace } from "../services/caseDetail";
import { analyzeCase, analyzeSignal } from "../../agents/orchestrator";
import {
  analyzeSchema,
  approveSchema,
  createSignalSchema,
  demoResetSchema,
  overrideSchema,
  requestMoreEvidenceSchema,
} from "../../shared/schemas";
import { DEFAULT_OPS_ACTOR } from "../../shared/constants";
import type { HealthInfo, SignalDTO } from "../../shared/types";

export const apiRouter = Router();

apiRouter.get("/health", async (_req, res) => {
  const db = await getDb();
  const services = await probeCapabilities(db);
  const health: HealthInfo = {
    ok: true,
    mode: config.mode,
    version: config.version,
    services,
    time: new Date().toISOString(),
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
  const input = parse(createSignalSchema, req.body);
  const signal = await submitSignal(db, input);
  ok(res, signal, 201);
});

apiRouter.get("/signals/:id", async (req, res) => {
  const db = await getDb();
  const signal = await getSignal(db, req.params.id);
  if (!signal) throw new NotFoundError(`Signal ${req.params.id} not found`);
  const [theCase, system] = await Promise.all([
    getCaseBySignal(db, signal.signalId),
    getSystem(db, signal.systemId),
  ]);
  const dto: SignalDTO = {
    ...signal,
    caseId: theCase?.caseId ?? null,
    status: theCase ? "analyzed" : "received",
    systemName: system?.name ?? signal.systemId,
  };
  ok(res, dto);
});

apiRouter.post("/signals/:id/analyze", async (req, res) => {
  const db = await getDb();
  const { actor } = parse(analyzeSchema, req.body ?? {});
  const detail = await analyzeSignal(db, req.params.id, actor ?? DEFAULT_OPS_ACTOR);
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
  const detail = await analyzeCase(db, req.params.id, actor ?? DEFAULT_OPS_ACTOR);
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

apiRouter.post("/demo/reset", async (req, res) => {
  const db = await getDb();
  const input = parse(demoResetSchema, req.body ?? {});
  ok(res, await resetDemo(db, input));
});
