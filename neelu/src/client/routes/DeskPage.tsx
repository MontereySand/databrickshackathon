import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { AnimatePresence, motion } from "motion/react"
import maplibregl from "maplibre-gl"
import {
  RiArrowRightSLine,
  RiAlertLine,
  RiArrowRightLine,
  RiBarChartBoxLine,
  RiBrainAi3Line,
  RiCloseLine,
  RiDatabase2Line,
  RiFlashlightLine,
  RiKeyboardLine,
  RiMap2Line,
  RiMapPin2Line,
  RiMoonLine,
  RiRadarLine,
  RiPulseLine,
  RiRefreshLine,
  RiSendPlane2Line,
  RiShieldCheckLine,
  RiSparkling2Line,
  RiSunLine,
  RiToolsLine,
  RiWaterFlashLine,
  RiWifiOffLine,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog"
import {
  Map,
  MapControls,
  MapMarker,
  useMap,
} from "@/client/components/ui/map"
import {
  Message,
  MessageContent,
  MessageHeader,
} from "@/client/components/ui/message"
import { ScrollArea } from "@/client/components/ui/scroll-area"
import { Separator } from "@/client/components/ui/separator"
import { Skeleton } from "@/client/components/ui/skeleton"
import { Switch } from "@/client/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table"
import { Textarea } from "@/client/components/ui/textarea"
import { SeverityBadge, CaseStatusBadge, TaskStatusBadge } from "@/client/components/badges"
import { LoadingRows, EmptyState } from "@/client/components/states"
import { api, ApiClientError } from "@/client/lib/api"
import {
  formatDateTime,
  formatRelative,
  serviceStatusColor,
  serviceStatusLabel,
} from "@/client/lib/format"
import {
  buildReportableMapNodes,
  nodeHierarchyLabel,
  reportedNodeIdsFromSignals,
  reportInputForNode,
  type ReportableMapNode,
} from "@/client/lib/mapNodes"
import { useApi } from "@/client/lib/useApi"
import { useTheme } from "@/client/components/theme-provider"
import { cn } from "@/client/lib/utils"
import { SERVICE_LABELS, TEST_TYPE_LABELS } from "@/shared/constants"
import type { Severity, TestType } from "@/shared/constants"
import type {
  CaseListItem,
  ContractorQueueItem,
  H3MapCell,
  HealthInfo,
  ProviderAgentAction,
  ProviderAgentChatResponse,
  ProviderDashboard,
  SignalDTO,
  WaterSystem,
} from "@/shared/types"

type Selection =
  | { kind: "system"; system: WaterSystem; severity: Severity | null }
  | { kind: "facility"; facility: FacilityMarker }
  | { kind: "cell"; cell: H3MapCell }
  | { kind: "task"; task: ContractorQueueItem }
  | { kind: "reportNode"; node: ReportableMapNode; reported: boolean }
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

const DATABRICKS_RED = "#FF3621"

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

function severityTone(severity: Severity | null): string {
  if (severity === "urgent") return "border-red-500 bg-red-500"
  if (severity === "high") return "border-orange-500 bg-orange-500"
  if (severity === "moderate") return "border-amber-500 bg-amber-500"
  return "border-emerald-500 bg-emerald-500"
}

function pointFor(system: WaterSystem): { lat: number; lng: number } | null {
  if (system.latitude == null || system.longitude == null) return null
  return { lat: system.latitude, lng: system.longitude }
}

function distanceScore(
  point: { lat: number; lng: number },
  other: { lat: number; lng: number }
): number {
  return Math.abs(point.lat - other.lat) + Math.abs(point.lng - other.lng)
}

function systemsNearCell(
  cell: H3MapCell,
  systems: WaterSystem[]
): WaterSystem[] {
  const ranked = systems
    .flatMap((system) => {
      const point = pointFor(system)
      if (!point) return []
      return [
        {
          system,
          score: distanceScore(point, {
            lat: cell.center.latitude,
            lng: cell.center.longitude,
          }),
        },
      ]
    })
    .sort((a, b) => a.score - b.score)

  return ranked.slice(0, Math.min(3, ranked.length)).map((item) => item.system)
}

function scopeLabel(selection: Selection): string {
  if (!selection) return "All India"
  if (selection.kind === "system") return selection.system.name
  if (selection.kind === "reportNode") return selection.node.name
  if (selection.kind === "facility") return selection.facility.name
  if (selection.kind === "task") return selection.task.title
  return `${selection.cell.districtName} H3 cell`
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

interface AgentFocusItem {
  id: string
  title: string
  body: string
}

function visibleAgentFocusItems(
  alerts: ReturnType<typeof alertCards>
): AgentFocusItem[] {
  return alerts.slice(0, 2).map((alert) => ({
    id: alert.id,
    title: alert.title,
    body: alert.body,
  }))
}

function clientAgentActions(
  signals: SignalDTO[],
  cases: CaseListItem[],
  tasks: ContractorQueueItem[]
): ProviderAgentAction[] {
  const receivedSignal = signals.find((signal) => signal.status === "received")
  const priorityCase = cases.find(
    (item) => item.severity === "urgent" || item.severity === "high"
  )
  const openTask = tasks.find((task) => task.status === "open")
  return [
    receivedSignal
      ? {
          type: "analyze_signal",
          label: "Analyze newest signal",
          targetId: receivedSignal.signalId,
          reason: `${receivedSignal.systemName} is ready for review.`,
        }
      : null,
    priorityCase
      ? {
          type: "open_case",
          label: "Open priority case",
          targetId: priorityCase.caseId,
          reason: `${priorityCase.systemName} is marked ${priorityCase.severity ?? "open"}.`,
        }
      : null,
    openTask
      ? {
          type: "assign_task",
          label: "Assign work order",
          targetId: openTask.taskId,
          reason: `${openTask.title} is ready for field ownership.`,
        }
      : null,
    {
      type: "refresh_status",
      label: "Refresh service status",
      targetId: null,
      reason: "Reload the provider cockpit data.",
    },
  ].filter((action): action is ProviderAgentAction => Boolean(action))
}

function clientProviderAgentReply({
  scope,
  signals,
  cases,
  tasks,
  focusItems,
}: {
  scope: string
  signals: SignalDTO[]
  cases: CaseListItem[]
  tasks: ContractorQueueItem[]
  focusItems: AgentFocusItem[]
}): ProviderAgentChatResponse {
  const actions = clientAgentActions(signals, cases, tasks)
  const openTasks = tasks.filter((task) => task.status === "open").length
  const highCases = cases.filter(
    (item) => item.severity === "urgent" || item.severity === "high"
  ).length
  const focus = cases[0]?.systemName ?? signals[0]?.systemName ?? scope
  const concern = cases[0]?.contaminant ?? signals[0]?.testType ?? "water quality"
  const visibleFocus = focusItems.length
    ? `Visible context: ${focusItems
        .map((item) => `${item.title} - ${item.body}`)
        .join(" ")}`
    : `${focus} is the current operating focus for ${concern}.`
  return {
    reply: [
      `I inspected ${scope}: ${signals.length} signal(s), ${cases.length} case(s), ${openTasks} open work order(s), and ${highCases} high-priority item(s).`,
      visibleFocus,
      actions[0]?.reason
        ? `Recommended next move: ${actions[0].reason}`
        : "Recommended next move: keep monitoring the selected scope.",
    ].join(" "),
    mode: "LOCAL_SIM",
    modelEndpoint: "gpt-5.2",
    generatedAt: new Date().toISOString(),
    dataSource: "demo_model",
    sources: [
      "Provider dashboard aggregate",
      "Signal and case queue",
      "Contractor work-order telemetry",
    ],
    actions,
  }
}

function DatabricksIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn("grid h-5 w-5 grid-rows-3 gap-0.5", className)}
      aria-hidden
    >
      <span className="border border-[#ff3621]" />
      <span className="border border-[#ff3621]" />
      <span className="border border-[#ff3621]" />
    </span>
  )
}

