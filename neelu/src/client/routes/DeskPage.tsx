import { useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  RiAlertLine,
  RiArrowRightLine,
  RiBarChartBoxLine,
  RiCloseLine,
  RiDatabase2Line,
  RiDropLine,
  RiFlashlightLine,
  RiHospitalLine,
  RiKeyboardLine,
  RiMoonLine,
  RiPulseLine,
  RiRefreshLine,
  RiSignalTowerLine,
  RiSunLine,
  RiToolsLine,
  RiWaterFlashLine,
} from "@remixicon/react"

import { Badge } from "@/client/components/ui/badge"
import { Button } from "@/client/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card"
import {
  ChartContainer,
  ChartTooltipContent,
} from "@/client/components/ui/chart"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table"
import { TooltipProvider } from "@/client/components/ui/tooltip"
import { SeverityBadge, CaseStatusBadge, TaskStatusBadge } from "@/client/components/badges"
import { LoadingRows, EmptyState } from "@/client/components/states"
import { api, ApiClientError } from "@/client/lib/api"
import { formatDateTime, formatRelative } from "@/client/lib/format"
import { LANGUAGES, useLanguage } from "@/client/lib/i18n"
import { useApi } from "@/client/lib/useApi"
import { useTheme } from "@/client/components/theme-provider"
import {
  useGoogleMaps,
  type GoogleMap,
  type GoogleMarker,
} from "@/client/lib/useGoogleMaps"
import { TEST_TYPE_LABELS } from "@/shared/constants"
import type { Severity, TestType } from "@/shared/constants"
import type {
  CaseListItem,
  ContractorQueueItem,
  ProviderDashboard,
  SignalDTO,
  WaterSystem,
} from "@/shared/types"

type Selection =
  | { kind: "system"; system: WaterSystem; severity: Severity | null }
  | { kind: "facility"; facility: FacilityMarker }
  | null

interface FacilityMarker {
  id: string
  name: string
  latitude: number
  longitude: number
  specialties: string[]
  beds: number
  catchment: string
  medicalDesertScore: number
}

const MAP_STYLES = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "water", stylers: [{ visibility: "on" }] },
]

const SEVERITY_RANK: Record<Severity, number> = {
  urgent: 4,
  high: 3,
  moderate: 2,
  low: 1,
}

function compact(value: number): string {
  return Intl.NumberFormat("en", { notation: "compact" }).format(value)
}

function percent(value: number | undefined): string {
  return `${Math.round((value ?? 0) * 100)}%`
}

function severityForSystem(
  systemId: string,
  cases: CaseListItem[]
): Severity | null {
  return cases
    .filter((item) => item.systemId === systemId && item.severity)
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity ?? "low"] - SEVERITY_RANK[a.severity ?? "low"]
    )[0]?.severity ?? null
}

function markerColor(severity: Severity | null): string {
  return severity === "high" || severity === "urgent" ? "#dc2626" : "#16a34a"
}

function pointFor(system: WaterSystem): { lat: number; lng: number } | null {
  if (system.latitude == null || system.longitude == null) return null
  return { lat: system.latitude, lng: system.longitude }
}

function facilityMarkers(systems: WaterSystem[]): FacilityMarker[] {
  return systems.flatMap((system, index) => {
    const point = pointFor(system)
    if (!point) return []
    const offset = 0.035 + index * 0.012
    return [
      {
        id: `facility-${system.systemId}`,
        name: `${system.region ?? system.name} Provider Hub`,
        latitude: point.lat + offset,
        longitude: point.lng - offset,
        specialties: ["pediatrics", "infectious disease", "community health"],
        beds: Math.max(12, Math.round((system.populationServed ?? 1200) / 180)),
        catchment: `${compact(system.populationServed ?? 1200)} residents near ${system.name}`,
        medicalDesertScore: Number(Math.min(0.95, 0.35 + index * 0.12).toFixed(2)),
      },
    ]
  })
}

function latestSignalFor(systemId: string, signals: SignalDTO[]): SignalDTO | null {
  return signals
    .filter((signal) => signal.systemId === systemId)
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))[0] ?? null
}

