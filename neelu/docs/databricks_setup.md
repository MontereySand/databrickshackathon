# Databricks setup (flip to live)

This is the provisioning checklist to move Neelu from `LOCAL_SIM` to `DATABRICKS`. None of this is possible on Free Edition; you need a workspace tier that supports **Lakebase** and **Databricks Apps**. See [HANDOFF.md](../HANDOFF.md) for the code-side extension points.

## 0. Prerequisites

- A Databricks workspace (not Free Edition) with Apps + Lakebase enabled.
- The `databricks` CLI installed and authenticated (`databricks auth login` or a profile/token).
- This repo deployable from the workspace (Asset Bundle or App source path).

## 1. Lakebase (operational Postgres)

1. Create a Lakebase database (project / branch / database).
2. Obtain a Postgres connection string and set it as `DATABASE_URL`.
3. Apply the schema:
   ```bash
   psql "$DATABASE_URL" -f sql/lakebase_schema.sql
   ```
4. With `DATABASE_URL` set and `LOCAL_SIM=false`, Neelu uses node-postgres automatically — **no code change** — and the proof panel shows Lakebase = **Connected**.

## 2. Unity Catalog (governed source tables)

1. Create catalog/schema (e.g. `UC_CATALOG=neelu`, `UC_SCHEMA=silver`).
2. Create the tables in `sql/uc_tables.sql` and load the synthetic guidance + field-test fixtures (see `src/server/data/`).
3. Implement `src/server/databricks/unityCatalog.ts` to read the site profile from UC.

## 3. AI Search / Vector Search (guidance retrieval)

1. Create a Vector Search endpoint and an index over the guidance chunks (definition in `sql/ai_search_indexes.sql`). Set `AI_SEARCH_INDEX_NAME`.
2. Implement the `DATABRICKS extension point` in `src/server/databricks/aiSearch.ts` to query the index and return `source: "ai_search"`, `fallback: false`.

## 4. Model Serving / AI Gateway (reasoning)

1. Create or choose a serving endpoint; set `MODEL_ENDPOINT_NAME`.
2. Implement the extension point in `src/server/databricks/modelServing.ts` using the constrained prompt in `src/agents/prompts.ts`. Parse + validate the JSON response and return `{ available: true, finding }`.
3. **Keep the deterministic analyzer as the safety net** — if the model is unavailable or its output fails `checkFindingSafety`, fall back. `npm run eval` must stay green.

## 5. MLflow (tracing + eval)

1. Set `MLFLOW_EXPERIMENT_NAME`.
2. Implement `src/server/databricks/mlflow.ts` to create/log a trace and return its id with `source: "mlflow"`.

## 6. Deploy

- **App manifest** — `app.yaml` runs `npm run start`. Ensure `npm install && npm run build` runs in your pipeline first.
- **Asset Bundle** — fill in the workspace host in `databricks.yml`, then `databricks bundle deploy -t dev`.
- Wire `DATABASE_URL` and the resource env vars via workspace secrets/variables (never commit secrets).

## 7. Verify

- `GET /api/health` should show the wired services as `connected`.
- `npm run eval` and `npm run test` still pass.
- Walk the demo path (`docs/demo_script.md`) against the live services.
