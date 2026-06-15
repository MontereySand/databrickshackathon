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

import { config } from "../config"
import { ServiceUnavailableError } from "../lib/errors"
import type {
  CaseListItem,
  ProviderDashboard,
  ProviderInsight,
  ServiceCapability,
} from "../../shared/types"
import type {
  Severity,
  TestType,
  UncertaintyLevel,
} from "../../shared/constants"
import { CONTAMINANT_THRESHOLDS } from "../../shared/constants"
import { parsedSignalSchema, type ParsedSignal } from "../../shared/schemas"
import { z } from "zod"
import { SYSTEM_PROMPT } from "../../agents/prompts"
import { getWorkspaceClient, missingDatabricksDetail } from "./workspace"

export interface ModelFindingRequest {
  prompt: string
  signalSummary: string
  guidanceSnippets: string[]
}

export interface ModelFinding {
  classification: string
  recommendation: string
  severity: Severity
  uncertainty: UncertaintyLevel
  confidence: number
}

export type ModelResult =
  | { available: true; finding: ModelFinding }
  | { available: false; reason: string }

export interface ParseSignalRequest {
  transcript: string
  systemId?: string
  contextSnippets?: string[]
}

export type ParsedSignalResult =
  | {
      available: true
      parsed: ParsedSignal
      source: "model_serving" | "local_sim" | "safety_net"
    }
  | { available: false; reason: string }

const modelFindingSchema = z
  .object({
    classification: z.string().min(1),
    recommendation: z.string().min(1),
    severity: z.enum(["low", "moderate", "high", "urgent"]),
    uncertainty: z.enum(["low", "medium", "high"]),
    confidence: z.number().min(0).max(1),
  })
  .strict()

const providerInsightSchema = z
  .object({
    headline: z.string().min(1),
    summary: z.string().min(1),
    recommendedActions: z.array(z.string().min(1)).min(2).max(6),
    watchlistDistricts: z.array(z.string().min(1)).min(1).max(8),
  })
  .strict()

const KEYWORDS: Array<{ testType: TestType; terms: string[] }> = [
  { testType: "arsenic", terms: ["arsenic"] },
  {
    testType: "total_coliform",
    terms: ["coliform", "e coli", "e. coli", "diarrhea", "stomach"],
  },
  { testType: "nitrate", terms: ["nitrate", "fertilizer", "blue baby"] },
  { testType: "turbidity", terms: ["turbid", "cloudy", "muddy", "brown"] },
  { testType: "free_chlorine", terms: ["chlorine", "bleach", "smell"] },
  { testType: "ph", terms: ["ph", "acidic", "bitter"] },
]

function severityFor(testType: TestType, transcript: string): Severity {
  const urgentWords = [
    "urgent",
    "hospital",
    "vomit",
    "infant",
    "children",
    "skin lesions",
  ]
  if (urgentWords.some((term) => transcript.includes(term))) return "urgent"
  return CONTAMINANT_THRESHOLDS[testType].severityWhenExceeded
}

function pickTestType(transcript: string): TestType {
  const normalized = transcript.toLowerCase()
  return (
    KEYWORDS.find((entry) =>
      entry.terms.some((term) => normalized.includes(term))
    )?.testType ?? "total_coliform"
  )
}

function symptomsFrom(transcript: string): string[] {
  const normalized = transcript.toLowerCase()
  return [
    ["diarrhea", "diarrhea"],
    ["vomit", "vomiting"],
    ["skin", "skin lesions"],
    ["fever", "fever"],
    ["stomach", "stomach pain"],
  ]
    .filter(([needle]) => normalized.includes(needle))
    .map(([, symptom]) => symptom)
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return JSON.parse(trimmed)
  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/u)
  if (fenced) return JSON.parse(fenced[1])
  const first = trimmed.indexOf("{")
  const last = trimmed.lastIndexOf("}")
  if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1))
  throw new Error("Model response did not contain a JSON object")
}

async function queryChatJson(system: string, user: string): Promise<unknown> {
  const endpoint = config.databricks.modelEndpoint
  if (!endpoint) {
    throw new ServiceUnavailableError(
      missingDatabricksDetail("Model Serving", "MODEL_ENDPOINT_NAME")
    )
  }
  const response = await getWorkspaceClient().servingEndpoints.query({
    name: endpoint,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0,
    max_tokens: 900,
  })
  const content =
    response.choices?.[0]?.message?.content ?? response.choices?.[0]?.text ?? ""
  return extractJsonObject(content)
}

function parseSignalPrompt(request: ParseSignalRequest): string {
  return [
    "Extract a structured water-quality citizen signal from this transcript.",
    "Return strict JSON only with this shape:",
    '{"systemId":"string","testType":"nitrate|total_coliform|turbidity|ph|arsenic|free_chlorine","resultValue":number,"unit":"string","severity":"low|moderate|high|urgent","contaminant":"string","summary":"string","uncertainty":"low|medium|high","confidence":number,"locationLabel":string|null,"symptoms":["string"],"missingFields":["string"]}',
    "If a field is missing, infer conservatively and list it in missingFields.",
    request.systemId ? `Known systemId: ${request.systemId}` : "Known systemId: unknown",
    request.contextSnippets?.length
      ? `RAG context:\n${request.contextSnippets.join("\n---\n")}`
      : "RAG context: none",
    `Transcript: ${request.transcript}`,
  ].join("\n")
}