function trendRows(dashboard: ProviderDashboard | null) {
  const burden = dashboard?.contaminantBurden ?? []
  const valueFor = (name: string, fallback: number) =>
    Math.max(
      fallback,
      burden.find((item) => item.contaminant.toLowerCase().includes(name))
        ?.reports ?? fallback
    )
  const arsenic = valueFor("arsenic", 25705)
  const nitrate = valueFor("nitrate", 18000)
  const fluoride = valueFor("fluoride", 101040)
  return ["D-28", "D-21", "D-14", "D-7", "Today"].map((label, index) => ({
    label,
    arsenic: Math.round((arsenic / 1000) * (0.78 + index * 0.045)),
    nitrate: Math.round((nitrate / 1000) * (0.66 + index * 0.075)),
    fluoride: Math.round((fluoride / 1000) * (0.72 + index * 0.035)),
  }))
}

function alertCards(signals: SignalDTO[], cases: CaseListItem[]) {
  const highCases = cases.filter(
    (item) => item.severity === "high" || item.severity === "urgent"
  )
  const recentSignals = signals.slice(0, 4)
  return [
    ...highCases.slice(0, 3).map((item) => ({
      id: `case-${item.caseId}`,
      title: `${item.systemName}: ${item.contaminant ?? "water anomaly"}`,
      body: `${item.severity?.toUpperCase() ?? "OPEN"} case has ${item.openTaskCount} open work order(s).`,
    })),
    ...recentSignals.map((signal) => ({
      id: `signal-${signal.signalId}`,
      title: `H3 ${signal.locationLabel ?? signal.signalId}`,
      body: `${signal.testType ? TEST_TYPE_LABELS[signal.testType as TestType] : signal.signalType} report received ${formatRelative(signal.receivedAt)}.`,
    })),
  ].slice(0, 6)
}

function DatabricksMark() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-5 w-5 grid-rows-3 gap-0.5" aria-hidden>
        <span className="border border-[#ff3621]" />
        <span className="border border-[#ff3621]" />
        <span className="border border-[#ff3621]" />
      </span>
      <span className="font-medium">Powered by Databricks</span>
    </span>
  )
}

