import { useEffect, useMemo, useState } from "react"
import maplibregl from "maplibre-gl"
import {
  RiAlertLine,
  RiMap2Line,
  RiRadarLine,
  RiSignalWifiOffLine,
} from "@remixicon/react"

import { Badge } from "@/client/components/ui/badge"
import { Card, CardContent } from "@/client/components/ui/card"
import { Map, MapControls, MapMarker, useMap } from "@/client/components/ui/map"
import { cn } from "@/client/lib/utils"
import {
  buildReportableMapNodes,
  nodeHierarchyLabel,
  reportedNodeIdsFromSignals,
  type ReportableMapNode,
} from "@/client/lib/mapNodes"
import type { Severity } from "@/shared/constants"
import type {
  ContractorQueueItem,
  H3MapCell,
  SignalDTO,
  WaterSystem,
} from "@/shared/types"

const DATABRICKS_RED = "#FF3621"

const SEVERITY_RANK: Record<Severity, number> = {
  urgent: 4,
  high: 3,
  moderate: 2,
  low: 1,
}

export type WaterOperationsMapSelection =
  | { kind: "system"; system: WaterSystem; severity: Severity | null }
  | { kind: "cell"; cell: H3MapCell }
  | { kind: "reportNode"; node: ReportableMapNode; reported: boolean }
  | { kind: "task"; task: ContractorQueueItem }
  | null

