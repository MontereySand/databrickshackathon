/**
 * Capability probe that powers the command-desk "Databricks proof" panel and
 * GET /api/health. Reports, per service, whether Neelu is talking to a live
 * Databricks resource or running on a local fallback.
 */

import type { Db } from "../db"
import { aiSearchCapability } from "./aiSearch"
import { modelCapability } from "./modelServing"
import { mlflowCapability } from "./mlflow"
import { unityCatalogCapability } from "./unityCatalog"
import type { ServiceCapability } from "../../shared/types"

export function lakebaseCapability(db: Db): ServiceCapability {
  if (db.kind === "lakebase") {
    return {
      service: "lakebase",
      status: "connected",
      detail: "Connected to Lakebase via Databricks App postgres resource",
    }
  }
  if (db.kind === "postgres") {
    return {
      service: "lakebase",
      status: "connected",
      detail:
        "Connected to Postgres via DATABASE_URL (Lakebase or local Postgres)",
    }
  }
  return {
    service: "lakebase",
    status: "local_fallback",
    detail: "In-process PGlite Postgres (LOCAL_SIM)",
  }
}

export async function probeCapabilities(db: Db): Promise<ServiceCapability[]> {
  return [
    lakebaseCapability(db),
    unityCatalogCapability(),
    aiSearchCapability(),
    modelCapability(),
    mlflowCapability(),
  ]
}

export function isAllLocalFallback(caps: ServiceCapability[]): boolean {
  return caps.every((cap) => cap.status !== "connected")
}
