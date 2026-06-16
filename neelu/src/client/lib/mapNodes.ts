import type { CreateSignalInput } from "@/shared/schemas"
import type { TestType } from "@/shared/constants"
import type { H3MapCell, SignalDTO, WaterSystem } from "@/shared/types"

export type ReportableNodeKind =
  | "school_tap"
  | "clinic_tank"
  | "market_fountain"
  | "standpost"
  | "borewell"
  | "ro_outlet"

export interface ReportableMapNode {
  id: string
  systemId: string
  systemName: string
  name: string
  kind: ReportableNodeKind
  latitude: number
  longitude: number
  stateName: string
  districtName: string
  locationLabel: string
  testType: TestType
  resultValue: number
  unit: string
  concern: string
  notes: string
}

interface NodeTemplate {
  label: string
  kind: ReportableNodeKind
  testType: TestType
  resultValue: number
  unit: string
  concern: string
}

const NODE_TEMPLATES: NodeTemplate[] = [
  {
    label: "primary school kitchen tap",
    kind: "school_tap",
    testType: "nitrate",
    resultValue: 48,
    unit: "mg/L",
    concern: "elevated nitrate near children under 6",
  },
  {
    label: "clinic rooftop tank outlet",
    kind: "clinic_tank",
    testType: "total_coliform",
    resultValue: 18,
    unit: "MPN/100mL",
    concern: "bacterial indicator at a clinical access point",
  },
  {
    label: "market drinking fountain",
    kind: "market_fountain",
    testType: "turbidity",
    resultValue: 8.6,
    unit: "NTU",
    concern: "visible turbidity in a high-footfall area",
  },
  {
    label: "ward standpost",
    kind: "standpost",
    testType: "free_chlorine",
    resultValue: 0.04,
    unit: "mg/L",
    concern: "low residual chlorine at public standpost",
  },
  {
    label: "anganwadi handpump",
    kind: "school_tap",
    testType: "nitrate",
    resultValue: 42,
    unit: "mg/L",
    concern: "borderline nitrate near child nutrition center",
  },
  {
    label: "bus stand water kiosk",
    kind: "standpost",
    testType: "total_coliform",
    resultValue: 9,
    unit: "MPN/100mL",
    concern: "microbial signal at commuter node",
  },
  {
    label: "panchayat borewell",
    kind: "borewell",
    testType: "arsenic",
    resultValue: 0.018,
    unit: "mg/L",
    concern: "trace arsenic above local screening trigger",
  },
  {
    label: "community RO outlet",
    kind: "ro_outlet",
    testType: "ph",
    resultValue: 8.7,
    unit: "pH",
    concern: "alkaline pH drift from treatment outlet",
  },
  {
    label: "temple courtyard tap",
    kind: "standpost",
    testType: "turbidity",
    resultValue: 5.4,
    unit: "NTU",
    concern: "turbidity at shared public tap",
  },
  {
    label: "settlement standpipe",
    kind: "standpost",
    testType: "free_chlorine",
    resultValue: 0.07,
    unit: "mg/L",
    concern: "low disinfectant residual in dense settlement",
  },
]

function pointFor(system: WaterSystem): { lat: number; lng: number } | null {
  if (system.latitude == null || system.longitude == null) return null
  return { lat: system.latitude, lng: system.longitude }
}

function districtForSystem(system: WaterSystem, index: number): string {
  const name = system.name.toLowerCase()
  if (name.includes("clinic")) return "Mandi District"
  if (name.includes("school")) return "North School Ward"
  if (name.includes("village")) return "Pune District"
  return ["Central District", "South Ward", "Provider Catchment"][index % 3]
}

function nearestCell(
  latitude: number,
  longitude: number,
  cells: H3MapCell[]
): H3MapCell | null {
  return cells
    .map((cell) => ({
      cell,
      score:
        Math.abs(cell.center.latitude - latitude) +
        Math.abs(cell.center.longitude - longitude),
    }))
    .sort((a, b) => a.score - b.score)[0]?.cell ?? null
}

export function nodeHierarchyLabel(node: ReportableMapNode): string {
  return `${node.stateName} -> ${node.districtName} -> ${node.systemName} -> ${node.name}`
}

export function buildReportableMapNodes(
  systems: WaterSystem[],
  cells: H3MapCell[]
): ReportableMapNode[] {
  return systems.flatMap((system, systemIndex) => {
    const point = pointFor(system)
    if (!point) return []
    const stateName = system.region ?? "India"
    const districtName = districtForSystem(system, systemIndex)

    return NODE_TEMPLATES.map((template, templateIndex) => {
      const angle =
        (templateIndex / NODE_TEMPLATES.length) * Math.PI * 2 +
        systemIndex * 0.44
      const radius = 0.028 + (templateIndex % 5) * 0.011
      const latitude = Number((point.lat + Math.sin(angle) * radius).toFixed(6))
      const longitude = Number(
        (point.lng + Math.cos(angle) * radius * 1.18).toFixed(6)
      )
      const cell = nearestCell(latitude, longitude, cells)
      const labelPrefix = districtName.replace(/\s+(District|Ward)$/u, "")
      const name = `${labelPrefix} ${template.label}`

      return {
        id: `node-${system.systemId}-${templateIndex}`,
        systemId: system.systemId,
        systemName: system.name,
        name,
        kind: template.kind,
        latitude,
        longitude,
        stateName: cell?.stateName ?? stateName,
        districtName: cell?.districtName ?? districtName,
        locationLabel: name,
        testType: template.testType,
        resultValue: template.resultValue,
        unit: template.unit,
        concern: template.concern,
        notes: `Map node report for ${stateName} -> ${districtName} -> ${system.name} -> ${name}. ${template.concern}. Right-click report generated from provider cockpit.`,
      }
    })
  })
}

export function reportInputForNode(node: ReportableMapNode): CreateSignalInput {
  return {
    systemId: node.systemId,
    signalType: "map_node_report",
    testType: node.testType,
    resultValue: node.resultValue,
    unit: node.unit,
    locationLabel: node.locationLabel,
    notes: node.notes,
    submittedBy: "provider-map",
  }
}

export function reportedNodeIdsFromSignals(
  nodes: ReportableMapNode[],
  signals: SignalDTO[]
): Set<string> {
  const signalKeys = new Set(
    signals.map((signal) => `${signal.systemId}:${signal.locationLabel ?? ""}`)
  )
  return new Set(
    nodes
      .filter((node) => signalKeys.has(`${node.systemId}:${node.locationLabel}`))
      .map((node) => node.id)
  )
}