export async function parseSignalWithModel(
  request: ParseSignalRequest
): Promise<ParsedSignalResult> {
  const transcript = request.transcript.toLowerCase()
  const testType = pickTestType(transcript)
  const threshold = CONTAMINANT_THRESHOLDS[testType]
  const hasNumber = request.transcript.match(/\b\d+(?:\.\d+)?\b/u)
  const resultValue = hasNumber
    ? Number(hasNumber[0])
    : threshold.thresholdValue + 1
  const parsed = parsedSignalSchema.parse({
    systemId: request.systemId ?? "sys-village",
    testType,
    resultValue,
    unit: threshold.unit,
    severity: severityFor(testType, transcript),
    contaminant: threshold.contaminant,
    summary: `Citizen voice report suggests ${threshold.contaminant}; provider review required before action.`,
    uncertainty: request.systemId ? "medium" : "high",
    confidence: request.systemId ? 0.74 : 0.52,
    locationLabel: request.systemId ? null : "citizen reported location",
    symptoms: symptomsFrom(transcript),
    missingFields: request.systemId ? [] : ["systemId"],
  })

  if (config.localSim) {
    return { available: true, parsed, source: "local_sim" }
  }

  try {
    const modelJson = await queryChatJson(
      "You are a cautious water-quality intake extraction model. Return JSON only.",
      parseSignalPrompt(request)
    )
    return {
      available: true,
      parsed: parsedSignalSchema.parse(modelJson),
      source: "model_serving",
    }
  } catch {
    return { available: true, parsed, source: "safety_net" }
  }
}

export async function generateFindingWithModel(
  request: ModelFindingRequest
): Promise<ModelResult> {
  if (config.localSim) {
    return {
      available: false,
      reason: "LOCAL_SIM=true; deterministic classifier is active",
    }
  }

  try {
    const modelJson = await queryChatJson(
      SYSTEM_PROMPT,
      [
        request.prompt,
        `Signal summary: ${request.signalSummary}`,
        "Guidance snippets:",
        request.guidanceSnippets
          .map((item, index) => `[${index + 1}] ${item}`)
          .join("\n"),
        "Return the strict JSON object only.",
      ]
        .filter(Boolean)
        .join("\n\n")
    )
    return {
      available: true,
      finding: modelFindingSchema.parse(modelJson),
    }
  } catch (error) {
    return {
      available: false,
      reason:
        error instanceof Error
          ? error.message
          : "Model Serving did not return a usable finding",
    }
  }
}

export async function generateProviderInsightWithModel(
  dashboard: ProviderDashboard,
  cases: CaseListItem[]
): Promise<ProviderInsight> {
  if (config.localSim) {
    return {
      headline: "Local simulation insight",
      summary:
        "LOCAL_SIM=true; provider insight generation is using the spoofed test path.",
      recommendedActions: [
        "Run the app with LOCAL_SIM=false to use Databricks Model Serving.",
        "Review urgent cases before assigning field follow-up.",
      ],
      watchlistDistricts: dashboard.priorityGeographies
        .slice(0, 3)
        .map((item) => item.districtName),
      modelEndpoint: "local_sim",
      generatedAt: new Date().toISOString(),
    }
  }

  const endpoint = config.databricks.modelEndpoint
  if (!endpoint) {
    throw new ServiceUnavailableError(
      missingDatabricksDetail("Model Serving", "MODEL_ENDPOINT_NAME")
    )
  }
  try {
    const modelJson = await queryChatJson(
      "You are a cautious provider operations insight agent for Neelu. Return JSON only. Do not make medical diagnoses or compliance determinations.",
      [
        "Create concise role-specific insights for a healthcare provider reviewing India water-risk and medical-access data.",
        "Return strict JSON: {\"headline\":\"string\",\"summary\":\"string\",\"recommendedActions\":[\"string\"],\"watchlistDistricts\":[\"string\"]}.",
        "Use only the supplied dashboard/case data. Mention human review where recommendations may affect people.",
        `Dashboard: ${JSON.stringify(dashboard).slice(0, 12000)}`,
        `Open cases: ${JSON.stringify(cases.slice(0, 20)).slice(0, 6000)}`,
      ].join("\n\n")
    )
    const parsed = providerInsightSchema.parse(modelJson)
    return {
      ...parsed,
      modelEndpoint: endpoint,
      generatedAt: new Date().toISOString(),
    }
  } catch (error) {
    return {
      headline: "AI insight unavailable",
      summary:
        error instanceof Error
          ? `Databricks Model Serving did not return an insight: ${error.message}`
          : "Databricks Model Serving did not return an insight.",
      recommendedActions: [
        "Use the ranked geographies and open cases while the endpoint is unavailable.",
        "Retry insight generation after the model endpoint is re-enabled.",
      ],
      watchlistDistricts: dashboard.priorityGeographies
        .slice(0, 3)
        .map((item) => item.districtName),
      modelEndpoint: endpoint,
      generatedAt: new Date().toISOString(),
    }
  }
}

export function modelCapability(): ServiceCapability {
  const endpoint = config.databricks.modelEndpoint
  if (config.localSim) {
    return {
      service: "model_serving",
      status: "local_fallback",
      detail: "LOCAL_SIM=true; deterministic rule-based finding is active",
    }
  }
  if (!endpoint) {
    return {
      service: "model_serving",
      status: "error",
      detail: missingDatabricksDetail("Model Serving", "MODEL_ENDPOINT_NAME"),
    }
  }
  return {
    service: "model_serving",
    status: "connected",
    detail: `Querying Databricks Model Serving endpoint ${endpoint}`,
  }
}
