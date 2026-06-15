/**
 * Model Serving / AI Gateway adapter.
 *
 * LOCAL_SIM: returns `available: false` so the orchestrator uses the
 * deterministic fallback finding (see src/agents/fallbackFindings.ts).
 *
 * DATABRICKS: implement a call to the serving endpoint named by
 * MODEL_ENDPOINT_NAME using the constrained prompt in src/agents/prompts.ts,
 * validate/parse the response, and return `available: true` with the structured
 * finding. The deterministic finding remains the safety net if the call fails.
 */

import { config } from "../config";
import type { ServiceCapability } from "../../shared/types";
import type { Severity, UncertaintyLevel } from "../../shared/constants";

export interface ModelFindingRequest {
  prompt: string;
  signalSummary: string;
  guidanceSnippets: string[];
}

export interface ModelFinding {
  classification: string;
  recommendation: string;
  severity: Severity;
  uncertainty: UncertaintyLevel;
  confidence: number;
}

export type ModelResult =
  | { available: true; finding: ModelFinding }
  | { available: false; reason: string };

export async function generateFindingWithModel(
  _request: ModelFindingRequest,
): Promise<ModelResult> {
  // DATABRICKS extension point: call MODEL_ENDPOINT_NAME here.
  return {
    available: false,
    reason: config.databricks.modelEndpoint
      ? "Model endpoint configured but live adapter not yet implemented"
      : "No model endpoint configured (LOCAL_SIM)",
  };
}

export function modelCapability(): ServiceCapability {
  const endpoint = config.databricks.modelEndpoint;
  return {
    service: "model_serving",
    status: "local_fallback",
    detail: endpoint
      ? `MODEL_ENDPOINT_NAME=${endpoint} configured; live adapter not yet implemented, using deterministic finding`
      : "Deterministic rule-based finding (no model endpoint)",
  };
}