export function WaterOperationsMap({
  systems,
  cells,
  signals = [],
  tasks = [],
  selected,
  onSelect,
  onReportNode,
  reportingNodeId = null,
  loading = false,
  title = "Live water operations map",
  subtitle = "Water points, H3 risk cells, reports, and field tasks stay selectable on one operational layer.",
  className,
  mapClassName,
}: {
  systems: WaterSystem[]
  cells: H3MapCell[]
  signals?: SignalDTO[]
  tasks?: ContractorQueueItem[]
  selected: WaterOperationsMapSelection
  onSelect: (selection: WaterOperationsMapSelection) => void
  onReportNode?: (node: ReportableMapNode) => void
  reportingNodeId?: string | null
  loading?: boolean
  title?: string
  subtitle?: string
  className?: string
  mapClassName?: string
}) {
  const [tileError, setTileError] = useState<string | null>(null)
  const reportableNodes = useMemo(
    () => buildReportableMapNodes(systems, cells),
    [cells, systems]
  )
  const reportedNodeIds = useMemo(
    () => reportedNodeIdsFromSignals(reportableNodes, signals),
    [reportableNodes, signals]
  )
  const systemMarkers = systems.flatMap((system) => {
    const point = pointFor(system)
    if (!point) return []
    return [
      {
        system,
        point,
        severity: severityForSystem(system, tasks, signals),
      },
    ]
  })
  const taskMarkers = tasks.flatMap((task) =>
    task.latitude == null || task.longitude == null ? [] : [task]
  )

  return (
    <Card
      className={cn(
        "dark h-[620px] overflow-hidden bg-[#080c10] text-foreground ring-white/10",
        className
      )}
    >
      <CardContent className="relative h-full p-0">
        <Map
          className={cn("h-full bg-[#090c10]", mapClassName)}
          theme="dark"
          center={[78.9629, 22.5937]}
          maxBounds={[
            [66, 5],
            [99, 38],
          ]}
          minZoom={4.2}
          maxZoom={11}
          zoom={4.65}
          pitch={12}
          useEmptyStyle={Boolean(tileError)}
          showLoadingOverlay={false}
          onMapError={(message) => setTileError(message)}
        >
          <MapTileReadinessGuard onSlowTiles={() => setTileError("slow")} />
          <FitMapToData
            systems={systems}
            cells={cells}
            tasks={taskMarkers}
            nodes={reportableNodes}
          />
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
                  "block size-4 rounded-full border-[3px] border-[#080c10] shadow-[0_0_0_2px_rgba(0,0,0,0.45)] transition-transform group-hover/map-marker:scale-125",
                  selected?.kind === "system" &&
                    selected.system.systemId === system.systemId
                    ? "scale-125 ring-2 ring-white/80"
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
                onContextMenu={
                  onReportNode ? () => onReportNode(node) : undefined
                }
                className={onReportNode ? "cursor-crosshair" : undefined}
              >
                <span
                  className={cn(
                    "relative block size-2.5 rounded-full border border-[#080c10] shadow-[0_0_0_1px_rgba(0,0,0,0.65)] transition-transform group-hover/map-marker:scale-150",
                    reported
                      ? "bg-[#FF3621] ring-2 ring-[#FF3621]/45"
                      : node.testType === "total_coliform" ||
                          node.testType === "nitrate"
                        ? "bg-orange-500"
                        : "bg-cyan-400",
                    selectedNode ? "scale-150 ring-2 ring-white/90" : "",
                    reportingNodeId === node.id
                      ? "animate-pulse ring-2 ring-[#FF3621]"
                      : ""
                  )}
                  title={nodeHierarchyLabel(node)}
                  aria-label={node.name}
                />
              </MapMarker>
            )
          })}

          {taskMarkers.map((task) => (
            <MapMarker
              key={task.taskId}
              longitude={task.longitude ?? 0}
              latitude={task.latitude ?? 0}
              onClick={() => onSelect({ kind: "task", task })}
            >
              <span
                className={cn(
                  "block size-3.5 rotate-45 border-2 border-[#080c10] bg-[#FF3621] shadow-md transition-transform group-hover/map-marker:scale-125",
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

        <div className="absolute left-3 top-3 z-20 max-w-[min(22rem,calc(100%-1.5rem))] border border-white/10 bg-[#090c10]/90 p-2 shadow-sm backdrop-blur">
          <div className="flex items-center gap-2">
            <RiMap2Line className="size-4 text-[#FF3621]" />
            <p className="truncate text-xs font-semibold text-white">{title}</p>
            <Badge
              variant="outline"
              className="ml-auto shrink-0 border-white/15 bg-white/5 text-[0.625rem] text-white"
            >
              {tileError ? "Overlays active" : "mapcn / MapLibre"}
            </Badge>
          </div>
          <div className="mt-2 flex items-start gap-2 text-[0.6875rem] leading-snug text-zinc-300">
            {tileError ? (
              <RiSignalWifiOffLine className="mt-0.5 size-3.5 shrink-0 text-zinc-400" />
            ) : (
              <RiRadarLine className="mt-0.5 size-3.5 shrink-0 text-[#FF3621]" />
            )}
            <p>
              {tileError
                ? "Cells, nodes, and tasks are active on the dark operations layer."
                : subtitle}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="absolute bottom-14 left-3 z-20 border border-white/10 bg-[#090c10]/90 px-2 py-1 text-[0.6875rem] text-zinc-300 shadow-sm backdrop-blur">
            Loading water layers
          </div>
        ) : null}

        <div className="absolute bottom-3 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2 text-[0.6875rem]">
          <MapStat label="Systems" value={systemMarkers.length} />
          <MapStat label="H3" value={cells.length} />
          <MapStat label="Nodes" value={reportableNodes.length} />
          <MapStat label="Reports" value={reportedNodeIds.size} />
          <MapStat label="Tasks" value={taskMarkers.length} alert={taskMarkers.length > 0} />
        </div>

        {!loading && !cells.length && !systemMarkers.length ? (
          <div className="absolute inset-x-3 bottom-16 z-20 border border-white/10 bg-[#090c10]/90 p-3 text-xs text-zinc-300 shadow-sm backdrop-blur">
            Water map data is not available yet.
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function MapStat({
  label,
  value,
  alert = false,
}: {
  label: string
  value: number
  alert?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border border-white/10 bg-[#090c10]/90 px-2 py-1 text-zinc-300 shadow-sm backdrop-blur",
        alert ? "border-[#FF3621]/40 text-white" : ""
      )}
    >
      {alert ? <RiAlertLine className="size-3 text-[#FF3621]" /> : null}
      {label} {value}
    </span>
  )
}

function pointFor(system: WaterSystem): { lat: number; lng: number } | null {
  if (system.latitude == null || system.longitude == null) return null
  return { lat: system.latitude, lng: system.longitude }
}

function severityForSystem(
  system: WaterSystem,
  tasks: ContractorQueueItem[],
  signals: SignalDTO[]
): Severity | null {
  const fromTasks = tasks
    .filter((task) => task.systemName === system.name && task.severity)
    .map((task) => task.severity as Severity)
  const fromSignals = signals.some(
    (signal) => signal.systemId === system.systemId && signal.status === "received"
  )
    ? (["moderate"] as Severity[])
    : []
  return [...fromTasks, ...fromSignals].sort(
    (a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a]
  )[0] ?? null
}

function severityTone(severity: Severity | null): string {
  if (severity === "urgent") return "border-red-500 bg-red-500"
  if (severity === "high") return "border-orange-500 bg-orange-500"
  if (severity === "moderate") return "border-amber-500 bg-amber-500"
  return "border-emerald-500 bg-emerald-500"
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
            [
              cell.boundary[0]?.[1] ?? cell.center.longitude,
              cell.boundary[0]?.[0] ?? cell.center.latitude,
            ],
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
  selected: WaterOperationsMapSelection
  onSelect: (selection: WaterOperationsMapSelection) => void
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

    const handleClick = (event: {
      features?: Array<{ properties?: { h3Cell?: string } }>
    }) => {
      const h3Cell = event.features?.[0]?.properties?.h3Cell
      const cell = cells.find((item) => item.h3Cell === h3Cell)
      if (cell) onSelect({ kind: "cell", cell })
    }
    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer"
    }
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = ""
    }
    map.on("click", fillLayerId, handleClick)
    map.on("mouseenter", fillLayerId, handleMouseEnter)
    map.on("mouseleave", fillLayerId, handleMouseLeave)

    return () => {
      map.off("click", fillLayerId, handleClick)
      map.off("mouseenter", fillLayerId, handleMouseEnter)
      map.off("mouseleave", fillLayerId, handleMouseLeave)
    }
  }, [cells, isLoaded, map, onSelect, selected, sourceData])

  return null
}

