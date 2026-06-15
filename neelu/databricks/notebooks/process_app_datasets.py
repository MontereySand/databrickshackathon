# Databricks notebook source
# MAGIC %md
# MAGIC # Build Neelu contract-backed app datasets
# MAGIC
# MAGIC This notebook consumes Databricks source tables only and writes app-facing
# MAGIC Delta tables for Neelu.
# MAGIC
# MAGIC It intentionally separates:
# MAGIC
# MAGIC - Unity Catalog analytics/evidence context: this notebook's outputs.
# MAGIC - Lakebase operational state: signals, cases, findings, approvals, audit.

# COMMAND ----------

from __future__ import annotations

from pyspark.sql import DataFrame, Window
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
        df.withColumn("_processed_at", F.current_timestamp())
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


def scored_percentile(col_name: str, ascending: bool = True) -> F.Column:
    order_col = F.col(col_name).asc_nulls_last() if ascending else F.col(col_name).desc_nulls_last()
    ranked = F.percent_rank().over(Window.orderBy(order_col))
    return F.when(F.col(col_name).isNotNull(), ranked)

# COMMAND ----------

facilities_raw = table(mandatory_catalog, mandatory_schema, "facilities")
pincode_raw = table(mandatory_catalog, mandatory_schema, "india_post_pincode_directory")
nfhs_raw = table(mandatory_catalog, mandatory_schema, "nfhs_5_district_health_indicators")
water_raw = table(source_catalog, source_schema, "india_affected_water_quality_areas")

# COMMAND ----------

pincode_geo = (
    pincode_raw.select(
        F.col("pincode").cast("string").alias("pincode"),
        F.col("officename").alias("office_name"),
        F.col("officetype").alias("office_type"),
        F.col("delivery").alias("delivery_status"),
        clean_state(F.col("statename")).alias("state_name"),
        clean_district(F.col("district")).alias("district_name"),
        parse_number(F.col("latitude")).alias("latitude"),
        parse_number(F.col("longitude")).alias("longitude"),
    )
    .withColumn("state_key", key(F.col("state_name")))
    .withColumn("district_key", key(F.col("district_name")))
    .withColumn("valid_geo", india_geo_valid(F.col("latitude"), F.col("longitude")))
    .withColumn("geo_source", F.when(F.col("valid_geo"), F.lit("pincode_directory")).otherwise(F.lit("missing_or_invalid")))
    .withColumn("source_table", F.lit(f"{mandatory_catalog}.{mandatory_schema}.india_post_pincode_directory"))
)

pincode_distinct = pincode_geo.select(
    "pincode",
    "state_name",
    "district_name",
    "state_key",
    "district_key",
    "latitude",
    "longitude",
    "valid_geo",
).dropDuplicates(["pincode"])

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
        F.col("Year").alias("event_date_raw"),
        F.col("District Name").alias("district_name_raw"),
        F.col("Habitation Name").alias("habitation_name_raw"),
    )
    .withColumn("state_key", key(F.col("state_name")))
    .withColumn("district_key", key(F.col("district_name")))
    .withColumn("quality_parameter_key", key(F.col("quality_parameter")))
    .withColumn("event_date", F.coalesce(F.to_date(F.col("event_date_raw"), "M/d/yyyy"), F.to_date(F.col("event_date_raw"), "d/M/yyyy")))
    .withColumn("event_year", F.year("event_date"))
    .withColumn("source_table", F.lit(f"{source_catalog}.{source_schema}.india_affected_water_quality_areas"))
    .withColumn("evidence_kind", F.lit("historical_affected_area"))
    .withColumn("evidence_note", F.lit("Historical affected-area evidence from 2009-2012; not a current water-quality certification."))
)
write_table(water_events, "app_water_quality_events")

# COMMAND ----------

