/**
 * Zod schemas for every mutating API input. The server validates request bodies
 * against these before any DB work happens, and the inferred types are reused by
 * the client so the form payloads and the API contract cannot drift.
 */

import { z } from "zod"
import {
  SEVERITIES,
  TEST_TYPES,
  SCENARIO_IDS,
  UNCERTAINTY_LEVELS,
} from "./constants"

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected a YYYY-MM-DD date")

const dateOrDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Expected a valid date")

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
})
export type CreateSignalInput = z.infer<typeof createSignalSchema>

export const parsedSignalSchema = z
  .object({
    systemId: z.string().min(1),
    testType: z.enum(TEST_TYPES),
    resultValue: z.coerce.number().finite(),
    unit: z.string().min(1).max(20),
    severity: z.enum(SEVERITIES),
    contaminant: z.string().min(1).max(120),
    summary: z.string().min(1).max(600),
    uncertainty: z.enum(UNCERTAINTY_LEVELS),
    confidence: z.number().min(0).max(1),
    locationLabel: z.string().max(200).nullable().optional(),
    symptoms: z.array(z.string().min(1).max(80)).default([]),
    missingFields: z.array(z.string().min(1).max(80)).default([]),
  })
  .strict()
export type ParsedSignal = z.infer<typeof parsedSignalSchema>

export const voiceSignalSchema = z
  .object({
    mode: z.literal("voice").default("voice"),
    transcript: z.string().min(3).max(5000),
    systemId: z.string().min(1).optional(),
    actor: z.string().min(1).max(120).default("citizen"),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    h3Cell: z.string().min(1).max(32).optional(),
    photoRef: z.string().max(300).optional().nullable(),
  })
  .strict()
export type VoiceSignalInput = z.infer<typeof voiceSignalSchema>

export const signalIntakeSchema = z.union([
  createSignalSchema,
  voiceSignalSchema,
])
export type SignalIntakeInput = z.infer<typeof signalIntakeSchema>

export const upiCallbackSchema = z
  .object({
    transactionId: z
      .string()
      .min(1)
      .max(120)
      .default(() => `upi-${Date.now()}`),
    memo: z.string().min(1).max(240).optional(),
    tn: z.string().min(1).max(240).optional(),
    amount: z.coerce.number().nonnegative().optional(),
    actor: z.string().min(1).max(120).default("upi-webhook"),
  })
  .strict()
  .refine((value) => Boolean(value.memo ?? value.tn), {
    message: "memo or tn is required",
    path: ["memo"],
  })
export type UpiCallbackInput = z.infer<typeof upiCallbackSchema>

export const contractorTaskDoneSchema = z
  .object({
    kind: z.literal("contractor_task_done"),
    clientId: z.string().min(1).max(120),
    taskId: z.string().min(1).max(120),
    actor: z.string().min(1).max(120).default("contractor"),
    notes: z.string().max(2000).optional().nullable(),
    photoRef: z.string().max(300).optional().nullable(),
    completedAt: dateOrDateTime.optional(),
  })
  .strict()

export const citizenReportSyncSchema = z
  .object({
    kind: z.literal("citizen_report"),
    clientId: z.string().min(1).max(120),
    transcript: z.string().min(3).max(5000),
    systemId: z.string().min(1).optional(),
    actor: z.string().min(1).max(120).default("citizen"),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    h3Cell: z.string().min(1).max(32).optional(),
  })
  .strict()

export const syncBatchSchema = z
  .object({
    batchId: z.string().min(1).max(120),
    source: z.enum(["citizen", "contractor"]).default("citizen"),
    items: z
      .array(
        z.discriminatedUnion("kind", [
          citizenReportSyncSchema,
          contractorTaskDoneSchema,
        ])
      )
      .min(1)
      .max(50),
  })
  .strict()
export type SyncBatchInput = z.infer<typeof syncBatchSchema>

export const assignTaskSchema = z
  .object({
    owner: z.string().min(1).max(120),
    actor: z.string().min(1).max(120).default("provider"),
  })
  .strict()
export type AssignTaskInput = z.infer<typeof assignTaskSchema>

export const completeTaskSchema = z
  .object({
    actor: z.string().min(1).max(120).default("contractor"),
    notes: z.string().max(2000).optional().nullable(),
    photoRef: z.string().max(300).optional().nullable(),
  })
  .strict()
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>

export const reviewCaseSchema = z
  .object({
    actor: z.string().min(1).max(120).default("provider"),
    severity: z.enum(SEVERITIES).optional(),
    recommendation: z.string().max(2000).optional(),
    rationale: z.string().min(1).max(2000),
    assignTo: z.string().min(1).max(120).optional(),
  })
  .strict()
export type ReviewCaseInput = z.infer<typeof reviewCaseSchema>

export const h3MapQuerySchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    limit: z.coerce.number().int().min(1).max(250).default(80),
  })
  .strict()
export type H3MapQuery = z.infer<typeof h3MapQuerySchema>

export const analyzeSchema = z
  .object({
    actor: z.string().min(1).max(120).optional(),
  })
  .default({})
export type AnalyzeInput = z.infer<typeof analyzeSchema>

export const approveSchema = z.object({
  approver: z.string().min(1, "Approver name is required").max(120),
  rationale: z.string().min(1, "A rationale is required").max(2000),
})
export type ApproveInput = z.infer<typeof approveSchema>

export const overrideSchema = z.object({
  approver: z.string().min(1, "Approver name is required").max(120),
  rationale: z.string().min(1, "An override rationale is required").max(2000),
  replacementAction: z
    .string()
    .min(1, "A replacement action is required")
    .max(2000),
})
export type OverrideInput = z.infer<typeof overrideSchema>

export const requestMoreEvidenceSchema = z.object({
  approver: z.string().min(1).max(120).optional(),
  requestedEvidence: z
    .string()
    .min(1, "Describe the evidence you need")
    .max(2000),
  owner: z.string().min(1, "Assign an owner").max(120),
  dueAt: dateOrDateTime,
})
export type RequestMoreEvidenceInput = z.infer<typeof requestMoreEvidenceSchema>

export const demoResetSchema = z
  .object({
    scenario: z.string().min(1).max(120).optional(),
    seed: z.coerce.number().int().optional(),
    focusScenario: z.enum(SCENARIO_IDS).optional(),
  })
  .default({})
export type DemoResetInput = z.infer<typeof demoResetSchema>
