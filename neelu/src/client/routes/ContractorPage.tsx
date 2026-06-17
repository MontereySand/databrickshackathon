import { useEffect, useMemo, useState } from "react"
import { openDB } from "idb"
import { toast } from "sonner"
import {
  RiCameraLine,
  RiCheckboxCircleLine,
  RiFileList3Line,
  RiMapPinLine,
  RiRefreshLine,
  RiSignalWifiOffLine,
  RiToolsLine,
  RiUploadCloud2Line,
} from "@remixicon/react"

import {
  WaterOperationsMap,
  type WaterOperationsMapSelection,
} from "@/client/components/WaterOperationsMap"
import { SeverityBadge, TaskStatusBadge } from "@/client/components/badges"
import { Badge } from "@/client/components/ui/badge"
import { Button } from "@/client/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card"
import { Textarea } from "@/client/components/ui/textarea"
import { api, ApiClientError } from "@/client/lib/api"
import { formatDateTime } from "@/client/lib/format"
import { nodeHierarchyLabel } from "@/client/lib/mapNodes"
import { cn } from "@/client/lib/utils"
import { useApi } from "@/client/lib/useApi"
import { TEST_TYPE_LABELS } from "@/shared/constants"
import type { ContractorQueueItem } from "@/shared/types"

interface QueuedCompletion {
  clientId: string
  taskId: string
  notes: string
  photoRef: string | null
  actor: string
}

async function queueDb() {
  return openDB("neelu-offline", 1, {
    upgrade(db) {
      db.createObjectStore("task-completions", { keyPath: "clientId" })
    },
  })
}

async function addCompletion(item: QueuedCompletion) {
  const db = await queueDb()
  await db.put("task-completions", item)
}

async function listCompletions(): Promise<QueuedCompletion[]> {
  const db = await queueDb()
  return db.getAll("task-completions")
}

async function clearCompletions(ids: string[]) {
  const db = await queueDb()
  await Promise.all(ids.map((id) => db.delete("task-completions", id)))
}

