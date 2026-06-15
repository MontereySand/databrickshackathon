import { useState } from "react"
import { Link, useParams } from "react-router-dom"
import { toast } from "sonner"
import {
  RiAlertLine,
  RiArrowLeftLine,
  RiCheckLine,
  RiFileTextLine,
  RiShieldCheckLine,
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/client/components/ui/tabs"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/client/components/ui/dialog"
import { Button } from "@/client/components/ui/button"
import { Badge } from "@/client/components/ui/badge"
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import { Textarea } from "@/client/components/ui/textarea"
import { Separator } from "@/client/components/ui/separator"
import {
  CaseStatusBadge,
  SeverityBadge,
  TaskStatusBadge,
  UncertaintyBadge,
} from "@/client/components/badges"
import { EmptyState, ErrorState, LoadingRows } from "@/client/components/states"
import { formatDateTime } from "@/client/lib/format"
import { AUDIT_ACTION_LABELS } from "@/client/lib/labels"
import type { AuditEvent, CaseDetail } from "@/shared/types"

const DECIDED = new Set(["approved", "overridden", "closed"])

function defaultDueDate(): string {
  const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
}

export function CasePage() {
  const { caseId = "" } = useParams()
  const detail = useApi(() => api.caseDetail(caseId), [caseId])
  const audit = useApi(() => api.audit(caseId), [caseId])

  function reload() {
    detail.reload()
    audit.reload()
  }

  if (detail.error) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink />
        <ErrorState message={detail.error} onRetry={detail.reload} />
      </div>
    )
  }

  if (detail.loading || !detail.data) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <BackLink />
        <LoadingRows rows={2} />
        <LoadingRows rows={5} />
      </div>
    )
  }

  const data = detail.data
  const decided = DECIDED.has(data.case.status)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <BackLink />
      <Hero data={data} />
      <Tabs defaultValue="finding">
        <TabsList className="flex w-full flex-wrap">
          <TabsTrigger value="finding">Agent finding</TabsTrigger>
          <TabsTrigger value="evidence">
            Evidence ({data.evidence.length})
          </TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({data.tasks.length})</TabsTrigger>
          <TabsTrigger value="notice">Notice draft</TabsTrigger>
          <TabsTrigger value="approval">Approval</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="trace">Trace</TabsTrigger>
        </TabsList>

        <TabsContent value="finding">
          <FindingTab data={data} />
        </TabsContent>
        <TabsContent value="evidence">
          <EvidenceTab data={data} />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksTab data={data} />
        </TabsContent>
        <TabsContent value="notice">
          <NoticeTab data={data} />
        </TabsContent>
        <TabsContent value="approval">
          <ApprovalTab data={data} decided={decided} onDone={reload} />
        </TabsContent>
        <TabsContent value="audit">
          <AuditTab
            loading={audit.loading}
            error={audit.error}
            events={audit.data}
            onRetry={audit.reload}
          />
        </TabsContent>
        <TabsContent value="trace">
          <TraceTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function BackLink() {
  return (
    <Link
      to="/"
      className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <RiArrowLeftLine className="size-4" />
      Back to command desk
    </Link>
  )
}

