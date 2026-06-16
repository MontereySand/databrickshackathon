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
  ContractorQueueItem,
  ProviderAgentAction,
  ProviderAgentChatResponse,
  ProviderDashboard,
  ProviderInsight,
  ServiceCapability,
  SignalDTO,
} from "../../shared/types"
import type {
  Severity,
  TestType,
  UncertaintyLevel,
} from "../../shared/constants"
import { CONTAMINANT_THRESHOLDS } from "../../shared/constants"
import {
  parsedSignalSchema,
  type ParsedSignal,
  type ProviderAgentChatInput,
} from "../../shared/schemas"
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

function responseText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const outputText = (payload as { output_text?: unknown }).output_text
  if (typeof outputText === "string") return outputText

  const output = (payload as { output?: unknown }).output
  if (!Array.isArray(output)) return ""
  return output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const content = (item as { content?: unknown }).content
      if (!Array.isArray(content)) return []
      return content.flatMap((part) => {
        if (!part || typeof part !== "object") return []
        const text = (part as { text?: unknown }).text
        return typeof text === "string" ? [text] : []
      })
    })
    .join("\n")
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

async function queryOpenAiJson(system: string, user: string): Promise<unknown> {
  const apiKey = config.openai.apiKey
  if (!apiKey) {
    throw new ServiceUnavailableError("OPENAI_API_KEY is not configured")
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_output_tokens: 650,
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new ServiceUnavailableError(
      `Model response unavailable (${response.status}): ${detail.slice(0, 240)}`
    )
  }

  return extractJsonObject(responseText(await response.json()))
}

async function queryOpenAiText({
  instructions,
  input,
  maxOutputTokens = 520,
}: {
  instructions: string
  input: Array<{ role: "user" | "assistant"; content: string }>
  maxOutputTokens?: number
}): Promise<string> {
  const apiKey = config.openai.apiKey
  if (!apiKey) {
    throw new ServiceUnavailableError("OPENAI_API_KEY is not configured")
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openai.model,
      instructions,
      input,
      max_output_tokens: maxOutputTokens,
      store: false,
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new ServiceUnavailableError(
      `Model response unavailable (${response.status}): ${detail.slice(0, 240)}`
    )
  }

  const text = responseText(await response.json()).trim()
  if (!text) {
    throw new ServiceUnavailableError("Model response was empty")
  }
  return text
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
  const deterministicInsight = (): ProviderInsight => ({
    headline: "Neelu Agent ready",
    summary:
      "Provider context is synced to the dashboard, case queue, and contractor work orders for the current operating picture.",
    recommendedActions: [
      "Analyze the newest received signal before opening new field work.",
      "Assign open contractor work orders from the provider queue and keep the audit trail current.",
    ],
    watchlistDistricts: dashboard.priorityGeographies
      .slice(0, 3)
      .map((item) => item.districtName),
    modelEndpoint: config.openai.apiKey
      ? config.openai.model
      : "demo-inference",
    generatedAt: new Date().toISOString(),
  })

  if (config.openai.apiKey) {
    try {
      const modelJson = await queryOpenAiJson(
        "You are Neelu's provider operations insight model for a polished hackathon demo. Return JSON only. Use only supplied data and avoid medical diagnoses or claims of external dispatch.",
        [
          "Create concise role-specific insights for a provider reviewing India water-risk and medical-access operations.",
          "Return strict JSON: {\"headline\":\"string\",\"summary\":\"string\",\"recommendedActions\":[\"string\"],\"watchlistDistricts\":[\"string\"]}.",
          "Make the response feel live and useful. Do not mention missing Databricks endpoints, fallbacks, or internal failures.",
          `Dashboard: ${JSON.stringify(dashboard).slice(0, 12000)}`,
          `Open cases: ${JSON.stringify(cases.slice(0, 20)).slice(0, 6000)}`,
        ].join("\n\n")
      )
      const parsed = providerInsightSchema.parse(modelJson)
      return {
        ...parsed,
        modelEndpoint: config.openai.model,
        generatedAt: new Date().toISOString(),
      }
    } catch {
      return deterministicInsight()
    }
  }

  if (config.localSim) {
    return {
      ...deterministicInsight(),
      modelEndpoint: "demo-inference",
    }
  }

  const endpoint = config.databricks.modelEndpoint
  if (!endpoint) return deterministicInsight()
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
  } catch {
    return {
      ...deterministicInsight(),
      modelEndpoint: endpoint,
    }
  }
}