water_param_counts = (
    water_events.where(F.col("quality_parameter_key").isNotNull() & (F.col("quality_parameter_key") != ""))
    .groupBy("state_key", "district_key", "quality_parameter", "quality_parameter_key")
    .agg(F.count("*").alias("parameter_event_count"))
)

dominant_window = Window.partitionBy("state_key", "district_key").orderBy(F.col("parameter_event_count").desc(), F.col("quality_parameter_key").asc())
dominant_water_parameter = (
    water_param_counts.withColumn("rn", F.row_number().over(dominant_window))
    .where(F.col("rn") == 1)
    .select(
        "state_key",
        "district_key",
        F.col("quality_parameter").alias("dominant_quality_parameter"),
        F.col("quality_parameter_key").alias("dominant_quality_parameter_key"),
        "parameter_event_count",
    )
)

water_district_summary = (
    water_events.where((F.col("state_key") != "") & (F.col("district_key") != ""))
    .groupBy("state_key", "district_key")
    .agg(
        F.first("state_name", ignorenulls=True).alias("state_name"),
        F.first("district_name", ignorenulls=True).alias("district_name"),
        F.count("*").alias("water_quality_event_count"),
        F.countDistinct("habitation_name").alias("affected_habitation_count"),
        F.countDistinct("quality_parameter_key").alias("distinct_contaminant_count"),
        F.sum((F.col("quality_parameter_key") == "arsenic").cast("int")).alias("arsenic_event_count"),
        F.sum((F.col("quality_parameter_key") == "fluoride").cast("int")).alias("fluoride_event_count"),
        F.sum((F.col("quality_parameter_key") == "nitrate").cast("int")).alias("nitrate_event_count"),
        F.sum((F.col("quality_parameter_key") == "iron").cast("int")).alias("iron_event_count"),
        F.sum((F.col("quality_parameter_key") == "salinity").cast("int")).alias("salinity_event_count"),
        F.min("event_year").alias("first_event_year"),
        F.max("event_year").alias("latest_event_year"),
    )
    .join(dominant_water_parameter, on=["state_key", "district_key"], how="left")
    .withColumn("priority_contaminant_event_count", F.col("arsenic_event_count") + F.col("fluoride_event_count") + F.col("nitrate_event_count"))
    .withColumn("evidence_note", F.lit("Historical affected-area evidence from 2009-2012; not a current water-quality certification."))
)
write_table(water_district_summary, "app_water_quality_district_summary")

# COMMAND ----------

facility_clean = (
    facilities_raw.select(
        F.col("unique_id").alias("facility_id"),
        F.col("name").alias("facility_name"),
        F.col("facilityTypeId").alias("facility_type"),
        F.col("operatorTypeId").alias("operator_type"),
        F.regexp_extract(F.col("address_zipOrPostcode").cast("string"), r"[0-9]{6}", 0).alias("pincode"),
        parse_number(F.col("latitude")).alias("latitude"),
        parse_number(F.col("longitude")).alias("longitude"),
        parse_number(F.col("numberDoctors")).alias("doctor_count"),
        parse_number(F.col("capacity")).alias("bed_capacity"),
        F.col("specialties").cast("string").alias("specialties"),
        F.col("capability").cast("string").alias("capability"),
        F.col("description").alias("description"),
        F.col("source_urls").cast("string").alias("source_urls"),
    )
    .withColumn("facility_valid_geo", india_geo_valid(F.col("latitude"), F.col("longitude")))
    .join(
        pincode_distinct.select(
            "pincode",
            F.col("state_name").alias("pincode_state_name"),
            F.col("district_name").alias("pincode_district_name"),
            F.col("state_key").alias("pincode_state_key"),
            F.col("district_key").alias("pincode_district_key"),
        ),
        on="pincode",
        how="left",
    )
    .withColumn("care_text", F.lower(F.concat_ws(" ", "facility_type", "specialties", "capability", "description")))
    .withColumn("is_hospital", F.lower(F.coalesce(F.col("facility_type"), F.lit(""))).contains("hospital"))
    .withColumn("is_clinic", F.lower(F.coalesce(F.col("facility_type"), F.lit(""))).contains("clinic"))
    .withColumn("is_public_operator", F.col("care_text").rlike("government|public|charitable|trust"))
    .withColumn("has_emergency_signal", F.col("care_text").rlike("emergency|24/7|24 hrs|ambulance|icu|critical"))
    .withColumn(
        "geo_source",
        F.when(F.col("facility_valid_geo"), F.lit("facility_coordinates"))
        .when(F.col("pincode_state_key").isNotNull(), F.lit("pincode_directory"))
        .otherwise(F.lit("missing_or_invalid")),
    )
    .withColumn("source_table", F.lit(f"{mandatory_catalog}.{mandatory_schema}.facilities"))
)

