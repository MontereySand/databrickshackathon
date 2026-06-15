/**
 * Unity Catalog source-data adapter.
 *
 * LOCAL_SIM: site profiles come from the operational systems table plus the
 * seeded risk notes. DATABRICKS: read governed profiles from
 * neelu.silver.site_profiles (see sql/uc_tables.sql).
 */

import { config } from "../config";
import type { Db } from "../db";
import { getSystem } from "../db/repositories";
import { SYSTEMS } from "../data/scenarios";
import type { ServiceCapability, WaterSystem } from "../../shared/types";

export interface SiteProfile {
  system: WaterSystem;
  riskNotes: string;
  source: "unity_catalog" | "local_fallback";
}

export async function lookupSiteProfile(
  db: Db,
  systemId: string,
): Promise<SiteProfile | null> {
  const system = await getSystem(db, systemId);
  if (!system) return null;
  const seed = SYSTEMS.find((entry) => entry.systemId === systemId);
  const riskNotes =
    seed?.riskNotes ??
    "No additional risk profile on file for this system.";
  return { system, riskNotes, source: "local_fallback" };
}

export function unityCatalogCapability(): ServiceCapability {
  const { ucCatalog, ucSchema } = config.databricks;
  const configured = Boolean(ucCatalog);
  return {
    service: "unity_catalog",
    status: "local_fallback",
    detail: configured
      ? `UC ${ucCatalog}.${ucSchema ?? "?"} configured; live reads not yet implemented, using seeded source data`
      : "Seeded source data (no Unity Catalog configured)",
  };
}
