# Databricks notebook source
# MAGIC %md
# MAGIC # Upload split Healthanalytics key-indicator CSVs
# MAGIC
# MAGIC This notebook creates one Delta table per CSV in a staged directory.
# MAGIC
# MAGIC It is intentionally separate from the app pipeline. The app should consume Databricks tables, not local `/notes/data` files.
# MAGIC
# MAGIC Expected staging flow:
# MAGIC 1. Upload/copy the local `notes/data` directory to a Databricks-readable path, preferably a UC Volume such as `/Volumes/workspace/hackathon/raw_files/notes/data`.
# MAGIC 2. Run this notebook with `source_dir` set to either that staged `notes/data` directory or the nested `healthanalytics/Key_Indicator_State_and_District_wise_data` folder.
# MAGIC 3. Tables are written into `output_catalog.output_schema` using sanitized CSV basenames.

# COMMAND ----------

from __future__ import annotations

import re
from typing import Iterable

from pyspark.sql import DataFrame
from pyspark.sql import functions as F

# COMMAND ----------

dbutils.widgets.text("source_dir", "/Volumes/workspace/hackathon/raw_files/notes/data")
dbutils.widgets.text("output_catalog", "workspace")
dbutils.widgets.text("output_schema", "hackathon")
dbutils.widgets.dropdown("overwrite", "true", ["true", "false"])

source_dir = dbutils.widgets.get("source_dir").rstrip("/")
output_catalog = dbutils.widgets.get("output_catalog")
output_schema = dbutils.widgets.get("output_schema")
overwrite = dbutils.widgets.get("overwrite").lower() == "true"
write_mode = "overwrite" if overwrite else "errorifexists"

spark.sql(f"CREATE SCHEMA IF NOT EXISTS `{output_catalog}`.`{output_schema}`")

# COMMAND ----------

def resolve_healthanalytics_dir(path: str) -> str:
    direct_files = [entry.path for entry in dbutils.fs.ls(path) if (not entry.isDir()) and entry.path.lower().endswith(".csv")]
    if direct_files:
        return path

    candidates = [
        f"{path}/healthanalytics/Key_Indicator_State_and_District_wise_data",
        f"{path}/Key_Indicator_State_and_District_wise_data",
        f"{path}/healthanalytics/Key_Indicator_State_and_District_wise_data/Key_Indicator_State_and_District_wise_data",
    ]
    for candidate in candidates:
        try:
            if any((not entry.isDir()) and entry.path.lower().endswith(".csv") for entry in dbutils.fs.ls(candidate)):
                return candidate.rstrip("/")
        except Exception:
            pass

    raise ValueError(
        "Could not find healthanalytics CSVs. Set source_dir to the staged notes/data directory "
        "or to healthanalytics/Key_Indicator_State_and_District_wise_data directly."
    )


def walk_files(path: str) -> Iterable[str]:
    for entry in dbutils.fs.ls(path):
        if entry.isDir():
            yield from walk_files(entry.path.rstrip("/"))
        elif entry.path.lower().endswith(".csv"):
            yield entry.path


def list_csv_files(path: str) -> list[str]:
    direct = sorted(
        entry.path
        for entry in dbutils.fs.ls(path)
        if (not entry.isDir()) and entry.path.lower().endswith(".csv")
    )
    return direct if direct else sorted(set(walk_files(path)))


def sanitize_table_name(path: str) -> str:
    name = path.rstrip("/").split("/")[-1]
    name = re.sub(r"\.csv$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"[^A-Za-z0-9]+", "_", name).strip("_").lower()
    name = re.sub(r"_+", "_", name)
    if not name or not re.match(r"^[a-z]", name):
        name = f"t_{name}"
    return name[:200]


def normalize_column_name(name: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "_", name.strip()).strip("_").lower()
    cleaned = re.sub(r"_+", "_", cleaned)
    return cleaned or "col"


def uniquify(names: list[str]) -> list[str]:
    seen: dict[str, int] = {}
    unique: list[str] = []
    for name in names:
        index = seen.get(name, 0)
        seen[name] = index + 1
        unique.append(name if index == 0 else f"{name}_{index + 1}")
    return unique


def normalize_columns(df: DataFrame) -> DataFrame:
    normalized = uniquify([normalize_column_name(col_name) for col_name in df.columns])
    return df.toDF(*normalized)

# COMMAND ----------

source_dir = resolve_healthanalytics_dir(source_dir)
csv_files = list_csv_files(source_dir)
if not csv_files:
    raise ValueError(f"No CSV files found under {source_dir}")

written = []
for path in csv_files:
    table_name = sanitize_table_name(path)
    full_name = f"`{output_catalog}`.`{output_schema}`.`{table_name}`"

    df = (
        spark.read.option("header", "true")
        .option("inferSchema", "false")
        .option("multiLine", "true")
        .option("escape", '"')
        .csv(path)
    )

    df = (
        normalize_columns(df)
        .withColumn("_source_file", F.lit(path))
        .withColumn("_ingested_at", F.current_timestamp())
    )

    df.write.mode(write_mode).option("overwriteSchema", "true").format("delta").saveAsTable(full_name)
    written.append((table_name, path, df.count()))

summary = spark.createDataFrame(written, "table_name string, source_path string, row_count long")
summary.write.mode("overwrite").option("overwriteSchema", "true").format("delta").saveAsTable(
    f"`{output_catalog}`.`{output_schema}`.`healthanalytics_upload_manifest`"
)
display(summary.orderBy("table_name"))
