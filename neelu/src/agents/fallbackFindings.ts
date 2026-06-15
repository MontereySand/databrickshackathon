/**
 * Deterministic, rule-based classification. This is the safety net that makes the
 * Analyze flow robust: it runs with no model and no live retrieval, producing a
 * cited, uncertainty-flagged finding that always requires human approval.
 *
 * A model finding (DATABRICKS mode) may override the classification/recommendation
 * text, but the deterministic result remains the fallback and the structural
 * safety guarantees still apply.
 */

import { CONTAMINANT_THRESHOLDS } from "../shared/constants";
import type { Severity, UncertaintyLevel } from "../shared/constants";
import type { Citation, Signal, WaterSystem } from "../shared/types";
import type { RetrievalResult } from "../server/databricks/aiSearch";
import { withApprovalStatement } from "./safety";

export interface Classification {
  contaminant: string;
  exceeds: boolean;
  severity: Severity;
  uncertainty: UncertaintyLevel;
  uncertaintyReason: string;
  findingText: string;
  recommendation: string;
  confidence: number;
  citations: Citation[];
  summary: string;
  source: "deterministic" | "model";
}

function isKitExpired(signal: Signal): boolean {
  if (!signal.kitExpiresAt) return false;
  const expires = new Date(`${signal.kitExpiresAt}T23:59:59Z`).getTime();
  const received = new Date(signal.receivedAt).getTime();
  return Number.isFinite(expires) && expires < received;
}

function mentionsMissingConfirmation(signal: Signal): boolean {
  const notes = (signal.notes ?? "").toLowerCase();
  return notes.includes("no confirmatory") || notes.includes("not collected");
}

function evaluateExceedance(signal: Signal): { exceeds: boolean; thresholdLabel: string } {
  if (!signal.testType) return { exceeds: false, thresholdLabel: "n/a" };
  const threshold = CONTAMINANT_THRESHOLDS[signal.testType];
  const value = signal.resultValue ?? 0;
  let exceeds = false;
  if (threshold.direction === "above") exceeds = value > threshold.thresholdValue;
  else if (threshold.direction === "below") exceeds = value < threshold.thresholdValue;
  else exceeds = value >= 1; // presence/absence
  const thresholdLabel = `${threshold.thresholdValue} ${threshold.thresholdUnit}`;
  return { exceeds, thresholdLabel };
}

function citationsFromRetrieval(results: RetrievalResult[]): Citation[] {
  return results.map((result) => ({
    label: result.sourceName,
    sourceName: result.sourceName,
    sourceUri: result.sourceUri,
    snippet: result.snippet,
  }));
}

export function classifySignalDeterministic(
  signal: Signal,
  system: WaterSystem,
  retrieval: RetrievalResult[],
): Classification {
  const testType = signal.testType ?? "nitrate";
  const threshold = CONTAMINANT_THRESHOLDS[testType];
  const { exceeds, thresholdLabel } = evaluateExceedance(signal);
  const value = signal.resultValue ?? 0;
  const unit = signal.unit ?? threshold.unit;

  const expired = isKitExpired(signal);
  const missingConfirmation = mentionsMissingConfirmation(signal);

  const severity: Severity = exceeds ? threshold.severityWhenExceeded : "low";

  let uncertainty: UncertaintyLevel = "medium";
  let uncertaintyReason =
    "Field-kit screening result; a confirmatory accredited laboratory sample is required before action.";
  if (expired) {
    uncertainty = "high";
    uncertaintyReason =
      "Test kit appears to be past its expiration date, which lowers confidence; a confirmatory laboratory sample is required.";
  } else if (missingConfirmation) {
    uncertainty = "high";
    uncertaintyReason =
      "No confirmatory microbiological/laboratory sample has been collected yet; result is provisional.";
  }

  const presence = threshold.direction === "presence";
  const measured = presence
    ? value >= 1
      ? "a positive (presence) result"
      : "a negative (absence) result"
    : `${value} ${unit}`;
  const comparison = presence
    ? exceeds
      ? "indicates contamination"
      : "indicates no detection"
    : exceeds
      ? `exceeds the reference value of ${thresholdLabel}`
      : `is within the reference value of ${thresholdLabel}`;

  const findingText =
    `Field ${threshold.label} test at ${system.name} returned ${measured}, which ${comparison}. ` +
    `Severity assessed as ${severity}. Uncertainty (${uncertainty}): ${uncertaintyReason}`;

  const confidence = exceeds ? (expired ? 0.5 : 0.7) : 0.6;

  let recommendation = exceeds
    ? `Treat as provisional and prioritize a confirmatory laboratory sample for ${threshold.contaminant}, notify the supervisor/program lead, and prepare (do not send) a public-health notice draft for review.`
    : `Document the result and continue routine monitoring; collect a confirmatory sample if conditions change.`;
  recommendation = withApprovalStatement(recommendation);

  // Always include the threshold guidance + confirmatory-sampling guidance even
  // if retrieval returned nothing, so the finding is never uncited.
  let citations = citationsFromRetrieval(retrieval);
  if (citations.length === 0) {
    citations = [
      {
        label: threshold.label,
        sourceName: "Reference threshold",
        sourceUri: null,
        snippet: `Reference value for ${threshold.contaminant}: ${thresholdLabel}.`,
      },
    ];
  }

  const summary = exceeds
    ? `${threshold.label} ${measured} at ${system.name} ${comparison}.`
    : `${threshold.label} within reference at ${system.name}.`;

  return {
    contaminant: threshold.contaminant,
    exceeds,
    severity,
    uncertainty,
    uncertaintyReason,
    findingText,
    recommendation,
    confidence,
    citations,
    summary,
    source: "deterministic",
  };
}
