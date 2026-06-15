import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  RiArrowRightLine,
  RiDropLine,
  RiRefreshLine,
  RiSparkling2Line,
} from "@remixicon/react"
import { api, ApiClientError } from "@/client/lib/api"
import { useApi } from "@/client/lib/useApi"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card"
import { Button } from "@/client/components/ui/button"
import { Badge } from "@/client/components/ui/badge"
import { Separator } from "@/client/components/ui/separator"
import { ProofPanel } from "@/client/components/ProofPanel"
import { CaseStatusBadge, SeverityBadge } from "@/client/components/badges"
import { EmptyState, ErrorState, LoadingRows } from "@/client/components/states"
import { formatRelative, formatDateTime } from "@/client/lib/format"
import { TEST_TYPE_LABELS } from "@/shared/constants"
import type { Severity, TestType } from "@/shared/constants"
import type { CaseListItem, SignalDTO, WaterSystem } from "@/shared/types"

const SEVERITY_RANK: Record<Severity, number> = {
  urgent: 0,
  high: 1,
  moderate: 2,
  low: 3,
}

function rankSeverity(severity: Severity | null): number {
  return severity ? SEVERITY_RANK[severity] : 4
}

export function DeskPage() {
  const navigate = useNavigate()
  const systems = useApi(() => api.systems(), [])
  const signals = useApi(() => api.signals(), [])
  const cases = useApi(() => api.cases(), [])
  const health = useApi(() => api.health(), [])
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)

  function reloadAll() {
    signals.reload()
    cases.reload()
    health.reload()
    systems.reload()
  }

  async function analyze(signalId: string) {
    setAnalyzingId(signalId)
    try {
      const detail = await api.analyzeSignal(signalId)
      toast.success(`Case ${detail.case.caseId} opened`)
      navigate(`/cases/${detail.case.caseId}`)
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : "Analysis failed",
      )
      setAnalyzingId(null)
    }
  }

  async function resetDemo() {
    setResetting(true)
    try {
      const summary = await api.resetDemo()
      toast.success(
        `Demo reset — ${summary.systems} systems, ${summary.signals} signals`,
      )
      reloadAll()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : "Reset failed",
      )
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <section className="flex flex-col gap-4 lg:col-span-3">
        <SystemsCard
          loading={systems.loading}
          error={systems.error}
          data={systems.data}
          onRetry={systems.reload}
        />
      </section>

      <section className="flex flex-col gap-4 lg:col-span-6">
        <SignalQueue
          loading={signals.loading}
          error={signals.error}
          data={signals.data}
          analyzingId={analyzingId}
          onAnalyze={analyze}
          onOpenCase={(caseId) => navigate(`/cases/${caseId}`)}
          onRetry={signals.reload}
        />
        <CaseQueue
          loading={cases.loading}
          error={cases.error}
          data={cases.data}
          onOpenCase={(caseId) => navigate(`/cases/${caseId}`)}
          onRetry={cases.reload}
        />
      </section>

      <section className="flex flex-col gap-4 lg:col-span-3">
        <ProofPanel health={health.data} />
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Demo controls</CardTitle>
            <CardDescription>
              Reseed deterministic systems, signals, and the primary
              nitrate-near-school scenario.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={resetDemo}
              disabled={resetting}
            >
              <RiRefreshLine className="size-4" />
              {resetting ? "Resetting…" : "Reset demo data"}
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function SystemsCard({
  loading,
  error,
  data,
  onRetry,
}: {
  loading: boolean
  error: string | null
  data: WaterSystem[] | null
  onRetry: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <RiDropLine className="size-4 text-primary" />
          Water systems
        </CardTitle>
        <CardDescription>Governed sites under monitoring.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : loading ? (
          <LoadingRows rows={3} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No systems" hint="Reset the demo to seed sites." />
        ) : (
          data.map((system) => (
            <div
              key={system.systemId}
              className="rounded-md border p-3 text-sm"
            >
              <p className="font-medium">{system.name}</p>
              <p className="text-xs text-muted-foreground">
                {[system.region, system.country].filter(Boolean).join(", ") ||
                  "—"}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem] text-muted-foreground">
                {system.populationServed != null ? (
                  <span>{system.populationServed.toLocaleString()} served</span>
                ) : null}
                {system.sourceWaterType ? (
                  <span>{system.sourceWaterType}</span>
                ) : null}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function SignalQueue({
  loading,
  error,
  data,
  analyzingId,
  onAnalyze,
  onOpenCase,
  onRetry,
}: {
  loading: boolean
  error: string | null
  data: SignalDTO[] | null
  analyzingId: string | null
  onAnalyze: (signalId: string) => void
  onOpenCase: (caseId: string) => void
  onRetry: () => void
}) {
  const pending = (data ?? []).filter((signal) => signal.status === "received")
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <RiSparkling2Line className="size-4 text-primary" />
            Signal queue
          </span>
          <Badge variant="secondary">{pending.length} awaiting analysis</Badge>
        </CardTitle>
        <CardDescription>
          New field submissions. Run the cited agent analysis to open a case.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : loading ? (
          <LoadingRows rows={3} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            title="No signals yet"
            hint="Submit a field test from /field or reset the demo."
          />
        ) : (
          data.map((signal) => {
            const label = signal.testType
              ? TEST_TYPE_LABELS[signal.testType as TestType]
              : signal.signalType
            return (
              <div
                key={signal.signalId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{signal.signalId}</span>
                    {signal.status === "analyzed" ? (
                      <Badge variant="outline" className="text-[0.625rem]">
                        Analyzed
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[0.625rem]">
                        Received
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-sm">
                    {signal.systemName} · {label} · {signal.resultValue}{" "}
                    {signal.unit}
                  </p>
                  <p className="text-[0.6875rem] text-muted-foreground">
                    {formatRelative(signal.receivedAt)}
                    {signal.locationLabel ? ` · ${signal.locationLabel}` : ""}
                  </p>
                </div>
                {signal.status === "analyzed" && signal.caseId ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onOpenCase(signal.caseId as string)}
                  >
                    Open case
                    <RiArrowRightLine className="size-4" />
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => onAnalyze(signal.signalId)}
                    disabled={analyzingId === signal.signalId}
                  >
                    {analyzingId === signal.signalId
                      ? "Analyzing…"
                      : "Analyze"}
                  </Button>
                )}
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

function CaseQueue({
  loading,
  error,
  data,
  onOpenCase,
  onRetry,
}: {
  loading: boolean
  error: string | null
  data: CaseListItem[] | null
  onOpenCase: (caseId: string) => void
  onRetry: () => void
}) {
  const sorted = [...(data ?? [])].sort((a, b) => {
    const severityDelta = rankSeverity(a.severity) - rankSeverity(b.severity)
    if (severityDelta !== 0) return severityDelta
    return a.dueAt && b.dueAt ? a.dueAt.localeCompare(b.dueAt) : 0
  })
  const pendingApprovals = sorted.filter((item) => item.pendingApproval).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-sm">
          <span>Case queue</span>
          <Badge variant="secondary">
            {pendingApprovals} pending approval
          </Badge>
        </CardTitle>
        <CardDescription>
          Sorted by severity. Review evidence, then approve or override.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : loading ? (
          <LoadingRows rows={3} />
        ) : sorted.length === 0 ? (
          <EmptyState
            title="No cases yet"
            hint="Analyze a signal to open the first case."
          />
        ) : (
          sorted.map((item) => (
            <button
              key={item.caseId}
              type="button"
              onClick={() => onOpenCase(item.caseId)}
              className="flex w-full flex-col gap-1.5 rounded-md border p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={item.severity} />
                <CaseStatusBadge status={item.status} />
                <span className="font-mono text-xs text-muted-foreground">
                  {item.caseId}
                </span>
              </div>
              <p className="text-sm font-medium">
                {item.systemName}
                {item.contaminant ? ` · ${item.contaminant}` : ""}
              </p>
              {item.summary ? (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {item.summary}
                </p>
              ) : null}
              <Separator className="my-1" />
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem] text-muted-foreground">
                <span>{item.openTaskCount} open tasks</span>
                {item.missingEvidence ? (
                  <span className="text-amber-600 dark:text-amber-400">
                    Missing evidence
                  </span>
                ) : null}
                {item.pendingApproval ? (
                  <span className="text-orange-600 dark:text-orange-400">
                    Awaiting approval
                  </span>
                ) : null}
                {item.assignedTo ? <span>Owner: {item.assignedTo}</span> : null}
                {item.dueAt ? (
                  <span>Due {formatDateTime(item.dueAt)}</span>
                ) : null}
              </div>
            </button>
          ))
        )}
      </CardContent>
    </Card>
  )
}
