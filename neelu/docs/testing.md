# Testing

Neelu uses **Vitest** (test runner) and **supertest** (HTTP assertions against the Express app) plus a standalone **eval harness**. Tests run against an ephemeral in-memory PGlite database (`PGLITE_DATA_DIR=memory`) so they are isolated and require no Databricks.

## Commands

```bash
npm run test        # run all vitest suites once
npm run test:watch  # watch mode
npm run eval        # run the eval harness over all scenarios (non-zero exit on failure)
npm run typecheck   # tsc for client + server projects
npm run check-scope # static file + route guardrail
```

## What is covered

- **Signals validation** — `POST /api/signals` rejects invalid payloads (missing system, non-numeric value, bad date) with `400` + `details`, and accepts a valid submission, writing a `signal_submitted` audit event.
- **Analyze side effects** — `POST /api/signals/:id/analyze` creates a case, a cited finding, evidence, the required tasks, DRAFT notices, and the corresponding audit events; the case ends in `awaiting_approval`.
- **Approve / override audit** — approving writes an `approvals` row + audit and flips status to `approved`; override requires a rationale + replacement action, creates a follow-up task, and is audited; deciding an already-decided case returns `409`.
- **Eval scorers on the primary case** — running the full pipeline on the nitrate-near-school scenario passes all six scorers.

## Eval harness

`src/evals/runEval.ts` seeds an in-memory DB, analyzes every scenario, runs `runScorers()` against each resulting `CaseDetail` + audit trail, and prints a per-scenario report. It exits non-zero if any scorer fails — wire this into CI as the safety gate. The same scorers are rendered live in the case **Trace** tab so reviewers see them in the UI.

## Conventions

- Tests live in `src/**/__tests__` or `*.test.ts`.
- Each test gets a fresh app + in-memory DB; no shared state between tests.
- Prefer asserting on **audit events and persisted state** (the source of truth) over implementation details.
