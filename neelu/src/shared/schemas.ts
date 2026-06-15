/**
 * Zod schemas for every mutating API input. The server validates request bodies
 * against these before any DB work happens, and the inferred types are reused by
 * the client so the form payloads and the API contract cannot drift.
 */

import { z } from "zod";
import { TEST_TYPES, SCENARIO_IDS } from "./constants";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected a YYYY-MM-DD date");

const dateOrDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Expected a valid date");

export const createSignalSchema = z.object({
  systemId: z.string().min(1, "Select a water system"),
  signalType: z.string().min(1).max(60).default("field_test"),
  testType: z.enum(TEST_TYPES),
  resultValue: z.coerce
    .number()
    .refine((value) => Number.isFinite(value), "Enter a numeric result"),
  unit: z.string().min(1, "Unit is required").max(20),
  kitId: z.string().max(60).optional().nullable(),
  kitExpiresAt: isoDate.optional().nullable(),
  locationLabel: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  photoRef: z.string().max(300).optional().nullable(),
  submittedBy: z.string().min(1).max(120).optional(),
});
export type CreateSignalInput = z.infer<typeof createSignalSchema>;

export const analyzeSchema = z
  .object({
    actor: z.string().min(1).max(120).optional(),
  })
  .default({});
export type AnalyzeInput = z.infer<typeof analyzeSchema>;

export const approveSchema = z.object({
  approver: z.string().min(1, "Approver name is required").max(120),
  rationale: z.string().min(1, "A rationale is required").max(2000),
});
export type ApproveInput = z.infer<typeof approveSchema>;

export const overrideSchema = z.object({
  approver: z.string().min(1, "Approver name is required").max(120),
  rationale: z.string().min(1, "An override rationale is required").max(2000),
  replacementAction: z
    .string()
    .min(1, "A replacement action is required")
    .max(2000),
});
export type OverrideInput = z.infer<typeof overrideSchema>;

export const requestMoreEvidenceSchema = z.object({
  approver: z.string().min(1).max(120).optional(),
  requestedEvidence: z
    .string()
    .min(1, "Describe the evidence you need")
    .max(2000),
  owner: z.string().min(1, "Assign an owner").max(120),
  dueAt: dateOrDateTime,
});
export type RequestMoreEvidenceInput = z.infer<typeof requestMoreEvidenceSchema>;

export const demoResetSchema = z
  .object({
    scenario: z.string().min(1).max(120).optional(),
    seed: z.coerce.number().int().optional(),
    focusScenario: z.enum(SCENARIO_IDS).optional(),
  })
  .default({});
export type DemoResetInput = z.infer<typeof demoResetSchema>;
