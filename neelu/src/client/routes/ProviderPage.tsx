import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { toast } from "sonner"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  RiAiGenerate,
  RiBarChartBoxLine,
  RiBrainLine,
  RiDashboard3Line,
  RiEarthLine,
  RiFirstAidKitLine,
  RiGlobalLine,
  RiHospitalLine,
  RiMap2Line,
  RiPulseLine,
  RiRefreshLine,
  RiShieldCheckLine,
  RiTableLine,
  RiWaterFlashLine,
} from "@remixicon/react"

import { H3MapPanel } from "@/client/components/H3MapPanel"
import { CaseStatusBadge, SeverityBadge } from "@/client/components/badges"
import { Badge } from "@/client/components/ui/badge"
import { Button } from "@/client/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card"
import {
  ChartContainer,
  ChartTooltipContent,
} from "@/client/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/client/components/ui/tabs"
import { Textarea } from "@/client/components/ui/textarea"
import { api, ApiClientError } from "@/client/lib/api"
import { useApi } from "@/client/lib/useApi"
import type { CaseListItem, H3MapCell, ProviderDashboard } from "@/shared/types"

type LanguageCode = "en" | "hi" | "ta" | "te" | "kn" | "ml" | "gu" | "bn"

const LANGUAGES: Array<{ code: LanguageCode; label: string }> = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिन्दी" },
  { code: "ta", label: "தமிழ்" },
  { code: "te", label: "తెలుగు" },
  { code: "kn", label: "ಕನ್ನಡ" },
  { code: "ml", label: "മലയാളം" },
  { code: "gu", label: "ગુજરાતી" },
  { code: "bn", label: "বাংলা" },
]

const chartConfig = {
  priority: { label: "Priority", color: "var(--chart-1)" },
  water: { label: "Water", color: "var(--chart-2)" },
  access: { label: "Medical access", color: "var(--chart-3)" },
  reports: { label: "Reports", color: "var(--chart-4)" },
  facilities: { label: "Facilities", color: "var(--chart-5)" },
} as const

const SEVERITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  moderate: 2,
  low: 3,
}

function compact(value: number): string {
  return Intl.NumberFormat("en", { notation: "compact" }).format(value)
}

function percent(value: number | undefined): string {
  return `${Math.round((value ?? 0) * 100)}%`
}

function shortLabel(name: string): string {
  return name.length > 12 ? `${name.slice(0, 11)}.` : name
}

function cellTone(cell: H3MapCell | null): string {
  if (!cell) return "No cell"
  if (cell.quality === "contaminated") return "Contaminated cell"
  if (cell.quality === "caution") return "Caution cell"
  return "Clean cell"
}

function kpiCards(data: ProviderDashboard | null) {
  const metrics = data?.metrics
  return [
    {
      label: "Districts",
      value: compact(metrics?.districtsTracked ?? 0),
      icon: RiEarthLine,
    },
    {
      label: "Habitations",
      value: compact(metrics?.affectedHabitations ?? 0),
      icon: RiWaterFlashLine,
    },
    {
      label: "Facilities",
      value: compact(metrics?.facilityCount ?? 0),
      icon: RiFirstAidKitLine,
    },
    {
      label: "Priority avg",
      value: percent(metrics?.priorityAverage),
      icon: RiPulseLine,
    },
  ]
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
      const next = {
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      }
      setSize((current) =>
        current.width === next.width && current.height === next.height
          ? current
          : next
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <ChartContainer ref={ref} config={chartConfig} className={className}>
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </ChartContainer>
  )
}

function DataCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: typeof RiBarChartBoxLine
  children: ReactNode
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">{children}</CardContent>
    </Card>
  )
}