facility_access_by_pincode = (
    facility_clean.where(F.col("pincode") != "")
    .groupBy("pincode")
    .agg(
        F.first("pincode_state_name", ignorenulls=True).alias("state_name"),
        F.first("pincode_district_name", ignorenulls=True).alias("district_name"),
        F.first("pincode_state_key", ignorenulls=True).alias("state_key"),
        F.first("pincode_district_key", ignorenulls=True).alias("district_key"),
        F.countDistinct("facility_id").alias("facility_count"),
        F.sum(F.col("is_hospital").cast("int")).alias("hospital_count"),
        F.sum(F.col("is_clinic").cast("int")).alias("clinic_count"),
        F.sum(F.col("is_public_operator").cast("int")).alias("public_operator_count"),
        F.sum(F.col("has_emergency_signal").cast("int")).alias("emergency_signal_count"),
        F.sum(F.col("facility_valid_geo").cast("int")).alias("valid_facility_geo_count"),
        F.sum((~F.col("facility_valid_geo")).cast("int")).alias("invalid_facility_geo_count"),
        F.sum(F.coalesce(F.col("doctor_count"), F.lit(0.0))).alias("reported_doctors"),
        F.sum(F.coalesce(F.col("bed_capacity"), F.lit(0.0))).alias("reported_beds"),
    )
    .join(pincode_distinct.select("pincode", "latitude", "longitude", F.col("valid_geo").alias("pincode_valid_geo")), on="pincode", how="left")
)
write_table(facility_access_by_pincode, "app_facility_access_by_pincode")

facility_access_by_district = (
    facility_access_by_pincode.where(F.col("state_key").isNotNull() & F.col("district_key").isNotNull())
    .groupBy("state_key", "district_key")
    .agg(
        F.first("state_name", ignorenulls=True).alias("state_name"),
        F.first("district_name", ignorenulls=True).alias("district_name"),
        F.countDistinct("pincode").alias("facility_pincode_count"),
        F.sum("facility_count").alias("facility_count"),
        F.sum("hospital_count").alias("hospital_count"),
        F.sum("clinic_count").alias("clinic_count"),
        F.sum("public_operator_count").alias("public_operator_count"),
        F.sum("emergency_signal_count").alias("emergency_signal_count"),
        F.sum("valid_facility_geo_count").alias("valid_facility_geo_count"),
        F.sum("invalid_facility_geo_count").alias("invalid_facility_geo_count"),
        F.sum("reported_doctors").alias("reported_doctors"),
        F.sum("reported_beds").alias("reported_beds"),
        F.avg(F.when(F.col("pincode_valid_geo"), F.col("latitude"))).alias("centroid_latitude"),
        F.avg(F.when(F.col("pincode_valid_geo"), F.col("longitude"))).alias("centroid_longitude"),
    )
    .withColumn("hospital_share", F.col("hospital_count") / F.greatest(F.col("facility_count"), F.lit(1)))
    .withColumn("emergency_share", F.col("emergency_signal_count") / F.greatest(F.col("facility_count"), F.lit(1)))
)
write_table(facility_access_by_district, "app_facility_access_by_district")

