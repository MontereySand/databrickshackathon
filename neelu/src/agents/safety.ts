/**
 * Safety constraints enforced on every agent finding before it is persisted.
 *
 * Neelu is advisory only: it never certifies legal/regulatory compliance, never
 * sends notifications, and always requires human approval. These helpers make
 * those guarantees structural rather than aspirational.
 */

import type { Citation } from "../shared/types";
import type { UncertaintyLevel } from "../shared/constants";

export const SAFETY_DISCLAIMER =
  "Advisory only. Neelu does not certify legal or regulatory compliance and sends no notifications. A human must review and approve any public-health action.";

export const HUMAN_APPROVAL_STATEMENT =
  "Human approval is required before any action is taken.";

// Phrases that would imply Neelu itself certifies compliance. The deterministic
// generator never emits these; the scorer also checks for their absence.
const FORBIDDEN_COMPLIANCE_PATTERNS: RegExp[] = [
  /certif\w*\s+complian/iu,
  /compliance\s+certif/iu,
  /legally\s+complian/iu,
  /guarantee[sd]?\s+complian/iu,
  /meets\s+all\s+(regulations|requirements)/iu,
  /officially\s+(safe|compliant)/iu,
];

export function containsComplianceClaim(text: string): boolean {
  return FORBIDDEN_COMPLIANCE_PATTERNS.some((pattern) => pattern.test(text));
}

export interface FindingSafetyInput {
  findingText: string;
  recommendation: string;
  uncertainty: UncertaintyLevel;
  citations: Citation[];
}

export interface SafetyResult {
  ok: boolean;
  violations: string[];
}

export function checkFindingSafety(input: FindingSafetyInput): SafetyResult {
  const violations: string[] = [];
  if (input.citations.length === 0) {
    violations.push("Finding has no supporting citations.");
  }
  if (!input.recommendation.includes(HUMAN_APPROVAL_STATEMENT)) {
    violations.push("Recommendation does not state human approval is required.");
  }
  const combined = `${input.findingText} ${input.recommendation}`;
  if (containsComplianceClaim(combined)) {
    violations.push("Finding contains a prohibited compliance certification claim.");
  }
  return { ok: violations.length === 0, violations };
}

/** Ensure a recommendation always ends with the human-approval statement. */
export function withApprovalStatement(recommendation: string): string {
  if (recommendation.includes(HUMAN_APPROVAL_STATEMENT)) return recommendation;
  const trimmed = recommendation.trim();
  const sep = trimmed.endsWith(".") ? " " : ". ";
  return `${trimmed}${sep}${HUMAN_APPROVAL_STATEMENT}`;
}
