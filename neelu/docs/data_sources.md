# Data sources & schema

> **All data in Neelu is synthetic and fictional**, created for demonstration. No real water systems, people, or lab results are represented. Reference thresholds approximate widely-cited drinking-water values (e.g. EPA MCLs / WHO guideline values) and are used for *demo reasoning only* — Neelu never certifies regulatory compliance.

## Operational schema (Lakebase / PGlite)

`sql/lakebase_schema.sql` defines 9 tables. The same DDL runs on PGlite (LOCAL_SIM) and Lakebase (DATABRICKS).

| Table | Purpose |
|---|---|
| `systems` | Water systems / sites under monitoring. |
| `signals` | Field test submissions (the raw evidence). |
| `cases` | A reviewable case opened from a signal. |
| `evidence_items` | Evidence attached to a case (field result, guidance, site profile, …). |
| `agent_findings` | The cited agent finding + recommendation + uncertainty + citations. |
| `tasks` | The action plan (confirmatory sample, notify, review notice, follow-up, record). |
| `approvals` | Human decisions (approved / overridden / more-evidence-requested). |
| `audit_events` | Immutable, append-only audit trail of every mutation. |
| `demo_runs` | Records each deterministic demo reset (scenario + seed). |

## Unity Catalog source tables (DATABRICKS)

`sql/uc_tables.sql` contains placeholder DDL for the governed raw/silver/gold tables (e.g. `water_guidance_docs`, `synthetic_field_tests`, `guidance_chunks`). In LOCAL_SIM the equivalent fixtures live in `src/server/data/`.

## Guidance corpus

`src/server/data/guidance.ts` holds the synthetic guidance documents retrieved during analysis (one per contaminant: nitrate, coliform, turbidity, pH, arsenic, chlorine). Each has a stable id, title, source name/uri, applicability, body text, and tags. In LOCAL_SIM these are keyword-searched; in DATABRICKS they back the AI Search / Vector Search index defined in `sql/ai_search_indexes.sql`.

## Seed systems & scenarios

`src/server/data/scenarios.ts` defines 3 systems and 3 reproducible scenarios (stable signal ids so resets are deterministic):

- **Primary — `nitrate_school`**: nitrate 18.4 mg/L at "North School Tap" (serves children under 6). Exceeds the 10 mg/L reference → high severity.
- **`coliform_expired_kit`**: positive coliform at "Hill Clinic Supply" but the kit is **expired** → elevated uncertainty, confirmatory sample required.
- **`turbidity_pipe_repair`**: turbidity 7.2 NTU at "Demo Village Water Point" after a pipe repair, no confirmatory microbiological sample yet.

`primaryScenario()` returns the nitrate-near-school case used as the headline demo.
