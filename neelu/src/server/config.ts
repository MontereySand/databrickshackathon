/**
 * Centralized runtime configuration. All environment access happens here so the
 * rest of the server reads a typed config object instead of poking at
 * process.env. No secrets are ever logged or shipped to the client.
 */

import dotenv from "dotenv";
import type { RuntimeMode } from "../shared/constants";

dotenv.config({ quiet: true });

export const APP_VERSION = "0.1.0";

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value !== "false" && value !== "0" && value !== "";
}

// LOCAL_SIM defaults to true. Setting LOCAL_SIM=false (and providing Databricks
// resources) switches the app into DATABRICKS mode.
const localSim = bool(process.env.LOCAL_SIM, true);
const mode: RuntimeMode = localSim ? "LOCAL_SIM" : "DATABRICKS";

export interface DatabricksConfig {
  host: string | undefined;
  token: string | undefined;
  profile: string | undefined;
  warehouseId: string | undefined;
  modelEndpoint: string | undefined;
  embeddingEndpoint: string | undefined;
  aiSearchIndex: string | undefined;
  aiSearchEndpoint: string | undefined;
  ucCatalog: string | undefined;
  ucSchema: string | undefined;
  mlflowExperiment: string | undefined;
}

export interface OpenAiConfig {
  apiKey: string | undefined;
  model: string;
}

export interface AppConfig {
  mode: RuntimeMode;
  localSim: boolean;
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  version: string;
  /** Postgres connection string for Lakebase or a local Postgres fallback. */
  databaseUrl: string | undefined;
  /** PGlite data directory (LOCAL_SIM). "memory" => ephemeral in-memory db. */
  pgliteDir: string;
  googleMapsApiKey: string | undefined;
  databricks: DatabricksConfig;
  openai: OpenAiConfig;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const config: AppConfig = {
  mode,
  localSim,
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: Number(
    process.env.PORT ?? process.env.DATABRICKS_APP_PORT ?? 8000,
  ),
  version: APP_VERSION,
  databaseUrl: process.env.DATABASE_URL,
  pgliteDir: process.env.PGLITE_DATA_DIR ?? "memory",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  databricks: {
    host: process.env.DATABRICKS_HOST,
    token: process.env.DATABRICKS_TOKEN,
    profile: process.env.DATABRICKS_PROFILE,
    warehouseId: process.env.DATABRICKS_WAREHOUSE_ID,
    modelEndpoint: process.env.MODEL_ENDPOINT_NAME,
    embeddingEndpoint:
      process.env.EMBEDDING_ENDPOINT_NAME ?? "databricks-gte-large-en",
    aiSearchIndex: process.env.AI_SEARCH_INDEX_NAME,
    aiSearchEndpoint: process.env.AI_SEARCH_ENDPOINT_NAME,
    ucCatalog: process.env.UC_CATALOG,
    ucSchema: process.env.UC_SCHEMA,
    mlflowExperiment: process.env.MLFLOW_EXPERIMENT_NAME,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? "gpt-5.2",
  },
};

/** True when a real Postgres (Lakebase or local) connection string is present. */
export function hasPostgres(): boolean {
  return Boolean(config.databaseUrl);
}