function DatabricksMark() {
  return (
    <span className="inline-flex items-center gap-2">
      <DatabricksIcon />
      <span className="font-medium">Powered by Databricks</span>
    </span>
  )
}

function h3CellFeatures(cells: H3MapCell[]) {
  return {
    type: "FeatureCollection",
    features: cells.map((cell) => ({
      type: "Feature",
      properties: {
        h3Cell: cell.h3Cell,
        quality: cell.quality,
        districtName: cell.districtName,
        stateName: cell.stateName,
      },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            ...cell.boundary.map(([lat, lng]) => [lng, lat]),
            [cell.boundary[0]?.[1] ?? cell.center.longitude, cell.boundary[0]?.[0] ?? cell.center.latitude],
          ],
        ],
      },
    })),
  }
}

function H3CellLayer({
  cells,
  selected,
  onSelect,
}: {
  cells: H3MapCell[]
  selected: Selection
  onSelect: (selection: Selection) => void
}) {
  const { map, isLoaded } = useMap()
  const sourceData = useMemo(() => h3CellFeatures(cells), [cells])

  useEffect(() => {
    if (!map || !isLoaded) return
    const sourceId = "neelu-h3-cells"
    const fillLayerId = "neelu-h3-cells-fill"
    const lineLayerId = "neelu-h3-cells-line"
    const selectedCell = selected?.kind === "cell" ? selected.cell.h3Cell : ""

    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: sourceData as never,
      })
      map.addLayer({
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": [
            "match",
            ["get", "quality"],
            "contaminated",
            DATABRICKS_RED,
            "caution",
            "#f59e0b",
            "#22c55e",
          ],
          "fill-opacity": [
            "case",
            ["==", ["get", "h3Cell"], selectedCell],
            0.34,
            0.16,
          ],
        },
      })
      map.addLayer({
        id: lineLayerId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": [
            "case",
            ["==", ["get", "h3Cell"], selectedCell],
            DATABRICKS_RED,
            "#ffffff",
          ],
          "line-width": [
            "case",
            ["==", ["get", "h3Cell"], selectedCell],
            3,
            1.2,
          ],
          "line-opacity": 0.82,
        },
      })
    } else {
      const source = map.getSource(sourceId) as unknown as {
        setData: (data: unknown) => void
      }
      source.setData(sourceData)
      if (map.getLayer(fillLayerId)) {
        map.setPaintProperty(fillLayerId, "fill-opacity", [
          "case",
          ["==", ["get", "h3Cell"], selectedCell],
          0.34,
          0.16,
        ])
      }
      if (map.getLayer(lineLayerId)) {
        map.setPaintProperty(lineLayerId, "line-color", [
          "case",
          ["==", ["get", "h3Cell"], selectedCell],
          DATABRICKS_RED,
          "#ffffff",
        ])
        map.setPaintProperty(lineLayerId, "line-width", [
          "case",
          ["==", ["get", "h3Cell"], selectedCell],
          3,
          1.2,
        ])
      }
    }

    const handleClick = (event: { features?: Array<{ properties?: { h3Cell?: string } }> }) => {
      const h3Cell = event.features?.[0]?.properties?.h3Cell
      const cell = cells.find((item) => item.h3Cell === h3Cell)
      if (cell) onSelect({ kind: "cell", cell })
    }
    map.on("click", fillLayerId, handleClick)
    map.on("mouseenter", fillLayerId, () => {
      map.getCanvas().style.cursor = "pointer"
    })
    map.on("mouseleave", fillLayerId, () => {
      map.getCanvas().style.cursor = ""
    })

    return () => {
      map.off("click", fillLayerId, handleClick)
    }
  }, [cells, isLoaded, map, onSelect, selected, sourceData])

  return null
}

function FitMapToData({
  systems,
  cells,
  tasks,
}: {
  systems: WaterSystem[]
  cells: H3MapCell[]
  tasks: ContractorQueueItem[]
}) {
  const { map, isLoaded } = useMap()
  const points = useMemo(
    () => [
      ...systems.flatMap((system) => {
        const point = pointFor(system)
        return point ? [[point.lng, point.lat] as [number, number]] : []
      }),
      ...cells.map(
        (cell) => [cell.center.longitude, cell.center.latitude] as [number, number]
      ),
      ...tasks.flatMap((task) =>
        task.latitude == null || task.longitude == null
          ? []
          : [[task.longitude, task.latitude] as [number, number]]
      ),
    ],
    [cells, systems, tasks]
  )

  useEffect(() => {
    if (!map || !isLoaded || points.length === 0) return

    const bounds = new maplibregl.LngLatBounds(points[0], points[0])
    points.slice(1).forEach((point) => bounds.extend(point))
    map.fitBounds(bounds, {
      duration: 650,
      maxZoom: 7,
      padding: { top: 84, right: 84, bottom: 88, left: 84 },
    })
  }, [isLoaded, map, points])

  return null
}

