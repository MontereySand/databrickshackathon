/**
 * Unity Catalog source-data adapter.
 *
 * LOCAL_SIM: site profiles come from the operational systems table plus seeded
 * risk notes. DATABRICKS: read governed app-ready analytics tables from Unity
 * Catalog via the SQL warehouse declared on the Databricks App.
 */

import { cellToBoundary, latLngToCell } from "h3-js";
import { config } from "../config";
import type { Db } from "../db";
import { getSystem } from "../db/repositories";
import { SYSTEMS } from "../data/scenarios";
import type {
  H3MapResponse,
  ProviderDashboard,
  ServiceCapability,
  WaterSystem,
} from "../../shared/types";
import {
  missingDatabricksDetail,
  numberValue,
  runSqlRows,
  stringValue,
  tableName,
} from "./workspace";

export interface SiteProfile {
  system: WaterSystem;
  riskNotes: string;
  source: "unity_catalog" | "local_fallback";
}

function cleanScore(value: number): number {
  return Number(Math.min(1, Math.max(0, value)).toFixed(3));
}

function qualityFromScore(score: number): "clean" | "caution" | "contaminated" {
  if (score >= 0.7) return "contaminated";
  if (score >= 0.35) return "caution";
  return "clean";
}

export async function lookupSiteProfile(
  db: Db,
  systemId: string,
): Promise<SiteProfile | null> {
  const system = await getSystem(db, systemId);
  if (!system) return null;

  if (!config.localSim) {
    const hasCoords = system.latitude != null && system.longitude != null;
    const orderBy = hasCoords
      ? `pow(centroid_latitude - ${system.latitude}, 2)
             + pow(centroid_longitude - ${system.longitude}, 2) ASC,
        priority_rank ASC`
      : "priority_rank ASC";
    const rows = await runSqlRows(
      `
      SELECT
        state_name,
        district_name,
        priority_rank,
        neelu_priority_score,
        water_burden_score,
        medical_desert_score,
        dominant_quality_parameter,
        affected_habitation_count,
        facility_count,
        hospital_count,
        priority_reason
      FROM ${tableName("app_priority_geographies")}
      WHERE centroid_latitude IS NOT NULL
        AND centroid_longitude IS NOT NULL
      ORDER BY ${orderBy}
      LIMIT 1
      `,
      { rowLimit: 1 }
    );
    const row = rows[0];
    if (row) {
      const district = stringValue(row, "district_name", "Unknown district");
      const state = stringValue(row, "state_name", "Unknown state");
      const contaminant = stringValue(
        row,
        "dominant_quality_parameter",
        "water quality issue"
      );
      const riskNotes = [
        `${district}, ${state} is ranked #${numberValue(row, "priority_rank")} in the Unity Catalog priority geography table.`,
        `Priority score ${cleanScore(numberValue(row, "neelu_priority_score"))}; water burden ${cleanScore(numberValue(row, "water_burden_score"))}; medical desert score ${cleanScore(numberValue(row, "medical_desert_score"))}.`,
        `Dominant parameter: ${contaminant}; affected habitations ${numberValue(row, "affected_habitation_count")}; facilities ${numberValue(row, "facility_count")}; hospitals ${numberValue(row, "hospital_count")}.`,
        stringValue(row, "priority_reason", ""),
      ]
        .filter(Boolean)
        .join(" ");
      return { system, riskNotes, source: "unity_catalog" };
    }
  }

  const seed = SYSTEMS.find((entry) => entry.systemId === systemId);
  const riskNotes =
    seed?.riskNotes ??
    "No additional risk profile on file for this system.";
  return { system, riskNotes, source: "local_fallback" };
}

