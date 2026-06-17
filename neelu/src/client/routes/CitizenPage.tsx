import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  RiChatVoiceLine,
  RiDropLine,
  RiMapPinLine,
  RiMicLine,
  RiQrScanLine,
  RiRecordCircleLine,
  RiRefreshLine,
  RiSendPlaneLine,
  RiWaterFlashLine,
} from "@remixicon/react"

import {
  WaterOperationsMap,
  type ReportableMapNode,
  type WaterOperationsMapSelection,
} from "@/client/components/WaterOperationsMap"
import { Badge } from "@/client/components/ui/badge"
import { Button } from "@/client/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/client/components/ui/sheet"
import { Textarea } from "@/client/components/ui/textarea"
import { api, ApiClientError } from "@/client/lib/api"
import { formatRelative } from "@/client/lib/format"
import { nodeHierarchyLabel, reportInputForNode } from "@/client/lib/mapNodes"
import { cn } from "@/client/lib/utils"
import { useApi } from "@/client/lib/useApi"
import { TEST_TYPE_LABELS } from "@/shared/constants"
import type { H3MapCell, SignalDTO, WaterSystem } from "@/shared/types"

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognition
  webkitSpeechRecognition?: new () => SpeechRecognition
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>
      }) => void)
    | null
  onend: (() => void) | null
}

const VOICE_LANGUAGES = [
  { label: "English", value: "en-IN" },
  { label: "हिन्दी", value: "hi-IN" },
  { label: "தமிழ்", value: "ta-IN" },
  { label: "తెలుగు", value: "te-IN" },
  { label: "ಕನ್ನಡ", value: "kn-IN" },
  { label: "മലയാളം", value: "ml-IN" },
  { label: "ગુજરાતી", value: "gu-IN" },
  { label: "বাংলা", value: "bn-IN" },
]

function parseUpiCoordinates(uri: string): {
  latitude: number
  longitude: number
} | null {
  try {
    const parsed = new URL(uri)
    const params = parsed.searchParams
    const ll = params.get("ll") ?? params.get("location")
    if (ll) {
      const [lat, lng] = ll.split(",").map((item) => Number(item.trim()))
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { latitude: lat, longitude: lng }
      }
    }
    const latitude = Number(params.get("lat") ?? params.get("latitude"))
    const longitude = Number(params.get("lng") ?? params.get("lon") ?? params.get("longitude"))
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude }
    }
  } catch {
    return null
  }
  return null
}

function qualityLabel(cell: H3MapCell | null): string {
  if (!cell) return "Select area"
  if (cell.quality === "contaminated") return "Contaminated"
  if (cell.quality === "caution") return "Caution"
  return "Clean"
}

function score(value: number | undefined): string {
  return `${Math.round((value ?? 0) * 100)}`
}

function compact(value: number | null | undefined): string {
  return Intl.NumberFormat("en", { notation: "compact" }).format(value ?? 0)
}

function systemIdForSelection(
  selection: WaterOperationsMapSelection,
  systems: WaterSystem[],
  defaultSystemId: string
): string {
  if (selection?.kind === "reportNode") return selection.node.systemId
  if (selection?.kind === "system") return selection.system.systemId
  if (selection?.kind === "task") {
    return (
      systems.find((system) => system.name === selection.task.systemName)
        ?.systemId ?? defaultSystemId
    )
  }
  return defaultSystemId
}

