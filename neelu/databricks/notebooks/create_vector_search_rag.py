# Databricks notebook source
# MAGIC %md
# MAGIC # Create Neelu Vector Search RAG resources
# MAGIC
# MAGIC This notebook creates the guidance Delta table used by Neelu RAG and then
# MAGIC creates/syncs a Databricks Vector Search Delta Sync index over it.
# MAGIC
# MAGIC Run this only after approving Vector Search provisioning.

# COMMAND ----------

from __future__ import annotations

import time

from databricks.sdk import WorkspaceClient
from databricks.sdk.errors import NotFound
from pyspark.sql import functions as F

# COMMAND ----------

dbutils.widgets.text("output_catalog", "workspace")
dbutils.widgets.text("output_schema", "hackathon")
dbutils.widgets.text("vector_search_endpoint", "neelu-vector-search")
dbutils.widgets.text("vector_search_index", "workspace.hackathon.neelu_guidance_index")
dbutils.widgets.text("embedding_endpoint", "databricks-gte-large-en")

output_catalog = dbutils.widgets.get("output_catalog")
output_schema = dbutils.widgets.get("output_schema")
vector_search_endpoint = dbutils.widgets.get("vector_search_endpoint")
vector_search_index = dbutils.widgets.get("vector_search_index")
embedding_endpoint = dbutils.widgets.get("embedding_endpoint")

spark.sql(f"CREATE SCHEMA IF NOT EXISTS `{output_catalog}`.`{output_schema}`")

# COMMAND ----------

guidance_rows = [
    (
        "guidance-nitrate",
        "Nitrate in drinking water (reference value 10 mg/L as N)",
        "EPA - Ground Water and Drinking Water",
        "https://www.epa.gov/ground-water-and-drinking-water/national-primary-drinking-water-regulations",
        "nitrate",
        "The commonly cited maximum contaminant level for nitrate is 10 mg/L as nitrogen. Levels above this reference value are of particular concern for infants under six months and pregnant people, where nitrate can cause methemoglobinemia. A field-kit exceedance should be treated as provisional and confirmed with an accredited laboratory sample before public-health action.",
        ["nitrate", "infant", "school", "mcl", "confirm"],
    ),
    (
        "guidance-coliform",
        "Total coliform and E. coli detections",
        "WHO - Guidelines for Drinking-water Quality",
        "https://www.who.int/publications/i/item/9789241549950",
        "total_coliform",
        "Total coliform bacteria should not be detectable in treated drinking water. E. coli indicates recent fecal contamination and requires immediate investigation, resampling, and consideration of a boil-water advisory by the responsible authority. Detections from expired or improperly stored test kits carry elevated uncertainty and must be confirmed.",
        ["coliform", "ecoli", "boil-water", "confirm", "uncertainty"],
    ),
    (
        "guidance-turbidity",
        "Turbidity after distribution disturbances",
        "WHO - Guidelines for Drinking-water Quality",
        "https://www.who.int/publications/i/item/9789241549950",
        "turbidity",
        "Turbidity should ideally be below 1 NTU and not exceed 5 NTU. Elevated turbidity can shield pathogens from disinfection. Following pipe repairs or main breaks, distribution lines should be flushed and re-tested, and confirmatory microbiological sampling is recommended before clearing a site.",
        ["turbidity", "pipe-repair", "flush", "confirm"],
    ),
    (
        "guidance-ph",
        "pH operational range",
        "WHO - Guidelines for Drinking-water Quality",
        "https://www.who.int/publications/i/item/9789241549950",
        "ph",
        "A pH in the range 6.5 to 8.5 is generally recommended for drinking water. Values outside this range can impair disinfection effectiveness and increase pipe corrosion and metal leaching.",
        ["ph", "corrosion", "disinfection"],
    ),
    (
        "guidance-arsenic",
        "Arsenic in drinking water (reference value 0.01 mg/L)",
        "WHO - Arsenic Fact Sheet",
        "https://www.who.int/news-room/fact-sheets/detail/arsenic",
        "arsenic",
        "The provisional guideline value for arsenic is 0.01 mg/L. Chronic exposure is associated with skin lesions and cancers. Exceedances warrant urgent confirmatory testing and identification of alternative water sources for affected populations.",
        ["arsenic", "chronic", "urgent", "confirm"],
    ),
    (
        "guidance-chlorine",
        "Free chlorine residual maintenance",
        "WHO - Guidelines for Drinking-water Quality",
        "https://www.who.int/publications/i/item/9789241549950",
        "free_chlorine",
        "A free chlorine residual of at least 0.2 mg/L at the point of delivery is commonly recommended to limit microbial regrowth in the distribution network. Low residuals can indicate contamination ingress or excessive demand and warrant investigation.",
        ["chlorine", "residual", "regrowth"],
    ),
    (
        "guidance-confirmatory-sampling",
        "Confirmatory laboratory sampling for field-kit exceedances",
        "Neelu synthetic operations handbook",
        "https://developers.databricks.com",
        "all",
        "Field test kits are a screening tool. Any exceedance detected by a field kit should be confirmed with an accredited laboratory sample collected following chain-of-custody procedures before issuing public-health notices or compliance determinations.",
        ["confirm", "lab", "chain-of-custody", "process"],
    ),
    (
        "guidance-public-notice",
        "Public notification responsibilities",
        "Neelu synthetic operations handbook",
        "https://developers.databricks.com",
        "all",
        "Public notifications must be issued by an authorized public-health or water-system authority. Draft notices generated for review do not constitute official notification and require human and regulatory approval before any release.",
        ["notice", "approval", "human-in-the-loop", "process"],
    ),
]

