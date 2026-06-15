/**
 * Typed API client. One thin fetch wrapper; all endpoints return the unwrapped
 * `data` payload or throw an ApiClientError carrying status + validation details.
 */

import type {
  AuditEvent,
  CaseDetail,
  CaseListItem,
  CaseTrace,
  DemoResetSummary,
  HealthInfo,
  Signal,
  SignalDTO,
  WaterSystem,
} from "@/shared/types";
import type {
  ApproveInput,
  CreateSignalInput,
  OverrideInput,
  RequestMoreEvidenceInput,
} from "@/shared/schemas";

const BASE = "/api";

export interface ValidationDetail {
  path: string;
  message: string;
}

export class ApiClientError extends Error {
  status: number;
  details?: ValidationDetail[];
  constructor(message: string, status: number, details?: ValidationDetail[]) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = (await res.json().catch(() => null)) as
    | { data?: T; message?: string; error?: string; details?: ValidationDetail[] }
    | null;
  if (!res.ok) {
    throw new ApiClientError(
      json?.message ?? res.statusText ?? "Request failed",
      res.status,
      json?.details,
    );
  }
  return (json?.data as T) ?? (undefined as T);
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return http<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
}

export const api = {
  health: () => http<HealthInfo>("/health"),
  systems: () => http<WaterSystem[]>("/systems"),
  signals: () => http<SignalDTO[]>("/signals"),
  getSignal: (id: string) => http<SignalDTO>(`/signals/${id}`),
  createSignal: (body: CreateSignalInput) => post<Signal>("/signals", body),
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
  audit: (id: string) => http<AuditEvent[]>(`/cases/${id}/audit`),
  trace: (id: string) => http<CaseTrace>(`/cases/${id}/trace`),
  resetDemo: () => post<DemoResetSummary>("/demo/reset"),
};
