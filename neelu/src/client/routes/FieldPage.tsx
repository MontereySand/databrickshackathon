import { useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { RiCheckboxCircleFill, RiFlaskLine } from "@remixicon/react"
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
import { Input } from "@/client/components/ui/input"
import { Label } from "@/client/components/ui/label"
import { Textarea } from "@/client/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select"
import { ErrorState, LoadingRows } from "@/client/components/states"
import {
  CONTAMINANT_THRESHOLDS,
  TEST_TYPES,
  TEST_TYPE_LABELS,
} from "@/shared/constants"
import type { TestType } from "@/shared/constants"
import type { Signal } from "@/shared/types"

interface FormState {
  systemId: string
  testType: TestType
  resultValue: string
  unit: string
  kitId: string
  kitExpiresAt: string
  locationLabel: string
  notes: string
  photoRef: string
  submittedBy: string
}

const EMPTY: FormState = {
  systemId: "",
  testType: "nitrate",
  resultValue: "",
  unit: CONTAMINANT_THRESHOLDS.nitrate.unit,
  kitId: "",
  kitExpiresAt: "",
  locationLabel: "",
  notes: "",
  photoRef: "",
  submittedBy: "",
}

export function FieldPage() {
  const systemsState = useApi(() => api.systems(), [])
  const [form, setForm] = useState<FormState>(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<Signal | null>(null)

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onTestTypeChange(value: string) {
    const testType = value as TestType
    setForm((prev) => ({
      ...prev,
      testType,
      unit: CONTAMINANT_THRESHOLDS[testType].unit,
    }))
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    try {
      const signal = await api.createSignal({
        systemId: form.systemId,
        signalType: "field_test",
        testType: form.testType,
        resultValue: Number(form.resultValue),
        unit: form.unit,
        kitId: form.kitId || null,
        kitExpiresAt: form.kitExpiresAt || null,
        locationLabel: form.locationLabel || null,
        notes: form.notes || null,
        photoRef: form.photoRef || null,
        submittedBy: form.submittedBy || undefined,
      })
      setSubmitted(signal)
      toast.success(`Signal ${signal.signalId} recorded`)
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? `${error.message}${error.details ? `: ${error.details.map((d) => d.message).join(", ")}` : ""}`
          : "Failed to submit signal"
      toast.error(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RiCheckboxCircleFill className="size-5 text-primary" />
              Submission recorded
            </CardTitle>
            <CardDescription>
              The signal is queued for review. A reviewer will analyze it on the
              command desk.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Signal ID</span>
              <span className="font-mono">{submitted.signalId}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Status</span>
              <span>Received</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-muted-foreground">Test</span>
              <span>
                {TEST_TYPE_LABELS[(submitted.testType ?? "nitrate") as TestType]} ·{" "}
                {submitted.resultValue} {submitted.unit}
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSubmitted(null)
                  setForm((prev) => ({ ...EMPTY, systemId: prev.systemId }))
                }}
              >
                Submit another
              </Button>
              <Button asChild>
                <Link to="/">Open command desk</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4 flex items-center gap-2">
        <RiFlaskLine className="size-5 text-primary" />
        <div>
          <h1 className="text-base font-semibold">Field test intake</h1>
          <p className="text-xs text-muted-foreground">
            Submit a water test result from the field.
          </p>
        </div>
      </div>

      {systemsState.error ? (
        <ErrorState message={systemsState.error} onRetry={systemsState.reload} />
      ) : systemsState.loading ? (
        <LoadingRows rows={6} />
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="system">Water system</Label>
            <Select value={form.systemId} onValueChange={(v) => update("systemId", v)}>
              <SelectTrigger id="system">
                <SelectValue placeholder="Select a water system" />
              </SelectTrigger>
              <SelectContent>
                {(systemsState.data ?? []).map((system) => (
                  <SelectItem key={system.systemId} value={system.systemId}>
                    {system.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="testType">Test type</Label>
              <Select value={form.testType} onValueChange={onTestTypeChange}>
                <SelectTrigger id="testType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEST_TYPES.map((testType) => (
                    <SelectItem key={testType} value={testType}>
                      {TEST_TYPE_LABELS[testType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={form.unit}
                onChange={(e) => update("unit", e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="resultValue">Result value</Label>
            <Input
              id="resultValue"
              inputMode="decimal"
              placeholder="e.g. 18.4"
              value={form.resultValue}
              onChange={(e) => update("resultValue", e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kitId">Test kit ID</Label>
              <Input
                id="kitId"
                value={form.kitId}
                onChange={(e) => update("kitId", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kitExpiresAt">Kit expiry</Label>
              <Input
                id="kitExpiresAt"
                type="date"
                value={form.kitExpiresAt}
                onChange={(e) => update("kitExpiresAt", e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="locationLabel">Location</Label>
            <Input
              id="locationLabel"
              placeholder="e.g. Tap beside school kitchen"
              value={form.locationLabel}
              onChange={(e) => update("locationLabel", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="photo">Photo (optional, not uploaded in demo)</Label>
            <Input
              id="photo"
              type="file"
              accept="image/*"
              onChange={(e) => update("photoRef", e.target.files?.[0]?.name ?? "")}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="submittedBy">Submitted by (optional)</Label>
            <Input
              id="submittedBy"
              placeholder="Your name"
              value={form.submittedBy}
              onChange={(e) => update("submittedBy", e.target.value)}
            />
          </div>

          <Button type="submit" disabled={submitting || !form.systemId}>
            {submitting ? "Submitting…" : "Submit field test"}
          </Button>
        </form>
      )}
    </div>
  )
}