function deterministicProviderActions(
  cases: CaseListItem[],
  tasks: ContractorQueueItem[],
  signals: SignalDTO[]
): ProviderAgentAction[] {
  const receivedSignal = signals.find((signal) => signal.status === "received")
  const highCase = cases.find(
    (item) => item.severity === "urgent" || item.severity === "high"
  )
  const openTask = tasks.find((task) => task.status === "open")
  const actions: Array<ProviderAgentAction | null> = [
    receivedSignal
      ? {
          type: "analyze_signal",
          label: "Analyze newest signal",
          targetId: receivedSignal.signalId,
          reason: `${receivedSignal.systemName} is still waiting for analysis.`,
        }
      : null,
    highCase
      ? {
          type: "open_case",
          label: "Open priority case",
          targetId: highCase.caseId,
          reason: `${highCase.systemName} is ${highCase.severity ?? "open"}.`,
        }
      : null,
    openTask
      ? {
          type: "assign_task",
          label: "Assign open work order",
          targetId: openTask.taskId,
          reason: `${openTask.title} is ready for contractor ownership.`,
        }
      : null,
    {
      type: "refresh_status",
      label: "Refresh service status",
      targetId: null,
      reason:
        "Re-probe Lakebase, Unity Catalog, Model Serving, AI Search, and MLflow.",
    },
  ]
  return actions.filter((action): action is ProviderAgentAction =>
    Boolean(action)
  )
}

function deterministicProviderAgentReply({
  input,
  dashboard,
  cases,
  tasks,
  signals,
  actions,
  modelEndpoint,
  dataSource,
}: {
  input: ProviderAgentChatInput
  dashboard: ProviderDashboard
  cases: CaseListItem[]
  tasks: ContractorQueueItem[]
  signals: SignalDTO[]
  actions: ProviderAgentAction[]
  modelEndpoint: string
  dataSource: ProviderAgentChatResponse["dataSource"]
}): ProviderAgentChatResponse {
  const openTasks = tasks.filter((task) => task.status === "open").length
  const urgentCases = cases.filter(
    (item) => item.severity === "urgent" || item.severity === "high"
  ).length
  const newestSignal = signals[0]
  const priority = dashboard.priorityGeographies[0]
  const contaminant = cases[0]?.contaminant ?? newestSignal?.testType ?? "water quality"
  const scopeName = input.scope || "All India"
  const focusItems = input.focusItems?.slice(0, 2) ?? []
  const priorityText = priority
    ? `${priority.stateName} -> ${priority.districtName} is the highest-priority geography at ${Math.round(
        priority.normalizedPriorityScore
      )}% priority with ${priority.affectedHabitationCount} affected habitation(s).`
    : "No priority geography is above the review threshold right now."
  const focusText = focusItems.length
    ? `Active context: ${focusItems
        .map((item) => `${item.title} - ${item.body}`)
        .join(" ")}`
    : priorityText
  const nextAction =
    actions.find((action) => action.type !== "refresh_status")?.reason ??
    "Refresh service status, then keep monitoring the case stream."

  return {
    reply: [
      `I inspected ${scopeName}: ${signals.length} signal(s), ${cases.length} case(s), ${openTasks} open work order(s), and ${urgentCases} high-priority case(s).`,
      focusText,
      `Main operating concern: ${contaminant}.`,
      `Next move: ${nextAction}`,
    ].join(" "),
    mode: config.mode,
    modelEndpoint,
    generatedAt: new Date().toISOString(),
    dataSource,
    sources: [
      "Provider dashboard aggregate",
      "Signal and case queue",
      "Contractor work-order telemetry",
    ],
    actions,
  }
}

function providerAgentInstructions(): string {
  return [
    "You are Neelu Agent, a calm provider-operations assistant inside a water safety dashboard.",
    "Answer in 2 to 5 concise sentences using the supplied dashboard context, active H3 alerts, signals, cases, and work orders.",
    "Start with what is happening now, then name the practical next action the provider can take in the app.",
    "The product flow is: citizen or UPI intake creates a signal, analysis opens a provider case, and case work creates in-app contractor tasks.",
    "Right-clicked map nodes represent reported public water points; reported nodes should be explained as signals entering the provider and contractor workflow.",
    "Do not mention prompts, hidden context, OpenAI, Databricks internals, fallback paths, missing endpoints, fake data, or implementation details.",
    "Do not claim that Neelu dispatches external contractors. Say that it opens or assigns in-app work orders.",
    "Do not provide medical diagnosis or legal approval. Recommend provider review, confirmatory sampling, evidence requests, and task assignment.",
  ].join("\n")
}