function FitMapToData({
  systems,
  cells,
  tasks,
  nodes,
}: {
  systems: WaterSystem[]
  cells: H3MapCell[]
  tasks: ContractorQueueItem[]
  nodes: ReportableMapNode[]
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
      ...nodes.map((node) => [node.longitude, node.latitude] as [number, number]),
      ...tasks.flatMap((task) =>
        task.latitude == null || task.longitude == null
          ? []
          : [[task.longitude, task.latitude] as [number, number]]
      ),
    ],
    [cells, nodes, systems, tasks]
  )

  useEffect(() => {
    if (!map || !isLoaded || points.length === 0) return

    const bounds = new maplibregl.LngLatBounds(points[0], points[0])
    points.slice(1).forEach((point) => bounds.extend(point))
    map.fitBounds(bounds, {
      duration: 650,
      maxZoom: 8.5,
      padding: { top: 88, right: 80, bottom: 84, left: 80 },
    })
  }, [isLoaded, map, points])

  return null
}

export { type ReportableMapNode }

function MapTileReadinessGuard({
  onSlowTiles,
}: {
  onSlowTiles: () => void
}) {
  const { isLoaded } = useMap()

  useEffect(() => {
    if (isLoaded) return
    const timeout = window.setTimeout(onSlowTiles, 1800)
    return () => window.clearTimeout(timeout)
  }, [isLoaded, onSlowTiles])

  return null
}