function Hero({ data }: { data: CaseDetail }) {
  const { case: c, system, signal } = data
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={c.severity} />
          <CaseStatusBadge status={c.status} />
          <UncertaintyBadge level={c.uncertainty} />
          <span className="font-mono text-xs text-muted-foreground">
            {c.caseId}
          </span>
        </div>
        <CardTitle className="text-lg">
          {system.name}
          {c.contaminant ? ` — ${c.contaminant}` : ""}
        </CardTitle>
        {c.summary ? (
          <CardDescription className="text-sm">{c.summary}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Fact label="Signal" value={signal.signalId} mono />
          <Fact
            label="Reading"
            value={
              signal.resultValue != null
                ? `${signal.resultValue} ${signal.unit ?? ""}`
                : "—"
            }
          />
          <Fact label="Owner" value={c.assignedTo ?? "Unassigned"} />
          <Fact
            label="Due"
            value={c.dueAt ? formatDateTime(c.dueAt) : "—"}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={mono ? "font-mono text-xs" : "text-sm"}>{value}</p>
    </div>
  )
}

function FindingTab({ data }: { data: CaseDetail }) {
  const { finding, trace } = data
  if (!finding) {
    return (
      <EmptyState
        title="No finding yet"
        hint="Run analysis on the signal to generate a cited finding."
      />
    )
  }
  return (
    <div className="flex flex-col gap-4">
      {trace?.source === "local_fallback" ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
          <RiAlertLine className="size-4 shrink-0" />
          <span>
            Generated by the deterministic fallback analyzer (model serving not
            connected). Reasoning is rule-based and fully cited.
          </span>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <RiShieldCheckLine className="size-4 text-primary" />
            {finding.agentName ?? "Water quality analyst"}
          </CardTitle>
          <CardDescription>
            {finding.findingType ?? "assessment"} · confidence{" "}
            {finding.confidence != null
              ? `${Math.round(finding.confidence * 100)}%`
              : "n/a"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {finding.findingText ? <p>{finding.findingText}</p> : null}
          {finding.recommendation ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recommended next steps
              </p>
              <p className="whitespace-pre-line">{finding.recommendation}</p>
            </div>
          ) : null}
          <Separator />
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Citations ({finding.citationsJson.length})
            </p>
            {finding.citationsJson.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No citations attached.
              </p>
            ) : (
              <ol className="flex flex-col gap-2">
                {finding.citationsJson.map((citation, index) => (
                  <li
                    key={`${citation.label}-${index}`}
                    className="rounded-md border p-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[0.625rem]">
                        {citation.label}
                      </Badge>
                      {citation.sourceUri ? (
                        <a
                          href={citation.sourceUri}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-primary hover:underline"
                        >
                          {citation.sourceName}
                        </a>
                      ) : (
                        <span className="font-medium">
                          {citation.sourceName}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {citation.snippet}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function EvidenceTab({ data }: { data: CaseDetail }) {
  if (data.evidence.length === 0) {
    return <EmptyState title="No evidence attached" />
  }
  return (
    <div className="flex flex-col gap-2">
      {data.missingEvidence ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
          This case is flagged as missing a key piece of evidence (e.g. an
          independent lab confirmation).
        </div>
      ) : null}
      {data.evidence.map((item) => (
        <Card key={item.evidenceId}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span>{item.title ?? "Evidence"}</span>
              {item.evidenceType ? (
                <Badge variant="secondary" className="text-[0.625rem]">
                  {item.evidenceType}
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {item.body ? <p>{item.body}</p> : null}
            {item.citationText ? (
              <p className="text-xs text-muted-foreground">
                {item.citationText}
              </p>
            ) : null}
            {item.sourceName ? (
              <p className="text-xs">
                Source:{" "}
                {item.sourceUri ? (
                  <a
                    href={item.sourceUri}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {item.sourceName}
                  </a>
                ) : (
                  item.sourceName
                )}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function TasksTab({ data }: { data: CaseDetail }) {
  if (data.tasks.length === 0) {
    return <EmptyState title="No tasks" hint="Analysis creates the action plan." />
  }
  return (
    <div className="flex flex-col gap-2">
      {data.tasks.map((task) => (
        <div
          key={task.taskId}
          className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium">{task.title}</p>
            {task.description ? (
              <p className="text-xs text-muted-foreground">
                {task.description}
              </p>
            ) : null}
            <div className="mt-1 flex flex-wrap gap-x-3 text-[0.6875rem] text-muted-foreground">
              {task.owner ? <span>Owner: {task.owner}</span> : null}
              {task.dueAt ? <span>Due {formatDateTime(task.dueAt)}</span> : null}
            </div>
          </div>
          <TaskStatusBadge status={task.status} />
        </div>
      ))}
    </div>
  )
}

function NoticeTab({ data }: { data: CaseDetail }) {
  if (data.notices.length === 0) {
    return <EmptyState title="No notice draft" />
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        <RiFileTextLine className="size-4 shrink-0" />
        <span>
          These are unapproved DRAFTS. Do not distribute until a human approver
          signs off. Neelu never certifies legal compliance.
        </span>
      </div>
      {data.notices.map((notice) => (
        <Card key={notice.language}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-sm">
              <span>{notice.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[0.625rem] uppercase">
                  {notice.language === "hi" ? "Hindi" : "English"}
                </Badge>
                <Badge
                  variant="outline"
                  className="border-amber-500/40 text-[0.625rem] text-amber-600 dark:text-amber-400"
                >
                  DRAFT
                </Badge>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
              {notice.body}
            </pre>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ApprovalTab({
  data,
  decided,
  onDone,
}: {
  data: CaseDetail
  decided: boolean
  onDone: () => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Human decision</CardTitle>
          <CardDescription>
            A person must approve, override, or request more evidence before any
            action is taken.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {decided ? (
            <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
              <RiCheckLine className="size-4" />
              This case is {data.case.status}. Decisions are immutable in this
              demo.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <ApproveDialog caseId={data.case.caseId} onDone={onDone} />
              <OverrideDialog caseId={data.case.caseId} onDone={onDone} />
              <RequestEvidenceDialog
                caseId={data.case.caseId}
                onDone={onDone}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Decision history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {data.approvals.length === 0 ? (
            <p className="text-xs text-muted-foreground">No decisions yet.</p>
          ) : (
            data.approvals.map((approval) => (
              <div
                key={approval.approvalId}
                className="rounded-md border p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{approval.approver}</span>
                  <Badge variant="secondary" className="text-[0.625rem]">
                    {approval.decision}
                  </Badge>
                </div>
                <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                  {approval.rationale}
                </p>
                <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                  {formatDateTime(approval.approvedAt)}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ApproveDialog({
  caseId,
  onDone,
}: {
  caseId: string
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [approver, setApprover] = useState("")
  const [rationale, setRationale] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await api.approve(caseId, { approver, rationale })
      toast.success("Case approved")
      setOpen(false)
      setApprover("")
      setRationale("")
      onDone()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <RiCheckLine className="size-4" />
          Approve
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve case</DialogTitle>
          <DialogDescription>
            Confirm the agent finding and recommended action plan.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="approve-approver">Approver</Label>
            <Input
              id="approve-approver"
              value={approver}
              onChange={(e) => setApprover(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="approve-rationale">Rationale</Label>
            <Textarea
              id="approve-rationale"
              rows={3}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why this decision is appropriate"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={submit} disabled={busy || !approver || !rationale}>
            {busy ? "Approving…" : "Confirm approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OverrideDialog({
  caseId,
  onDone,
}: {
  caseId: string
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [approver, setApprover] = useState("")
  const [rationale, setRationale] = useState("")
  const [replacementAction, setReplacementAction] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await api.override(caseId, { approver, rationale, replacementAction })
      toast.success("Case overridden")
      setOpen(false)
      onDone()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">Override</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override finding</DialogTitle>
          <DialogDescription>
            Reject the agent recommendation and define a replacement action.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-approver">Approver</Label>
            <Input
              id="override-approver"
              value={approver}
              onChange={(e) => setApprover(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-rationale">Override rationale</Label>
            <Textarea
              id="override-rationale"
              rows={2}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="override-action">Replacement action</Label>
            <Textarea
              id="override-action"
              rows={2}
              value={replacementAction}
              onChange={(e) => setReplacementAction(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={busy || !approver || !rationale || !replacementAction}
          >
            {busy ? "Saving…" : "Confirm override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RequestEvidenceDialog({
  caseId,
  onDone,
}: {
  caseId: string
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [requestedEvidence, setRequestedEvidence] = useState("")
  const [owner, setOwner] = useState("")
  const [dueAt, setDueAt] = useState(defaultDueDate())
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await api.requestMoreEvidence(caseId, {
        requestedEvidence,
        owner,
        dueAt,
      })
      toast.success("Evidence requested")
      setOpen(false)
      onDone()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Request more evidence</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request more evidence</DialogTitle>
          <DialogDescription>
            Assign a follow-up task and move the case to “needs more evidence”.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="evidence-detail">Evidence needed</Label>
            <Textarea
              id="evidence-detail"
              rows={2}
              value={requestedEvidence}
              onChange={(e) => setRequestedEvidence(e.target.value)}
              placeholder="e.g. Independent lab confirmation of nitrate level"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evidence-owner">Owner</Label>
              <Input
                id="evidence-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="evidence-due">Due date</Label>
              <Input
                id="evidence-due"
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={busy || !requestedEvidence || !owner || !dueAt}
          >
            {busy ? "Requesting…" : "Request evidence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AuditTab({
  loading,
  error,
  events,
  onRetry,
}: {
  loading: boolean
  error: string | null
  events: AuditEvent[] | null
  onRetry: () => void
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />
  if (loading) return <LoadingRows rows={5} />
  if (!events || events.length === 0) {
    return <EmptyState title="No audit events" />
  }
  return (
    <ol className="relative flex flex-col gap-3 border-l pl-4">
      {events.map((event) => (
        <li key={event.auditId} className="relative">
          <span className="absolute -left-[1.4rem] top-1 size-2 rounded-full bg-primary" />
          <div className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">
                {AUDIT_ACTION_LABELS[event.action] ?? event.action}
              </span>
              <span className="text-[0.6875rem] text-muted-foreground">
                {formatDateTime(event.createdAt)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {event.actor} · {event.entityType}{" "}
              <span className="font-mono">{event.entityId}</span>
            </p>
            {event.afterJson ? (
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 text-[0.6875rem] text-muted-foreground">
                {JSON.stringify(event.afterJson, null, 2)}
              </pre>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}

function TraceTab({ data }: { data: CaseDetail }) {
  const trace = data.trace
  if (!trace) {
    return <EmptyState title="No trace" hint="Analyze the signal to record a trace." />
  }
  const passed = trace.evalResults.filter((r) => r.passed).length
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <span>Reasoning trace</span>
            <Badge variant="outline" className="text-[0.625rem]">
              {trace.source === "mlflow" ? "MLflow" : "Local fallback"}
            </Badge>
          </CardTitle>
          <CardDescription>
            <span className="font-mono">{trace.traceId}</span> ·{" "}
            {trace.retrievedGuidanceCount} guidance docs ·{" "}
            {trace.citationsUsed} citations
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {trace.toolCalls.map((call, index) => (
            <div
              key={`${call.tool}-${index}`}
              className="rounded-md border p-2 text-xs"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium">{call.tool}</span>
                <div className="flex items-center gap-2">
                  {call.fallback ? (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-[0.625rem] text-amber-600 dark:text-amber-400"
                    >
                      fallback
                    </Badge>
                  ) : null}
                  <span className="text-muted-foreground">
                    {call.durationMs}ms
                  </span>
                </div>
              </div>
              <p className="mt-1 text-muted-foreground">{call.summary}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            <span>Eval scorers</span>
            <Badge variant={passed === trace.evalResults.length ? "default" : "secondary"}>
              {passed}/{trace.evalResults.length} passing
            </Badge>
          </CardTitle>
          <CardDescription>
            Deterministic safety + quality checks run on every analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {trace.evalResults.map((result) => (
            <div
              key={result.scorer}
              className="flex items-start gap-2 rounded-md border p-2 text-xs"
            >
              <Badge
                variant="outline"
                className={
                  result.passed
                    ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                    : "border-red-500/30 text-red-600 dark:text-red-400"
                }
              >
                {result.passed ? "PASS" : "FAIL"}
              </Badge>
              <div>
                <p className="font-medium">{result.scorer}</p>
                <p className="text-muted-foreground">{result.detail}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