function ProviderOperationalMap({
  systems,
  cases,
  signals,
  cells,
  tasks,
  selected,
  onSelect,
  reportingNodeId,
  onReportNode,
}: {
  systems: WaterSystem[]
  cases: CaseListItem[]
  signals: SignalDTO[]
  cells: H3MapCell[]
  tasks: ContractorQueueItem[]
  selected: Selection
  onSelect: (selection: Selection) => void
  reportingNodeId: string | null
  onReportNode: (node: ReportableMapNode) => void
}) {
  const [tileError, setTileError] = useState<string | null>(null)
  const systemMarkers = systems.flatMap((system) => {
    const point = pointFor(system)
    if (!point) return []
    const severity = severityForSystem(system.systemId, cases)
    return [{ system, point, severity }]
  })
  const reportableNodes = useMemo(
    () => buildReportableMapNodes(systems, cells),
    [cells, systems]
  )
  const reportedNodeIds = useMemo(
    () => reportedNodeIdsFromSignals(reportableNodes, signals),
    [reportableNodes, signals]
  )
  const hubs = facilityMarkers(systems).slice(0, 8)
  const taskMarkers = tasks.flatMap((task) =>
    task.latitude == null || task.longitude == null ? [] : [task]
  )
  const sourceLabel = tileError ? "H3 fallback" : "mapcn / MapLibre"

  return (
    <Card className="h-full min-h-[760px] overflow-hidden">
      <CardContent className="relative h-full min-h-[760px] p-0">
        <Map
          className="h-full min-h-[760px]"
          theme="dark"
          center={[78.9629, 22.5937]}
          maxBounds={[
            [66, 5],
            [99, 38],
          ]}
          minZoom={4.25}
          zoom={4.4}
          pitch={14}
          useEmptyStyle={Boolean(tileError)}
          onMapError={(message) => setTileError(message)}
        >
          <FitMapToData systems={systems} cells={cells} tasks={taskMarkers} />
          <H3CellLayer cells={cells} selected={selected} onSelect={onSelect} />
          {systemMarkers.map(({ system, point, severity }) => (
            <MapMarker
              key={system.systemId}
              longitude={point.lng}
              latitude={point.lat}
              onClick={() => onSelect({ kind: "system", system, severity })}
            >
              <span
                className={cn(
                  "block size-4 rounded-full border-[3px] border-background shadow-[0_0_0_2px_rgba(0,0,0,0.35)] transition-transform group-hover/map-marker:scale-125",
                  selected?.kind === "system" &&
                    selected.system.systemId === system.systemId
                    ? "scale-125 ring-2 ring-ring"
                    : "",
                  severityTone(severity)
                )}
                aria-label={system.name}
              />
            </MapMarker>
          ))}
          {reportableNodes.map((node) => {
            const reported = reportedNodeIds.has(node.id)
            const selectedNode =
              selected?.kind === "reportNode" && selected.node.id === node.id
            return (
              <MapMarker
                key={node.id}
                longitude={node.longitude}
                latitude={node.latitude}
                onClick={() => onSelect({ kind: "reportNode", node, reported })}
                onContextMenu={() => onReportNode(node)}
                className="cursor-crosshair"
              >
                <span
                  className={cn(
                    "relative block size-2.5 rounded-full border border-background shadow-[0_0_0_1px_rgba(0,0,0,0.55)] transition-transform group-hover/map-marker:scale-150",
                    reported
                      ? "bg-[#FF3621] ring-2 ring-[#FF3621]/40"
                      : node.testType === "total_coliform" ||
                          node.testType === "nitrate"
                        ? "bg-orange-500"
                        : "bg-cyan-500",
                    selectedNode ? "scale-150 ring-2 ring-ring" : "",
                    reportingNodeId === node.id
                      ? "animate-pulse ring-2 ring-[#FF3621]"
                      : ""
                  )}
                  title={`${nodeHierarchyLabel(node)}. Right-click to report.`}
                  aria-label={`${node.name}, right-click to report`}
                />
              </MapMarker>
            )
          })}
          {hubs.map((facility) => (
            <MapMarker
              key={facility.id}
              longitude={facility.longitude}
              latitude={facility.latitude}
              onClick={() => onSelect({ kind: "facility", facility })}
            >
              <span
                className={cn(
                  "grid size-6 place-items-center border-2 border-background bg-blue-600 text-[0.625rem] font-semibold text-white shadow-md",
                  selected?.kind === "facility" &&
                    selected.facility.id === facility.id
                    ? "ring-2 ring-ring"
                    : ""
                )}
              >
                H
              </span>
            </MapMarker>
          ))}
          {taskMarkers.slice(0, 12).map((task) => (
            <MapMarker
              key={task.taskId}
              longitude={task.longitude ?? 0}
              latitude={task.latitude ?? 0}
              onClick={() => onSelect({ kind: "task", task })}
            >
              <span
                className={cn(
                  "block size-3 rotate-45 border-2 border-background bg-[#FF3621] shadow-md transition-transform group-hover/map-marker:scale-125",
                  selected?.kind === "task" && selected.task.taskId === task.taskId
                    ? "scale-125 ring-2 ring-[#FF3621]"
                    : ""
                )}
                aria-label={task.title}
              />
            </MapMarker>
          ))}
          <MapControls />
        </Map>
        <div className="absolute left-3 top-3 z-20 max-w-sm border bg-background/90 p-2 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2">
            <RiMap2Line className="size-4 text-primary" />
            <p className="text-xs font-semibold">Live water operations map</p>
            <Badge variant={tileError ? "secondary" : "outline"} className="ml-auto">
              {sourceLabel}
            </Badge>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {tileError ? (
              <RiWifiOffLine className="size-4 text-muted-foreground" />
            ) : (
              <RiRadarLine className="size-4 text-primary" />
            )}
            <p className="text-[0.6875rem] font-medium">
              {tileError ? "Tile fallback active" : "Live geospatial overlay"}
            </p>
          </div>
          <p className="mt-1 text-[0.6875rem] leading-snug text-muted-foreground">
            {tileError
              ? "MapLibre is using an empty style while Neelu keeps H3 cells and coordinates clickable."
              : "Click nodes to focus the cockpit. Right-click any water node to report it into the signal and contractor flow."}
          </p>
        </div>
        <MapSelectionSummary
          selected={selected}
          signals={signals}
          cases={cases}
          tasks={tasks}
          reportingNodeId={reportingNodeId}
          onReportNode={onReportNode}
        />
        <div className="absolute bottom-3 left-3 z-20 flex flex-wrap gap-2 text-[0.6875rem]">
          <span className="border bg-background/90 px-2 py-1 text-muted-foreground">
            Systems {systemMarkers.length}
          </span>
          <span className="border bg-background/90 px-2 py-1 text-muted-foreground">
            H3 {cells.length}
          </span>
          <span className="border bg-background/90 px-2 py-1 text-muted-foreground">
            Hubs {hubs.length}
          </span>
          <span className="border bg-background/90 px-2 py-1 text-muted-foreground">
            Nodes {reportableNodes.length}
          </span>
          <span className="border bg-background/90 px-2 py-1 text-muted-foreground">
            Tasks {taskMarkers.length}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function MapSelectionSummary({
  selected,
  signals,
  cases,
  tasks,
  reportingNodeId,
  onReportNode,
}: {
  selected: Selection
  signals: SignalDTO[]
  cases: CaseListItem[]
  tasks: ContractorQueueItem[]
  reportingNodeId: string | null
  onReportNode: (node: ReportableMapNode) => void
}) {
  if (!selected) {
    return (
      <div className="absolute right-3 top-3 z-20 max-w-64 border bg-background/90 p-2 text-xs shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <RiMapPin2Line className="size-4 text-primary" />
          <p className="font-medium">Select a map object</p>
        </div>
        <p className="mt-1 leading-snug text-muted-foreground">
          Red diamonds are work orders. Polygons are H3 water-risk cells.
        </p>
      </div>
    )
  }

  if (selected.kind === "facility") {
    return (
      <div className="absolute bottom-3 right-3 z-20 w-80 border bg-background/95 p-3 text-xs shadow-sm backdrop-blur">
        <div className="flex items-center gap-2">
          <RiMapPin2Line className="size-4 text-primary" />
          <p className="truncate text-sm font-semibold">{selected.facility.name}</p>
        </div>
        <p className="mt-1 line-clamp-2 text-[0.6875rem] leading-snug text-muted-foreground">
          Provider hub for {selected.facility.catchment}.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <PinMetric label="Beds" value={String(selected.facility.beds)} />
          <PinMetric label="Desert" value={percent(selected.facility.medicalDesertScore)} />
        </div>
      </div>
    )
  }

  if (selected.kind === "cell") {
    return (
      <div className="absolute bottom-3 right-3 z-20 w-80 border bg-background/95 p-3 text-xs shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{selected.cell.districtName}</p>
            <p className="truncate text-[0.6875rem] text-muted-foreground">
              {selected.cell.stateName} &rarr; H3 {selected.cell.h3Cell}
            </p>
          </div>
          <Badge variant="secondary">{selected.cell.quality}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <PinMetric label="Water" value={String(selected.cell.waterPointCount)} />
          <PinMetric label="Facilities" value={String(selected.cell.facilityCount)} />
          <PinMetric label="Risk" value={percent(selected.cell.vulnerabilityIndex)} />
        </div>
      </div>
    )
  }

  if (selected.kind === "task") {
    return (
      <div className="absolute bottom-3 right-3 z-20 w-80 border border-[#FF3621]/50 bg-background/95 p-3 text-xs shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{selected.task.title}</p>
            <p className="truncate text-[0.6875rem] text-muted-foreground">
              {selected.task.systemName} &rarr; work order
            </p>
          </div>
          <TaskStatusBadge status={selected.task.status} />
        </div>
        <p className="mt-2 line-clamp-2 text-[0.6875rem] leading-snug text-muted-foreground">
          {selected.task.description ?? "Provider work order ready for contractor ownership."}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <PinMetric label="Owner" value={selected.task.owner ?? "Unassigned"} />
          <PinMetric
            label="Due"
            value={selected.task.dueAt ? formatDateTime(selected.task.dueAt) : "Open"}
          />
        </div>
      </div>
    )
  }

  if (selected.kind === "reportNode") {
    return (
      <div className="absolute bottom-3 right-3 z-20 w-80 border border-[#FF3621]/45 bg-background/95 p-3 text-xs shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{selected.node.name}</p>
            <p className="truncate text-[0.6875rem] text-muted-foreground">
              {nodeHierarchyLabel(selected.node)}
            </p>
          </div>
          <Badge
            variant={selected.reported ? "default" : "outline"}
            className={selected.reported ? "bg-[#FF3621] text-white" : ""}
          >
            {selected.reported ? "reported" : "node"}
          </Badge>
        </div>
        <p className="mt-2 line-clamp-2 text-[0.6875rem] leading-snug text-muted-foreground">
          {selected.node.concern}. Reporting creates a signal, runs analysis,
          and updates the in-app contractor queue.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <PinMetric
            label="Test"
            value={
              selected.node.testType
                ? TEST_TYPE_LABELS[selected.node.testType]
                : "Field"
            }
          />
          <PinMetric label="Value" value={`${selected.node.resultValue}`} />
          <PinMetric label="Unit" value={selected.node.unit} />
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-3 h-9 w-full"
          disabled={reportingNodeId === selected.node.id}
          onClick={() => onReportNode(selected.node)}
        >
          <RiAlertLine className="size-3.5" />
          {reportingNodeId === selected.node.id ? "Reporting" : "Report node"}
        </Button>
      </div>
    )
  }

  const signal = latestSignalFor(selected.system.systemId, signals)
  const relatedCases = cases.filter((item) => item.systemId === selected.system.systemId)
  const relatedTasks = tasks.filter((item) => item.systemName === selected.system.name)
  const testLabel = signal?.testType
    ? TEST_TYPE_LABELS[signal.testType as TestType]
    : "No recent field test"

  return (
    <div className="absolute bottom-3 right-3 z-20 w-80 border bg-background/95 p-3 text-xs shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{selected.system.name}</p>
          <p className="truncate text-[0.6875rem] text-muted-foreground">
            {selected.system.region ?? "Unknown state"} &rarr; {selected.system.name}
          </p>
        </div>
        {selected.severity ? <SeverityBadge severity={selected.severity} /> : null}
      </div>
      <p className="mt-2 line-clamp-2 text-[0.6875rem] leading-snug text-muted-foreground">
        {signal
          ? `${signal.locationLabel ?? selected.system.name}: ${testLabel} ${signal.resultValue ?? "?"} ${signal.unit ?? ""}`
          : `${compact(selected.system.populationServed ?? 0)} people served from ${selected.system.sourceWaterType ?? "unknown source"}.`}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <PinMetric label="Cases" value={String(relatedCases.length)} />
        <PinMetric label="Tasks" value={String(relatedTasks.length)} />
        <PinMetric label="Pop." value={compact(selected.system.populationServed ?? 0)} />
      </div>
    </div>
  )
}

function PinMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border bg-background/70 px-2 py-1">
      <p className="truncate text-[0.625rem] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border p-2">
      <p className="truncate text-[0.6875rem] text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words leading-snug">{value}</p>
    </div>
  )
}

