# Databricks data pipeline

Neelu uses Databricks tables as the source of truth for analytics and app ranking. Do not use local raw CSV folders as app inputs.

## Verified source tables

Mandatory hackathon datasets:

- `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities`
- `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory`
- `databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators`

Project datasets:

- `workspace.hackathon.india_affected_water_quality_areas`
- `workspace.hackathon.key_indicator_districtwise`
- `workspace.hackathon.key_indicator_statewise`

## Notebooks

- `databricks/notebooks/upload_healthanalytics_csvs.py` uploads a staged folder of split Key Indicator CSVs into `workspace.hackathon`, one table per CSV.
- `databricks/notebooks/explore_app_data_contracts.py` profiles source tables against the app contracts and writes small contract/profile tables.
- `databricks/notebooks/process_app_datasets.py` builds the contract-backed app-ready Delta tables for Neelu.

The upload notebook needs the source data staged in Databricks first. Raw CSV
datasets are intentionally not committed to this repo; keep them outside the
repo or in a workspace volume, then upload/stage them before running the job.
A typical staged location is:

```text
dbfs:/Volumes/workspace/hackathon/raw_files/healthanalytics
```

The notebook will resolve the nested `healthanalytics/Key_Indicator_State_and_District_wise_data` folder automatically. Once staged, run the notebook with:

- `source_dir`: staged data path, or the nested healthanalytics CSV folder path
- `output_catalog`: `workspace`
- `output_schema`: `hackathon`

## Contract/profile output tables

The exploration notebook writes:

- `workspace.hackathon.app_contract_source_profile`
- `workspace.hackathon.app_contract_water_parameter_profile`
- `workspace.hackathon.app_contract_geography_join_profile`
- `workspace.hackathon.app_contract_geography_join_summary`
- `workspace.hackathon.app_contract_pincode_profile`
- `workspace.hackathon.app_contract_facility_type_profile`
- `workspace.hackathon.app_contract_facility_profile`
- `workspace.hackathon.app_contract_nfhs_indicator_profile`

## App-ready output tables

The processing notebook writes:

- `workspace.hackathon.app_geography_bridge`
- `workspace.hackathon.app_water_quality_events`
- `workspace.hackathon.app_water_quality_district_summary`
- `workspace.hackathon.app_facility_access_by_pincode`
- `workspace.hackathon.app_facility_access_by_district`
- `workspace.hackathon.app_nfhs_vulnerability_indicators`
- `workspace.hackathon.app_priority_geographies`
- `workspace.hackathon.app_model_context_packs`
- `workspace.hackathon.app_data_quality_issues`

`app_priority_geographies` is the main table for the app's "medical desert + water quality" ranking. `app_facility_access_by_pincode` and `app_model_context_packs` support QR/intake and model-context workflows.

## Bundle jobs

The bundle defines three jobs:

- `neelu_upload_healthanalytics`
- `neelu_explore_app_data_contracts`
- `neelu_process_app_datasets`

Deploy and run from `neelu/`:

```bash
databricks bundle validate --profile dev
databricks bundle deploy -t dev --profile dev
databricks bundle run neelu_upload_healthanalytics -t dev --profile dev
databricks bundle run neelu_explore_app_data_contracts -t dev --profile dev
databricks bundle run neelu_process_app_datasets -t dev --profile dev
```

Run them in that order. Upload is raw ingestion, exploration validates the app contracts against the live tables, and processing publishes the app-facing tables.
