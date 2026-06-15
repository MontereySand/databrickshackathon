import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { closeDb, getDb } from "../../server/db"
import { seedDemo } from "../../server/services/demo"
import { analyzeSignal } from "../../agents/orchestrator"
import { getCaseDetail } from "../../server/services/caseDetail"
import { listCaseAudit } from "../../server/db/repositories"
import { runScorers } from "../scorers"
import { primaryScenario } from "../../server/data/scenarios"
import { EVAL_SCORERS } from "../../shared/constants"

beforeEach(async () => {
  await closeDb()
  const db = await getDb()
  await seedDemo(db)
})

afterAll(async () => {
  await closeDb()
})

describe("eval scorers on the primary nitrate-near-school case", () => {
  it("passes every scorer", async () => {
    const db = await getDb()
    const detail = await analyzeSignal(db, primaryScenario().signalId, "tester")
    const fresh = await getCaseDetail(db, detail.case.caseId)
    const audit = await listCaseAudit(db, detail.case.caseId)
    expect(fresh).not.toBeNull()

    const results = runScorers(fresh!, audit)
    expect(results.length).toBe(EVAL_SCORERS.length)

    const failed = results.filter((r) => !r.passed)
    expect(
      failed,
      `Failing scorers: ${failed.map((f) => `${f.scorer} (${f.detail})`).join("; ")}`,
    ).toHaveLength(0)
  })
})
