/**
 * MLflow tracing / evaluation adapter.
 *
 * LOCAL_SIM: builds a local trace object (source: "local_fallback") that the
 * Trace tab renders. DATABRICKS: log the trace + eval results to the MLflow
 * experiment named by MLFLOW_EXPERIMENT_NAME and return source: "mlflow".
 */

import { config } from "../config";
import { ServiceUnavailableError } from "../lib/errors";
import { newId } from "../lib/ids";
import type { CaseTrace, ServiceCapability } from "../../shared/types";
import { getWorkspaceClient, missingDatabricksDetail } from "./workspace";

export function newTraceId(): string {
  return newId("trace").toLowerCase();
}

async function getOrCreateExperimentId(name: string): Promise<string> {
  const experiments = getWorkspaceClient().experiments;
  try {
    const existing = await experiments.getByName({ experiment_name: name });
    if (existing.experiment?.experiment_id) return existing.experiment.experiment_id;
  } catch {
    // Create below when the experiment is not present.
  }

  const created = await experiments.createExperiment({ name });
  if (!created.experiment_id) {
    throw new ServiceUnavailableError(
      `MLflow experiment ${name} could not be created or resolved`,
    );
  }
  return created.experiment_id;
}

export async function logTrace(
  trace: CaseTrace,
): Promise<{ source: "mlflow" | "local_fallback" }> {
  if (config.localSim) return { source: "local_fallback" };

  const experimentName = config.databricks.mlflowExperiment;
  if (!experimentName) {
    throw new ServiceUnavailableError(
      missingDatabricksDetail("MLflow", "MLFLOW_EXPERIMENT_NAME"),
    );
  }

  const experiments = getWorkspaceClient().experiments;
  const experimentId = await getOrCreateExperimentId(experimentName);
  const startedAt = new Date(trace.createdAt).getTime();
  const run = await experiments.createRun({
    experiment_id: experimentId,
    run_name: `neelu-${trace.caseId}-${trace.traceId}`,
    start_time: Number.isFinite(startedAt) ? startedAt : Date.now(),
    tags: [
      { key: "neelu.trace_id", value: trace.traceId },
      { key: "neelu.case_id", value: trace.caseId },
      { key: "neelu.source", value: "databricks-app" },
    ],
  });
  const runId = run.run?.info?.run_id;
  if (!runId) throw new ServiceUnavailableError("MLflow did not return a run_id");

  const timestamp = Date.now();
  await experiments.logBatch({
    run_id: runId,
    params: [
      { key: "case_id", value: trace.caseId },
      { key: "trace_id", value: trace.traceId },
    ],
    metrics: [
      {
        key: "tool_calls",
        value: trace.toolCalls.length,
        timestamp,
        step: 0,
      },
      {
        key: "retrieved_guidance_count",
        value: trace.retrievedGuidanceCount,
        timestamp,
        step: 0,
      },
      {
        key: "citations_used",
        value: trace.citationsUsed,
        timestamp,
        step: 0,
      },
      ...trace.evalResults.map((result, index) => ({
        key: `eval_${result.scorer}`,
        value: result.passed ? 1 : 0,
        timestamp,
        step: index,
      })),
    ],
    tags: trace.toolCalls.slice(0, 20).map((toolCall, index) => ({
      key: `neelu.tool.${index}`,
      value: `${toolCall.tool}:${toolCall.fallback ? "fallback" : "live"}`,
    })),
  });
  await experiments.updateRun({
    run_id: runId,
    status: "FINISHED",
    end_time: Date.now(),
  });
  return { source: "mlflow" };
}

export function mlflowCapability(): ServiceCapability {
  const experiment = config.databricks.mlflowExperiment;
  if (config.localSim) {
    return {
      service: "mlflow",
      status: "local_fallback",
      detail: "LOCAL_SIM=true; local in-app trace and eval are active",
    };
  }
  if (!experiment) {
    return {
      service: "mlflow",
      status: "error",
      detail: missingDatabricksDetail("MLflow", "MLFLOW_EXPERIMENT_NAME"),
    };
  }
  return {
    service: "mlflow",
    status: "connected",
    detail: `Logging traces and eval metrics to MLflow experiment ${experiment}`,
  };
}