export async function getH3MapFromUnityCatalog(limit = 80): Promise<H3MapResponse> {
  const rows = await runSqlRows(
    `
    SELECT
      state_name,
      district_name,
      centroid_latitude,
      centroid_longitude,
      water_burden_score,
      medical_desert_score,
      neelu_priority_score,
      data_completeness_score,
      affected_habitation_count,
      facility_count
    FROM ${tableName("app_priority_geographies")}
    WHERE centroid_latitude IS NOT NULL
      AND centroid_longitude IS NOT NULL
    ORDER BY priority_rank ASC
    LIMIT ${Math.max(1, Math.min(250, limit))}
    `,
    { rowLimit: Math.max(1, Math.min(250, limit)) }
  );

  return {
    cells: rows.map((row) => {
      const latitude = numberValue(row, "centroid_latitude");
      const longitude = numberValue(row, "centroid_longitude");
      const h3Cell = latLngToCell(latitude, longitude, 8);
      const waterContaminationScore = cleanScore(
        numberValue(row, "water_burden_score", numberValue(row, "neelu_priority_score"))
      );
      const medicalDesertScore = cleanScore(numberValue(row, "medical_desert_score"));
      const vulnerabilityIndex = cleanScore(
        waterContaminationScore * medicalDesertScore
      );
      return {
        h3Cell,
        boundary: cellToBoundary(h3Cell).map(
          ([lat, lng]) => [lat, lng] as [number, number]
        ),
        center: { latitude, longitude },
        quality: qualityFromScore(waterContaminationScore),
        waterContaminationScore,
        medicalDesertScore,
        vulnerabilityIndex,
        waterPointCount: numberValue(row, "affected_habitation_count"),
        facilityCount: numberValue(row, "facility_count"),
        districtName: stringValue(row, "district_name", "Unknown district"),
        stateName: stringValue(row, "state_name", "Unknown state"),
        dataCompletenessScore: cleanScore(
          numberValue(row, "data_completeness_score", 1)
        ),
      };
    }),
    generatedAt: new Date().toISOString(),
    source: "databricks_tables",
  };
}

