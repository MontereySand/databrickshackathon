# Databricks notebook source
# MAGIC %md
# MAGIC # Explore Neelu app data contracts
# MAGIC
# MAGIC This notebook profiles the Databricks source tables against Neelu's app
# MAGIC contracts before the processing notebook is finalized.
# MAGIC
# MAGIC It does not create production app tables. It writes contract/profile tables
# MAGIC that explain whether the required joins and feature families are reliable.

# COMMAND ----------

from __future__ import annotations

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

# COMMAND ----------

dbutils.widgets.text("source_catalog", "workspace")
dbutils.widgets.text("source_schema", "hackathon")
dbutils.widgets.text("output_catalog", "workspace")
dbutils.widgets.text("output_schema", "hackathon")
dbutils.widgets.text("mandatory_catalog", "databricks_virtue_foundation_dataset_dais_2026")
dbutils.widgets.text("mandatory_schema", "virtue_foundation_dataset")

source_catalog = dbutils.widgets.get("source_catalog")
source_schema = dbutils.widgets.get("source_schema")
output_catalog = dbutils.widgets.get("output_catalog")
output_schema = dbutils.widgets.get("output_schema")
mandatory_catalog = dbutils.widgets.get("mandatory_catalog")
mandatory_schema = dbutils.widgets.get("mandatory_schema")

spark.sql(f"CREATE SCHEMA IF NOT EXISTS `{output_catalog}`.`{output_schema}`")

# COMMAND ----------

def table(catalog: str, schema: str, name: str) -> DataFrame:
    return spark.table(f"`{catalog}`.`{schema}`.`{name}`")


def write_table(df: DataFrame, name: str) -> None:
    (
        df.withColumn("_profiled_at", F.current_timestamp())
        .write.mode("overwrite")
        .option("overwriteSchema", "true")
        .format("delta")
        .saveAsTable(f"`{output_catalog}`.`{output_schema}`.`{name}`")
    )


def compact_spaces(col: F.Column) -> F.Column:
    return F.regexp_replace(F.trim(col.cast("string")), r"\s+", " ")


def clean_state(col: F.Column) -> F.Column:
    upper = F.upper(compact_spaces(F.regexp_replace(col.cast("string"), "&", "AND")))
    return (
        F.when(upper == "ORISSA", "ODISHA")
        .when(upper == "CHATTISGARH", "CHHATTISGARH")
        .when(upper == "CHATTISGARH", "CHHATTISGARH")
        .when(upper == "MAHARASTRA", "MAHARASHTRA")
        .when(upper == "PONDICHERRY", "PUDUCHERRY")
        .otherwise(upper)
    )


def clean_district(col: F.Column) -> F.Column:
    no_numeric_code = F.regexp_replace(F.upper(compact_spaces(col)), r"\([0-9 ]+\)$", "")
    return compact_spaces(no_numeric_code)


def key(col: F.Column) -> F.Column:
    return F.regexp_replace(F.lower(compact_spaces(col)), r"[^a-z0-9]+", "_")


def parse_number(col: F.Column) -> F.Column:
    text = F.trim(col.cast("string"))
    stripped = F.regexp_replace(F.regexp_replace(text, r"[(),]", ""), r"\s+", "")
    return (
        F.when(stripped.isin("", "*", "NA", "N/A", "na", "null", "NULL"), None)
        .when(stripped.rlike(r"^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$"), stripped.cast("double"))
        .otherwise(None)
    )


def has_marker(col: F.Column) -> F.Column:
    text = F.trim(col.cast("string"))
    return text.rlike(r"^\(.*\)$") | text.isin("*", "NA", "N/A")


def india_geo_valid(lat: F.Column, lon: F.Column) -> F.Column:
    return F.coalesce(lat.between(6, 38) & lon.between(68, 98), F.lit(False))


def metric(name: str, group: str, value: int | float | str, detail: str = "") -> tuple[str, str, str, str]:
    return (name, group, str(value), detail)

# COMMAND ----------

facilities_raw = table(mandatory_catalog, mandatory_schema, "facilities")
pincode_raw = table(mandatory_catalog, mandatory_schema, "india_post_pincode_directory")
nfhs_raw = table(mandatory_catalog, mandatory_schema, "nfhs_5_district_health_indicators")
water_raw = table(source_catalog, source_schema, "india_affected_water_quality_areas")

# COMMAND ----------