guidance_df = spark.createDataFrame(
    guidance_rows,
    "id string, title string, source_name string, source_uri string, applies_to string, content string, tags array<string>",
).withColumn("_processed_at", F.current_timestamp())

source_table = f"{output_catalog}.{output_schema}.app_guidance_chunks"
(
    guidance_df.write.mode("overwrite")
    .format("delta")
    .option("overwriteSchema", "true")
    .saveAsTable(f"`{output_catalog}`.`{output_schema}`.`app_guidance_chunks`")
)

spark.sql(
    f"ALTER TABLE `{output_catalog}`.`{output_schema}`.`app_guidance_chunks` "
    "SET TBLPROPERTIES (delta.enableChangeDataFeed = true)"
)

# COMMAND ----------

w = WorkspaceClient()

try:
    w.vector_search_endpoints.get_endpoint(endpoint_name=vector_search_endpoint)
except NotFound:
    w.vector_search_endpoints.create_endpoint(
        name=vector_search_endpoint,
        endpoint_type="STANDARD",
    ).result()

try:
    w.vector_search_indexes.get_index(index_name=vector_search_index)
except NotFound:
    w.vector_search_indexes.create_index(
        name=vector_search_index,
        endpoint_name=vector_search_endpoint,
        primary_key="id",
        index_type="DELTA_SYNC",
        delta_sync_index_spec={
            "source_table": source_table,
            "pipeline_type": "TRIGGERED",
            "embedding_source_columns": [
                {
                    "name": "content",
                    "embedding_model_endpoint_name": embedding_endpoint,
                }
            ],
            "columns_to_sync": [
                "id",
                "title",
                "source_name",
                "source_uri",
                "applies_to",
                "content",
                "tags",
            ],
        },
    )

w.vector_search_indexes.sync_index(index_name=vector_search_index)

for _ in range(60):
    index = w.vector_search_indexes.get_index(index_name=vector_search_index)
    status = getattr(index, "status", None)
    if status is None or "READY" in str(status).upper():
        break
    time.sleep(10)

print(
    {
        "source_table": source_table,
        "vector_search_endpoint": vector_search_endpoint,
        "vector_search_index": vector_search_index,
        "embedding_endpoint": embedding_endpoint,
    }
)
