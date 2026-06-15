# Neelu app data contracts

This document defines the app-facing data we should build before finalizing
`databricks/notebooks/process_app_datasets.py`.

The intended order is:

1. Upload raw and reference datasets into Unity Catalog.
2. Define the app workflows and data contracts.
3. Explore the real Databricks tables against those contracts.
4. Rewrite the processing job to produce only contract-backed tables.

That order has now been executed for the current `dev` workspace:

- `neelu_upload_healthanalytics`: succeeded.
- `neelu_explore_app_data_contracts`: succeeded.
- `neelu_process_app_datasets`: succeeded.

## Product workflows

### Command desk priority view

The desk needs a ranked list of districts or pincodes where historical water
quality burden, weak facility access, and population vulnerability overlap.

Required contract:

- Stable geography key: `state_key`, `district_key`, optional `pincode`.
- Display geography: state, district, optional block/village/habitation.
- Risk features: event count, affected habitations, contaminant count,
  dominant contaminant, latest evidence year.
- Medical access features: facility count, hospital count, clinic count,
  valid facility geo count, facilities per pincode.
- Vulnerability features: selected NFHS indicators with parsed numeric values
  and data-quality flags.
- Explanation fields: plain-language reason, top contributing factors, source
  table names, and freshness.
- Quality fields: join status, unmatched geography reason, invalid geo count.

### Field intake and QR activation

The field worker flow needs safe, constrained choices for where a submitted
voice or form signal belongs.

Required contract:

- QR target can resolve to a pincode, facility, district, or monitored site.
- Intake context includes allowed contaminants, suggested units, location label,
  nearest/related facilities, and known local water-quality history.
- Any inferred field from voice must have confidence and source text span.
- Low confidence, unsupported contaminant, impossible unit, or unmatched
  geography must route to human review before case creation.

### Case review evidence

The case page needs cited context that can be attached as evidence and inspected
by a reviewer.

Required contract:

- Evidence snippets must include title, body, source table, source row key, and
  confidence.
- Water-quality context must be described as historical affected-area evidence,
  not current certification.
- Facility-access context must show whether geo was exact, pincode-derived, or
  invalid/missing.
- NFHS context must expose parsed values and original raw values when markers
  such as parentheses or `*` are present.

### Model context pack

The voice transcription model should receive a small, deterministic payload
rather than raw table rows.

Required contract:

- Input: transcript, QR/geography context, allowed contaminant/unit dictionary,
  and top local risk facts.
- Output: structured signal draft with contaminant, result value, unit,
  location, kit metadata, missing fields, confidence per field, and safety flags.
- Guardrails: no certified-compliance language, cite or mark unsupported, force
  human approval for every action.

## Current exploration findings

- Upload succeeded and wrote 52 Healthanalytics CSV tables plus
  `workspace.hackathon.healthanalytics_upload_manifest`.
- Core source row counts:
  - `facilities`: 10,088
  - `india_post_pincode_directory`: 165,627
  - `nfhs_5_district_health_indicators`: 706
  - `india_affected_water_quality_areas`: 550,245
  - `key_indicator_districtwise`: 284
  - `key_indicator_statewise`: 9
- Water-quality parameters are limited to Iron, Salinity, Fluoride, Arsenic,
  and Nitrate, with event dates from 2009 through 2012.
- Facility data is usable for access scoring after validation:
  - 9,791 of 10,088 rows have a parseable six-digit pincode.
  - 9,572 rows match the official pincode directory.
  - 9,964 rows have India-bounds latitude/longitude.
- Pincode directory data has full pincode coverage, but about 12,009 rows use
  `NA` strings for latitude or longitude.
- District joins are feasible but not clean enough to hide:
  - After minimal state/district normalization, 427 of 498 water-quality
    districts match NFHS.
  - 419 of 498 match the pincode directory.
  - Historical state boundaries and aliases need explicit handling.
- NFHS has many usable numeric indicators, but some child nutrition fields are
  strings because the raw values include footnote markers such as parentheses
  and `*`. The parser must preserve raw values and add quality flags.

## Processing implications

The processing job now produces these contract-backed tables:

- `app_geography_bridge`
- `app_water_quality_events`
- `app_water_quality_district_summary`
- `app_facility_access_by_pincode`
- `app_facility_access_by_district`
- `app_nfhs_vulnerability_indicators`
- `app_priority_geographies`
- `app_model_context_packs`
- `app_data_quality_issues`

Lakebase should remain the system of record for human workflow state: signals,
cases, evidence, findings, tasks, approvals, and audit events. Unity Catalog
tables should feed analytics, ranking, evidence context, and model context.

## Current processed output counts

- `app_geography_bridge`: 911
- `app_water_quality_events`: 550,245
- `app_water_quality_district_summary`: 498
- `app_facility_access_by_pincode`: 3,013
- `app_facility_access_by_district`: 555
- `app_nfhs_vulnerability_indicators`: 706
- `app_priority_geographies`: 498
- `app_model_context_packs`: 498
- `app_data_quality_issues`: 660

## Priority score semantics

`app_priority_geographies.neelu_priority_score` is coverage-adjusted. Missing
NFHS or facility evidence lowers the published score instead of allowing
water-only districts to dominate the queue.

`normalized_priority_score` is retained for comparing geographies using only
the evidence available for that row. The app should rank by
`neelu_priority_score`, show `data_completeness_score`, and expose
`join_status`.

The top complete geographies after the coverage-adjusted run were:

- Katihar, Bihar
- Bahraich, Uttar Pradesh
- Begusarai, Bihar
- Munger, Bihar
- Murshidabad, West Bengal

## Data-quality issues to surface

The current processing run produced:

- 70 unmatched water-quality district groups to NFHS, affecting 36,426 source
  rows.
- 79 unmatched water-quality district groups to the pincode directory,
  affecting 55,585 source rows.
- 510 pincode district groups with invalid or missing pincode geo, affecting
  14,615 pincode rows.
- 124 facilities with invalid or missing facility geo.

The app should not hide these. Priority rows should display `join_status` and
`data_completeness_score`; reviewer evidence should cite whether facility geo
is exact, pincode-derived, or unavailable.
