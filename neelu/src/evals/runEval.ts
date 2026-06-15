/**
 * Eval harness (`npm run eval`). Seeds a fresh in-memory database, analyzes every
 * demo scenario, and runs the safety/completeness scorers against each resulting
 * case. Prints a per-scenario report and exits non-zero if any scorer fails.
 *
 * Uses an in-memory PGlite db so it never touches the dev/demo data directory.
 */

// Force an ephemeral db before any module reads config.
process.env.PGLITE_DATA_DIR = process.env.PGLITE_DATA_DIR ?? "memory";

import type { EvalScorerResult } from "../shared/types";

interface ScenarioReport {
  scenario: string;
  caseId: string;
  severity: string;
  results: EvalScorerResult[];
}

async function main(): Promise<void> {
  const { getDb, closeDb } = await import("../server/db/index");
  const { ensureSeeded } = await import("../server/services/demo");
  const { analyzeSignal } = await import("../agents/orchestrator");
  const { getCaseDetail } = await import("../server/services/caseDetail");
  const { listCaseAudit } = await import("../server/db/repositories");
  const { runScorers } = await import("./scorers");
  const { SCENARIOS } = await import("../server/data/scenarios");

  const db = await getDb();
  await ensureSeeded(db);

  const reports: ScenarioReport[] = [];
  for (const scenario of SCENARIOS) {
    const detail = await analyzeSignal(db, scenario.signalId, "eval-harness");
    const audit = await listCaseAudit(db, detail.case.caseId);
    const fresh = await getCaseDetail(db, detail.case.caseId);
    const results = runScorers(fresh ?? detail, audit);
    reports.push({
      scenario: scenario.id,
      caseId: detail.case.caseId,
      severity: detail.case.severity ?? "?",
      results,
    });
  }

  let failures = 0;
  console.log("\nNeelu eval report\n=================");
  for (const report of reports) {
    console.log(`\n• ${report.scenario}  (case ${report.caseId}, severity ${report.severity})`);
    for (const result of report.results) {
      const mark = result.passed ? "PASS" : "FAIL";
      if (!result.passed) failures += 1;
      console.log(`    [${mark}] ${result.scorer} — ${result.detail}`);
    }
  }

  const total = reports.reduce((sum, r) => sum + r.results.length, 0);
  console.log(`\nSummary: ${total - failures}/${total} scorer checks passed across ${reports.length} scenarios.`);

  await closeDb();
  if (failures > 0) {
    console.error(`\n${failures} scorer check(s) FAILED.`);
    process.exit(1);
  }
  console.log("\nAll scorer checks passed.");
}

main().catch((error) => {
  console.error("Eval run failed:", error);
  process.exit(1);
});
