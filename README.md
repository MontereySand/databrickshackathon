# Neelu Workspace

This repository is centered on [`neelu/`](./neelu), a Databricks-native
water-evidence ledger. Neelu turns phone-submitted or field-submitted water
quality evidence into cited, human-approved, auditable public-health action
cases.

## Start Here

```bash
cd neelu
npm install
npm run dev
```

Then open `http://localhost:8000`.

Primary docs:

- [`neelu/README.md`](./neelu/README.md) - local setup and product overview
- [`neelu/HANDOFF.md`](./neelu/HANDOFF.md) - what works, what is blocked, and
  how to flip to live Databricks resources
- [`neelu/docs/databricks_setup.md`](./neelu/docs/databricks_setup.md) -
  Lakebase, Databricks Apps, Unity Catalog, Vector Search, Model Serving, and
  MLflow setup
- [`neelu/docs/databricks_data_pipeline.md`](./neelu/docs/databricks_data_pipeline.md)
  - Databricks notebook jobs and app-ready data tables

## Repository Layout

```text
neelu/       Product app, Databricks assets, docs, SQL, tests, evals
.codex/     Codex project configuration and local agent role definitions
.agents/    Active Codex skills
skills/     Trimmed Neelu-relevant skill reference library
commands/   Trimmed workflow command reference library
mcp-configs/ Optional MCP config examples
```

Generated folders, dependency installs, local databases, and raw datasets are
ignored and should not be committed.

## Testing

Run local gates from `neelu/`:

```bash
npm run check-scope
npm run typecheck
npm run test
npm run eval
npm run build
```

Use localhost for normal development. Use the Databricks Apps URL for deployed
validation after bundle/app changes.

## Databricks CLI

The Databricks bundle lives in `neelu/databricks.yml`. When a workspace profile
is configured, validate or deploy from `neelu/`:

```bash
databricks bundle validate -t dev
databricks bundle deploy -t dev
```

Do not commit workspace tokens, connection strings, or raw staged datasets.