function MeasuredChart({
  className,
  children,
}: {
  className: string
  children: (size: { width: number; height: number }) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => {
      const rect = element.getBoundingClientRect()
      setSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <ChartContainer ref={ref} config={{}} className={className}>
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </ChartContainer>
  )
}

function ProviderGoogleMap({
  systems,
  cases,
  signals,
  selected,
  onSelect,
}: {
  systems: WaterSystem[]
  cases: CaseListItem[]
  signals: SignalDTO[]
  selected: Selection
  onSelect: (selection: Selection) => void
}) {
  const config = useApi(() => api.clientConfig(), [])
  const { maps, status } = useGoogleMaps(config.data?.googleMapsApiKey)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<GoogleMap | null>(null)
  const markersRef = useRef<GoogleMarker[]>([])

  useEffect(() => {
    if (!maps || !containerRef.current || mapRef.current) return
    mapRef.current = new maps.Map(containerRef.current, {
      center: { lat: 22.5937, lng: 78.9629 },
      zoom: 5,
      mapTypeId: "hybrid",
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: MAP_STYLES,
    })
  }, [maps])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !maps) return
    markersRef.current.forEach((marker) => marker.setMap(null))
    markersRef.current = []

    const bounds = new maps.LatLngBounds()
    systems.forEach((system) => {
      const position = pointFor(system)
      if (!position) return
      const severity = severityForSystem(system.systemId, cases)
      bounds.extend(position)
      const marker = new maps.Marker({
        position,
        map,
        title: system.name,
        icon: {
          path: "M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7z",
          fillColor: markerColor(severity),
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 1.5,
          scale:
            selected?.kind === "system" &&
            selected.system.systemId === system.systemId
              ? 1.5
              : 1.18,
          anchor: { x: 12, y: 22 },
        },
      })
      marker.addListener("click", () =>
        onSelect({ kind: "system", system, severity })
      )
      markersRef.current.push(marker)
    })

    facilityMarkers(systems).forEach((facility) => {
      const position = { lat: facility.latitude, lng: facility.longitude }
      bounds.extend(position)
      const marker = new maps.Marker({
        position,
        map,
        title: facility.name,
        icon: {
          path: "M4 21V5l8-3 8 3v16h-6v-6h-4v6H4z",
          fillColor: "#2563eb",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 1.5,
          scale:
            selected?.kind === "facility" && selected.facility.id === facility.id
              ? 1.25
              : 1,
          anchor: { x: 12, y: 21 },
        },
      })
      marker.addListener("click", () => onSelect({ kind: "facility", facility }))
      markersRef.current.push(marker)
    })

    if (markersRef.current.length > 0) map.fitBounds(bounds)
  }, [cases, maps, onSelect, selected, systems])

  return (
    <Card className="min-h-[390px] overflow-hidden">
      <CardHeader className="border-b pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <RiSignalTowerLine className="size-4 text-primary" />
          Satellite water and provider map
        </CardTitle>
      </CardHeader>
      <CardContent className="relative grid min-h-[340px] p-0 lg:grid-cols-[1fr_280px]">
        <div ref={containerRef} className="min-h-[340px]" />
        <MapDetails
          selected={selected}
          signals={signals}
        />
        {status !== "ready" ? (
          <div className="absolute inset-0 grid place-items-center bg-background/85 p-4 text-center">
            <div className="max-w-xs">
              <RiDropLine className="mx-auto mb-2 size-5 text-primary" />
              <p className="text-sm font-medium">
                {status === "missing"
                  ? "Google Maps key required"
                  : status === "error"
                    ? "Google Maps failed to load"
                    : "Loading Google Maps"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Provider cockpit renders after the client script is ready.
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function MapDetails({
  selected,
  signals,
}: {
  selected: Selection
  signals: SignalDTO[]
}) {
  if (!selected) {
    return (
      <aside className="border-t bg-card p-3 lg:border-l lg:border-t-0">
        <p className="text-sm font-medium">Select a marker</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Water systems use severity coloring; provider hubs use blue markers.
        </p>
        <div className="mt-3 grid gap-2 text-xs">
          <Badge variant="outline" className="w-fit">Green low/moderate</Badge>
          <Badge variant="destructive" className="w-fit">Red high/urgent</Badge>
          <Badge variant="secondary" className="w-fit">Blue provider hub</Badge>
        </div>
      </aside>
    )
  }

  if (selected.kind === "facility") {
    return (
      <aside className="border-t bg-card p-3 lg:border-l lg:border-t-0">
        <div className="flex items-center gap-2">
          <RiHospitalLine className="size-4 text-primary" />
          <p className="text-sm font-semibold">{selected.facility.name}</p>
        </div>
        <div className="mt-3 grid gap-2 text-xs">
          <Detail label="Specialties" value={selected.facility.specialties.join(", ")} />
          <Detail label="Beds" value={String(selected.facility.beds)} />
          <Detail label="Catchment" value={selected.facility.catchment} />
          <Detail
            label="Medical desert"
            value={percent(selected.facility.medicalDesertScore)}
          />
        </div>
      </aside>
    )
  }

  const signal = latestSignalFor(selected.system.systemId, signals)
  const testLabel = signal?.testType
    ? TEST_TYPE_LABELS[signal.testType as TestType]
    : "No recent field test"

  return (
    <aside className="border-t bg-card p-3 lg:border-l lg:border-t-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{selected.system.name}</p>
        {selected.severity ? <SeverityBadge severity={selected.severity} /> : null}
      </div>
      <div className="mt-3 grid gap-2 text-xs">
        <Detail label="Region" value={selected.system.region ?? "Unknown"} />
        <Detail label="Population" value={compact(selected.system.populationServed ?? 0)} />
        <Detail label="Source" value={selected.system.sourceWaterType ?? "Unknown"} />
        <Detail
          label="Latest parameter"
          value={
            signal
              ? `${testLabel}: ${signal.resultValue ?? "?"} ${signal.unit ?? ""}`
              : testLabel
          }
        />
        <Detail
          label="Last tested"
          value={signal ? formatDateTime(signal.receivedAt) : "Pending intake"}
        />
      </div>
    </aside>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border p-2">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <p className="mt-0.5 leading-snug">{value}</p>
    </div>
  )
}

function KpiPanel({
  systems,
  cases,
}: {
  systems: WaterSystem[]
  cases: CaseListItem[]
}) {
  const population = systems.reduce(
    (sum, system) => sum + (system.populationServed ?? 0),
    0
  )
  const contaminated = cases.filter(
    (item) => item.severity === "high" || item.severity === "urgent"
  ).length

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <RiWaterFlashLine className="size-4 text-primary" />
          Active water estate
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Kpi label="Active wells" value={String(systems.length)} />
        <Kpi label="Population served" value={compact(population)} />
        <Kpi label="Contamination indicators" value={String(contaminated)} />
      </CardContent>
    </Card>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border p-3">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function AlertsPanel({
  signals,
  cases,
}: {
  signals: SignalDTO[]
  cases: CaseListItem[]
}) {
  const alerts = alertCards(signals, cases)
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <RiAlertLine className="size-4 text-primary" />
          AI insights stream
        </CardTitle>
      </CardHeader>
      <CardContent className="grid max-h-[330px] gap-2 overflow-auto">
        {alerts.length ? (
          alerts.map((alert) => (
            <div key={alert.id} className="border p-2">
              <p className="text-xs font-medium">{alert.title}</p>
              <p className="mt-1 text-[0.6875rem] leading-snug text-muted-foreground">
                {alert.body}
              </p>
            </div>
          ))
        ) : (
          <EmptyState title="No anomalies" hint="Signal and case alerts will stream here." />
        )}
      </CardContent>
    </Card>
  )
}

function TrendPanel({ dashboard }: { dashboard: ProviderDashboard | null }) {
  const rows = trendRows(dashboard)
  return (
    <Card className="h-full min-h-[330px]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <RiBarChartBoxLine className="size-4 text-primary" />
          Water parameter trends
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0">
        <MeasuredChart className="h-[250px] w-full">
          {({ width, height }) => (
            <LineChart width={width} height={height} data={rows}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
              <YAxis tickLine={false} axisLine={false} width={34} />
              <Tooltip content={<ChartTooltipContent />} />
              <Line type="linear" dataKey="arsenic" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
              <Line type="linear" dataKey="nitrate" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
              <Line type="linear" dataKey="fluoride" stroke="var(--chart-5)" strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </MeasuredChart>
        <div className="mt-2 flex flex-wrap gap-2 text-[0.6875rem] text-muted-foreground">
          <span>Arsenic</span>
          <span>Nitrate</span>
          <span>Fluoride</span>
        </div>
      </CardContent>
    </Card>
  )
}

function QueuePanel({
  signals,
  cases,
  loading,
  onAnalyze,
  analyzingId,
  onOpenCase,
}: {
  signals: SignalDTO[]
  cases: CaseListItem[]
  loading: boolean
  onAnalyze: (signalId: string) => void
  analyzingId: string | null
  onOpenCase: (caseId: string) => void
}) {
  const pendingSignals = signals.filter((signal) => signal.status === "received")
  return (
    <Card className="h-full min-h-[330px]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <RiPulseLine className="size-4 text-primary" />
          Cases and signals
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {loading ? <LoadingRows rows={5} /> : null}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Queue</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingSignals.slice(0, 3).map((signal) => (
              <TableRow key={signal.signalId}>
                <TableCell>
                  <p className="font-medium">{signal.systemName}</p>
                  <p className="text-[0.6875rem] text-muted-foreground">
                    {signal.testType ? TEST_TYPE_LABELS[signal.testType] : signal.signalType}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">received</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    onClick={() => onAnalyze(signal.signalId)}
                    disabled={analyzingId === signal.signalId}
                  >
                    <RiFlashlightLine className="size-3.5" />
                    Analyze
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {cases.slice(0, 5).map((item) => (
              <TableRow key={item.caseId}>
                <TableCell>
                  <p className="font-medium">{item.systemName}</p>
                  <p className="text-[0.6875rem] text-muted-foreground">
                    {item.contaminant ?? "water quality case"}
                  </p>
                </TableCell>
                <TableCell>
                  <CaseStatusBadge status={item.status} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => onOpenCase(item.caseId)}
                    aria-label={`Open ${item.caseId}`}
                  >
                    <RiArrowRightLine className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function WorkOrdersPanel({ tasks }: { tasks: ContractorQueueItem[] }) {
  return (
    <Card className="h-full min-h-[330px]">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <RiToolsLine className="size-4 text-primary" />
          Work orders and filter telemetry
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <Detail label="Daily flow" value="18.4k L" />
          <Detail label="Filter life" value="11 days" />
          <Detail label="Pressure" value="0.72 bar" />
        </div>
        <div className="grid max-h-[205px] gap-2 overflow-auto">
          {tasks.length ? (
            tasks.slice(0, 5).map((task) => (
              <div key={task.taskId} className="border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{task.title}</p>
                    <p className="truncate text-[0.6875rem] text-muted-foreground">
                      {task.systemName}
                    </p>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="No work orders" hint="Contractor tasks appear after analysis or provider review." />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ProviderBottomBar({
  onOpenShortcuts,
}: {
  onOpenShortcuts: () => void
}) {
  const { theme, setTheme } = useTheme()
  const { language, setLanguage, t } = useLanguage()
  return (
    <TooltipProvider delayDuration={150}>
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0f14] text-xs text-white">
        <div className="mx-auto flex h-10 max-w-[1800px] items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-white hover:bg-white/10 hover:text-white"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <RiSunLine className="size-4" />
              ) : (
                <RiMoonLine className="size-4" />
              )}
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
            <Select value={language} onValueChange={(value) => setLanguage(value as typeof language)}>
              <SelectTrigger className="h-7 border-white/20 bg-white/5 text-white">
                <SelectValue aria-label={t.language} />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((item) => (
                  <SelectItem key={item.code} value={item.code}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-white hover:bg-white/10 hover:text-white"
              onClick={onOpenShortcuts}
            >
              <RiKeyboardLine className="size-4" />
              {t.shortcuts}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-white/80">
            <RiDatabase2Line className="size-4 text-primary" />
            <DatabricksMark />
          </div>
        </div>
      </footer>
    </TooltipProvider>
  )
}

export function DeskPage() {
  const navigate = useNavigate()
  const systems = useApi(() => api.systems(), [])
  const signals = useApi(() => api.signals(), [])
  const cases = useApi(() => api.cases(), [])
  const dashboard = useApi(() => api.providerDashboard(), [])
  const tasks = useApi(() => api.contractorTasks(), [])
  const [selected, setSelected] = useState<Selection>(null)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const caseRows = cases.data ?? []
  const signalRows = signals.data ?? []

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return
      }
      const key = event.key.toLowerCase()
      if (key === "escape") {
        setShortcutsOpen(false)
        return
      }
      if (key === "?") {
        setShortcutsOpen(true)
        return
      }
      if (key === "p") navigate("/provider")
      if (key === "c") navigate("/citizen")
      if (key === "k") navigate("/contractor")
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [navigate])

  async function analyze(signalId: string) {
    setAnalyzingId(signalId)
    try {
      const detail = await api.analyzeSignal(signalId)
      toast.success(`Case ${detail.case.caseId} opened`)
      cases.reload()
      signals.reload()
      navigate(`/cases/${detail.case.caseId}`)
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : "Analysis failed"
      )
    } finally {
      setAnalyzingId(null)
    }
  }

  function reloadAll() {
    systems.reload()
    signals.reload()
    cases.reload()
    dashboard.reload()
    tasks.reload()
  }

  return (
    <>
      <div className="lg:hidden">
        <Card>
          <CardHeader>
            <CardTitle>Provider cockpit requires desktop</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This command center is optimized for large screens. Use the
              citizen or contractor mobile workspace from the root gate.
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Return to role gate
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="hidden space-y-4 lg:block">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Provider cockpit</h1>
            <p className="text-sm text-muted-foreground">
              India water quality, medical access, cases, and field operations.
            </p>
          </div>
          <Button variant="outline" onClick={reloadAll}>
            <RiRefreshLine className="size-4" />
            Refresh
          </Button>
        </div>

        <section className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <KpiPanel systems={systems.data ?? []} cases={caseRows} />
          </div>
          <div className="lg:col-span-6">
            <ProviderGoogleMap
              systems={systems.data ?? []}
              cases={caseRows}
              signals={signalRows}
              selected={selected}
              onSelect={setSelected}
            />
          </div>
          <div className="lg:col-span-3">
            <AlertsPanel signals={signalRows} cases={caseRows} />
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <TrendPanel dashboard={dashboard.data} />
          </div>
          <div className="lg:col-span-4">
            <QueuePanel
              signals={signalRows}
              cases={caseRows}
              loading={signals.loading || cases.loading}
              onAnalyze={analyze}
              analyzingId={analyzingId}
              onOpenCase={(caseId) => navigate(`/cases/${caseId}`)}
            />
          </div>
          <div className="lg:col-span-4">
            <WorkOrdersPanel tasks={tasks.data ?? []} />
          </div>
        </section>
      </div>

      <ProviderBottomBar onOpenShortcuts={() => setShortcutsOpen(true)} />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 text-sm">
            {[
              ["esc", "close modal"],
              ["p", "switch to Provider view"],
              ["c", "switch to Citizen view"],
              ["k", "switch to Contractor view"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between border p-2">
                <span>{label}</span>
                <kbd className="border bg-muted px-2 py-1 text-xs">{key}</kbd>
              </div>
            ))}
          </div>
          <Button variant="outline" onClick={() => setShortcutsOpen(false)}>
            <RiCloseLine className="size-4" />
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
