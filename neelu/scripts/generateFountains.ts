import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"
import { latLngToCell } from "h3-js"
import { closeDb, getDb } from "../src/server/db"
import { insertWaterPoint } from "../src/server/db/repositories"

const CSV_USAGE =
  "Pass a local CSV path as the first argument or set NEELU_FOUNTAINS_CSV. Raw source datasets are not committed."

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ""
  let quoted = false
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
      continue
    }
    if (char === "," && !quoted) {
      cells.push(current.trim())
      current = ""
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 48)
}

function hash(value: string): number {
  let result = 0
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0
  return result
}

function coordinate(seed: string): { latitude: number; longitude: number } {
  const h = hash(seed)
  return {
    latitude: 8.2 + ((h % 2_500) / 2_500) * 27.8,
    longitude: 68.1 + (((h >>> 8) % 2_800) / 2_800) * 29.4,
  }
}

function pick(row: Record<string, string>, candidates: string[]): string {
  const lower = new Map(
    Object.entries(row).map(([key, value]) => [key.toLowerCase(), value])
  )
  for (const candidate of candidates) {
    const value = lower.get(candidate.toLowerCase())
    if (value) return value
  }
  return ""
}

async function main() {
  const inputCsv = process.argv[2] ?? process.env.NEELU_FOUNTAINS_CSV
  if (!inputCsv) {
    throw new Error(CSV_USAGE)
  }
  const file = path.resolve(inputCsv)
  if (!existsSync(file)) {
    throw new Error(
      `CSV not found at ${file}. ${CSV_USAGE}`
    )
  }
  const csv = await readFile(file, "utf8")
  const [headerLine, ...lines] = csv.split(/\r?\n/u).filter(Boolean)
  const headers = splitCsvLine(headerLine)
  const rows = lines.slice(0, 200).map((line) => {
    const values = splitCsvLine(line)
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""])
    )
  })

  const db = await getDb()
  let inserted = 0
  for (const row of rows) {
    const district =
      pick(row, ["district", "district_name", "District Name"]) || "district"
    const state = pick(row, ["state", "state_ut", "State Name"]) || "state"
    const population = Number(
      pick(row, ["population", "total_population", "Population"]) || 0
    )
    const count = population > 250_000 ? 5 : population > 100_000 ? 4 : 3
    const base = coordinate(`${state}:${district}`)
    for (let i = 0; i < count; i += 1) {
      const latitude = base.latitude + (i - 2) * 0.007
      const longitude = base.longitude + ((i % 3) - 1) * 0.009
      const quality = i === 0 ? "contaminated" : i === 1 ? "caution" : "clean"
      await insertWaterPoint(db, {
        pointId: `WPT-${slug(state)}-${slug(district)}-${i + 1}`,
        systemId: null,
        name: `${district} water point ${i + 1}`,
        latitude,
        longitude,
        h3Cell: latLngToCell(latitude, longitude, 8),
        quality,
        contaminant: quality === "clean" ? null : "unverified local report",
        populationServed:
          Number.isFinite(population) && population > 0 ? population : null,
      })
      inserted += 1
    }
  }
  await closeDb()
  console.log(`Generated ${inserted} local water points from ${file}`)
}

main().catch(async (error: unknown) => {
  await closeDb()
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
