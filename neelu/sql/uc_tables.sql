-- Neelu Unity Catalog / Delta source design (DATABRICKS mode).
--
-- These are governed source + analytics tables. In LOCAL_SIM the same shapes are
-- represented by seeded in-app data (see src/server/data/*). Run this against a
-- Unity Catalog-enabled workspace to provision the governed lakehouse side.
--
-- Layers:
--   raw    -> ingested synthetic source data
--   silver -> cleaned / chunked / profiled
--   gold   -> eval + demo curation
--
-- Replace `neelu` with your UC_CATALOG and adjust schemas to taste.

CREATE CATALOG IF NOT EXISTS neelu;

CREATE SCHEMA IF NOT EXISTS neelu.raw;
CREATE SCHEMA IF NOT EXISTS neelu.silver;
CREATE SCHEMA IF NOT EXISTS neelu.gold;

-- ---------------------------------------------------------------------------
-- raw
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neelu.raw.water_guidance_docs (
  doc_id          STRING,
  title           STRING,
  body            STRING,
  source_name     STRING,
  source_uri      STRING,
  jurisdiction    STRING,
  applies_to      STRING,   -- comma-separated test types
  published_at    DATE,
  ingested_at     TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS neelu.raw.synthetic_field_tests (
  signal_id       STRING,
  system_id       STRING,
  test_type       STRING,
  result_value    DOUBLE,
  unit            STRING,
  kit_id          STRING,
  kit_expires_at  DATE,
  location_label  STRING,
  notes           STRING,
  received_at     TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS neelu.raw.synthetic_sites (
  system_id         STRING,
  name              STRING,
  region            STRING,
  country           STRING,
  population_served INT,
  system_type       STRING,
  source_water_type STRING,
  latitude          DOUBLE,
  longitude         DOUBLE
) USING DELTA;

CREATE TABLE IF NOT EXISTS neelu.raw.synthetic_operator_notes (
  note_id     STRING,
  system_id   STRING,
  author      STRING,
  body        STRING,
  created_at  TIMESTAMP
) USING DELTA;

-- ---------------------------------------------------------------------------
-- silver
-- ---------------------------------------------------------------------------

-- Chunked guidance, the retrieval surface for AI Search (see ai_search_indexes.sql).
CREATE TABLE IF NOT EXISTS neelu.silver.guidance_chunks (
  chunk_id     STRING,
  doc_id       STRING,
  title        STRING,
  chunk_text   STRING,
  source_name  STRING,
  source_uri   STRING,
  applies_to   STRING,
  embedding    ARRAY<FLOAT>   -- optional precomputed embedding
) USING DELTA;

CREATE TABLE IF NOT EXISTS neelu.silver.site_profiles (
  system_id         STRING,
  name              STRING,
  region            STRING,
  population_served INT,
  source_water_type STRING,
  risk_notes        STRING,
  last_incident_at  TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS neelu.silver.signal_events (
  signal_id     STRING,
  system_id     STRING,
  test_type     STRING,
  result_value  DOUBLE,
  unit          STRING,
  exceeds       BOOLEAN,
  received_at   TIMESTAMP
) USING DELTA;

-- ---------------------------------------------------------------------------
-- gold
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS neelu.gold.eval_cases (
  eval_case_id  STRING,
  scenario_id   STRING,
  signal_id     STRING,
  expected_severity STRING,
  expected_requires_approval BOOLEAN,
  expected_tasks ARRAY<STRING>
) USING DELTA;

CREATE TABLE IF NOT EXISTS neelu.gold.demo_scenarios (
  scenario_id   STRING,
  name          STRING,
  description   STRING,
  is_primary    BOOLEAN
) USING DELTA;

CREATE TABLE IF NOT EXISTS neelu.gold.eval_results (
  run_id        STRING,
  eval_case_id  STRING,
  scorer        STRING,
  passed        BOOLEAN,
  detail        STRING,
  evaluated_at  TIMESTAMP
) USING DELTA;