function KpiPanel({
  systems,
  cases,
  signals,
  loading,
  scope,
}: {
  systems: WaterSystem[]
  cases: CaseListItem[]
  signals: SignalDTO[]
  loading: boolean
  scope: string
}) {
  const population = systems.reduce(
    (sum, system) => sum + (system.populationServed ?? 0),
    0
  )
  const contaminated = cases.filter(
    (item) => item.severity === "high" || item.severity === "urgent"
  ).length

  return (
    <Card className="min-h-[260px]" size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <RiWaterFlashLine className="size-4 text-primary" />
            Water estate
          </span>
          <Badge variant="outline" className="max-w-36 truncate">
            {scope}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {loading ? (
          <div className="grid grid-cols-2 gap-2">
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
            <KpiSkeleton />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Kpi label="Water points" value={String(systems.length)} />
              <Kpi label="Population" value={compact(population)} />
              <Kpi label="Indicators" value={String(contaminated)} />
              <Kpi label="Signals" value={String(signals.length)} />
            </div>
            <div className="border bg-muted/30 p-2">
              <p className="text-[0.6875rem] text-muted-foreground">
                Current scope
              </p>
              <p className="mt-1 truncate text-xs font-medium">{scope}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function KpiSkeleton() {
  return (
    <div className="border p-2">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-6 w-14" />
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="border p-2">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}

function MapScopeAnalysisPanel({
  selected,
  scope,
  systems,
  signals,
  cases,
  tasks,
  analyzingId,
  reportingNodeId,
  onAnalyze,
  onReportNode,
  onOpenCase,
  onAssign,
}: {
  selected: Selection
  scope: string
  systems: WaterSystem[]
  signals: SignalDTO[]
  cases: CaseListItem[]
  tasks: ContractorQueueItem[]
  analyzingId: string | null
  reportingNodeId: string | null
  onAnalyze: (signalId: string) => void
  onReportNode: (node: ReportableMapNode) => void
  onOpenCase: (caseId: string) => void
  onAssign: (taskId: string) => void
}) {
  const pendingSignal = signals.find((signal) => signal.status === "received")
  const priorityCase = [...cases].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity ?? "low"] - SEVERITY_RANK[a.severity ?? "low"]
  )[0]
  const openTask = tasks.find((task) => task.status === "open")
  const activeSystems = systems.length
  const signalLabel = pendingSignal?.testType
    ? TEST_TYPE_LABELS[pendingSignal.testType as TestType]
    : pendingSignal?.signalType ?? "Signal"
  const selectedType =
    selected?.kind === "system"
      ? "Water point"
      : selected?.kind === "reportNode"
        ? "Reportable node"
      : selected?.kind === "cell"
        ? "H3 cell"
        : selected?.kind === "facility"
          ? "Provider hub"
          : selected?.kind === "task"
            ? "Work order"
            : "All India"
  const summary =
    selected?.kind === "reportNode"
      ? `${nodeHierarchyLabel(selected.node)}. ${selected.node.concern}. Use Report node to create the signal, run analysis, and place resulting tasks in the contractor queue.`
      : priorityCase?.summary ??
        pendingSignal?.notes ??
        (selected
          ? "No generated finding yet. Analyze the newest signal or inspect related work orders."
          : "Select a map marker to focus this analysis strip.")
  const contextRows = [
    pendingSignal
      ? {
          id: `signal-${pendingSignal.signalId}`,
          label: "Signal",
          title: pendingSignal.locationLabel ?? pendingSignal.systemName,
          body: `${signalLabel} · received ${formatRelative(pendingSignal.receivedAt)}`,
          icon: <RiPulseLine className="size-3.5 text-primary" />,
        }
      : null,
    priorityCase
      ? {
          id: `case-${priorityCase.caseId}`,
          label: "Case",
          title: priorityCase.systemName,
          body: `${priorityCase.contaminant ?? "water case"} · ${priorityCase.openTaskCount} task(s)`,
          icon: <RiAlertLine className="size-3.5 text-[#FF3621]" />,
        }
      : null,
    openTask
      ? {
          id: `task-${openTask.taskId}`,
          label: "Task",
          title: openTask.title,
          body: `${openTask.systemName} · ${openTask.status}`,
          icon: <RiToolsLine className="size-3.5 text-primary" />,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item))

  return (
    <Card className="border-primary/30" size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="inline-flex min-w-0 items-center gap-2">
            <RiFlashlightLine className="size-4 shrink-0 text-primary" />
            <span className="truncate">Selected scope analysis</span>
          </span>
          <Badge variant="outline" className="max-w-56 truncate">
            {selectedType}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.95fr)_240px]">
        <div className="grid min-w-0 content-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold">{scope}</p>
            <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {summary}
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {priorityCase ? (
              <>
              <SeverityBadge severity={priorityCase.severity} />
              <Badge variant="outline" className="max-w-40 truncate">
                {priorityCase.contaminant ?? "water case"}
              </Badge>
              </>
            ) : null}
            <Badge variant="secondary" className="max-w-48 truncate">
              {selectedType}
            </Badge>
          </div>
        </div>

        <div className="grid min-w-0 gap-2">
          <div className="grid grid-cols-4 gap-2 text-xs">
            <PinMetric label="Water" value={String(activeSystems)} />
            <PinMetric label="Signals" value={String(signals.length)} />
            <PinMetric label="Cases" value={String(cases.length)} />
            <PinMetric label="Tasks" value={String(tasks.length)} />
          </div>
          <div className="grid gap-1.5">
            {contextRows.length ? (
              contextRows.slice(0, 3).map((item) => (
                <ScopeContextRow
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  title={item.title}
                  body={item.body}
                />
              ))
            ) : (
              <div className="border border-dashed p-2 text-xs text-muted-foreground">
                No active signal, case, or work-order context in this scope.
              </div>
            )}
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-2">
          <ScopeActionButton
            icon={
              selected?.kind === "reportNode" ? (
                <RiAlertLine className="size-4" />
              ) : (
                <RiFlashlightLine className="size-4" />
              )
            }
            label={selected?.kind === "reportNode" ? "Report node" : "Analyze signal"}
            detail={
              selected?.kind === "reportNode"
                ? `${selected.node.systemName} · ${selected.node.testType}`
                : pendingSignal
                ? `${pendingSignal.systemName} · ${signalLabel}`
                : "No received signal"
            }
            disabled={
              selected?.kind === "reportNode"
                ? reportingNodeId === selected.node.id
                : !pendingSignal || analyzingId === pendingSignal.signalId
            }
            onClick={() => {
              if (selected?.kind === "reportNode") {
                onReportNode(selected.node)
                return
              }
              if (pendingSignal) onAnalyze(pendingSignal.signalId)
            }}
          />
          <ScopeActionButton
            icon={<RiArrowRightLine className="size-4" />}
            label="Open case"
            detail={
              priorityCase
                ? `${priorityCase.systemName} · ${priorityCase.contaminant ?? "case"}`
                : "No active case"
            }
            disabled={!priorityCase}
            variant="outline"
            onClick={() => priorityCase && onOpenCase(priorityCase.caseId)}
          />
          <ScopeActionButton
            icon={<RiToolsLine className="size-4" />}
            label="Assign task"
            detail={
              openTask
                ? `${openTask.systemName} · ${openTask.title}`
                : "No open task"
            }
            disabled={!openTask}
            variant="outline"
            onClick={() => openTask && onAssign(openTask.taskId)}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function ScopeContextRow({
  icon,
  label,
  title,
  body,
}: {
  icon: ReactNode
  label: string
  title: string
  body: string
}) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_1fr] gap-2 border bg-background/40 p-2">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[0.625rem] font-medium uppercase text-muted-foreground">
            {label}
          </span>
          <span className="h-px min-w-3 flex-1 bg-border" />
        </div>
        <p className="mt-0.5 truncate text-xs font-medium">{title}</p>
        <p className="truncate text-[0.6875rem] text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}

function ScopeActionButton({
  icon,
  label,
  detail,
  disabled,
  onClick,
  variant = "default",
}: {
  icon: ReactNode
  label: string
  detail: string
  disabled?: boolean
  onClick: () => void
  variant?: "default" | "outline"
}) {
  return (
    <Button
      type="button"
      variant={variant}
      className="h-11 w-full justify-start gap-2 whitespace-normal px-3 text-left"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-xs font-semibold">{label}</span>
        <span className="truncate text-[0.6875rem] font-normal opacity-80">
          {detail}
        </span>
      </span>
    </Button>
  )
}

function ProviderOpsRail({
  health,
  healthLoading,
  signals,
  cases,
  tasks,
}: {
  health: HealthInfo | null
  healthLoading: boolean
  signals: SignalDTO[]
  cases: CaseListItem[]
  tasks: ContractorQueueItem[]
}) {
  const service = (name: "lakebase" | "unity_catalog" | "model_serving") =>
    health?.services.find((item) => item.service === name)
  const lakebase = service("lakebase")
  const unity = service("unity_catalog")
  const model = service("model_serving")
  const mode = health?.mode ?? "Probing"
  const taskCount = tasks.filter((task) => task.status !== "done").length
  const taskLabel = taskCount === 1 ? "1 open item" : `${taskCount} open items`
  const detailFor = (
    item: typeof lakebase,
    fallback: string
  ) =>
    item
      ? `${SERVICE_LABELS[item.service]} · ${serviceStatusLabel(item.status)}`
      : fallback

  return (
    <Card className="h-full min-h-[760px]" size="sm">
      <CardHeader className="border-b px-3 py-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2">
            <RiPulseLine className="size-4 text-primary" />
            Ops status
          </span>
          <Badge variant="outline">{mode}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 p-3">
        <div className="grid gap-2">
          <StatusBoardCell
            icon={<RiDatabase2Line className="size-4 text-primary" />}
            label="Lakebase"
            value={lakebase ? serviceStatusLabel(lakebase.status) : "Probing"}
            detail={detailFor(lakebase, "Operational rows and audit trail")}
            loading={healthLoading}
            dotClassName={lakebase ? serviceStatusColor(lakebase.status) : "bg-muted"}
          />
          <StatusBoardCell
            icon={<RiShieldCheckLine className="size-4 text-primary" />}
            label="Unity Catalog"
            value={unity ? serviceStatusLabel(unity.status) : "Probing"}
            detail={detailFor(unity, "Governed source tables")}
            loading={healthLoading}
            dotClassName={unity ? serviceStatusColor(unity.status) : "bg-muted"}
          />
          <StatusBoardCell
            icon={<DatabricksIcon className="h-4 w-4" />}
            label="Model Serving"
            value={model ? serviceStatusLabel(model.status) : "Probing"}
            detail={detailFor(model, "Pseudo model context")}
            loading={healthLoading}
            dotClassName={model ? serviceStatusColor(model.status) : "bg-[#FF3621]"}
          />
          <StatusBoardCell
            icon={<RiToolsLine className="size-4 text-primary" />}
            label="Contractor queue"
            value={taskLabel}
            detail={`${mode} task assignment and audit`}
          />
        </div>

        <Separator />

        <div className="grid gap-2">
          <p className="text-xs font-semibold">Request flow</p>
          <FlowStep
            label="Citizen / UPI / sync"
            value={`${signals.length} signal(s)`}
            detail="/signals · /upi/callback · /sync"
          />
          <FlowStep
            label="Databricks analysis"
            value={`${cases.length} case(s)`}
            detail="/signals/:id/analyze"
          />
          <FlowStep
            label="Provider review"
            value={`${cases.filter((item) => item.status !== "closed").length} active`}
            detail="approve · override · request evidence"
          />
          <FlowStep
            label="Contractor queue"
            value={`${taskCount} work order(s)`}
            detail="/contractor/tasks/:id/assign"
            isLast
          />
        </div>

      </CardContent>
    </Card>
  )
}

function StatusBoardCell({
  icon,
  label,
  value,
  detail,
  loading,
  dotClassName,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
  loading?: boolean
  dotClassName?: string
}) {
  return (
    <div className="min-w-0 border bg-background/70 px-2 py-1.5">
      <div className="flex items-center gap-2">
        {icon}
        <p className="truncate text-[0.6875rem] text-muted-foreground">
          {label}
        </p>
        {dotClassName ? (
          <span
            className={cn("ml-auto size-2 rounded-full", dotClassName)}
            aria-hidden
          />
        ) : null}
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-4 w-24" />
          <Skeleton className="mt-2 h-3 w-36" />
        </>
      ) : (
        <>
          <p className="mt-1 truncate text-sm font-semibold">{value}</p>
          <p className="mt-1 truncate text-[0.6875rem] text-muted-foreground">
            {detail}
          </p>
        </>
      )}
    </div>
  )
}