# COMMAND ----------

nfhs = (
    nfhs_raw.select(
        clean_state(F.col("state_ut")).alias("state_name"),
        clean_district(F.col("district_name")).alias("district_name"),
        parse_number(F.col("households_surveyed")).alias("households_surveyed"),
        parse_number(F.col("hh_improved_water_pct")).alias("hh_improved_water_pct"),
        parse_number(F.col("hh_use_improved_sanitation_pct")).alias("hh_use_improved_sanitation_pct"),
        parse_number(F.col("hh_member_covered_health_insurance_pct")).alias("health_insurance_coverage_pct"),
        parse_number(F.col("institutional_birth_5y_pct")).alias("institutional_birth_pct"),
        parse_number(F.col("prev_diarrhoea_2wk_child_u5_pct")).alias("u5_diarrhoea_2wk_pct"),
        parse_number(F.col("children_prev_symptoms_of_acute_respiratory_infection_ari_2_pct")).alias("u5_ari_2wk_pct"),
        parse_number(F.col("child_u5_who_are_stunted_height_for_age_18_pct")).alias("u5_stunted_pct"),
        parse_number(F.col("child_u5_who_are_wasted_weight_for_height_18_pct")).alias("u5_wasted_pct"),
        parse_number(F.col("child_u5_who_are_underweight_weight_for_age_18_pct")).alias("u5_underweight_pct"),
        parse_number(F.col("all_w15_49_who_are_anaemic_pct")).alias("women_anaemia_pct"),
        parse_number(F.col("population_below_age_15_years_pct")).alias("population_below_age_15_pct"),
        F.col("child_u5_who_are_stunted_height_for_age_18_pct").cast("string").alias("u5_stunted_raw"),
        F.col("child_u5_who_are_wasted_weight_for_height_18_pct").cast("string").alias("u5_wasted_raw"),
        F.col("child_u5_who_are_underweight_weight_for_age_18_pct").cast("string").alias("u5_underweight_raw"),
        has_marker(F.col("child_u5_who_are_stunted_height_for_age_18_pct")).alias("u5_stunted_has_marker"),
        has_marker(F.col("child_u5_who_are_wasted_weight_for_height_18_pct")).alias("u5_wasted_has_marker"),
        has_marker(F.col("child_u5_who_are_underweight_weight_for_age_18_pct")).alias("u5_underweight_has_marker"),
    )
    .withColumn("state_key", key(F.col("state_name")))
    .withColumn("district_key", key(F.col("district_name")))
    .withColumn(
        "health_vulnerability_raw",
        (
            F.coalesce(F.col("u5_diarrhoea_2wk_pct"), F.lit(0.0))
            + F.coalesce(F.col("u5_ari_2wk_pct"), F.lit(0.0))
            + F.coalesce(F.col("u5_underweight_pct"), F.lit(0.0))
            + F.coalesce(F.col("u5_stunted_pct"), F.lit(0.0))
            + F.coalesce(F.col("women_anaemia_pct"), F.lit(0.0))
            + F.coalesce(F.col("population_below_age_15_pct"), F.lit(0.0))
            + (F.lit(100.0) - F.coalesce(F.col("health_insurance_coverage_pct"), F.lit(0.0)))
            + (F.lit(100.0) - F.coalesce(F.col("hh_improved_water_pct"), F.lit(0.0)))
        )
        / F.lit(8.0),
    )
    .withColumn("source_table", F.lit(f"{mandatory_catalog}.{mandatory_schema}.nfhs_5_district_health_indicators"))
)
write_table(nfhs, "app_nfhs_vulnerability_indicators")

# COMMAND ----------

water_geo = water_district_summary.select("state_key", "district_key").withColumn("has_water_quality", F.lit(True))
nfhs_geo = nfhs.select("state_key", "district_key").dropDuplicates(["state_key", "district_key"]).withColumn("has_nfhs", F.lit(True))
pincode_district_geo = pincode_geo.select("state_key", "district_key").dropDuplicates(["state_key", "district_key"]).withColumn("has_pincode_directory", F.lit(True))

