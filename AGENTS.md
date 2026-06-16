# Repository Guide

## Active Product

The product is [`neelu/`](./neelu/): a Databricks-native water-evidence
ledger built with Vite, React, Express, and TypeScript.

Work on product code from `neelu/` and prefer the project docs:

- [`neelu/README.md`](./neelu/README.md)
- [`neelu/HANDOFF.md`](./neelu/HANDOFF.md)
- [`neelu/docs/`](./neelu/docs/)

Use Neelu scripts from `neelu/`:

```bash
npm run dev
npm run build
npm run test
npm run typecheck
npm run eval
npm run check-scope
```

There is intentionally no root Node package. The root contains only this guide,
Codex configuration, MCP config, and a small workflow reference library.

## Runtime Shape

- Local development uses `LOCAL_SIM=true` with in-process PGlite and simulated
  Databricks adapters.
- Production is a Databricks App backed by Lakebase, Unity Catalog, Vector
  Search / AI Search, Model Serving, and MLflow.
- Keep Databricks bundle assets, app manifests, SQL, and notebooks under
  `neelu/`; those are part of the product.

## Workflow Library

The root [`skills/`](./skills/) and [`commands/`](./commands/) directories are
trimmed reference surfaces for Neelu work. Keep additions relevant to:

- TypeScript, React, Express, Vite, and API/backend/frontend work
- testing, evals, verification, security, and code review
- Databricks, Postgres/Lakebase, ML/data workflows, MCP, and research
- product planning, demo, public-health safety, and pitch/support materials

Do not reintroduce off-stack language packs or harnesses unless Neelu actually
adopts that stack.

## Guardrails

- Do not commit generated/vendor folders such as `node_modules`, `dist`, local
  PGlite data, or raw CSV datasets.
- Raw source datasets are staged externally for Databricks jobs; local scripts
  that need them should accept caller-supplied paths.
- Never commit secrets or Databricks credentials. Use environment variables,
  Databricks secrets, or local profiles.
- Keep mutations auditable in the product code. Neelu's safety invariants live
  in `neelu/src/agents/safety.ts` and are checked by evals.

## Testing Guidance

Use localhost first for development because it is fast, inspectable, and
deterministic in `LOCAL_SIM`. Use the Databricks Apps URL for deployment
validation: app startup, env wiring, Lakebase/UC/serving permissions, production
static serving, and public URL behavior.
