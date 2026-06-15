import { afterAll, beforeEach, describe, expect, it } from "vitest"
import request from "supertest"
import type { Express } from "express"
import { createApp } from "../app"
import { closeDb, getDb } from "../db"
import { seedDemo } from "../services/demo"
import { primaryScenario } from "../data/scenarios"

const NITRATE_SIGNAL = primaryScenario().signalId // SIG-NITRATE-SCHOOL
const COLIFORM_SIGNAL = "SIG-COLIFORM-CLINIC"

let app: Express

beforeEach(async () => {
  await closeDb() // drop any previous in-memory db
  const db = await getDb() // fresh memory db + schema
  await seedDemo(db)
  app = await createApp()
})

afterAll(async () => {
  await closeDb()
})

async function auditActionsFor(entityId: string): Promise<string[]> {
  const db = await getDb()
  const { rows } = await db.query<{ action: string }>(
    "SELECT action FROM audit_events WHERE entity_id = $1",
    [entityId],
  )
  return rows.map((r) => r.action)
}

// The case timeline aggregates audit events for the case and all of its child
// entities (findings, tasks, approvals), mirroring GET /api/cases/:id/audit.
async function caseTimelineActions(caseId: string): Promise<string[]> {
  const res = await request(app).get(`/api/cases/${caseId}/audit`)
  return res.body.data.map((e: { action: string }) => e.action)
}

describe("POST /api/signals validation", () => {
  it("rejects an invalid payload with 400 + details", async () => {
    const res = await request(app)
      .post("/api/signals")
      .send({ systemId: "", testType: "nitrate", resultValue: "abc", unit: "" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBeTruthy()
    expect(Array.isArray(res.body.details)).toBe(true)
    expect(res.body.details.length).toBeGreaterThan(0)
  })

  it("accepts a valid submission, returns 201 + a signal id, and audits it", async () => {
    const res = await request(app).post("/api/signals").send({
      systemId: "sys-school",
      testType: "nitrate",
      resultValue: 12.5,
      unit: "mg/L",
      submittedBy: "tester",
    })
    expect(res.status).toBe(201)
    expect(res.body.data.signalId).toMatch(/^SIG-/)

    const signalId = res.body.data.signalId
    const detail = await request(app).get(`/api/signals/${signalId}`)
    expect(detail.status).toBe(200)
    expect(detail.body.data.status).toBe("received")

    expect(await auditActionsFor(signalId)).toContain("signal_submitted")
  })
})

describe("POST /api/signals/:id/analyze side effects", () => {
  it("creates a cited case, finding, tasks, notices, and audit events", async () => {
    const res = await request(app).post(`/api/signals/${NITRATE_SIGNAL}/analyze`)
    expect(res.status).toBe(201)
    const detail = res.body.data

    expect(detail.case.status).toBe("awaiting_approval")
    expect(detail.case.severity).toBeTruthy()
    expect(detail.finding).not.toBeNull()
    expect(detail.finding.citationsJson.length).toBeGreaterThan(0)
    expect(detail.tasks.length).toBeGreaterThan(0)
    // English + Hindi DRAFT notices.
    expect(detail.notices.length).toBeGreaterThanOrEqual(2)
    expect(detail.pendingApproval).toBe(true)

    // All eval scorers pass on the analyzed case.
    expect(detail.trace).not.toBeNull()
    expect(detail.trace.evalResults.every((r: { passed: boolean }) => r.passed)).toBe(
      true,
    )

    const caseId = detail.case.caseId
    const audit = await request(app).get(`/api/cases/${caseId}/audit`)
    const actions = audit.body.data.map((e: { action: string }) => e.action)
    expect(actions).toContain("case_created")
    expect(actions).toContain("finding_generated")
    expect(actions).toContain("tasks_created")
  })

  it("is idempotent: re-analyzing returns the same case", async () => {
    const first = await request(app).post(`/api/signals/${NITRATE_SIGNAL}/analyze`)
    const second = await request(app).post(`/api/signals/${NITRATE_SIGNAL}/analyze`)
    expect(second.status).toBeLessThan(500)
    expect(second.body.data.case.caseId).toBe(first.body.data.case.caseId)
  })
})

describe("approve / override decisions are audited and immutable", () => {
  it("approves a case, writes an approval + audit, and rejects a second decision", async () => {
    const analyzed = await request(app).post(
      `/api/signals/${NITRATE_SIGNAL}/analyze`,
    )
    const caseId = analyzed.body.data.case.caseId

    const approve = await request(app)
      .post(`/api/cases/${caseId}/approve`)
      .send({ approver: "Dr. Rao", rationale: "Confirmed high nitrate; proceed." })
    expect(approve.status).toBe(200)
    expect(approve.body.data.case.status).toBe("approved")
    expect(approve.body.data.approvals.length).toBeGreaterThan(0)

    expect(await caseTimelineActions(caseId)).toContain("approval_recorded")

    // Deciding again on a decided case is a conflict.
    const again = await request(app)
      .post(`/api/cases/${caseId}/approve`)
      .send({ approver: "Dr. Rao", rationale: "again" })
    expect(again.status).toBe(409)
  })

  it("override requires a replacement action and creates a follow-up task", async () => {
    const analyzed = await request(app).post(
      `/api/signals/${COLIFORM_SIGNAL}/analyze`,
    )
    const caseId = analyzed.body.data.case.caseId

    // Missing replacementAction => 400.
    const bad = await request(app)
      .post(`/api/cases/${caseId}/override`)
      .send({ approver: "Dr. Rao", rationale: "disagree" })
    expect(bad.status).toBe(400)

    const ok = await request(app).post(`/api/cases/${caseId}/override`).send({
      approver: "Dr. Rao",
      rationale: "Kit expired; treat as inconclusive.",
      replacementAction: "Collect a fresh confirmatory sample within 24h.",
    })
    expect(ok.status).toBe(200)
    expect(ok.body.data.case.status).toBe("overridden")

    const actions = await caseTimelineActions(caseId)
    expect(actions).toContain("override_recorded")
  })

  it("request-more-evidence moves the case to needs_more_evidence", async () => {
    const analyzed = await request(app).post(
      `/api/signals/${NITRATE_SIGNAL}/analyze`,
    )
    const caseId = analyzed.body.data.case.caseId

    const res = await request(app)
      .post(`/api/cases/${caseId}/request-more-evidence`)
      .send({
        requestedEvidence: "Independent lab confirmation of nitrate.",
        owner: "Asha",
        dueAt: "2030-01-01",
      })
    expect(res.status).toBe(200)
    expect(res.body.data.case.status).toBe("needs_more_evidence")
    expect(await caseTimelineActions(caseId)).toContain("evidence_requested")
  })
})

describe("GET /api/health", () => {
  it("reports mode and per-service capabilities", async () => {
    const res = await request(app).get("/api/health")
    expect(res.status).toBe(200)
    expect(res.body.data.mode).toBe("LOCAL_SIM")
    expect(res.body.data.services.length).toBe(5)
  })
})
