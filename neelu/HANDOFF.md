# HANDOFF — read me first

> **This is a pickup-later codebase.** It was built during hackathon prep on Databricks **Free Edition**, which cannot provision Lakebase or Databricks Apps. Everything that does **not** need live Databricks resources is **done and working in `LOCAL_SIM` mode**. The Databricks integrations are coded as typed adapters with explicit extension points, but are **inert** until a capable workspace + resource names exist. This document tells the next agent exactly what works, what is blocked, and how to finish.

## Repository & harness context

Neelu lives in the `neelu/` subfolder of this repository. The root now contains only lightweight Codex configuration plus a trimmed workflow reference library (`skills/` and `commands/`) for Neelu work. When picking this up:

- **The product is everything under `neelu/`.** Run all product commands from `neelu/` (`npm run dev|build|test|typecheck|eval|check-scope`).
- There is no root Node package after the cleanup. Use `neelu/package.json` for product scripts.
- The root git repository tracks the product plus selected workflow references. Do not reintroduce generated/vendor folders, raw CSV datasets, or off-stack harness directories.

## TL;DR for the next agent

1. `cd neelu && npm install && npm run dev` → full app works locally at `http://localhost:8000`.
2. Run `npm run eval` and `npm run test` → both green. This is your behavioral spec.
3. To go live, implement the four `// DATABRICKS extension point` blocks (search them) and supply the env vars in `.env.example`. Each adapter already documents its contract.
4. Nothing in the app silently breaks if a service is missing — it degrades to the local fallback and the proof panel shows `Local fallback`.

## What works locally right now

- **Field intake → signal → cited analysis → human approval → audit/trace** end to end.
- Real Postgres schema (`sql/lakebase_schema.sql`, 9 tables) running on in-process **PGlite**.
- Deterministic agent pipeline (`src/agents/`) with cite-or-mark-unsupported, uncertainty flagging, required-human-approval, and no-compliance-claim guardrails.
- Keyword guidance retrieval over a seeded corpus (`src/server/data/guidance.ts`).
- Three screens: `/field`, `/` command desk, `/cases/:id` (7 tabs).
- Capability **proof panel** + `/api/health` showing each service's connected/fallback state.
- `seed`, `reset-demo`, `eval`, `check-scope` scripts; vitest + supertest tests.
- Deploy manifests: `app.yaml` (Databricks Apps) and `databricks.yml` (Asset Bundle) — templates ready.

## Hard blockers (need a human / a capable workspace)

These are the things we could **not** do here and that you must supply:

1. **Account tier** — Lakebase and Databricks Apps require a non-Free workspace. Free Edition cannot run them.
2. **Databricks AppKit template** — if your org uses a specific AppKit scaffold/preset, paste it; this build follows the documented Vite + Express AppKit pattern but was scaffolded with the public shadcn Vite generator.
3. **Resource names / connection details** (none of these exist yet):
   - `DATABRICKS_HOST` and auth (`DATABRICKS_TOKEN` or `DATABRICKS_PROFILE`).
   - **Lakebase**: the project / branch / database and a Postgres `DATABASE_URL`.
   - **Model Serving / AI Gateway**: `MODEL_ENDPOINT_NAME`.
   - **AI Search / Vector Search**: endpoint + `AI_SEARCH_INDEX_NAME`.
   - **Unity Catalog**: `UC_CATALOG` / `UC_SCHEMA` for governed source tables.
   - **MLflow**: `MLFLOW_EXPERIMENT_NAME`.
4. **Live deployment access** — the `databricks` CLI is installed locally, but deploy/validation still needs an authenticated profile plus a workspace that supports Apps and Lakebase.

## Flip to `DATABRICKS` mode — step by step

1. **Provision** the resources in [docs/databricks_setup.md](./docs/databricks_setup.md). Create the Lakebase DB and run `sql/lakebase_schema.sql` against it. Create UC tables from `sql/uc_tables.sql` and the index from `sql/ai_search_indexes.sql`.
2. **Configure env** — copy `.env.example` → `.env`, set `LOCAL_SIM=false`, `DATABASE_URL=...`, and the resource names. With `DATABASE_URL` set, Neelu already uses node-postgres against Lakebase (no code change needed) and the proof panel shows Lakebase = **Connected**.
3. **Implement the live adapters** (each is small and isolated). Search the repo for `DATABRICKS extension point`:
   - `src/server/databricks/aiSearch.ts` → call Vector Search, return `source: "ai_search"`, `fallback: false`.
   - `src/server/databricks/modelServing.ts` → call `MODEL_ENDPOINT_NAME` with `src/agents/prompts.ts`, parse/validate, return `{ available: true, finding }`. The deterministic finding stays as the safety net.
   - `src/server/databricks/mlflow.ts` → start/log a real trace, return its id and `source: "mlflow"`.
   - `src/server/databricks/unityCatalog.ts` → read the governed site profile from UC instead of the local fixture.
   Update each `*Capability()` to report `connected` when wired.
4. **Deploy** — fill in `databricks.yml` workspace host, `databricks bundle deploy -t dev`, or deploy the App pointing at `app.yaml`.
5. **Verify** — `/api/health` should show the wired services as `connected`; `npm run eval` must still pass (the safety scorers are mode-independent).

## Guardrails that must not regress

Whatever you wire up, these invariants are non-negotiable (enforced in `src/agents/safety.ts`, checked by `src/evals/scorers.ts`):

- Every finding **cites sources** or marks claims unsupported.
- Findings **flag uncertainty**.
- A case **always requires human approval** before action.
- **No certified-compliance language** is ever emitted.
- Every mutation **writes an `audit_events` row**.

If a model output violates these, prefer the deterministic fallback. Keep `npm run eval` green.

## Where things live

```
neelu/
  src/shared/      types, zod schemas, constants (single source of truth)
  src/server/      express app, routes, db (pglite/postgres), services, databricks adapters
  src/agents/      orchestrator, tools, prompts, safety, deterministic fallback
  src/evals/       scorers + runEval
  src/client/      react SPA (routes/, components/, lib/)
  sql/             lakebase_schema.sql, uc_tables.sql, ai_search_indexes.sql
  scripts/         seedDemo, resetDemo, checkScope
  docs/            architecture, api, safety, data_sources, demo_script, testing, databricks_setup, mcp, third_party_notices
  app.yaml, databricks.yml, .env.example
```