water_events = (
    water_raw.select(
        clean_state(F.col("State Name")).alias("state_name"),
        clean_district(F.col("District Name")).alias("district_name"),
        clean_district(F.col("Block Name")).alias("block_name"),
        clean_district(F.col("Panchayat Name")).alias("panchayat_name"),
        clean_district(F.col("Village Name")).alias("village_name"),
        clean_district(F.col("Habitation Name")).alias("habitation_name"),
        compact_spaces(F.col("Quality Parameter")).alias("quality_parameter"),
        F.coalesce(F.to_date(F.col("Year"), "M/d/yyyy"), F.to_date(F.col("Year"), "d/M/yyyy")).alias("event_date"),
        F.col("District Name").alias("raw_district_name"),
    )
    .withColumn("state_key", key(F.col("state_name")))
    .withColumn("district_key", key(F.col("district_name")))
    .withColumn("event_year", F.year("event_date"))
)

nfhs_geo = (
    nfhs_raw.select(
        clean_state(F.col("state_ut")).alias("state_name"),
        clean_district(F.col("district_name")).alias("district_name"),
    )
    .withColumn("state_key", key(F.col("state_name")))
    .withColumn("district_key", key(F.col("district_name")))
    .dropDuplicates(["state_key", "district_key"])
)

pincode_geo = (
    pincode_raw.select(
        F.col("pincode").cast("string").alias("pincode"),
        clean_state(F.col("statename")).alias("state_name"),
        clean_district(F.col("district")).alias("district_name"),
        parse_number(F.col("latitude")).alias("latitude"),
        parse_number(F.col("longitude")).alias("longitude"),
    )
    .withColumn("state_key", key(F.col("state_name")))
    .withColumn("district_key", key(F.col("district_name")))
    .withColumn("valid_geo", india_geo_valid(F.col("latitude"), F.col("longitude")))
)

facility_clean = (
    facilities_raw.select(
        F.col("unique_id").alias("facility_id"),
        F.col("name").alias("facility_name"),
        F.col("facilityTypeId").alias("facility_type"),
        F.regexp_extract(F.col("address_zipOrPostcode").cast("string"), r"[0-9]{6}", 0).alias("pincode"),
        parse_number(F.col("latitude")).alias("latitude"),
        parse_number(F.col("longitude")).alias("longitude"),
    )
    .withColumn("valid_geo", india_geo_valid(F.col("latitude"), F.col("longitude")))
)

# COMMAND ----------

source_metrics = [
    metric("facilities_rows", "source_count", facilities_raw.count()),
    metric("pincode_directory_rows", "source_count", pincode_raw.count()),
    metric("nfhs_district_rows", "source_count", nfhs_raw.count()),
    metric("water_quality_rows", "source_count", water_raw.count()),
]

try:
    upload_manifest = table(output_catalog, output_schema, "healthanalytics_upload_manifest")
    source_metrics.append(metric("healthanalytics_uploaded_tables", "source_count", upload_manifest.count()))
    source_metrics.append(metric("healthanalytics_uploaded_rows", "source_count", upload_manifest.agg(F.sum("row_count")).first()[0] or 0))
except Exception as exc:
    source_metrics.append(metric("healthanalytics_manifest_missing", "source_count", 1, str(exc)[:500]))

source_profile = spark.createDataFrame(source_metrics, "metric_name string, metric_group string, metric_value string, detail string")
write_table(source_profile, "app_contract_source_profile")

# COMMAND ----------

water_parameter_profile = (
    water_events.where(F.col("quality_parameter").isNotNull())
    .groupBy("quality_parameter")
    .agg(
        F.count("*").alias("event_rows"),
        F.countDistinct("state_key").alias("state_count"),
        F.countDistinct(F.concat_ws("|", "state_key", "district_key")).alias("district_count"),
        F.countDistinct("habitation_name").alias("habitation_count"),
        F.min("event_year").alias("first_year"),
        F.max("event_year").alias("last_year"),
    )
    .orderBy(F.col("event_rows").desc())
)
write_table(water_parameter_profile, "app_contract_water_parameter_profile")

# COMMAND ----------

water_districts = (
    water_events.where((F.col("state_key") != "") & (F.col("district_key") != ""))
    .groupBy("state_name", "district_name", "state_key", "district_key")
    .agg(
        F.count("*").alias("water_event_rows"),
        F.countDistinct("habitation_name").alias("affected_habitations"),
        F.countDistinct("quality_parameter").alias("contaminant_count"),
        F.max("event_year").alias("latest_event_year"),
    )
)