function coordinatesForSelection(
  selection: WaterOperationsMapSelection,
  fallbackCell: H3MapCell | null
): { latitude?: number; longitude?: number; h3Cell?: string } {
  if (selection?.kind === "reportNode") {
    return {
      latitude: selection.node.latitude,
      longitude: selection.node.longitude,
    }
  }
  if (selection?.kind === "cell") {
    return {
      latitude: selection.cell.center.latitude,
      longitude: selection.cell.center.longitude,
      h3Cell: selection.cell.h3Cell,
    }
  }
  if (
    selection?.kind === "system" &&
    selection.system.latitude != null &&
    selection.system.longitude != null
  ) {
    return {
      latitude: selection.system.latitude,
      longitude: selection.system.longitude,
    }
  }
  if (
    selection?.kind === "task" &&
    selection.task.latitude != null &&
    selection.task.longitude != null
  ) {
    return {
      latitude: selection.task.latitude,
      longitude: selection.task.longitude,
      h3Cell: selection.task.h3Cell ?? undefined,
    }
  }
  return fallbackCell
    ? {
        latitude: fallbackCell.center.latitude,
        longitude: fallbackCell.center.longitude,
        h3Cell: fallbackCell.h3Cell,
      }
    : {}
}

export function CitizenPage() {
  const map = useApi(() => api.h3Map(), [])
  const systems = useApi(() => api.systems(), [])
  const signals = useApi(() => api.signals(), [])
  const tasks = useApi(() => api.contractorTasks(), [])
  const [selected, setSelected] = useState<WaterOperationsMapSelection>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [recording, setRecording] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reportingNodeId, setReportingNodeId] = useState<string | null>(null)
  const [speechLang, setSpeechLang] = useState("en-IN")
  const [qrUri, setQrUri] = useState(
    "upi://pay?pa=neelu@upi&pn=Neelu%20Water&tn=SYS_sys-village_REPORT_URGENT&ll=28.6139,77.2090"
  )
  const [parsedQr, setParsedQr] = useState<{
    latitude: number
    longitude: number
  } | null>(null)

  const cells = map.data?.cells ?? []
  const systemRows = systems.data ?? []
  const signalRows = signals.data ?? []
  const taskRows = tasks.data ?? []
  const selectedCell = selected?.kind === "cell" ? selected.cell : cells[0] ?? null
  const defaultSystemId = systemRows[0]?.systemId ?? "sys-village"
  const selectedSystem = systemIdForSelection(
    selected,
    systemRows,
    defaultSystemId
  )
  const recentSignals = useMemo(
    () =>
      [...signalRows]
        .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
        .slice(0, 5),
    [signalRows]
  )
  const mapLoading =
    map.loading || systems.loading || signals.loading || tasks.loading

  function reloadAll() {
    map.reload()
    systems.reload()
    signals.reload()
    tasks.reload()
  }

  function startVoice() {
    const speechWindow = window as SpeechWindow
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      toast.message("Speech recognition is not available in this browser.")
      return
    }
    const recognition = new Recognition()
    recognition.lang = speechLang
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .flatMap((result) => Array.from(result))
        .map((item) => item.transcript)
        .join(" ")
      setTranscript(text)
    }
    recognition.onend = () => setRecording(false)
    setRecording(true)
    recognition.start()
  }

  async function reportNode(node: ReportableMapNode) {
    if (reportingNodeId) return
    setReportingNodeId(node.id)
    setSelected({ kind: "reportNode", node, reported: false })
    try {
      const existingSignal = signalRows.find(
        (signal) =>
          signal.systemId === node.systemId &&
          signal.locationLabel === node.locationLabel
      )
      const signal =
        existingSignal ??
        (await api.createSignal(reportInputForNode(node, "citizen-map")))

      if (!existingSignal?.caseId) {
        await api.analyzeSignal(signal.signalId)
      }

      setSelected({ kind: "reportNode", node, reported: true })
      toast.success("Report opened for review and field work")
      reloadAll()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : "Report could not be submitted"
      )
    } finally {
      setReportingNodeId(null)
    }
  }

  async function submitVoice() {
    setSubmitting(true)
    try {
      const location = coordinatesForSelection(selected, selectedCell)
      const detail = await api.createVoiceSignal({
        mode: "voice",
        transcript,
        systemId: selectedSystem,
        actor: "citizen",
        h3Cell: location.h3Cell,
        latitude: location.latitude,
        longitude: location.longitude,
      })
      toast.success(`Report opened as ${detail.case.caseId}`)
      setTranscript("")
      setSheetOpen(false)
      reloadAll()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : "Report failed"
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function submitQrIntake() {
    const coordinates = parseUpiCoordinates(qrUri)
    setParsedQr(coordinates)
    if (!coordinates) {
      toast.error("QR URI must include ll=lat,lng or lat/lng parameters.")
      return
    }
    setSubmitting(true)
    try {
      const result = await api.upiCallback({
        transactionId: `fountain-scan-${Date.now()}`,
        tn:
          new URL(qrUri).searchParams.get("tn") ??
          `SYS_${selectedSystem}_REPORT_URGENT`,
        actor: "physical-fountain-qr",
      })
      toast.success(`QR report opened as ${result.caseId}`)
      setSheetOpen(false)
      reloadAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Scan failed")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dark mx-auto grid max-w-6xl gap-4 pb-6 text-foreground xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-[#090c10] p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-lg font-semibold text-white">
              <RiWaterFlashLine className="size-5 text-[#FF3621]" />
              Public water reporting
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-400">
              Select a water point or area, then record an issue into Neelu's
              auditable in-app review and field workflow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={reloadAll}
            >
              <RiRefreshLine className="size-4" />
              Refresh
            </Button>
            <Button
              type="button"
              className="bg-[#FF3621] text-white hover:bg-[#FF3621]/85"
              onClick={() => setSheetOpen(true)}
            >
              <RiChatVoiceLine className="size-4" />
              Report issue
            </Button>
          </div>
        </div>

        <WaterOperationsMap
          systems={systemRows}
          cells={cells}
          signals={signalRows}
          tasks={taskRows}
          selected={selected}
          onSelect={setSelected}
          onReportNode={(node) => void reportNode(node)}
          reportingNodeId={reportingNodeId}
          loading={mapLoading}
          title="Live water operations map"
          subtitle="Tap a marker to inspect it. Context actions on water nodes open an auditable report."
          className="h-[58svh] min-h-[420px] lg:h-[calc(100svh-9rem)] lg:min-h-[620px]"
        />
      </section>

      <aside className="grid content-start gap-3">
        <SelectedWaterPanel
          selected={selected}
          fallbackCell={selectedCell}
          reportingNodeId={reportingNodeId}
          onReportNode={(node) => void reportNode(node)}
          onOpenReport={() => setSheetOpen(true)}
        />

        <Card className="bg-[#090c10] text-foreground ring-white/10" size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between gap-2 text-sm text-white">
              Recent reports
              <Badge variant="outline" className="border-white/15 text-zinc-300">
                {signalRows.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Reports stay inside Neelu until review and field work are created.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {recentSignals.length ? (
              recentSignals.map((signal) => (
                <RecentSignalRow key={signal.signalId} signal={signal} />
              ))
            ) : (
              <div className="border border-dashed border-white/10 p-3 text-xs text-zinc-400">
                No public reports have been received yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-[#090c10] text-foreground ring-white/10" size="sm">
          <CardContent className="grid grid-cols-2 gap-2 pt-3">
            <Metric label="Water areas" value={String(cells.length)} />
            <Metric label="Open tasks" value={String(taskRows.length)} tone="alert" />
            <Metric label="Systems" value={String(systemRows.length)} />
            <Metric label="Selected" value={selectedKindLabel(selected)} />
          </CardContent>
        </Card>
      </aside>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="dark mx-auto max-h-[92svh] max-w-2xl overflow-auto border-white/10 bg-[#090c10] text-foreground"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-base text-white">
              <RiDropLine className="size-5 text-[#FF3621]" />
              Report from selected water point
            </SheetTitle>
          </SheetHeader>
          <div className="grid gap-4 px-6">
            <div className="grid grid-cols-4 gap-1 sm:grid-cols-8">
              {VOICE_LANGUAGES.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  variant={speechLang === item.value ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 px-1 text-[0.6875rem]",
                    speechLang === item.value
                      ? "bg-[#FF3621] text-white hover:bg-[#FF3621]/85"
                      : "border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
                  )}
                  onClick={() => setSpeechLang(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <Button
              type="button"
              className="h-24 flex-col gap-2 bg-[#FF3621] text-white hover:bg-[#FF3621]/85"
              variant={recording ? "destructive" : "default"}
              onClick={startVoice}
              disabled={recording}
            >
              {recording ? (
                <RiRecordCircleLine className="size-8 animate-pulse" />
              ) : (
                <RiMicLine className="size-8" />
              )}
              {recording ? "Listening" : "Record voice report"}
            </Button>
            <Textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="Type or record what changed: cloudy water, smell, illness symptoms, damaged tap, or blocked access."
              rows={6}
              className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
            />
            <Button
              type="button"
              variant="outline"
              className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
              onClick={() =>
                setTranscript(
                  "The tap near the school has cloudy water and children report stomach pain after drinking it."
                )
              }
            >
              Use sample school report
            </Button>
            <div className="space-y-2 border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <RiQrScanLine className="size-4 text-[#FF3621]" />
                Water point QR intake
              </div>
              <Textarea
                value={qrUri}
                onChange={(event) => setQrUri(event.target.value)}
                rows={3}
                className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
                placeholder="upi://pay?...&tn=SYS_sys-village_REPORT_URGENT&ll=28.6139,77.2090"
              />
              {parsedQr ? (
                <p className="text-xs text-zinc-400">
                  Parsed {parsedQr.latitude.toFixed(4)},{" "}
                  {parsedQr.longitude.toFixed(4)}
                </p>
              ) : null}
            </div>
          </div>
          <SheetFooter>
            <Button
              type="button"
              className="bg-[#FF3621] text-white hover:bg-[#FF3621]/85"
              onClick={submitVoice}
              disabled={submitting || transcript.trim().length < 3}
            >
              <RiSendPlaneLine className="size-4" />
              Send voice report
            </Button>
            <Button
              type="button"
              variant="outline"
              className="border-white/15 bg-white/5 text-zinc-200 hover:bg-white/10"
              onClick={submitQrIntake}
              disabled={submitting}
            >
              <RiQrScanLine className="size-4" />
              Process QR intake
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function SelectedWaterPanel({
  selected,
  fallbackCell,
  reportingNodeId,
  onReportNode,
  onOpenReport,
}: {
  selected: WaterOperationsMapSelection
  fallbackCell: H3MapCell | null
  reportingNodeId: string | null
  onReportNode: (node: ReportableMapNode) => void
  onOpenReport: () => void
}) {
  if (selected?.kind === "reportNode") {
    const testLabel = TEST_TYPE_LABELS[selected.node.testType]
    return (
      <Card className="border-[#FF3621]/35 bg-[#090c10] text-foreground ring-white/10" size="sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-start justify-between gap-2 text-sm text-white">
            <span className="min-w-0 truncate">{selected.node.name}</span>
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 border-white/15 text-zinc-300",
                selected.reported ? "border-[#FF3621]/40 bg-[#FF3621]/15 text-white" : ""
              )}
            >
              {selected.reported ? "Reported" : "Water node"}
            </Badge>
          </CardTitle>
          <CardDescription className="line-clamp-2">
            {nodeHierarchyLabel(selected.node)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs leading-relaxed text-zinc-300">
            {selected.node.concern}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Test" value={testLabel} />
            <Metric label="Value" value={`${selected.node.resultValue}`} />
            <Metric label="Unit" value={selected.node.unit} />
          </div>
          <Button
            type="button"
            className="bg-[#FF3621] text-white hover:bg-[#FF3621]/85"
            disabled={reportingNodeId === selected.node.id || selected.reported}
            onClick={() => onReportNode(selected.node)}
          >
            <RiSendPlaneLine className="size-4" />
            {selected.reported ? "Report received" : "Report selected point"}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (selected?.kind === "system") {
    return (
      <Card className="bg-[#090c10] text-foreground ring-white/10" size="sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm text-white">
            <RiMapPinLine className="size-4 text-[#FF3621]" />
            {selected.system.name}
          </CardTitle>
          <CardDescription>{selected.system.region ?? "Water system"}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Population" value={compact(selected.system.populationServed)} />
            <Metric label="Source" value={selected.system.sourceWaterType ?? "Unknown"} />
          </div>
          <Button type="button" variant="outline" onClick={onOpenReport}>
            <RiChatVoiceLine className="size-4" />
            Report at this system
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (selected?.kind === "task") {
    return (
      <Card className="border-[#FF3621]/35 bg-[#090c10] text-foreground ring-white/10" size="sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white">{selected.task.title}</CardTitle>
          <CardDescription>
            {selected.task.systemName} · field work opened
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Metric label="Issue" value={selected.task.contaminant ?? "Water report"} />
          <Metric label="Status" value={selected.task.status} />
        </CardContent>
      </Card>
    )
  }

  const cell = selected?.kind === "cell" ? selected.cell : fallbackCell
  return (
    <Card className="bg-[#090c10] text-foreground ring-white/10" size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-white">
          <RiMapPinLine className="size-4 text-[#FF3621]" />
          Selected water area
        </CardTitle>
        <CardDescription>
          {cell?.districtName ?? "Select a marker or H3 cell on the map"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-2xl font-semibold text-white">{qualityLabel(cell)}</p>
          <p className="text-xs text-zinc-400">
            {cell?.stateName ?? "Water quality context appears here"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Water" value={score(cell?.waterContaminationScore)} />
          <Metric label="Access" value={score(cell?.medicalDesertScore)} />
          <Metric label="Priority" value={score(cell?.vulnerabilityIndex)} tone="alert" />
          <Metric label="Points" value={String(cell?.waterPointCount ?? 0)} />
        </div>
        <Button type="button" variant="outline" onClick={onOpenReport}>
          <RiChatVoiceLine className="size-4" />
          Report from this area
        </Button>
      </CardContent>
    </Card>
  )
}

function RecentSignalRow({ signal }: { signal: SignalDTO }) {
  const testLabel = signal.testType ? TEST_TYPE_LABELS[signal.testType] : signal.signalType
  return (
    <div className="grid gap-1 border border-white/10 bg-white/[0.03] p-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate font-medium text-white">
          {signal.locationLabel ?? signal.systemName}
        </p>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 border-white/15 text-[0.625rem] text-zinc-300",
            signal.status === "analyzed" ? "border-[#FF3621]/40 text-white" : ""
          )}
        >
          {signal.status === "analyzed" ? "Reviewed" : "Received"}
        </Badge>
      </div>
      <p className="truncate text-zinc-400">
        {testLabel} · {formatRelative(signal.receivedAt)}
      </p>
    </div>
  )
}

function selectedKindLabel(selection: WaterOperationsMapSelection): string {
  if (!selection) return "None"
  if (selection.kind === "reportNode") return "Node"
  if (selection.kind === "cell") return "Area"
  if (selection.kind === "system") return "System"
  return "Task"
}

function Metric({
  label,
  value,
  tone = "default",
}: {
  label: string
  value: string
  tone?: "default" | "alert"
}) {
  return (
    <div
      className={cn(
        "min-w-0 border border-white/10 bg-white/[0.03] p-3",
        tone === "alert" ? "border-[#FF3621]/35" : ""
      )}
    >
      <p className="truncate text-[0.6875rem] text-zinc-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-white">{value}</p>
    </div>
  )
}