function FlowStep({
  label,
  value,
  detail,
  isLast,
}: {
  label: string
  value: string
  detail: string
  isLast?: boolean
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 border bg-background/60 p-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{label}</p>
        <p className="mt-0.5 truncate text-[0.6875rem] text-muted-foreground">
          {detail}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Badge variant="secondary">{value}</Badge>
        {isLast ? null : (
          <RiArrowRightSLine className="size-4 text-muted-foreground" />
        )}
      </div>
    </div>
  )
}

interface AgentMessageItem {
  id: string
  role: "user" | "assistant"
  body: string
}

function AgentMessages({
  messages,
  thinking,
}: {
  messages: AgentMessageItem[]
  thinking: boolean
}) {
  return (
    <ScrollArea className="min-h-0">
      <div className="grid gap-2 pr-3">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16 }}
            >
              <Message role={message.role}>
                <MessageHeader
                  icon={
                    message.role === "assistant" ? (
                      <RiBrainAi3Line className="size-3.5 text-[#FF3621]" />
                    ) : (
                      <RiShieldCheckLine className="size-3.5 text-muted-foreground" />
                    )
                  }
                >
                  {message.role === "assistant" ? "Neelu Agent" : "Operator"}
                </MessageHeader>
                <MessageContent>
                  <p>{message.body}</p>
                </MessageContent>
              </Message>
            </motion.div>
          ))}
          {thinking ? (
            <motion.div
              key="thinking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Message role="status">
                <MessageContent className="flex items-center gap-2">
                  <motion.span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: DATABRICKS_RED }}
                    initial={{ opacity: 0.4, scale: 0.85 }}
                    animate={{ opacity: [0.45, 1], scale: [0.85, 1.25] }}
                    transition={{
                      duration: 0.7,
                      repeat: Infinity,
                      repeatType: "mirror",
                    }}
                    aria-hidden
                  />
                  Neelu Agent is reading the current scope
                </MessageContent>
              </Message>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </ScrollArea>
  )
}