geography_bridge = (
    water_geo.join(nfhs_geo, on=["state_key", "district_key"], how="full")
    .join(pincode_district_geo, on=["state_key", "district_key"], how="full")
    .join(water_district_summary.select("state_key", "district_key", F.col("state_name").alias("water_state_name"), F.col("district_name").alias("water_district_name")), on=["state_key", "district_key"], how="left")
    .join(nfhs.select("state_key", "district_key", F.col("state_name").alias("nfhs_state_name"), F.col("district_name").alias("nfhs_district_name")).dropDuplicates(["state_key", "district_key"]), on=["state_key", "district_key"], how="left")
    .join(pincode_geo.select("state_key", "district_key", F.col("state_name").alias("pincode_state_name"), F.col("district_name").alias("pincode_district_name")).dropDuplicates(["state_key", "district_key"]), on=["state_key", "district_key"], how="left")
    .withColumn("has_water_quality", F.coalesce(F.col("has_water_quality"), F.lit(False)))
    .withColumn("has_nfhs", F.coalesce(F.col("has_nfhs"), F.lit(False)))
    .withColumn("has_pincode_directory", F.coalesce(F.col("has_pincode_directory"), F.lit(False)))
    .withColumn("state_name", F.coalesce("water_state_name", "nfhs_state_name", "pincode_state_name"))
    .withColumn("district_name", F.coalesce("water_district_name", "nfhs_district_name", "pincode_district_name"))
    .withColumn(
        "join_status",
        F.when(F.col("has_water_quality") & F.col("has_nfhs") & F.col("has_pincode_directory"), "complete")
        .when(F.col("has_water_quality") & ~F.col("has_nfhs") & ~F.col("has_pincode_directory"), "water_only")
        .when(F.col("has_water_quality") & ~F.col("has_nfhs"), "missing_nfhs")
        .when(F.col("has_water_quality") & ~F.col("has_pincode_directory"), "missing_pincode_directory")
        .otherwise("reference_only"),
    )
    .select(
        "state_key",
        "district_key",
        "state_name",
        "district_name",
        "has_water_quality",
        "has_nfhs",
        "has_pincode_directory",
        "join_status",
    )
)
write_table(geography_bridge, "app_geography_bridge")

# COMMAND ----------

priority_base = (
    water_district_summary.alias("w")
    .join(geography_bridge.alias("g"), on=["state_key", "district_key"], how="left")
    .join(nfhs.alias("n"), on=["state_key", "district_key"], how="left")
    .join(facility_access_by_district.alias("f"), on=["state_key", "district_key"], how="left")
    .select(
        "state_key",
        "district_key",
        F.coalesce(F.col("g.state_name"), F.col("w.state_name"), F.col("n.state_name"), F.col("f.state_name")).alias("state_name"),
        F.coalesce(F.col("g.district_name"), F.col("w.district_name"), F.col("n.district_name"), F.col("f.district_name")).alias("district_name"),
        "join_status",
        "has_nfhs",
        "has_pincode_directory",
        "water_quality_event_count",
        "affected_habitation_count",
        "distinct_contaminant_count",
        "dominant_quality_parameter",
        "dominant_quality_parameter_key",
        "priority_contaminant_event_count",
        "arsenic_event_count",
        "fluoride_event_count",
        "nitrate_event_count",
        "first_event_year",
        "latest_event_year",
        "hh_improved_water_pct",
        "hh_use_improved_sanitation_pct",
        "health_insurance_coverage_pct",
        "institutional_birth_pct",
        "u5_diarrhoea_2wk_pct",
        "u5_ari_2wk_pct",
        "u5_underweight_pct",
        "u5_stunted_pct",
        "u5_wasted_pct",
        "women_anaemia_pct",
        "population_below_age_15_pct",
        "health_vulnerability_raw",
        F.col("facility_pincode_count"),
        F.col("facility_count"),
        F.col("hospital_count"),
        F.col("clinic_count"),
        F.col("emergency_signal_count"),
        F.col("valid_facility_geo_count"),
        F.col("invalid_facility_geo_count"),
        F.col("centroid_latitude"),
        F.col("centroid_longitude"),
    )
    .withColumn("facilities_per_affected_habitation", F.col("facility_count") / F.greatest(F.col("affected_habitation_count"), F.lit(1)))
)