export function ContractorPage() {
  const tasks = useApi(() => api.contractorTasks(), [])
  const systems = useApi(() => api.systems(), [])
  const map = useApi(() => api.h3Map(), [])
  const signals = useApi(() => api.signals(), [])
  const [selected, setSelected] = useState<WaterOperationsMapSelection>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [photoRefs, setPhotoRefs] = useState<Record<string, string | null>>({})
  const [queued, setQueued] = useState<QueuedCompletion[]>([])
  const [syncing, setSyncing] = useState(false)
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null)
  const [deviceLocation, setDeviceLocation] = useState<{
    latitude: number
    longitude: number
  } | null>(null)

  async function refreshQueued() {
    setQueued(await listCompletions())
  }

  useEffect(() => {
    refreshQueued()
    navigator.geolocation?.getCurrentPosition(
      (position) =>
        setDeviceLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => setDeviceLocation(null),
      { enableHighAccuracy: false, timeout: 5000 }
    )
    const listener = () => {
      syncQueued()
    }
    window.addEventListener("online", listener)
    return () => window.removeEventListener("online", listener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sortedTasks = useMemo(
    () =>
      [...(tasks.data ?? [])].sort((a, b) => {
        const distanceA = distanceToTask(deviceLocation, a)
        const distanceB = distanceToTask(deviceLocation, b)
        return distanceA - distanceB
      }),
    [deviceLocation, tasks.data]
  )

  useEffect(() => {
    setSelected((current) => {
      if (current?.kind === "task") {
        const updatedTask = sortedTasks.find(
          (task) => task.taskId === current.task.taskId
        )
        if (updatedTask) return { kind: "task", task: updatedTask }
      }
      if (!current && sortedTasks[0]) return { kind: "task", task: sortedTasks[0] }
      return current
    })
  }, [sortedTasks])

  function reloadAll() {
    tasks.reload()
    systems.reload()
    map.reload()
    signals.reload()
  }

  async function complete(task: ContractorQueueItem) {
    const payload: QueuedCompletion = {
      clientId: `task-${task.taskId}-${Date.now()}`,
      taskId: task.taskId,
      notes: notes[task.taskId] ?? "Completed by contractor from field view.",
      photoRef: photoRefs[task.taskId] ?? null,
      actor: "contractor",
    }
    if (!navigator.onLine) {
      await addCompletion(payload)
      await refreshQueued()
      toast.message("Stored offline; will sync when online.")
      return
    }
    setCompletingTaskId(task.taskId)
    try {
      await api.completeTask(task.taskId, {
        actor: payload.actor,
        notes: payload.notes,
        photoRef: payload.photoRef,
      })
      toast.success("Task completed")
      reloadAll()
    } catch (error) {
      await addCompletion(payload)
      await refreshQueued()
      toast.error(
        error instanceof ApiClientError
          ? `${error.message}; queued offline`
          : "Queued offline"
      )
    } finally {
      setCompletingTaskId(null)
    }
  }

  async function syncQueued() {
    const items = await listCompletions()
    if (items.length === 0) return
    setSyncing(true)
    try {
      const result = await api.sync({
        batchId: `contractor-${Date.now()}`,
        source: "contractor",
        items: items.map((item) => ({
          kind: "contractor_task_done",
          clientId: item.clientId,
          taskId: item.taskId,
          actor: item.actor,
          notes: item.notes,
          photoRef: item.photoRef,
        })),
      })
      await clearCompletions(items.map((item) => item.clientId))
      setQueued([])
      reloadAll()
      toast.success(`Synced ${result.accepted} queued updates`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed")
    } finally {
      setSyncing(false)
    }
  }

  const selectedTask = selected?.kind === "task" ? selected.task : null
  const activeTask = selectedTask ?? sortedTasks[0] ?? null
  const mapLoading =
    tasks.loading || systems.loading || map.loading || signals.loading

  return (
    <div className="dark mx-auto grid max-w-6xl gap-4 pb-6 text-foreground xl:grid-cols-[minmax(0,1fr)_370px]">
      <section className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-[#090c10] p-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-white">
              <RiToolsLine className="size-5 text-[#FF3621]" />
              Contractor field queue
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-400">
              Inspect report locations, add field notes and photo references,
              then mark the in-app task done.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="border-white/15 text-zinc-300">
              {sortedTasks.length} open
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "border-white/15 text-zinc-300",
                queued.length ? "border-[#FF3621]/40 text-white" : ""
              )}
            >
              {queued.length} queued
            </Badge>
            <Button
              type="button"
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={reloadAll}
            >
              <RiRefreshLine className="size-4" />
              Refresh
            </Button>
          </div>
        </div>

        <WaterOperationsMap
          systems={systems.data ?? []}
          cells={map.data?.cells ?? []}
          signals={signals.data ?? []}
          tasks={sortedTasks}
          selected={selected}
          onSelect={setSelected}
          loading={mapLoading}
          title="Live water operations map"
          subtitle="Red diamonds are open work orders. Water nodes and H3 cells provide nearby report context."
          className="h-[52svh] min-h-[380px] lg:h-[calc(100svh-9rem)] lg:min-h-[620px]"
        />
      </section>

      <aside className="grid content-start gap-3">
        <SelectionDetailPanel
          selection={selected}
          task={activeTask}
          value={activeTask ? notes[activeTask.taskId] ?? "" : ""}
          photoRef={activeTask ? photoRefs[activeTask.taskId] ?? null : null}
          distanceKm={activeTask ? distanceToTask(deviceLocation, activeTask) : null}
          completing={activeTask?.taskId === completingTaskId}
          onChange={(value) => {
            if (!activeTask) return
            setNotes((current) => ({ ...current, [activeTask.taskId]: value }))
          }}
          onPhoto={(photoRef) => {
            if (!activeTask) return
            setPhotoRefs((current) => ({
              ...current,
              [activeTask.taskId]: photoRef,
            }))
          }}
          onComplete={() => activeTask && complete(activeTask)}
        />

        <TaskQueueList
          tasks={sortedTasks}
          selectedTaskId={selectedTask?.taskId ?? activeTask?.taskId ?? null}
          deviceLocation={deviceLocation}
          onSelect={(task) => setSelected({ kind: "task", task })}
        />

        <OfflineQueueCard
          queued={queued}
          syncing={syncing}
          onSync={() => void syncQueued()}
        />
      </aside>
    </div>
  )
}

function distanceKm(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number }
): number {
  const radiusKm = 6371
  const dLat = ((to.latitude - from.latitude) * Math.PI) / 180
  const dLng = ((to.longitude - from.longitude) * Math.PI) / 180
  const lat1 = (from.latitude * Math.PI) / 180
  const lat2 = (to.latitude * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function distanceToTask(
  location: { latitude: number; longitude: number } | null,
  task: ContractorQueueItem
): number {
  if (location && task.latitude != null && task.longitude != null) {
    return distanceKm(location, {
      latitude: task.latitude,
      longitude: task.longitude,
    })
  }
  return task.distanceKm ?? Number.POSITIVE_INFINITY
}

function SelectionDetailPanel({
  selection,
  task,
  value,
  photoRef,
  distanceKm: distance,
  completing,
  onChange,
  onPhoto,
  onComplete,
}: {
  selection: WaterOperationsMapSelection
  task: ContractorQueueItem | null
  value: string
  photoRef: string | null
  distanceKm: number | null
  completing: boolean
  onChange: (value: string) => void
  onPhoto: (photoRef: string | null) => void
  onComplete: () => void
}) {
  if (selection?.kind === "reportNode") {
    return (
      <Card className="border-[#FF3621]/35 bg-[#090c10] text-foreground ring-white/10" size="sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white">{selection.node.name}</CardTitle>
          <CardDescription className="line-clamp-2">
            {nodeHierarchyLabel(selection.node)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-xs leading-relaxed text-zinc-300">
            {selection.node.concern}
          </p>
          <div className="grid grid-cols-3 gap-2">
            <DetailMetric
              label="Test"
              value={TEST_TYPE_LABELS[selection.node.testType]}
            />
            <DetailMetric label="Value" value={`${selection.node.resultValue}`} />
            <DetailMetric label="Unit" value={selection.node.unit} />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (selection?.kind === "cell") {
    return (
      <Card className="bg-[#090c10] text-foreground ring-white/10" size="sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white">{selection.cell.districtName}</CardTitle>
          <CardDescription>
            {selection.cell.stateName} · H3 {selection.cell.h3Cell}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <DetailMetric label="Water points" value={String(selection.cell.waterPointCount)} />
          <DetailMetric label="Facilities" value={String(selection.cell.facilityCount)} />
          <DetailMetric
            label="Priority"
            value={`${Math.round(selection.cell.vulnerabilityIndex * 100)}%`}
          />
          <DetailMetric label="Quality" value={selection.cell.quality} />
        </CardContent>
      </Card>
    )
  }

  if (selection?.kind === "system") {
    return (
      <Card className="bg-[#090c10] text-foreground ring-white/10" size="sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-white">{selection.system.name}</CardTitle>
          <CardDescription>{selection.system.region ?? "Water system"}</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <DetailMetric
            label="Population"
            value={Intl.NumberFormat("en", { notation: "compact" }).format(
              selection.system.populationServed ?? 0
            )}
          />
          <DetailMetric
            label="Source"
            value={selection.system.sourceWaterType ?? "Unknown"}
          />
        </CardContent>
      </Card>
    )
  }

  if (!task) {
    return (
      <Card className="bg-[#090c10] text-foreground ring-white/10" size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm text-white">
            <RiFileList3Line className="size-4 text-[#FF3621]" />
            No open field tasks
          </CardTitle>
          <CardDescription>
            New reviewed reports will appear here as in-app work orders.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="border-[#FF3621]/35 bg-[#090c10] text-foreground ring-white/10" size="sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm text-white">{task.title}</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-1">
              <RiMapPinLine className="size-3.5" />
              {task.systemName}
              {distance != null && Number.isFinite(distance)
                ? ` · ${distance.toFixed(1)} km`
                : ""}
            </CardDescription>
          </div>
          {task.severity ? <SeverityBadge severity={task.severity} /> : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <DetailMetric label="Issue" value={task.contaminant ?? "Water report"} />
          <DetailMetric label="Due" value={formatDateTime(task.dueAt)} />
          <DetailMetric label="Hex cell" value={task.h3Cell ?? "Pending"} />
          <DetailMetric label="Case" value={task.caseStatus} />
        </div>
        <div className="flex flex-wrap gap-2">
          <TaskStatusBadge status={task.status} />
          <Badge variant="outline" className="border-white/15 text-zinc-300">
            {task.owner ?? "Unassigned"}
          </Badge>
        </div>
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Work completed, repair performed, materials used, or follow-up needed."
          rows={4}
          className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500"
        />
        <label className="flex cursor-pointer items-center justify-center gap-2 border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-medium text-white hover:bg-white/[0.06]">
          <RiCameraLine className="size-4 text-[#FF3621]" />
          <span className="min-w-0 truncate">
            {photoRef ? photoRef : "Capture completion photo"}
          </span>
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => onPhoto(event.target.files?.[0]?.name ?? null)}
          />
        </label>
        <Button
          type="button"
          className="bg-[#FF3621] text-white hover:bg-[#FF3621]/85"
          disabled={completing || task.status === "done"}
          onClick={onComplete}
        >
          <RiCheckboxCircleLine className="size-4" />
          {completing ? "Saving" : "Mark done"}
        </Button>
      </CardContent>
    </Card>
  )
}

function TaskQueueList({
  tasks,
  selectedTaskId,
  deviceLocation,
  onSelect,
}: {
  tasks: ContractorQueueItem[]
  selectedTaskId: string | null
  deviceLocation: { latitude: number; longitude: number } | null
  onSelect: (task: ContractorQueueItem) => void
}) {
  return (
    <Card className="bg-[#090c10] text-foreground ring-white/10" size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm text-white">
          <span className="inline-flex items-center gap-2">
            <RiFileList3Line className="size-4 text-[#FF3621]" />
            Work orders
          </span>
          <Badge variant="outline" className="border-white/15 text-zinc-300">
            {tasks.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid max-h-[360px] gap-2 overflow-auto pr-1">
        {tasks.length ? (
          tasks.map((task) => (
            <button
              key={task.taskId}
              type="button"
              className={cn(
                "grid gap-1 border border-white/10 bg-white/[0.03] p-2 text-left text-xs transition-colors hover:border-[#FF3621]/40 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3621]/40",
                selectedTaskId === task.taskId ? "border-[#FF3621]/55 bg-[#FF3621]/10" : ""
              )}
              onClick={() => onSelect(task)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-medium text-white">
                  {task.title}
                </p>
                {task.severity ? <SeverityBadge severity={task.severity} /> : null}
              </div>
              <div className="flex items-center justify-between gap-2 text-zinc-400">
                <span className="min-w-0 truncate">{task.systemName}</span>
                <span className="shrink-0">
                  {Number.isFinite(distanceToTask(deviceLocation, task))
                    ? `${distanceToTask(deviceLocation, task).toFixed(1)} km`
                    : "Distance n/a"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <TaskStatusBadge status={task.status} />
                <Badge variant="outline" className="border-white/15 text-zinc-300">
                  {task.contaminant ?? "Water"}
                </Badge>
              </div>
            </button>
          ))
        ) : (
          <div className="border border-dashed border-white/10 p-4 text-center text-xs text-zinc-400">
            No open work orders.
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function OfflineQueueCard({
  queued,
  syncing,
  onSync,
}: {
  queued: QueuedCompletion[]
  syncing: boolean
  onSync: () => void
}) {
  return (
    <Card className="bg-[#090c10] text-foreground ring-white/10" size="sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm text-white">
          <RiSignalWifiOffLine className="size-4 text-[#FF3621]" />
          Offline queue
        </CardTitle>
        <CardDescription>
          Task completions are held on this device until connectivity returns.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <DetailMetric label="Queued" value={String(queued.length)} alert={queued.length > 0} />
          <Button
            type="button"
            variant="outline"
            className="h-full border-white/15 bg-white/5 text-white hover:bg-white/10"
            onClick={onSync}
            disabled={syncing || queued.length === 0}
          >
            <RiUploadCloud2Line className="size-4" />
            {syncing ? "Syncing" : "Sync now"}
          </Button>
        </div>
        <div className="grid gap-2">
          {queued.slice(0, 4).map((item) => (
            <div
              key={item.clientId}
              className="border border-white/10 bg-white/[0.03] p-2 text-xs"
            >
              <p className="truncate font-medium text-white">{item.taskId}</p>
              <p className="truncate text-zinc-400">{item.notes}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DetailMetric({
  label,
  value,
  alert = false,
}: {
  label: string
  value: string
  alert?: boolean
}) {
  return (
    <div
      className={cn(
        "min-w-0 border border-white/10 bg-white/[0.03] p-2",
        alert ? "border-[#FF3621]/40" : ""
      )}
    >
      <p className="truncate text-[0.6875rem] text-zinc-400">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-white">{value}</p>
    </div>
  )
}