geo_join_profile = (
    water_districts.alias("w")
    .join(nfhs_geo.alias("n"), on=["state_key", "district_key"], how="left")
    .join(
        pincode_geo.select("state_key", "district_key").dropDuplicates(["state_key", "district_key"]).alias("p"),
        on=["state_key", "district_key"],
        how="left",
    )
    .select(
        F.col("w.state_name").alias("state_name"),
        F.col("w.district_name").alias("district_name"),
        "state_key",
        "district_key",
        "water_event_rows",
        "affected_habitations",
        "contaminant_count",
        "latest_event_year",
        F.col("n.district_key").isNotNull().alias("matches_nfhs"),
        F.col("p.district_key").isNotNull().alias("matches_pincode_directory"),
    )
)
write_table(geo_join_profile, "app_contract_geography_join_profile")

geo_summary = geo_join_profile.agg(
    F.count("*").alias("water_districts"),
    F.sum(F.col("matches_nfhs").cast("int")).alias("matched_nfhs"),
    F.sum(F.col("matches_pincode_directory").cast("int")).alias("matched_pincode_directory"),
).withColumn("metric_group", F.lit("geography_join"))
write_table(geo_summary, "app_contract_geography_join_summary")

# COMMAND ----------

pincode_profile = pincode_geo.agg(
    F.count("*").alias("rows"),
    F.countDistinct("pincode").alias("distinct_pincodes"),
    F.sum(F.col("valid_geo").cast("int")).alias("valid_geo_rows"),
    F.sum((~F.col("valid_geo")).cast("int")).alias("invalid_geo_rows"),
    F.countDistinct(F.concat_ws("|", "state_key", "district_key")).alias("districts"),
)
write_table(pincode_profile, "app_contract_pincode_profile")

facility_by_type = (
    facility_clean.groupBy(F.coalesce(F.col("facility_type"), F.lit("unknown")).alias("facility_type"))
    .agg(
        F.count("*").alias("facility_rows"),
        F.sum(F.col("valid_geo").cast("int")).alias("valid_geo_rows"),
        F.sum((F.col("pincode") != "").cast("int")).alias("parseable_pincode_rows"),
    )
    .orderBy(F.col("facility_rows").desc())
)
write_table(facility_by_type, "app_contract_facility_type_profile")

facility_pincode_profile = (
    facility_clean.alias("f")
    .join(
        pincode_geo.select(F.col("pincode").alias("directory_pincode")).dropDuplicates(["directory_pincode"]).alias("p"),
        F.col("f.pincode") == F.col("p.directory_pincode"),
        how="left",
    )
    .agg(
        F.count("*").alias("facilities"),
        F.sum((F.col("f.pincode") != "").cast("int")).alias("parseable_pincode_rows"),
        F.sum(F.col("f.valid_geo").cast("int")).alias("valid_geo_rows"),
        F.sum((~F.col("f.valid_geo")).cast("int")).alias("invalid_geo_rows"),
        F.sum(F.col("p.directory_pincode").isNotNull().cast("int")).alias("pincode_directory_match_rows"),
        F.countDistinct(F.when(F.col("p.directory_pincode").isNotNull(), F.col("f.pincode"))).alias("matched_distinct_pincodes"),
    )
)
write_table(facility_pincode_profile, "app_contract_facility_profile")

# COMMAND ----------

nfhs_indicator_exprs = [
    ("hh_improved_water_pct", F.col("hh_improved_water_pct")),
    ("hh_use_improved_sanitation_pct", F.col("hh_use_improved_sanitation_pct")),
    ("hh_member_covered_health_insurance_pct", F.col("hh_member_covered_health_insurance_pct")),
    ("institutional_birth_5y_pct", F.col("institutional_birth_5y_pct")),
    ("prev_diarrhoea_2wk_child_u5_pct", F.col("prev_diarrhoea_2wk_child_u5_pct")),
    ("children_prev_symptoms_of_acute_respiratory_infection_ari_2_pct", F.col("children_prev_symptoms_of_acute_respiratory_infection_ari_2_pct")),
    ("child_u5_who_are_stunted_height_for_age_18_pct", F.col("child_u5_who_are_stunted_height_for_age_18_pct")),
    ("child_u5_who_are_wasted_weight_for_height_18_pct", F.col("child_u5_who_are_wasted_weight_for_height_18_pct")),
    ("child_u5_who_are_underweight_weight_for_age_18_pct", F.col("child_u5_who_are_underweight_weight_for_age_18_pct")),
    ("all_w15_49_who_are_anaemic_pct", F.col("all_w15_49_who_are_anaemic_pct")),
    ("population_below_age_15_years_pct", F.col("population_below_age_15_years_pct")),
]