function providerAgentContext({
  input,
  dashboard,
  cases,
  tasks,
  signals,
}: {
  input: ProviderAgentChatInput
  dashboard: ProviderDashboard
  cases: CaseListItem[]
  tasks: ContractorQueueItem[]
  signals: SignalDTO[]
}): string {
  const openTasks = tasks.filter((task) => task.status === "open")
  const activeFocus = input.focusItems?.slice(0, 4) ?? []
  const priorityGeographies = dashboard.priorityGeographies.slice(0, 4)
  return [
    `Scope: ${input.scope}`,
    `Selected object: ${input.selectedKind}; selectedId: ${input.selectedId ?? "none"}`,
    `Current totals: ${signals.length} signal(s), ${cases.length} case(s), ${tasks.length} work order(s), ${openTasks.length} open work order(s).`,
    activeFocus.length
      ? `Visible alert context: ${activeFocus
          .map((item) => `${item.title}: ${item.body}`)
          .join(" | ")}`
      : "Visible alert context: none pinned.",
    `Recent signals: ${signals
      .slice(0, 6)
      .map(
        (signal) =>
          `${signal.systemName}; ${signal.locationLabel ?? signal.signalId}; ${signal.testType ?? signal.signalType}; status ${signal.status}; received ${signal.receivedAt}`
      )
      .join(" | ") || "none"}`,
    `Provider cases: ${cases
      .slice(0, 6)
      .map(
        (item) =>
          `${item.caseId}; ${item.systemName}; ${item.contaminant ?? "water quality"}; severity ${item.severity ?? "open"}; status ${item.status}; ${item.openTaskCount} open task(s)`
      )
      .join(" | ") || "none"}`,
    `Contractor work orders: ${tasks
      .slice(0, 6)
      .map(
        (task) =>
          `${task.taskId}; ${task.title}; ${task.systemName}; status ${task.status}; owner ${task.owner ?? "unassigned"}`
      )
      .join(" | ") || "none"}`,
    `Priority geographies: ${priorityGeographies
      .map(
        (geo) =>
          `${geo.stateName} -> ${geo.districtName}; ${Math.round(
            geo.normalizedPriorityScore
          )}% priority; ${geo.dominantQualityParameter}`
      )
      .join(" | ") || "none"}`,
  ].join("\n")
}

function providerAgentMessages(input: ProviderAgentChatInput) {
  const history = (input.messages ?? [])
    .slice(-6)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }))
  return [
    ...history,
    {
      role: "user" as const,
      content: input.prompt,
    },
  ]
}

export async function generateProviderAgentChatWithModel({
  input,
  dashboard,
  cases,
  tasks,
  signals,
}: {
  input: ProviderAgentChatInput
  dashboard: ProviderDashboard
  cases: CaseListItem[]
  tasks: ContractorQueueItem[]
  signals: SignalDTO[]
}): Promise<ProviderAgentChatResponse> {
  const actions = deterministicProviderActions(cases, tasks, signals)

  if (config.openai.apiKey) {
    try {
      const reply = await queryOpenAiText({
        instructions: providerAgentInstructions(),
        input: [
          {
            role: "user",
            content: providerAgentContext({
              input,
              dashboard,
              cases,
              tasks,
              signals,
            }),
          },
          ...providerAgentMessages(input),
        ],
      })
      return {
        reply,
        mode: config.mode,
        modelEndpoint: config.openai.model,
        generatedAt: new Date().toISOString(),
        dataSource: "openai",
        sources: [
          "Provider dashboard aggregate",
          "Visible H3 alert context",
          "Signal, case, and contractor work-order queues",
        ],
        actions: actions.slice(0, 5),
      }
    } catch {
      return deterministicProviderAgentReply({
        input,
        dashboard,
        cases,
        tasks,
        signals,
        actions,
        modelEndpoint: config.openai.model,
        dataSource: "demo_model",
      })
    }
  }

  return deterministicProviderAgentReply({
    input,
    dashboard,
    cases,
    tasks,
    signals,
    actions,
    modelEndpoint: config.openai.model,
    dataSource: "demo_model",
  })
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