function AgentBriefingPanel({
  signals,
  cases,
  tasks,
  scope,
  selected,
  onAction,
}: {
  signals: SignalDTO[]
  cases: CaseListItem[]
  tasks: ContractorQueueItem[]
  scope: string
  selected: Selection
  onAction: (action: ProviderAgentAction) => void
}) {
  const [prompt, setPrompt] = useState("")
  const [messages, setMessages] = useState<AgentMessageItem[]>([
    {
      id: "agent-ready",
      role: "assistant",
      body:
        "I can read the selected map scope, active H3 alerts, cases, signals, and contractor work orders. Ask what needs action or click an active context item.",
    },
  ])
  const [lastActions, setLastActions] = useState<ProviderAgentAction[]>([])
  const [sending, setSending] = useState(false)
  const alerts = alertCards(signals, cases)
  const selectedNodeFocus =
    selected?.kind === "reportNode"
      ? [
          {
            id: selected.node.id,
            title: `Selected node: ${selected.node.name}`,
            body: `${nodeHierarchyLabel(selected.node)}. ${selected.node.concern}. Reporting this node creates a signal, analysis case, and contractor work-order context.`,
          },
        ]
      : []
  const focusItems = [
    ...selectedNodeFocus,
    ...visibleAgentFocusItems(alerts),
  ].slice(0, 4)
  const selectedKind =
    selected?.kind === "reportNode" ? "system" : selected?.kind ?? "none"
  const selectedId =
    selected?.kind === "system"
      ? selected.system.systemId
      : selected?.kind === "reportNode"
        ? selected.node.systemId
      : selected?.kind === "cell"
        ? selected.cell.h3Cell
        : selected?.kind === "facility"
          ? selected.facility.id
      : selected?.kind === "task"
        ? selected.task.taskId
        : null

  async function runPrompt(rawPrompt: string) {
    const trimmedPrompt = rawPrompt.trim()
    if (!trimmedPrompt) return
    const history = messages
      .filter((message) => message.id !== "agent-ready")
      .slice(-6)
      .map((message) => ({
        role: message.role,
        content: message.body,
      }))
    const userMessage: AgentMessageItem = {
      id: `operator-${Date.now()}`,
      role: "user",
      body: trimmedPrompt,
    }
    setMessages((current) => [...current, userMessage])
    setSending(true)
    setPrompt("")
    try {
      const response = await api.providerAgentChat({
        prompt: trimmedPrompt,
        scope,
        selectedKind,
        selectedId,
        focusItems,
        messages: history,
      })
      setMessages((current) => [
        ...current,
        {
          id: `agent-${response.generatedAt}`,
          role: "assistant",
          body: response.reply,
        },
      ])
      setLastActions(response.actions)
    } catch {
      const response = clientProviderAgentReply({
        scope,
        signals,
        cases,
        tasks,
        focusItems,
      })
      setMessages((current) => [
        ...current,
        {
          id: `agent-local-${Date.now()}`,
          role: "assistant",
          body: response.reply,
        },
      ])
      setLastActions(response.actions)
    } finally {
      setSending(false)
    }
  }

  async function submitPrompt() {
    await runPrompt(prompt)
  }

  return (
    <Card
      className="flex h-full min-h-[760px] flex-col overflow-hidden border-2 border-[#FF3621] bg-card shadow-[0_0_0_1px_rgba(255,54,33,0.22),inset_0_0_0_1px_rgba(255,54,33,0.18)]"
      size="sm"
    >
      <CardHeader className="border-b border-[#FF3621]/60 bg-[#FF3621]/10 px-3 py-3">
        <CardTitle className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-2">
              <DatabricksIcon className="h-4 w-4 shrink-0" />
              <span className="truncate">Neelu Agent</span>
            </span>
            <Badge
              variant="outline"
              className="shrink-0 border-[#FF3621]/65 bg-background/65 text-[#FF3621]"
            >
              Ready
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-1.5 text-[0.625rem] font-normal text-muted-foreground">
            <span className="truncate border border-[#FF3621]/25 bg-background/45 px-1.5 py-1">
              {signals.length} signal(s)
            </span>
            <span className="truncate border border-[#FF3621]/25 bg-background/45 px-1.5 py-1">
              {cases.length} case(s)
            </span>
            <span className="truncate border border-[#FF3621]/25 bg-background/45 px-1.5 py-1">
              {tasks.length} task(s)
            </span>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto_auto] gap-3 p-3">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.625rem] font-semibold uppercase tracking-wide text-[#FF3621]">
              Active context
            </p>
            <span className="h-px min-w-8 flex-1 bg-[#FF3621]/30" />
          </div>
          <div className="grid gap-2">
            {focusItems.length ? (
              focusItems.slice(0, 2).map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  className="group grid min-w-0 gap-1 border border-[#FF3621]/55 bg-[#FF3621]/5 p-2 text-left transition-colors hover:border-[#FF3621] hover:bg-[#FF3621]/10"
                  onClick={() =>
                    void runPrompt(`What is happening with ${alert.title}?`)
                  }
                >
                  <div className="flex min-w-0 items-center gap-2 text-xs font-semibold">
                    <RiAlertLine className="size-3.5 shrink-0 text-[#FF3621]" />
                    <span className="truncate">{alert.title}</span>
                  </div>
                  <p className="line-clamp-1 text-[0.6875rem] text-muted-foreground">
                    {alert.body}
                  </p>
                </button>
              ))
            ) : (
              <div className="border border-dashed border-[#FF3621]/35 p-2 text-xs text-muted-foreground">
                Select a map node, case, or signal to pin context here.
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 border border-[#FF3621]/35 bg-background/50 p-2">
          <AgentMessages messages={messages} thinking={sending} />
        </div>

        <form
          className="grid gap-2 border border-[#FF3621]/45 bg-background/75 p-2"
          onSubmit={(event) => {
            event.preventDefault()
            void submitPrompt()
          }}
        >
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-20 resize-none border-[#FF3621]/40 bg-background text-xs focus-visible:ring-[#FF3621]/60"
            placeholder="Ask what needs action in this scope..."
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault()
                void submitPrompt()
              }
            }}
          />
          <div className="grid grid-cols-[1fr_auto] items-center gap-2">
            <div className="truncate text-[0.6875rem] text-muted-foreground">
              {scope} · {signals.length} signals · {cases.length} cases · {tasks.length} tasks
            </div>
            <Button
              type="submit"
              size="sm"
              className="border border-[#FF3621] bg-[#FF3621] text-white hover:bg-[#d92d1c]"
              disabled={sending || !prompt.trim()}
            >
              <RiSendPlane2Line className="size-3.5" />
              Ask
            </Button>
          </div>
        </form>

        {lastActions.length ? (
          <div className="grid grid-cols-2 gap-2">
            {lastActions.slice(0, 2).map((action) => (
              <Button
                key={`${action.type}-${action.targetId ?? "none"}`}
                type="button"
                variant="outline"
                size="sm"
                className="h-9 min-w-0 justify-start border-[#FF3621]/55 bg-[#FF3621]/5 px-2 text-xs hover:bg-[#FF3621]/10"
                onClick={() => onAction(action)}
              >
                <RiArrowRightSLine className="size-3.5 shrink-0 text-[#FF3621]" />
                <span className="truncate">{action.label}</span>
              </Button>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function AnalyticsPanel({
  dashboard,
  systems,
  cases,
  signals,
  loading,
  scope,
}: {
  dashboard: ProviderDashboard | null
  systems: WaterSystem[]
  cases: CaseListItem[]
  signals: SignalDTO[]
  loading: boolean
  scope: string
}) {
  const burden = useMemo(() => {
    if (cases.length === 0) return dashboard?.contaminantBurden ?? []

    const grouped = new globalThis.Map<
      string,
      { contaminant: string; reports: number; districts: Set<string> }
    >()
    cases.forEach((item) => {
      const contaminant = item.contaminant ?? "Water anomaly"
      const current =
        grouped.get(contaminant) ??
        { contaminant, reports: 0, districts: new Set<string>() }
      current.reports += 1
      current.districts.add(item.systemName)
      grouped.set(contaminant, current)
    })

    return [...grouped.values()]
      .map((item) => ({
        contaminant: item.contaminant,
        reports: item.reports,
        districts: item.districts.size,
      }))
      .sort((a, b) => b.reports - a.reports)
  }, [cases, dashboard])
  const priorities = useMemo(() => {
    if (systems.length === 0) return dashboard?.priorityGeographies ?? []

    return systems
      .map((system) => {
        const systemCases = cases.filter((item) => item.systemId === system.systemId)
        const systemSignals = signals.filter((item) => item.systemId === system.systemId)
        const severityScore = systemCases.reduce(
          (max, item) => Math.max(max, item.severity ? SEVERITY_RANK[item.severity] : 0),
          0
        )
        const neeluPriorityScore = Math.min(
          1,
          (severityScore + Math.min(3, systemSignals.length) * 0.35) / 4.5
        )

        return {
          stateName: system.region ?? "Unknown state",
          districtName: system.name,
          neeluPriorityScore,
          affectedHabitationCount: systemCases.length,
          facilityCount: 1,
          dominantQualityParameter:
            systemCases[0]?.contaminant ??
            systemSignals[0]?.testType ??
            "No active parameter",
        }
      })
      .sort((a, b) => b.neeluPriorityScore - a.neeluPriorityScore)
  }, [cases, dashboard, signals, systems])
  const maxReports = Math.max(1, ...burden.map((item) => item.reports))
  return (
    <Card className="min-h-[300px]" size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <RiBarChartBoxLine className="size-4 text-primary" />
            Data-backed analytics
          </span>
          <Badge variant="outline" className="max-w-32 truncate">
            {scope}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {loading ? (
          <LoadingRows rows={5} />
        ) : burden.length === 0 && priorities.length === 0 ? (
          <EmptyState
            title="No analytics rows"
            hint="Charts appear only when provider dashboard data returns rows."
          />
        ) : (
          <>
            <div className="grid gap-2">
              <p className="text-xs font-semibold">Contaminant burden</p>
              {burden.slice(0, 4).map((item) => (
                <div key={item.contaminant} className="grid gap-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">{item.contaminant}</span>
                    <span className="text-muted-foreground">
                      {item.reports} reports · {item.districts} districts
                    </span>
                  </div>
                  <div className="h-2 bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${Math.max(8, (item.reports / maxReports) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="grid gap-2">
              <p className="text-xs font-semibold">Priority geographies</p>
              {priorities.slice(0, 4).map((item) => (
                <div key={`${item.stateName}-${item.districtName}`} className="border p-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium">
                      {item.stateName} &rarr; {item.districtName}
                    </span>
                    <Badge variant="secondary">{percent(item.neeluPriorityScore)}</Badge>
                  </div>
                  <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                    {item.affectedHabitationCount} habitation(s), {item.facilityCount} facility point(s), {item.dominantQualityParameter}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function QueuePanel({
  signals,
  cases,
  loading,
  scope,
  onAnalyze,
  analyzingId,
  onOpenCase,
}: {
  signals: SignalDTO[]
  cases: CaseListItem[]
  loading: boolean
  scope: string
  onAnalyze: (signalId: string) => void
  analyzingId: string | null
  onOpenCase: (caseId: string) => void
}) {
  const pendingSignals = signals.filter((signal) => signal.status === "received")
  const hasRows = pendingSignals.length > 0 || cases.length > 0
  return (
    <Card className="min-h-[300px]" size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <RiPulseLine className="size-4 text-primary" />
            Cases and signals
          </span>
          <Badge variant="outline" className="max-w-32 truncate">
            {scope}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {loading ? (
          <LoadingRows rows={5} />
        ) : !hasRows ? (
          <EmptyState
            title="No queue items"
            hint="Selecting another water point or clearing scope will show more work."
          />
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-28 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingSignals.slice(0, 3).map((signal) => (
                <TableRow key={signal.signalId}>
                  <TableCell>
                    <p className="truncate font-medium">{signal.systemName}</p>
                    <p className="truncate text-[0.6875rem] text-muted-foreground">
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
                    <p className="truncate font-medium">{item.systemName}</p>
                    <p className="truncate text-[0.6875rem] text-muted-foreground">
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
        )}
      </CardContent>
    </Card>
  )
}

function WorkOrdersPanel({
  tasks,
  loading,
  scope,
  onAssign,
}: {
  tasks: ContractorQueueItem[]
  loading: boolean
  scope: string
  onAssign: (taskId: string) => void
}) {
  const open = tasks.filter((task) => task.status === "open").length
  const inProgress = tasks.filter((task) => task.status === "in_progress").length
  const done = tasks.filter((task) => task.status === "done").length
  return (
    <Card className="min-h-[300px]" size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <RiToolsLine className="size-4 text-primary" />
            Work orders and telemetry
          </span>
          <Badge variant="outline" className="max-w-32 truncate">
            {scope}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          {loading ? (
            <>
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </>
          ) : (
            <>
              <Detail label="Open" value={String(open)} />
              <Detail label="In progress" value={String(inProgress)} />
              <Detail label="Done" value={String(done)} />
            </>
          )}
        </div>
        {loading ? (
          <LoadingRows rows={4} />
        ) : (
          <ScrollArea className="max-h-[230px]">
            <div className="grid gap-2 pr-3">
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
                    {task.status === "open" ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-7 w-full justify-start"
                        onClick={() => onAssign(task.taskId)}
                      >
                        <RiArrowRightLine className="size-3.5" />
                        Assign to field team
                      </Button>
                    ) : null}
                  </div>
                ))
              ) : (
                <EmptyState title="No work orders" hint="Contractor tasks appear after analysis or provider review." />
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

function ThemeModeSwitch() {
  const { theme, setTheme } = useTheme()
  const checked = theme === "dark"

  return (
    <div className="flex h-7 w-36 items-center gap-2 px-1">
      <RiSunLine className="size-4 text-white/75" />
      <Switch
        checked={checked}
        onCheckedChange={(value) => setTheme(value ? "dark" : "light")}
        aria-label="Toggle dark mode"
      />
      <RiMoonLine className="size-4 text-white/75" />
      <span className="ml-1 w-10 text-white/75">{checked ? "Dark" : "Light"}</span>
    </div>
  )
}

function ProviderBottomBar({
  onOpenShortcuts,
}: {
  onOpenShortcuts: () => void
}) {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0f14] text-xs text-white">
      <div className="mx-auto grid h-11 max-w-[1840px] grid-cols-[300px_1fr_260px] items-center gap-3 px-8 xl:px-10 2xl:px-12">
        <div className="flex items-center gap-2">
          <ThemeModeSwitch />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-32 justify-start px-2 text-white hover:bg-white/10 hover:text-white"
            onClick={onOpenShortcuts}
          >
            <RiKeyboardLine className="size-4" />
            Shortcuts
          </Button>
        </div>
        <div aria-hidden />
        <div className="flex items-center justify-end gap-2 text-white/80">
          <DatabricksMark />
        </div>
      </div>
    </footer>
  )
}

export function DeskPage() {
  const navigate = useNavigate()
  const systems = useApi(() => api.systems(), [])
  const signals = useApi(() => api.signals(), [])
  const cases = useApi(() => api.cases(), [])
  const dashboard = useApi(() => api.providerDashboard(), [])
  const health = useApi(() => api.health(), [])
  const h3Map = useApi(() => api.h3Map(), [])
  const tasks = useApi(() => api.contractorTasks(), [])
  const [selected, setSelected] = useState<Selection>(null)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [reportingNodeId, setReportingNodeId] = useState<string | null>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const systemRows = systems.data ?? []
  const caseRows = cases.data ?? []
  const signalRows = signals.data ?? []
  const mapCells = h3Map.data?.cells ?? []
  const focusedSystems =
    selected?.kind === "system"
      ? [selected.system]
      : selected?.kind === "reportNode"
        ? systemRows.filter((system) => system.systemId === selected.node.systemId)
      : selected?.kind === "cell"
        ? systemsNearCell(selected.cell, systemRows)
        : selected?.kind === "facility"
          ? systemRows.filter(
              (system) => `facility-${system.systemId}` === selected.facility.id
            )
        : selected?.kind === "task"
          ? systemRows.filter((system) => system.name === selected.task.systemName)
        : systemRows
  const focusedSystemIds = new Set(focusedSystems.map((system) => system.systemId))
  const focusedCases =
    selected?.kind === "task"
        ? caseRows.filter((item) => item.caseId === selected.task.caseId)
      : selected
        ? caseRows.filter((item) => focusedSystemIds.has(item.systemId))
        : caseRows
  const focusedSignals =
    selected
        ? signalRows.filter((signal) => focusedSystemIds.has(signal.systemId))
        : signalRows
  const focusedTasks =
    selected?.kind === "system"
      ? (tasks.data ?? []).filter((task) => task.systemName === selected.system.name)
      : selected?.kind === "reportNode"
        ? (tasks.data ?? []).filter((task) => task.systemName === selected.node.systemName)
      : selected?.kind === "cell"
        ? (tasks.data ?? []).filter((task) =>
            focusedSystems.some((system) => system.name === task.systemName)
          )
        : selected?.kind === "task"
          ? [selected.task]
        : tasks.data ?? []
  const currentScope = scopeLabel(selected)
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

  async function assignTaskToFieldTeam(taskId: string) {
    try {
      await api.assignTask(taskId, {
        owner: "provider-field-team",
        actor: "provider",
      })
      toast.success("Work order assigned")
      tasks.reload()
      cases.reload()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : "Assignment failed"
      )
    }
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
        existingSignal ?? (await api.createSignal(reportInputForNode(node)))

      if (!existingSignal?.caseId) {
        await api.analyzeSignal(signal.signalId)
      }

      setSelected({ kind: "reportNode", node, reported: true })
      toast.success(`${node.name} reported into contractor queue`)
      reloadAll()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : "Node report could not be submitted"
      )
    } finally {
      setReportingNodeId(null)
    }
  }

  function handleAgentAction(action: ProviderAgentAction) {
    if (action.type === "analyze_signal" && action.targetId) {
      void analyze(action.targetId)
      return
    }
    if (action.type === "open_case" && action.targetId) {
      navigate(`/cases/${action.targetId}`)
      return
    }
    if (action.type === "assign_task" && action.targetId) {
      void assignTaskToFieldTeam(action.targetId)
      return
    }
    if (action.type === "request_evidence" && action.targetId) {
      navigate(`/cases/${action.targetId}`)
      return
    }
    reloadAll()
  }

  function reloadAll() {
    systems.reload()
    signals.reload()
    cases.reload()
    dashboard.reload()
    health.reload()
    h3Map.reload()
    tasks.reload()
  }

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="sticky top-0 z-50 h-10 bg-[#6f180f] text-white">
        <div className="flex h-full w-full items-center justify-center px-4">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.22em]">
            Neelu - Made by Aditya and Yagev
          </p>
        </div>
      </header>

      <div className="dark p-4 text-foreground lg:hidden">
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

      <motion.div
        className="mx-auto hidden max-w-[1840px] space-y-4 px-8 pb-16 pt-6 lg:block xl:px-10 2xl:px-12"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-4xl font-semibold">Provider Dashboard</h1>
              <Badge
                variant="outline"
                className="gap-1.5 border-[#FF3621]/60 bg-[#FF3621]/10 text-[#FF3621]"
              >
                <RiSparkling2Line className="size-3.5" />
                Databricks assisted
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Live water signals, Databricks analysis, provider cases, and
              contractor work orders in one operations view.
            </p>
          </div>
          <div className="dark flex items-center gap-2 text-foreground">
            {selected ? (
              <Button variant="outline" onClick={() => setSelected(null)}>
                <RiCloseLine className="size-4" />
                Clear scope
              </Button>
            ) : null}
            <Button variant="outline" onClick={reloadAll}>
              <RiRefreshLine className="size-4" />
              Refresh
            </Button>
          </div>
        </div>

        <section className="dark grid h-[calc(100vh-10rem)] min-h-[760px] gap-4 text-foreground lg:grid-cols-[240px_minmax(0,1fr)_320px] 2xl:grid-cols-[250px_minmax(0,1fr)_330px]">
          <ProviderOpsRail
            health={health.data}
            healthLoading={health.loading}
            signals={focusedSignals}
            cases={focusedCases}
            tasks={focusedTasks}
          />
          <ProviderOperationalMap
            systems={systemRows}
            cases={caseRows}
            signals={signalRows}
            cells={mapCells}
            tasks={tasks.data ?? []}
            selected={selected}
            onSelect={setSelected}
            reportingNodeId={reportingNodeId}
            onReportNode={(node) => void reportNode(node)}
          />
          <AgentBriefingPanel
            signals={focusedSignals}
            cases={focusedCases}
            tasks={focusedTasks}
            scope={currentScope}
            selected={selected}
            onAction={handleAgentAction}
          />
        </section>

        <section className="dark grid gap-4 text-foreground lg:grid-cols-[240px_minmax(0,1fr)_320px] 2xl:grid-cols-[250px_minmax(0,1fr)_330px]">
          <KpiPanel
            systems={focusedSystems}
            cases={focusedCases}
            signals={focusedSignals}
            loading={systems.loading || cases.loading}
            scope={currentScope}
          />
          <MapScopeAnalysisPanel
            selected={selected}
            scope={currentScope}
            systems={focusedSystems}
            signals={focusedSignals}
            cases={focusedCases}
            tasks={focusedTasks}
            analyzingId={analyzingId}
            reportingNodeId={reportingNodeId}
            onAnalyze={analyze}
            onReportNode={(node) => void reportNode(node)}
            onOpenCase={(caseId) => navigate(`/cases/${caseId}`)}
            onAssign={assignTaskToFieldTeam}
          />
          <WorkOrdersPanel
            tasks={focusedTasks}
            loading={tasks.loading}
            scope={currentScope}
            onAssign={assignTaskToFieldTeam}
          />
        </section>

        <section className="dark grid items-start gap-4 text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div>
            <AnalyticsPanel
              dashboard={dashboard.data}
              systems={focusedSystems}
              cases={focusedCases}
              signals={focusedSignals}
              loading={dashboard.loading || signals.loading || cases.loading}
              scope={currentScope}
            />
          </div>
          <div>
            <QueuePanel
              signals={focusedSignals}
              cases={focusedCases}
              loading={signals.loading || cases.loading}
              scope={currentScope}
              onAnalyze={analyze}
              analyzingId={analyzingId}
              onOpenCase={(caseId) => navigate(`/cases/${caseId}`)}
            />
          </div>
        </section>
      </motion.div>

      <ProviderBottomBar onOpenShortcuts={() => setShortcutsOpen(true)} />

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              Provider cockpit navigation shortcuts for switching workspaces and
              closing overlays.
            </DialogDescription>
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
    </div>
  )
}