priority_scored = (
    priority_base
    .withColumn("water_burden_score", scored_percentile("affected_habitation_count", ascending=True))
    .withColumn("priority_contaminant_score", scored_percentile("priority_contaminant_event_count", ascending=True))
    .withColumn("facility_access_score", scored_percentile("facilities_per_affected_habitation", ascending=True))
    .withColumn("medical_desert_score", F.when(F.col("facility_access_score").isNotNull(), F.lit(1.0) - F.col("facility_access_score")))
    .withColumn("health_vulnerability_score", scored_percentile("health_vulnerability_raw", ascending=True))
    .withColumn(
        "available_score_weight",
        F.lit(0.30) * F.col("water_burden_score").isNotNull().cast("double")
        + F.lit(0.20) * F.col("priority_contaminant_score").isNotNull().cast("double")
        + F.lit(0.30) * F.col("medical_desert_score").isNotNull().cast("double")
        + F.lit(0.20) * F.col("health_vulnerability_score").isNotNull().cast("double"),
    )
    .withColumn(
        "normalized_priority_score",
        F.when(
            F.col("available_score_weight") > 0,
            F.round(
                F.lit(100.0)
                * (
                    F.lit(0.30) * F.coalesce(F.col("water_burden_score"), F.lit(0.0))
                    + F.lit(0.20) * F.coalesce(F.col("priority_contaminant_score"), F.lit(0.0))
                    + F.lit(0.30) * F.coalesce(F.col("medical_desert_score"), F.lit(0.0))
                    + F.lit(0.20) * F.coalesce(F.col("health_vulnerability_score"), F.lit(0.0))
                )
                / F.col("available_score_weight"),
                2,
            ),
        ),
    )
    .withColumn(
        "neelu_priority_score",
        F.round(
            F.lit(100.0)
            * (
                F.lit(0.30) * F.coalesce(F.col("water_burden_score"), F.lit(0.0))
                + F.lit(0.20) * F.coalesce(F.col("priority_contaminant_score"), F.lit(0.0))
                + F.lit(0.30) * F.coalesce(F.col("medical_desert_score"), F.lit(0.0))
                + F.lit(0.20) * F.coalesce(F.col("health_vulnerability_score"), F.lit(0.0))
            ),
            2,
        ),
    )
    .withColumn("data_completeness_score", F.round(F.col("available_score_weight"), 2))
    .withColumn(
        "priority_reason",
        F.concat_ws(
            " ",
            F.lit("Historical water-quality burden:"),
            F.col("affected_habitation_count").cast("string"),
            F.lit("affected habitations; dominant contaminant:"),
            F.coalesce(F.col("dominant_quality_parameter"), F.lit("unknown")),
            F.lit("; matched facility count:"),
            F.coalesce(F.col("facility_count").cast("string"), F.lit("unmatched")),
            F.lit("; NFHS vulnerability available:"),
            F.col("has_nfhs").cast("string"),
            F.lit("."),
        ),
    )
    .withColumn("priority_rank", F.dense_rank().over(Window.orderBy(F.col("neelu_priority_score").desc_nulls_last(), F.col("affected_habitation_count").desc_nulls_last())))
)
write_table(priority_scored, "app_priority_geographies")

# COMMAND ----------

