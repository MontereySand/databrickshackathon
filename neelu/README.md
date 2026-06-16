# Neelu — Water Evidence Ledger

> **Status: Hackathon-prep / handoff build.** Neelu runs **fully end-to-end today in `LOCAL_SIM` mode** (no Databricks account, no credentials). The Databricks integrations (Lakebase, Unity Catalog, AI Search, Model Serving, MLflow) are **coded but inert** — wired behind typed adapters with documented extension points. See **[HANDOFF.md](./HANDOFF.md)** to flip it to a live Databricks workspace.

Neelu turns phone-submitted water-test evidence into **cited, human-approved, fully auditable** public-health action cases. A field worker submits a test result; an agent retrieves guidance, classifies severity, drafts an action plan + public notice (English/Hindi), and **requires a human to approve or override** before anything is acted on. Every step is written to an immutable audit trail and a reasoning trace with deterministic eval scorers.

## Why it's built this way

The hackathon environment is Databricks **Free Edition**, which cannot run Lakebase or Databricks Apps. Rather than stub a fake demo, Neelu implements the *real* application logic against the *real* Postgres schema using in-process [PGlite](https://github.com/electric-sql/pglite), and mocks only the Databricks service boundary. The same code path runs against Lakebase + Vector Search + Model Serving once those resources exist.

## Quick start (local, no Databricks)

```bash
cd neelu
npm install
npm run dev          # Express + Vite on http://localhost:8000 (auto-seeds demo data)
```

Then:

- **`/field`** — submit a water test (mobile-first intake).
- **`/`** — command desk: systems, signal & case queues, Databricks proof panel, reset-demo.
- **`/cases/:id`** — review evidence, the cited agent finding, tasks, the DRAFT notice, approve/override/request-more-evidence, audit timeline, and the reasoning trace + eval scorers.

The primary demo scenario is **high nitrate near a school**.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Express server with Vite middleware; auto-seeds on first run. |
| `npm run build` | Builds the client (`dist/client`) and bundles the server (`dist/server`). |
| `npm run start` | Production server (used by `app.yaml` on Databricks Apps). |
| `npm run typecheck` | Type-checks client and server projects. |
| `npm run test` | Vitest + supertest API/eval tests. |
| `npm run eval` | Runs the eval harness over all scenarios; non-zero exit on any failed scorer. |
| `npm run seed` | Seeds demo data if the DB is empty. |
| `npm run seed:fountains -- <csv>` | Optional local helper for generating water points from a caller-supplied CSV. Raw source datasets are not committed. |
| `npm run reset-demo` | Deterministically wipes and reseeds (`--seed <n>`, `--scenario <name>`). |
| `npm run check-scope` | Verifies required files exist and client/server routes agree. |

## Runtime modes

| | `LOCAL_SIM` (default) | `DATABRICKS` |
|---|---|---|
| Operational store | In-process PGlite Postgres | Lakebase Postgres (`DATABASE_URL`) |
| Guidance retrieval | Keyword search over seeded corpus | AI Search / Vector Search |
| Finding generation | Deterministic rule-based analyzer | Model Serving + deterministic safety net |
| Tracing / eval | Local trace + deterministic scorers | MLflow traces + eval |
| Source tables | Seeded fixtures | Unity Catalog |

Set `LOCAL_SIM=false` plus the resource env vars (see `.env.example`) to attempt `DATABRICKS` mode. The live adapters still need implementing — they are clearly marked. **[HANDOFF.md](./HANDOFF.md)** has the step-by-step.

## Safety posture

Neelu is **advisory only**. It never certifies legal/regulatory compliance, always flags uncertainty, always cites or marks unsupported, and **always requires human approval**. These properties are enforced in `src/agents/safety.ts` and checked by eval scorers on every analysis. See [docs/safety.md](./docs/safety.md).

## Docs

- [docs/architecture.md](./docs/architecture.md) — system shape and data flow
- [docs/api.md](./docs/api.md) — REST endpoints
- [docs/data_sources.md](./docs/data_sources.md) — schema + synthetic data provenance
- [docs/safety.md](./docs/safety.md) — guardrails and eval scorers
- [docs/demo_script.md](./docs/demo_script.md) — 3-minute walkthrough
- [docs/testing.md](./docs/testing.md) — test + eval strategy
- [docs/databricks_setup.md](./docs/databricks_setup.md) — provisioning the live resources
- [docs/mcp.md](./docs/mcp.md) — MCP server configs for agent tooling
- [docs/third_party_notices.md](./docs/third_party_notices.md) — dependencies & data licensing notes
- [HANDOFF.md](./HANDOFF.md) — **start here if you are picking this up**

All synthetic data is fictional and for demonstration only.
