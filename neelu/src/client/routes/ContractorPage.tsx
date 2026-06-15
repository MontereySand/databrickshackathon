import { useEffect, useState } from "react"
import { openDB } from "idb"
import { toast } from "sonner"
import {
  RiCameraLine,
  RiCheckboxCircleLine,
  RiMapPinLine,
  RiSignalWifiOffLine,
  RiToolsLine,
  RiUploadCloud2Line,
} from "@remixicon/react"

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
import { useApi } from "@/client/lib/useApi"
import { SeverityBadge, TaskStatusBadge } from "@/client/components/badges"
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
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [photoRefs, setPhotoRefs] = useState<Record<string, string | null>>({})
  const [queued, setQueued] = useState<QueuedCompletion[]>([])
  const [syncing, setSyncing] = useState(false)
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

  async function complete(task: ContractorQueueItem) {
    const payload: QueuedCompletion = {
      clientId: `task-${task.taskId}-${Date.now()}`,
      taskId: task.taskId,
      notes: notes[task.taskId] ?? "Completed in field spoof run.",
      photoRef: photoRefs[task.taskId] ?? null,
      actor: "contractor",
    }
    if (!navigator.onLine) {
      await addCompletion(payload)
      await refreshQueued()
      toast.message("Stored offline; will sync when online.")
      return
    }
    try {
      await api.completeTask(task.taskId, payload)
      toast.success("Task completed")
      tasks.reload()
    } catch (error) {
      await addCompletion(payload)
      await refreshQueued()
      toast.error(
        error instanceof ApiClientError
          ? `${error.message}; queued offline`
          : "Queued offline"
      )
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
      tasks.reload()
      toast.success(`Synced ${result.accepted} queued updates`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed")
    } finally {
      setSyncing(false)
    }
  }

  const sortedTasks = [...(tasks.data ?? [])].sort((a, b) => {
    const distanceA = distanceToTask(deviceLocation, a)
    const distanceB = distanceToTask(deviceLocation, b)
    return distanceA - distanceB
  })

  return (
    <div className="mx-auto grid max-w-md gap-4 pb-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <RiToolsLine className="size-5 text-primary" />
            Contractor queue
          </h1>
          <Badge variant="outline">{sortedTasks.length} open</Badge>
        </div>
        {sortedTasks.map((task) => (
          <TaskCard
            key={task.taskId}
            task={task}
            value={notes[task.taskId] ?? ""}
            photoRef={photoRefs[task.taskId] ?? null}
            distanceKm={distanceToTask(deviceLocation, task)}
            onChange={(value) =>
              setNotes((current) => ({ ...current, [task.taskId]: value }))
            }
            onPhoto={(photoRef) =>
              setPhotoRefs((current) => ({ ...current, [task.taskId]: photoRef }))
            }
            onComplete={() => complete(task)}
          />
        ))}
      </section>

      <aside>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RiSignalWifiOffLine className="size-4 text-primary" />
              Offline queue
            </CardTitle>
            <CardDescription>
              IndexedDB stores task completions until connectivity returns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border p-3">
              <p className="text-2xl font-semibold">{queued.length}</p>
              <p className="text-xs text-muted-foreground">
                queued completions
              </p>
            </div>
            <div className="grid gap-2">
              {queued.slice(0, 4).map((item) => (
                <div key={item.clientId} className="border p-2 text-xs">
                  <p className="font-medium">{item.taskId}</p>
                  <p className="truncate text-muted-foreground">{item.notes}</p>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={syncQueued}
              disabled={syncing || queued.length === 0}
            >
              <RiUploadCloud2Line className="size-4" />
              {syncing ? "Syncing" : "Sync now"}
            </Button>
          </CardContent>
        </Card>
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

function TaskCard({
  task,
  value,
  photoRef,
  distanceKm: distance,
  onChange,
  onPhoto,
  onComplete,
}: {
  task: ContractorQueueItem
  value: string
  photoRef: string | null
  distanceKm: number
  onChange: (value: string) => void
  onPhoto: (photoRef: string | null) => void
  onComplete: () => void
}) {
  return (
    <Card>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{task.title}</CardTitle>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <RiMapPinLine className="size-3.5" />
                  {task.systemName}
                  {Number.isFinite(distance) ? ` · ${distance.toFixed(1)} km` : ""}
                </div>
              </div>
              {task.severity ? <SeverityBadge severity={task.severity} /> : null}
            </div>
          </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="border p-2">
            <p className="text-muted-foreground">Issue</p>
            <p className="truncate font-medium">{task.contaminant ?? "Unverified report"}</p>
          </div>
          <div className="border p-2">
            <p className="text-muted-foreground">Hex cell</p>
            <p className="truncate font-medium">{task.h3Cell ?? "pending"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <TaskStatusBadge status={task.status} />
          <Badge variant="outline">Case {task.caseStatus}</Badge>
        </div>
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Repair notes"
          rows={3}
        />
        <label className="flex cursor-pointer items-center justify-center gap-2 border px-3 py-2 text-sm font-medium">
          <RiCameraLine className="size-4 text-primary" />
          {photoRef ? photoRef : "Capture completion photo"}
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) =>
              onPhoto(event.target.files?.[0]?.name ?? null)
            }
          />
        </label>
        <Button onClick={onComplete}>
          <RiCheckboxCircleLine className="size-4" />
          Mark done
        </Button>
      </CardContent>
    </Card>
  )
}