allowed_contaminants = F.array(F.lit("arsenic"), F.lit("fluoride"), F.lit("nitrate"), F.lit("iron"), F.lit("salinity"))

model_context_packs = (
    priority_scored.select(
        "state_key",
        "district_key",
        "state_name",
        "district_name",
        "priority_rank",
        "neelu_priority_score",
        "data_completeness_score",
        "join_status",
        "dominant_quality_parameter",
        "latest_event_year",
        "affected_habitation_count",
        "facility_count",
        "hospital_count",
        "hh_improved_water_pct",
        "u5_diarrhoea_2wk_pct",
        "women_anaemia_pct",
    )
    .withColumn("allowed_contaminants", allowed_contaminants)
    .withColumn(
        "context_json",
        F.to_json(
            F.struct(
                "state_name",
                "district_name",
                "priority_rank",
                "neelu_priority_score",
                "data_completeness_score",
                "join_status",
                "allowed_contaminants",
                F.struct(
                    "dominant_quality_parameter",
                    "latest_event_year",
                    "affected_habitation_count",
                ).alias("historical_water_quality_context"),
                F.struct("facility_count", "hospital_count").alias("medical_access_context"),
                F.struct("hh_improved_water_pct", "u5_diarrhoea_2wk_pct", "women_anaemia_pct").alias("nfhs_context"),
                F.lit("Historical affected-area evidence is not current certification. Extracted voice fields require confidence and human approval.").alias("safety_instruction"),
            )
        ),
    )
)
write_table(model_context_packs, "app_model_context_packs")

# COMMAND ----------

quality_issue_frames = []

quality_issue_frames.append(
    priority_scored.where(~F.col("has_nfhs")).select(
        F.lit("unmatched_water_district_to_nfhs").alias("issue_type"),
        F.lit("high").alias("severity"),
        F.lit(f"{source_catalog}.{source_schema}.india_affected_water_quality_areas").alias("source_table"),
        "state_name",
        "district_name",
        F.col("water_quality_event_count").alias("affected_rows"),
        F.to_json(F.struct("state_key", "district_key", "affected_habitation_count", "latest_event_year")).alias("detail_json"),
    )
)

quality_issue_frames.append(
    priority_scored.where(~F.col("has_pincode_directory")).select(
        F.lit("unmatched_water_district_to_pincode_directory").alias("issue_type"),
        F.lit("medium").alias("severity"),
        F.lit(f"{source_catalog}.{source_schema}.india_affected_water_quality_areas").alias("source_table"),
        "state_name",
        "district_name",
        F.col("water_quality_event_count").alias("affected_rows"),
        F.to_json(F.struct("state_key", "district_key", "affected_habitation_count", "latest_event_year")).alias("detail_json"),
    )
)

quality_issue_frames.append(
    pincode_geo.where(~F.col("valid_geo")).groupBy("state_name", "district_name").agg(F.count("*").alias("affected_rows")).select(
        F.lit("invalid_or_missing_pincode_geo").alias("issue_type"),
        F.lit("medium").alias("severity"),
        F.lit(f"{mandatory_catalog}.{mandatory_schema}.india_post_pincode_directory").alias("source_table"),
        "state_name",
        "district_name",
        "affected_rows",
        F.lit("{}").alias("detail_json"),
    )
)

quality_issue_frames.append(
    facility_clean.where(~F.col("facility_valid_geo")).agg(F.count("*").alias("affected_rows")).select(
        F.lit("invalid_or_missing_facility_geo").alias("issue_type"),
        F.lit("medium").alias("severity"),
        F.lit(f"{mandatory_catalog}.{mandatory_schema}.facilities").alias("source_table"),
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

display(priority_scored.orderBy("priority_rank").limit(50))
display(data_quality_issues.groupBy("issue_type", "severity").agg(F.count("*").alias("issue_groups"), F.sum("affected_rows").alias("affected_rows")).orderBy(F.col("affected_rows").desc()))
