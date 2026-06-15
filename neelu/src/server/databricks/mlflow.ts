/**
 * MLflow tracing / evaluation adapter.
 *
 * LOCAL_SIM: builds a local trace object (source: "local_fallback") that the
 * Trace tab renders. DATABRICKS: log the trace + eval results to the MLflow
 * experiment named by MLFLOW_EXPERIMENT_NAME and return source: "mlflow".
 */

import { config } from "../config";
import { newId } from "../lib/ids";
import type { CaseTrace, ServiceCapability } from "../../shared/types";

export function newTraceId(): string {
  return newId("trace").toLowerCase();
}

export async function logTrace(
  _trace: CaseTrace,
): Promise<{ source: "mlflow" | "local_fallback" }> {
  // DATABRICKS extension point: log spans + eval metrics to MLflow here.
  return { source: "local_fallback" };
}

export function mlflowCapability(): ServiceCapability {
  const experiment = config.databricks.mlflowExperiment;
  return {
    service: "mlflow",
    status: "local_fallback",
    detail: experiment
      ? `MLFLOW_EXPERIMENT_NAME=${experiment} configured; live logging not yet implemented, using local trace`
      : "Local in-app trace + eval (no MLflow experiment)",
  };
}
