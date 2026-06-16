/**
 * Typed API client. One thin fetch wrapper; all endpoints return the unwrapped
 * `data` payload or throw an ApiClientError carrying status + validation details.
 */

import type {
  AuditEvent,
  CaseDetail,
  CaseListItem,
  CaseTrace,
  ClientConfig,
  ContractorQueueItem,
  DemoResetSummary,
  H3MapResponse,
  HealthInfo,
  ProviderDashboard,
  ProviderAgentChatResponse,
  ProviderInsight,
  Signal,
  SignalDTO,
  SyncBatchResult,
  UpiCallbackResult,
  WaterSystem,
} from "@/shared/types"
import type {
  AssignTaskInput,
  ApproveInput,
  CompleteTaskInput,
  CreateSignalInput,
  OverrideInput,
  RequestMoreEvidenceInput,
  ReviewCaseInput,
  SyncBatchInput,
  UpiCallbackInput,
  VoiceSignalInput,
  ProviderAgentChatInput,
} from "@/shared/schemas"

const BASE = "/api"

export interface ValidationDetail {
  path: string
  message: string
}

export class ApiClientError extends Error {
  status: number
  details?: ValidationDetail[]
  constructor(message: string, status: number, details?: ValidationDetail[]) {
    super(message)
    this.name = "ApiClientError"
    this.status = status
    this.details = details
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  })
  const json = (await res.json().catch(() => null)) as {
    data?: T
    message?: string
    error?: string
    details?: ValidationDetail[]
  } | null
  if (!res.ok) {
    throw new ApiClientError(
      json?.message ?? res.statusText ?? "Request failed",
      res.status,
      json?.details
    )
  }
  return (json?.data as T) ?? (undefined as T)
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return http<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) })
}

export const api = {
  health: () => http<HealthInfo>("/health"),
  clientConfig: () => http<ClientConfig>("/client-config"),
  systems: () => http<WaterSystem[]>("/systems"),
  signals: () => http<SignalDTO[]>("/signals"),
  getSignal: (id: string) => http<SignalDTO>(`/signals/${id}`),
  createSignal: (body: CreateSignalInput) => post<Signal>("/signals", body),
  createVoiceSignal: (body: VoiceSignalInput) =>
    post<CaseDetail>("/signals", body),
  analyzeSignal: (id: string) => post<CaseDetail>(`/signals/${id}/analyze`),
  cases: () => http<CaseListItem[]>("/cases"),
  caseDetail: (id: string) => http<CaseDetail>(`/cases/${id}`),
  analyzeCase: (id: string) => post<CaseDetail>(`/cases/${id}/analyze`),
  approve: (id: string, body: ApproveInput) =>
    post<CaseDetail>(`/cases/${id}/approve`, body),
  override: (id: string, body: OverrideInput) =>
    post<CaseDetail>(`/cases/${id}/override`, body),
  requestMoreEvidence: (id: string, body: RequestMoreEvidenceInput) =>
    post<CaseDetail>(`/cases/${id}/request-more-evidence`, body),
  reviewCase: (id: string, body: ReviewCaseInput) =>
    post<CaseDetail>(`/cases/${id}/review`, body),
  audit: (id: string) => http<AuditEvent[]>(`/cases/${id}/audit`),
  trace: (id: string) => http<CaseTrace>(`/cases/${id}/trace`),
  upiCallback: (body: UpiCallbackInput) =>
    post<UpiCallbackResult>("/upi/callback", body),
  sync: (body: SyncBatchInput) => post<SyncBatchResult>("/sync", body),
  h3Map: () => http<H3MapResponse>("/h3-map"),
  contractorTasks: () => http<ContractorQueueItem[]>("/contractor/tasks"),
  completeTask: (id: string, body: CompleteTaskInput) =>
    post<CaseDetail>(`/contractor/tasks/${id}/done`, body),
  assignTask: (id: string, body: AssignTaskInput) =>
    post<CaseDetail>(`/contractor/tasks/${id}/assign`, body),
  providerDashboard: () => http<ProviderDashboard>("/provider/dashboard"),
  providerInsights: () => http<ProviderInsight>("/provider/insights"),
  providerAgentChat: (body: ProviderAgentChatInput) =>
    post<ProviderAgentChatResponse>("/provider/agent-chat", body),
  resetDemo: () => post<DemoResetSummary>("/demo/reset"),
}