export async function providerDashboardFromUnityCatalog(): Promise<ProviderDashboard> {
  const [metricRows, priorityRows, symptomRows, contaminantRows, facilityRows] =
    await Promise.all([
      runSqlRows(
        `
        SELECT
          count(*) AS districts_tracked,
          sum(affected_habitation_count) AS affected_habitations,
          sum(facility_count) AS facility_count,
          sum(hospital_count) AS hospital_count,
          avg(neelu_priority_score) AS priority_average,
          avg(water_burden_score) AS water_burden_average,
          avg(medical_desert_score) AS medical_desert_average,
          avg(data_completeness_score) AS data_completeness_average
        FROM ${tableName("app_priority_geographies")}
        `,
        { rowLimit: 1 }
      ),
    runSqlRows(
      `
      SELECT
        state_name,
        district_name,
        neelu_priority_score,
        normalized_priority_score,
        data_completeness_score,
        join_status,
        water_burden_score,
        medical_desert_score,
        affected_habitation_count,
        facility_count,
        hospital_count,
        dominant_quality_parameter
      FROM ${tableName("app_priority_geographies")}
      ORDER BY priority_rank ASC
      LIMIT 12
      `,
      { rowLimit: 12 }
    ),
    runSqlRows(
      `
      SELECT
        CASE
          WHEN lower(quality_parameter_key) LIKE '%arsenic%' THEN 'skin lesions'
          WHEN lower(quality_parameter_key) LIKE '%fluoride%' THEN 'joint pain'
          WHEN lower(quality_parameter_key) LIKE '%nitrate%' THEN 'infant illness'
          ELSE 'diarrhea'
        END AS symptom,
        coalesce(quality_parameter, quality_parameter_key) AS contaminant,
        count(*) AS reports,
        count(DISTINCT concat_ws('|', state_key, district_key)) AS verified_signals
      FROM ${tableName("app_water_quality_events")}
      WHERE quality_parameter_key IS NOT NULL
      GROUP BY symptom, contaminant
      ORDER BY reports DESC
      LIMIT 10
      `,
      { rowLimit: 10 }
    ),
    runSqlRows(
      `
      SELECT
        coalesce(quality_parameter, quality_parameter_key) AS contaminant,
        count(*) AS reports,
        count(DISTINCT concat_ws('|', state_key, district_key)) AS districts
      FROM ${tableName("app_water_quality_events")}
      WHERE quality_parameter_key IS NOT NULL
      GROUP BY contaminant
      ORDER BY reports DESC
      LIMIT 10
      `,
      { rowLimit: 10 }
    ),
    runSqlRows(
      `
      SELECT
        state_name,
        district_name,
        facility_count,
        hospital_count,
        medical_desert_score
      FROM ${tableName("app_priority_geographies")}
      WHERE facility_count IS NOT NULL
      ORDER BY medical_desert_score DESC, facility_count ASC
      LIMIT 10
      `,
      { rowLimit: 10 }
    ),
  ]);
  const metrics = metricRows[0] ?? {};

  return {
    metrics: {
      districtsTracked: numberValue(metrics, "districts_tracked"),
      affectedHabitations: numberValue(metrics, "affected_habitations"),
      facilityCount: numberValue(metrics, "facility_count"),
      hospitalCount: numberValue(metrics, "hospital_count"),
      priorityAverage: cleanScore(numberValue(metrics, "priority_average")),
      waterBurdenAverage: cleanScore(numberValue(metrics, "water_burden_average")),
      medicalDesertAverage: cleanScore(
        numberValue(metrics, "medical_desert_average")
      ),
      dataCompletenessAverage: cleanScore(
        numberValue(metrics, "data_completeness_average", 1)
      ),
    },
    priorityGeographies: priorityRows.map((row) => ({
      stateName: stringValue(row, "state_name", "Unknown state"),
      districtName: stringValue(row, "district_name", "Unknown district"),
      neeluPriorityScore: cleanScore(numberValue(row, "neelu_priority_score")),
      normalizedPriorityScore: cleanScore(
        numberValue(row, "normalized_priority_score")
      ),
      dataCompletenessScore: cleanScore(
        numberValue(row, "data_completeness_score", 1)
      ),
      joinStatus: stringValue(row, "join_status", "unknown"),
      waterBurdenScore: cleanScore(numberValue(row, "water_burden_score")),
      medicalDesertScore: cleanScore(numberValue(row, "medical_desert_score")),
      affectedHabitationCount: numberValue(row, "affected_habitation_count"),
      facilityCount: numberValue(row, "facility_count"),
      hospitalCount: numberValue(row, "hospital_count"),
      dominantQualityParameter: stringValue(
        row,
        "dominant_quality_parameter",
        "unknown"
      ),
    })),
    symptomCorrelations: symptomRows.map((row) => ({
      symptom: stringValue(row, "symptom", "symptom report"),
      contaminant: stringValue(row, "contaminant", "water contaminant"),
      reports: numberValue(row, "reports"),
      verifiedSignals: numberValue(row, "verified_signals"),
    })),
    contaminantBurden: contaminantRows.map((row) => ({
      contaminant: stringValue(row, "contaminant", "water contaminant"),
      reports: numberValue(row, "reports"),
      districts: numberValue(row, "districts"),
    })),
    facilityAccess: facilityRows.map((row) => ({
      stateName: stringValue(row, "state_name", "Unknown state"),
      districtName: stringValue(row, "district_name", "Unknown district"),
      facilities: numberValue(row, "facility_count"),
      hospitals: numberValue(row, "hospital_count"),
      medicalDesertScore: cleanScore(numberValue(row, "medical_desert_score")),
    })),
    coverage: [
      {
        label: "Data completeness",
        value: cleanScore(numberValue(metrics, "data_completeness_average", 1)),
      },
      {
        label: "Water burden",
        value: cleanScore(numberValue(metrics, "water_burden_average")),
      },
      {
        label: "Medical desert",
        value: cleanScore(numberValue(metrics, "medical_desert_average")),
      },
      {
        label: "Priority index",
        value: cleanScore(numberValue(metrics, "priority_average")),
      },
    ],
  };
}

export function unityCatalogCapability(): ServiceCapability {
  const { ucCatalog, ucSchema, warehouseId } = config.databricks;
  if (config.localSim) {
    return {
      service: "unity_catalog",
      status: "local_fallback",
      detail: "LOCAL_SIM=true; using seeded source data",
    };
  }
  if (!warehouseId) {
    return {
      service: "unity_catalog",
      status: "error",
      detail: missingDatabricksDetail("Unity Catalog", "DATABRICKS_WAREHOUSE_ID"),
    };
  }
  if (!ucCatalog || !ucSchema) {
    return {
      service: "unity_catalog",
      status: "error",
      detail: missingDatabricksDetail("Unity Catalog", "UC_CATALOG and UC_SCHEMA"),
    };
  }
  return {
    service: "unity_catalog",
    status: "connected",
    detail: `Reading ${ucCatalog}.${ucSchema} through SQL warehouse ${warehouseId}`,
  };
}