export function ProviderPage() {
  const dashboard = useApi(() => api.providerDashboard(), [])
  const insights = useApi(() => api.providerInsights(), [])
  const map = useApi(() => api.h3Map(), [])
  const cases = useApi(() => api.cases(), [])
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [language, setLanguage] = useState<LanguageCode>("en")
  const [note, setNote] = useState("")

  const cells = map.data?.cells ?? []
  const selectedCell =
    cells.find((cell) => cell.h3Cell === selectedCellId) ?? cells[0] ?? null
  const priority = dashboard.data?.priorityGeographies ?? []
  const contaminants = dashboard.data?.contaminantBurden ?? []
  const facilityAccess = dashboard.data?.facilityAccess ?? []
  const openCases = useMemo(
    () =>
      [...(cases.data ?? [])].sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity ?? "low"] ?? 4) -
            (SEVERITY_ORDER[b.severity ?? "low"] ?? 4) ||
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
      ),
    [cases.data]
  )

  useEffect(() => {
    if (!selectedCellId && cells[0]) {
      setSelectedCellId(cells[0].h3Cell)
    }
  }, [cells, selectedCellId])

  function reloadAll() {
    dashboard.reload()
    insights.reload()
    map.reload()
    cases.reload()
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key.toLowerCase() === "r") reloadAll()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })

  async function review(item: CaseListItem) {
    setReviewing(item.caseId)
    try {
      await api.reviewCase(item.caseId, {
        actor: "provider",
        severity: item.severity ?? "moderate",
        rationale:
          note.trim() ||
          "Provider reviewed current evidence, geography risk, and contractor routing.",
        recommendation:
          "Assign contractor follow-up and keep the case awaiting approval until field evidence is reviewed.",
        assignTo: "contractor-triage",
      })
      toast.success("Review logged")
      setNote("")
      cases.reload()
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : "Review failed"
      )
    } finally {
      setReviewing(null)
    }
  }

  const rankedCells = [...cells]
    .sort((a, b) => b.vulnerabilityIndex - a.vulnerabilityIndex)
    .slice(0, 8)

  return (
    <div className="provider-cockpit -mx-2 grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <RiDashboard3Line className="size-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-normal">Provider cockpit</h1>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={language}
            onValueChange={(value) => setLanguage(value as LanguageCode)}
          >
            <SelectTrigger className="w-[150px]">
              <RiGlobalLine className="size-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((item) => (
                <SelectItem key={item.code} value={item.code}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={reloadAll}>
            <RiRefreshLine className="size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <section className="grid gap-3 xl:grid-cols-[310px_minmax(560px,1fr)_360px]">
        <div className="grid content-start gap-3">
          <div className="grid grid-cols-2 gap-2">
            {kpiCards(dashboard.data).map((item) => (
              <Card key={item.label}>
                <CardContent className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-[0.6875rem] text-muted-foreground">{item.label}</p>
                    <p className="text-xl font-semibold">{item.value}</p>
                  </div>
                  <item.icon className="size-4 text-primary" />
                </CardContent>
              </Card>
            ))}
          </div>

          <DataCard title="Highest risk hexes" icon={RiMap2Line}>
            <div className="grid gap-2">
              {rankedCells.map((cell) => (
                <button
                  key={cell.h3Cell}
                  className="grid gap-1 border p-2 text-left hover:bg-muted"
                  onClick={() => setSelectedCellId(cell.h3Cell)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{cell.districtName}</span>
                    <Badge variant="outline">{percent(cell.vulnerabilityIndex)}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[0.6875rem] text-muted-foreground">
                    <span>Water {percent(cell.waterContaminationScore)}</span>
                    <span>Access {percent(cell.medicalDesertScore)}</span>
                    <span>{cell.waterPointCount} pts</span>
                  </div>
                </button>
              ))}
            </div>
          </DataCard>
        </div>

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/35 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <RiMap2Line className="size-4 text-primary" />
              Satellite H3 operating map
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <H3MapPanel
              cells={cells}
              defaultMapType="hybrid"
              selectedCell={selectedCell?.h3Cell}
              onCellSelect={(cell) => setSelectedCellId(cell.h3Cell)}
              className="min-h-[610px] rounded-none border-0"
            />
          </CardContent>
        </Card>

        <div className="grid content-start gap-3">
          <DataCard title="Selected cell" icon={RiWaterFlashLine}>
            <div className="space-y-3">
              <div>
                <p className="text-2xl font-semibold">{cellTone(selectedCell)}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedCell
                    ? `${selectedCell.districtName}, ${selectedCell.stateName}`
                    : "Choose a hex on the map"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Metric label="Vulnerability" value={percent(selectedCell?.vulnerabilityIndex)} />
                <Metric label="Water burden" value={percent(selectedCell?.waterContaminationScore)} />
                <Metric label="Medical desert" value={percent(selectedCell?.medicalDesertScore)} />
                <Metric label="Completeness" value={percent(selectedCell?.dataCompletenessScore)} />
              </div>
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Provider review note"
                rows={3}
              />
            </div>
          </DataCard>

          <DataCard title="AI provider insight" icon={RiBrainLine}>
            <div className="space-y-3">
              {insights.error ? (
                <p className="text-sm text-destructive">{insights.error}</p>
              ) : (
                <>
                  <div>
                    <p className="font-semibold">
                      {insights.data?.headline ?? "Generating insight"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {insights.data?.summary ?? "Waiting for model response"}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    {(insights.data?.recommendedActions ?? []).slice(0, 4).map((action) => (
                      <div key={action} className="flex gap-2 text-sm">
                        <RiShieldCheckLine className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{action}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <Button variant="outline" className="w-full" onClick={insights.reload}>
                <RiAiGenerate className="size-4" />
                Regenerate
              </Button>
            </div>
          </DataCard>
        </div>
      </section>

      <Tabs defaultValue="geographies" className="gap-3">
        <TabsList>
          <TabsTrigger value="geographies">
            <RiTableLine className="size-4" />
            Geographies
          </TabsTrigger>
          <TabsTrigger value="cases">
            <RiShieldCheckLine className="size-4" />
            Cases
          </TabsTrigger>
          <TabsTrigger value="evidence">
            <RiBarChartBoxLine className="size-4" />
            Evidence
          </TabsTrigger>
        </TabsList>

        <TabsContent value="geographies">
          <section className="grid gap-3 xl:grid-cols-[1fr_430px]">
            <DataCard title="Priority score by district" icon={RiBarChartBoxLine}>
              <MeasuredChart className="block h-72 min-h-72 min-w-0 aspect-auto">
                {({ width, height }) => (
                  <BarChart width={width} height={height} data={priority}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="districtName" tickFormatter={shortLabel} tickLine={false} axisLine={false} interval={0} />
                    <YAxis domain={[0, 1]} tickFormatter={(value) => `${Math.round(Number(value) * 100)}`} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="neeluPriorityScore" name="priority" fill="var(--color-priority)" radius={0} />
                    <Bar dataKey="waterBurdenScore" name="water" fill="var(--color-water)" radius={0} />
                    <Bar dataKey="medicalDesertScore" name="access" fill="var(--color-access)" radius={0} />
                  </BarChart>
                )}
              </MeasuredChart>
            </DataCard>
            <DataCard title="Top priority geographies" icon={RiEarthLine}>
              <div className="grid max-h-72 gap-2 overflow-auto pr-1">
                {priority.map((item, index) => (
                  <div key={`${item.stateName}-${item.districtName}`} className="grid grid-cols-[2rem_1fr_auto] items-center gap-2 border p-2">
                    <span className="text-muted-foreground">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.districtName}</p>
                      <p className="truncate text-[0.6875rem] text-muted-foreground">
                        {item.stateName} · {item.dominantQualityParameter}
                      </p>
                    </div>
                    <Badge variant="outline">{percent(item.neeluPriorityScore)}</Badge>
                  </div>
                ))}
              </div>
            </DataCard>
          </section>
        </TabsContent>

        <TabsContent value="cases">
          <section className="grid gap-3 xl:grid-cols-2">
            {openCases.slice(0, 8).map((item) => (
              <Card key={item.caseId}>
                <CardContent className="space-y-3 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.systemName}</p>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {item.summary ?? "Awaiting structured summary"}
                      </p>
                    </div>
                    <CaseStatusBadge status={item.status} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.severity ? <SeverityBadge severity={item.severity} /> : null}
                    <Badge variant="outline">{item.contaminant ?? "unknown"}</Badge>
                    <Badge variant="outline">{item.openTaskCount} tasks</Badge>
                  </div>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => review(item)}
                    disabled={reviewing === item.caseId}
                  >
                    {reviewing === item.caseId ? "Logging" : "Log provider review"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </section>
        </TabsContent>

        <TabsContent value="evidence">
          <section className="grid gap-3 xl:grid-cols-2">
            <DataCard title="Contaminant burden" icon={RiWaterFlashLine}>
              <MeasuredChart className="block h-72 min-h-72 min-w-0 aspect-auto">
                {({ width, height }) => (
                  <BarChart width={width} height={height} data={contaminants}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="contaminant" tickFormatter={shortLabel} tickLine={false} axisLine={false} interval={0} />
                    <YAxis tickFormatter={(value) => compact(Number(value))} tickLine={false} axisLine={false} domain={[0, "dataMax"]} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="reports" name="reports" fill="var(--color-reports)" radius={0}>
                      {contaminants.map((_, index) => (
                        <Cell key={index} fill={`var(--chart-${(index % 5) + 1})`} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </MeasuredChart>
            </DataCard>
            <DataCard title="Facility access pressure" icon={RiHospitalLine}>
              <MeasuredChart className="block h-72 min-h-72 min-w-0 aspect-auto">
                {({ width, height }) => (
                  <BarChart width={width} height={height} data={facilityAccess}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="districtName" tickFormatter={shortLabel} tickLine={false} axisLine={false} interval={0} />
                    <YAxis tickFormatter={(value) => compact(Number(value))} tickLine={false} axisLine={false} domain={[0, "dataMax"]} />
                    <Tooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="facilities" name="facilities" fill="var(--color-facilities)" radius={0} />
                    <Bar dataKey="hospitals" name="hospitals" fill="var(--color-access)" radius={0} />
                  </BarChart>
                )}
              </MeasuredChart>
            </DataCard>
          </section>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border p-2">
      <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}
