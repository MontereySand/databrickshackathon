/**
 * Prompt templates for the constrained model call (DATABRICKS mode). The model is
 * only ever asked to classify/draft within strict safety rails; the deterministic
 * finding remains the fallback and the safety checks still run on model output.
 */

import { SAFETY_DISCLAIMER, HUMAN_APPROVAL_STATEMENT } from "./safety";
import type { Signal, WaterSystem } from "../shared/types";
import type { RetrievalResult } from "../server/databricks/aiSearch";

export const SYSTEM_PROMPT = `You are Neelu, a cautious water-quality analysis assistant.
Rules you must always follow:
- ${SAFETY_DISCLAIMER}
- ${HUMAN_APPROVAL_STATEMENT}
- Every claim must cite one of the provided guidance snippets, or be explicitly marked as unsupported.
- Always flag uncertainty for field-kit results and recommend confirmatory laboratory sampling.
- Never state that water is safe/unsafe as a legal determination and never certify compliance.
Return strict JSON: { "classification": string, "recommendation": string, "severity": "low|moderate|high|urgent", "uncertainty": "low|medium|high", "confidence": number }`;

export function buildUserPrompt(
  signal: Signal,
  system: WaterSystem,
  guidance: RetrievalResult[],
): string {
  const snippets = guidance
    .map((g, i) => `[${i + 1}] ${g.sourceName}: ${g.snippet}`)
    .join("\n");
  return [
    `System: ${system.name} (${system.region ?? "unknown region"}, serves ${system.populationServed ?? "?"} people).`,
    `Field test: ${signal.testType} = ${signal.resultValue} ${signal.unit}.`,
    `Kit: ${signal.kitId ?? "unknown"} (expires ${signal.kitExpiresAt ?? "unknown"}).`,
    `Notes: ${signal.notes ?? "none"}.`,
    "",
    "Guidance snippets:",
    snippets || "(none retrieved)",
    "",
    "Classify the signal and recommend next steps within the rules above.",
  ].join("\n");
}