indicator_profiles: list[DataFrame] = []
for indicator_name, raw_col in nfhs_indicator_exprs:
    parsed = parse_number(raw_col)
    profile = nfhs_raw.select(raw_col.cast("string").alias("raw_value"), parsed.alias("parsed_value"), has_marker(raw_col).alias("has_marker")).agg(
        F.lit(indicator_name).alias("indicator_name"),
        F.count("*").alias("district_rows"),
        F.sum(F.col("parsed_value").isNotNull().cast("int")).alias("parsed_rows"),
        F.sum(F.col("has_marker").cast("int")).alias("marker_rows"),
        F.min("parsed_value").alias("min_value"),
        F.expr("percentile_approx(parsed_value, 0.5)").alias("median_value"),
        F.max("parsed_value").alias("max_value"),
    )
    indicator_profiles.append(profile)

nfhs_indicator_profile = indicator_profiles[0]
for profile in indicator_profiles[1:]:
    nfhs_indicator_profile = nfhs_indicator_profile.unionByName(profile)

write_table(nfhs_indicator_profile, "app_contract_nfhs_indicator_profile")

# COMMAND ----------

quality_issue_frames = []

quality_issue_frames.append(
    geo_join_profile.where(~F.col("matches_nfhs")).select(
        F.lit("unmatched_water_district_to_nfhs").alias("issue_type"),
        F.lit("high").alias("severity"),
        F.lit("workspace.hackathon.india_affected_water_quality_areas").alias("source_table"),
        "state_name",
        "district_name",
        F.col("water_event_rows").alias("affected_rows"),
        F.to_json(F.struct("state_key", "district_key", "affected_habitations", "latest_event_year")).alias("detail_json"),
    )
)

quality_issue_frames.append(
    geo_join_profile.where(~F.col("matches_pincode_directory")).select(
        F.lit("unmatched_water_district_to_pincode_directory").alias("issue_type"),
        F.lit("medium").alias("severity"),
        F.lit("workspace.hackathon.india_affected_water_quality_areas").alias("source_table"),
        "state_name",
        "district_name",
        F.col("water_event_rows").alias("affected_rows"),
        F.to_json(F.struct("state_key", "district_key", "affected_habitations", "latest_event_year")).alias("detail_json"),
    )
)

quality_issue_frames.append(
    pincode_geo.where(~F.col("valid_geo")).groupBy("state_name", "district_name").agg(F.count("*").alias("affected_rows")).select(
        F.lit("invalid_or_missing_pincode_geo").alias("issue_type"),
        F.lit("medium").alias("severity"),
        F.lit("india_post_pincode_directory").alias("source_table"),
        "state_name",
        "district_name",
        "affected_rows",
        F.lit("{}").alias("detail_json"),
    )
)

quality_issue_frames.append(
    facility_clean.where(~F.col("valid_geo")).agg(F.count("*").alias("affected_rows")).select(
        F.lit("invalid_or_missing_facility_geo").alias("issue_type"),
        F.lit("medium").alias("severity"),
        F.lit("facilities").alias("source_table"),
        F.lit(None).cast("string").alias("state_name"),
        F.lit(None).cast("string").alias("district_name"),
        "affected_rows",
        F.lit("{}").alias("detail_json"),
    )
)

data_quality_issues = quality_issue_frames[0]
for frame in quality_issue_frames[1:]:
    data_quality_issues = data_quality_issues.unionByName(frame)

write_table(data_quality_issues, "app_data_quality_issues")

# COMMAND ----------

display(spark.table(f"`{output_catalog}`.`{output_schema}`.`app_contract_source_profile`"))
display(spark.table(f"`{output_catalog}`.`{output_schema}`.`app_contract_geography_join_summary`"))
display(spark.table(f"`{output_catalog}`.`{output_schema}`.`app_contract_water_parameter_profile`"))
display(spark.table(f"`{output_catalog}`.`{output_schema}`.`app_contract_facility_profile`"))
display(spark.table(f"`{output_catalog}`.`{output_schema}`.`app_contract_nfhs_indicator_profile`"))
